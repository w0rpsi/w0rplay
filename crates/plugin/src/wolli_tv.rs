//! Optional world-space TV mirror. Only the independently generated compatibility texture is touched.
//! The dashboard's capture/input pipeline and GPS render-target detection remain unchanged.
use std::ffi::c_void;
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::sync::{LazyLock, Mutex};

use w0rplay_shared::{SCREEN_HEIGHT, SCREEN_WIDTH};
use windows::Win32::Graphics::Direct3D11::{
    D3D11_BOX, D3D11_SUBRESOURCE_DATA, D3D11_TEXTURE2D_DESC, ID3D11DeviceContext, ID3D11Resource,
    ID3D11ShaderResourceView, ID3D11Texture2D,
};
use windows::Win32::Graphics::Dxgi::Common::{
    DXGI_FORMAT_B8G8R8A8_TYPELESS, DXGI_FORMAT_B8G8R8A8_UNORM, DXGI_FORMAT_B8G8R8A8_UNORM_SRGB,
};
use windows::core::Interface;

use crate::frame::FrameSource;
use crate::{bridge, log};

// One extra column distinguishes this texture from every dashboard layout. Repeat the last column
// there so the complete CarPlay image is retained, without cropping its right edge.
pub const WIDTH: u32 = w0rplay_shared::WOLLI_TV_WIDTH;
pub const MAGIC: [u8; 8] = w0rplay_shared::WOLLI_TV_MAGIC;
const MAX_TEXTURES: usize = 8;
static PRESENT: AtomicU64 = AtomicU64::new(0);
static LAST_DRAWN: AtomicU64 = AtomicU64::new(u64::MAX);
static HAS_TEXTURES: AtomicBool = AtomicBool::new(false);
static HAS_VIEWS: AtomicBool = AtomicBool::new(false);
static PUBLISHING: AtomicBool = AtomicBool::new(false);
// Avoid taking a mutex for every unrelated shader bind in the game. The TV normally has one SRV.
static KNOWN_VIEWS: [AtomicUsize; 16] = [const { AtomicUsize::new(0) }; 16];

fn publish_view_ids(state: &State) {
    for (index, slot) in KNOWN_VIEWS.iter().enumerate() {
        slot.store(state.views.get(index).map_or(0, |view| view.srv.as_raw() as usize), Ordering::Release);
    }
}

struct Television {
    texture: ID3D11Texture2D,
    version: Option<(u32, u64)>,
    black: bool,
    seen: u64,
}
struct View {
    // Keep the interface alive so its pointer cannot be reused for an unrelated texture.
    srv: ID3D11ShaderResourceView,
    texture: usize,
}
#[derive(Default)]
struct State {
    textures: Vec<Television>,
    views: Vec<View>,
    frames: FrameSource,
    device: usize,
}
struct Shared(State);
// SAFETY: resource interfaces are free-threaded. The mutex protects bookkeeping; immediate-context
// copies happen only in on_present, on the game's Present thread.
unsafe impl Send for Shared {}
static STATE: LazyLock<Mutex<Shared>> = LazyLock::new(|| Mutex::new(Shared(State::default())));
static BLACK: LazyLock<Vec<u8>> = LazyLock::new(|| {
    let mut pixels = vec![0; (WIDTH * SCREEN_HEIGHT * 4) as usize];
    for alpha in pixels.iter_mut().skip(3).step_by(4) {
        *alpha = 255;
    }
    pixels
});

pub fn dimensions_match(desc: &D3D11_TEXTURE2D_DESC) -> bool {
    desc.Width == WIDTH
        && desc.Height == SCREEN_HEIGHT
        && desc.MipLevels == 1
        && desc.ArraySize == 1
        && desc.SampleDesc.Count == 1
        && [DXGI_FORMAT_B8G8R8A8_UNORM_SRGB, DXGI_FORMAT_B8G8R8A8_UNORM, DXGI_FORMAT_B8G8R8A8_TYPELESS]
            .contains(&desc.Format)
}

/// # Safety
/// The description and initial data are the game's live CreateTexture2D arguments.
pub unsafe fn tagged(desc: &D3D11_TEXTURE2D_DESC, initial: *const D3D11_SUBRESOURCE_DATA) -> bool {
    if !dimensions_match(desc) {
        return false;
    }
    // SAFETY: the caller supplies valid CreateTexture2D data; the validated dimensions contain at
    // least eight bytes. Check the pointer and pitch before reading that small identifying prefix.
    unsafe {
        let Some(initial) = initial.as_ref() else { return false };
        !initial.pSysMem.is_null()
            && initial.SysMemPitch >= WIDTH * 4
            && std::slice::from_raw_parts(initial.pSysMem.cast::<u8>(), MAGIC.len()) == MAGIC
    }
}

/// ETS2 creates this addon DDS as an empty DEFAULT texture and uploads its bytes later (observed in
/// the real 2.1.7 game log). Reserved dimensions identify that path; supplied initial data must still
/// carry the signature. Never accept a render target, staging resource or writable CPU texture here.
/// # Safety
/// Same valid CreateTexture2D arguments as tagged.
pub unsafe fn mirror_texture(desc: &D3D11_TEXTURE2D_DESC, initial: *const D3D11_SUBRESOURCE_DATA) -> bool {
    // SAFETY: forwarded live CreateTexture2D arguments; tagged reads only valid supplied initial bytes.
    (unsafe { tagged(desc, initial) })
        || (initial.is_null()
            && dimensions_match(desc)
            && desc.Usage == windows::Win32::Graphics::Direct3D11::D3D11_USAGE_DEFAULT
            && desc.BindFlags == windows::Win32::Graphics::Direct3D11::D3D11_BIND_SHADER_RESOURCE.0 as u32
            && desc.CPUAccessFlags == 0
            && desc.MiscFlags == 0)
}

/// # Safety
/// texture is the successful CreateTexture2D result for a signed or reserved empty mirror texture.
pub unsafe fn register_texture(texture: *mut c_void) {
    // SAFETY: the caller retains the successful API result; clone an owned resource reference.
    unsafe {
        let Some(texture) = ID3D11Texture2D::from_raw_borrowed(&texture) else { return };
        let Ok(device) = texture.GetDevice() else { return };
        let mut shared = STATE.lock().unwrap_or_else(|e| e.into_inner());
        let state = &mut shared.0;
        if state.device != device.as_raw() as usize {
            *state = State { device: device.as_raw() as usize, ..Default::default() };
            HAS_VIEWS.store(false, Ordering::Release);
            publish_view_ids(state);
            LAST_DRAWN.store(u64::MAX, Ordering::Relaxed);
        }
        if state.textures.len() >= MAX_TEXTURES {
            let old = state.textures.remove(0).texture.as_raw() as usize;
            state.views.retain(|view| view.texture != old);
            HAS_VIEWS.store(!state.views.is_empty(), Ordering::Release);
            publish_view_ids(state);
        }
        state.textures.push(Television { texture: texture.clone(), version: None, black: false, seen: u64::MAX });
        HAS_TEXTURES.store(true, Ordering::Release);
        log!("wolli TV: tagged mirror texture registered ({}x{})", WIDTH, SCREEN_HEIGHT);
    }
}

/// # Safety
/// resource and view are live arguments/results of a successful CreateShaderResourceView call.
pub unsafe fn register_view(resource: *mut c_void, view: *mut c_void) {
    if !HAS_TEXTURES.load(Ordering::Acquire) {
        return;
    }
    // SAFETY: both interfaces are alive through the caller's successful API call.
    unsafe {
        let Some(resource) = ID3D11Resource::from_raw_borrowed(&resource) else { return };
        let Ok(texture) = resource.cast::<ID3D11Texture2D>() else { return };
        let mut shared = STATE.lock().unwrap_or_else(|e| e.into_inner());
        let state = &mut shared.0;
        if !state.textures.iter().any(|tv| tv.texture.as_raw() == texture.as_raw()) {
            return;
        }
        let Some(srv) = ID3D11ShaderResourceView::from_raw_borrowed(&view) else { return };
        if !state.views.iter().any(|known| known.srv.as_raw() == srv.as_raw()) {
            state.views.push(View { srv: srv.clone(), texture: texture.as_raw() as usize });
            publish_view_ids(state);
            HAS_VIEWS.store(true, Ordering::Release);
            log!("wolli TV: mirror shader view registered");
        }
    }
}

/// # Safety
/// views is the game's PSSetShaderResources array, containing count live or null interfaces.
pub unsafe fn on_bind(count: u32, views: *const *mut c_void) {
    if !HAS_VIEWS.load(Ordering::Acquire) || views.is_null() || count == 0 || count > 128 {
        return;
    }
    // SAFETY: the hook passes its valid shader-view array; pointer identities need no GPU queries.
    let incoming = unsafe { std::slice::from_raw_parts(views, count as usize) };
    let matches_tv = KNOWN_VIEWS
        .iter()
        .map(|slot| slot.load(Ordering::Acquire))
        .take_while(|id| *id != 0)
        .any(|id| incoming.contains(&(id as *mut c_void)));
    if !matches_tv {
        return;
    }
    let mut shared = STATE.lock().unwrap_or_else(|e| e.into_inner());
    let state = &mut shared.0;
    let now = PRESENT.load(Ordering::Relaxed);
    for tv in &mut state.textures {
        if state
            .views
            .iter()
            .any(|view| view.texture == tv.texture.as_raw() as usize && incoming.contains(&view.srv.as_raw()))
        {
            if tv.seen == u64::MAX {
                log!("wolli TV: mirror is being drawn");
            }
            tv.seen = now;
            if let Some(bridge) = bridge::get() {
                bridge.plugin.wolli_tv_available.store(1, Ordering::Release);
            }
            LAST_DRAWN.store(now, Ordering::Relaxed);
        }
    }
}

pub fn visible() -> bool {
    let seen = LAST_DRAWN.load(Ordering::Relaxed);
    seen != u64::MAX && PRESENT.load(Ordering::Relaxed).saturating_sub(seen) <= 2
}

pub fn truck_changed() {
    LAST_DRAWN.store(u64::MAX, Ordering::Relaxed);
    if let Some(bridge) = bridge::get() {
        bridge.plugin.wolli_tv_available.store(0, Ordering::Release);
    }
    let mut shared = STATE.lock().unwrap_or_else(|e| e.into_inner());
    for tv in &mut shared.0.textures {
        tv.seen = u64::MAX;
    }
}

pub fn reset() {
    truck_changed();
    HAS_TEXTURES.store(false, Ordering::Release);
    HAS_VIEWS.store(false, Ordering::Release);
    LAST_DRAWN.store(u64::MAX, Ordering::Relaxed);
    let mut shared = STATE.lock().unwrap_or_else(|e| e.into_inner());
    shared.0 = State::default();
    publish_view_ids(&shared.0);
}

/// Submit on the game's Present thread, never from asset-loading or deferred-context threads. The
/// world draw has already used the previous image: one frame of latency, with no extra browser/capture.
pub fn on_present(frame: u64) {
    PRESENT.store(frame, Ordering::Relaxed);
    if !HAS_VIEWS.load(Ordering::Acquire) || !visible() {
        return;
    }
    if PUBLISHING.compare_exchange(false, true, Ordering::Acquire, Ordering::Relaxed).is_err() {
        return;
    }
    struct Publishing;
    impl Drop for Publishing {
        fn drop(&mut self) {
            PUBLISHING.store(false, Ordering::Release);
        }
    }
    let _publishing = Publishing;
    // Snapshot resources before issuing any GPU commands. Asset callbacks can register resources
    // while the driver executes copies, without waiting on a mutex held by this render callback.
    let (device_id, mut frames, mut targets) = {
        let mut shared = STATE.lock().unwrap_or_else(|e| e.into_inner());
        let state = &mut shared.0;
        let targets: Vec<_> = state
            .textures
            .iter()
            .filter(|tv| tv.seen != u64::MAX && frame.saturating_sub(tv.seen) <= 2)
            .map(|tv| (tv.texture.clone(), tv.version, tv.black))
            .collect();
        if targets.is_empty() {
            return;
        }
        (state.device, std::mem::take(&mut state.frames), targets)
    };
    // SAFETY: retained live game resources, on its Present thread. The guard serializes mirror
    // publication; no bookkeeping mutex is held while the immediate context or shared frame is used.
    unsafe {
        if let Ok(device) = targets[0].0.GetDevice()
            && let Ok(context) = device.GetImmediateContext()
        {
            let enabled = bridge::host_alive()
                && bridge::get().is_some_and(|b| {
                    b.host.screen_enabled.load(Ordering::Acquire) == 1
                        && b.host.wolli_tv_mirror.load(Ordering::Acquire) == 1
                });
            let latest = if enabled { frames.update(&device, &context) } else { None };
            let generation = bridge::get().map_or(0, |b| b.host.frame_generation.load(Ordering::Acquire));
            for (texture, previous, black) in &mut targets {
                if let Some((source, sequence)) = &latest {
                    let version = (generation, *sequence);
                    if *previous != Some(version) {
                        copy_frame(&context, texture, source);
                        *previous = Some(version);
                        *black = false;
                    }
                } else if !*black {
                    context.UpdateSubresource(&*texture, 0, None, BLACK.as_ptr().cast(), WIDTH * 4, 0);
                    *previous = None;
                    *black = true;
                }
            }
            // screen_frame is the dashboard signal used by the host's interior/exterior
            // audio detection. A sleeper TV can also be drawn through a window; it must
            // not make an exterior camera count as being inside the cab.
        }
    }
    let mut shared = STATE.lock().unwrap_or_else(|e| e.into_inner());
    let state = &mut shared.0;
    if state.device == device_id {
        state.frames = frames;
        for (texture, version, black) in &targets {
            if let Some(tv) = state.textures.iter_mut().find(|tv| tv.texture.as_raw() == texture.as_raw()) {
                tv.version = *version;
                tv.black = *black;
            }
        }
    }
    // Release the lock before dropping snapshots (and any obsolete frame resources).
    drop(shared);
}

/// # Safety
/// Both textures belong to context's device, with source SCREEN_WIDTH x SCREEN_HEIGHT and destination
/// WIDTH x SCREEN_HEIGHT in the BGRA8 format family. Destination has DEFAULT usage.
unsafe fn copy_frame(context: &ID3D11DeviceContext, destination: &ID3D11Texture2D, source: &ID3D11Texture2D) {
    let image = D3D11_BOX { left: 0, top: 0, front: 0, right: SCREEN_WIDTH, bottom: SCREEN_HEIGHT, back: 1 };
    let edge = D3D11_BOX { left: SCREEN_WIDTH - 1, ..image };
    // SAFETY: the caller guarantees matching resources; both regions fit, including the extra column.
    unsafe {
        context.CopySubresourceRegion(destination, 0, 0, 0, 0, source, 0, Some(&image));
        context.CopySubresourceRegion(destination, 0, SCREEN_WIDTH, 0, 0, source, 0, Some(&edge));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use windows::Win32::Graphics::Dxgi::Common::DXGI_SAMPLE_DESC;

    #[test]
    fn recognizes_the_games_delayed_upload_without_accepting_render_targets() {
        use windows::Win32::Graphics::Direct3D11::*;
        let desc = D3D11_TEXTURE2D_DESC {
            Width: WIDTH,
            Height: SCREEN_HEIGHT,
            MipLevels: 1,
            ArraySize: 1,
            Format: DXGI_FORMAT_B8G8R8A8_UNORM_SRGB,
            SampleDesc: DXGI_SAMPLE_DESC { Count: 1, Quality: 0 },
            Usage: D3D11_USAGE_DEFAULT,
            BindFlags: D3D11_BIND_SHADER_RESOURCE.0 as u32,
            ..Default::default()
        };
        // SAFETY: null initial data is the documented delayed-upload branch; all descriptors are owned.
        unsafe {
            assert!(mirror_texture(&desc, std::ptr::null()));
            assert!(!mirror_texture(&D3D11_TEXTURE2D_DESC { Width: SCREEN_WIDTH, ..desc }, std::ptr::null()));
            assert!(!mirror_texture(
                &D3D11_TEXTURE2D_DESC {
                    BindFlags: (D3D11_BIND_SHADER_RESOURCE.0 | D3D11_BIND_RENDER_TARGET.0) as u32,
                    ..desc
                },
                std::ptr::null()
            ));
            assert!(!mirror_texture(&D3D11_TEXTURE2D_DESC { Usage: D3D11_USAGE_STAGING, ..desc }, std::ptr::null()));
        }
    }

    #[test]
    fn requires_an_exact_signature_not_just_a_texture_size() {
        let desc = D3D11_TEXTURE2D_DESC {
            Width: WIDTH,
            Height: SCREEN_HEIGHT,
            MipLevels: 1,
            ArraySize: 1,
            Format: DXGI_FORMAT_B8G8R8A8_UNORM_SRGB,
            SampleDesc: DXGI_SAMPLE_DESC { Count: 1, Quality: 0 },
            ..Default::default()
        };
        let initial =
            D3D11_SUBRESOURCE_DATA { pSysMem: MAGIC.as_ptr().cast(), SysMemPitch: WIDTH * 4, SysMemSlicePitch: 0 };
        // SAFETY: exact valid descriptor and an eight-byte prefix; tagged reads only that prefix.
        unsafe {
            assert!(tagged(&desc, &initial));
            assert!(!tagged(&desc, std::ptr::null()));
            let ordinary = [0u8; 8];
            assert!(!tagged(&desc, &D3D11_SUBRESOURCE_DATA { pSysMem: ordinary.as_ptr().cast(), ..initial }));
            assert!(!tagged(&D3D11_TEXTURE2D_DESC { Width: SCREEN_WIDTH, ..desc }, &initial));
            assert!(!tagged(&D3D11_TEXTURE2D_DESC { MipLevels: 2, ..desc }, &initial));
        }
    }

    #[test]
    fn copies_every_pixel_and_repeats_only_the_tag_column() {
        use windows::Win32::Foundation::HMODULE;
        use windows::Win32::Graphics::Direct3D::D3D_DRIVER_TYPE_WARP;
        use windows::Win32::Graphics::Direct3D11::*;
        use windows::Win32::Graphics::Dxgi::Common::DXGI_FORMAT_B8G8R8A8_UNORM;
        // SAFETY: independent software D3D11 device and owned test buffers; no game process is touched.
        unsafe {
            let mut device = None;
            let mut context = None;
            D3D11CreateDevice(
                None,
                D3D_DRIVER_TYPE_WARP,
                HMODULE::default(),
                D3D11_CREATE_DEVICE_FLAG(0),
                None,
                D3D11_SDK_VERSION,
                Some(&mut device),
                None,
                Some(&mut context),
            )
            .unwrap();
            let device = device.unwrap();
            let context = context.unwrap();
            let mut pixels = vec![0u8; (SCREEN_WIDTH * SCREEN_HEIGHT * 4) as usize];
            for y in 0..SCREEN_HEIGHT {
                for x in 0..SCREEN_WIDTH {
                    let offset = ((y * SCREEN_WIDTH + x) * 4) as usize;
                    pixels[offset..offset + 4].copy_from_slice(&[(x % 251) as u8, (y % 253) as u8, 91, 255]);
                }
            }
            let source_desc = D3D11_TEXTURE2D_DESC {
                Width: SCREEN_WIDTH,
                Height: SCREEN_HEIGHT,
                MipLevels: 1,
                ArraySize: 1,
                Format: DXGI_FORMAT_B8G8R8A8_UNORM,
                SampleDesc: DXGI_SAMPLE_DESC { Count: 1, Quality: 0 },
                Usage: D3D11_USAGE_DEFAULT,
                BindFlags: D3D11_BIND_SHADER_RESOURCE.0 as u32,
                ..Default::default()
            };
            let initial = D3D11_SUBRESOURCE_DATA {
                pSysMem: pixels.as_ptr().cast(),
                SysMemPitch: SCREEN_WIDTH * 4,
                SysMemSlicePitch: 0,
            };
            let mut source = None;
            device.CreateTexture2D(&source_desc, Some(&initial), Some(&mut source)).unwrap();
            let target_desc =
                D3D11_TEXTURE2D_DESC { Width: WIDTH, Format: DXGI_FORMAT_B8G8R8A8_UNORM_SRGB, ..source_desc };
            let mut target = None;
            device.CreateTexture2D(&target_desc, None, Some(&mut target)).unwrap();
            let target = target.unwrap();
            copy_frame(&context, &target, &source.unwrap());
            let staging_desc = D3D11_TEXTURE2D_DESC {
                Usage: D3D11_USAGE_STAGING,
                BindFlags: 0,
                CPUAccessFlags: D3D11_CPU_ACCESS_READ.0 as u32,
                ..target_desc
            };
            let mut staging = None;
            device.CreateTexture2D(&staging_desc, None, Some(&mut staging)).unwrap();
            let staging = staging.unwrap();
            context.CopyResource(&staging, &target);
            let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
            context.Map(&staging, 0, D3D11_MAP_READ, 0, Some(&mut mapped)).unwrap();
            let captured =
                std::slice::from_raw_parts(mapped.pData.cast::<u8>(), (mapped.RowPitch * SCREEN_HEIGHT) as usize);
            let mut correct = true;
            for y in 0..SCREEN_HEIGHT as usize {
                let row = &captured[y * mapped.RowPitch as usize..][..WIDTH as usize * 4];
                let original = &pixels[y * SCREEN_WIDTH as usize * 4..][..SCREEN_WIDTH as usize * 4];
                correct &= &row[..original.len()] == original;
                correct &= row[original.len()..] == original[original.len() - 4..];
            }
            context.Unmap(&staging, 0);
            assert!(correct, "TV mirror cropped or modified the CarPlay image");
        }
    }
}
