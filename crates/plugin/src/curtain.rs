//! Private curtain textures: legacy reveal and complete 3D side-curtain pose selection.
//! No game draw calls are intercepted. Whole-pose selection is not skeletal/cloth simulation.
mod pose;
use crate::{bridge, log};
use std::{
    ffi::c_void,
    sync::{
        LazyLock, Mutex,
        atomic::{AtomicBool, AtomicUsize, Ordering},
    },
    time::Instant,
};
use w0rplay_shared::{
    CURTAIN_HEIGHT, CURTAIN_MAGIC, CURTAIN_POSE_HEIGHT, CURTAIN_POSE_MAGIC, CURTAIN_POSE_WIDTH, CURTAIN_WIDTH,
};
use windows::{
    Win32::Graphics::{Direct3D11::*, Dxgi::Common::*},
    core::Interface,
};

static HAVE_TEXTURES: AtomicBool = AtomicBool::new(false);
static VIEWS: [AtomicUsize; 8] = [const { AtomicUsize::new(0) }; 8];
static SEEN: AtomicBool = AtomicBool::new(false);

#[derive(Default)]
struct State {
    device: usize,
    textures: Vec<Texture>,
    views: Vec<View>,
    pixels: Vec<u8>,
    motion: Motion,
    palette: Option<pose::Palette>,
}
struct Texture {
    texture: ID3D11Texture2D,
    version: u16,
    verified: bool,
    bound: bool,
    attempts: u8,
    pose: bool,
}
struct View {
    srv: ID3D11ShaderResourceView,
    texture: usize,
}
struct Shared(State);
// SAFETY: D3D resources are free threaded; bookkeeping is locked. GPU writes run on Present's thread.
unsafe impl Send for Shared {}
static STATE: LazyLock<Mutex<Shared>> = LazyLock::new(|| Mutex::new(Shared(State::default())));

fn publish_views(s: &State) {
    for (i, slot) in VIEWS.iter().enumerate() {
        slot.store(s.views.get(i).map_or(0, |v| v.srv.as_raw() as usize), Ordering::Release);
    }
}
pub fn dimensions_match(d: &D3D11_TEXTURE2D_DESC) -> bool {
    ((d.Width == CURTAIN_WIDTH && d.Height == CURTAIN_HEIGHT)
        || (d.Width == CURTAIN_POSE_WIDTH && d.Height == CURTAIN_POSE_HEIGHT))
        && d.MipLevels == 1
        && d.ArraySize == 1
        && d.SampleDesc.Count == 1
        && [DXGI_FORMAT_B8G8R8A8_UNORM, DXGI_FORMAT_B8G8R8A8_UNORM_SRGB, DXGI_FORMAT_B8G8R8A8_TYPELESS]
            .contains(&d.Format)
}
/// # Safety
/// Live CreateTexture2D arguments. The marker row is reserved and never sampled by our mesh.
pub unsafe fn matches(d: &D3D11_TEXTURE2D_DESC, initial: *const D3D11_SUBRESOURCE_DATA) -> bool {
    if !dimensions_match(d) {
        return false;
    }
    if initial.is_null() {
        // ETS2 1.61 uploads shader-only textures after allocation, as with the private Wolli mirror.
        return d.Usage == D3D11_USAGE_DEFAULT
            && d.BindFlags == D3D11_BIND_SHADER_RESOURCE.0 as u32
            && d.CPUAccessFlags == 0
            && d.MiscFlags == 0;
    }
    // SAFETY: valid API data; the validated pitch and dimensions contain the eight marker bytes.
    let data = unsafe { &*initial };
    !data.pSysMem.is_null()
        && data.SysMemPitch >= d.Width * 4
        && unsafe { std::slice::from_raw_parts(data.pSysMem.cast::<u8>(), 8) }
            == if d.Width == CURTAIN_POSE_WIDTH { CURTAIN_POSE_MAGIC } else { CURTAIN_MAGIC }
}
/// # Safety
/// Successful creation of our signed/reserved texture. Retain an owned COM reference.
pub unsafe fn register_texture(raw: *mut c_void, verified: bool) {
    // SAFETY: the hook owns a successful live texture result throughout this call.
    unsafe {
        let Some(texture) = ID3D11Texture2D::from_raw_borrowed(&raw) else { return };
        let Ok(device) = texture.GetDevice() else { return };
        let mut guard = STATE.lock().unwrap_or_else(|e| e.into_inner());
        let s = &mut guard.0;
        if s.device != device.as_raw() as usize {
            *s = State { device: device.as_raw() as usize, ..Default::default() };
        }
        if s.textures.len() >= 4 {
            let removed = s.textures.remove(0).texture.as_raw() as usize;
            s.views.retain(|v| v.texture != removed);
        }
        let mut desc = D3D11_TEXTURE2D_DESC::default();
        texture.GetDesc(&mut desc);
        s.textures.push(Texture {
            texture: texture.clone(),
            version: u16::MAX,
            verified,
            bound: false,
            attempts: 0,
            pose: desc.Width == CURTAIN_POSE_WIDTH,
        });
        publish_views(s);
        HAVE_TEXTURES.store(true, Ordering::Release);
        log!("curtain: private accessory texture registered");
    }
}
/// # Safety
/// Successful CreateShaderResourceView arguments/results.
pub unsafe fn register_view(resource: *mut c_void, raw: *mut c_void) {
    if !HAVE_TEXTURES.load(Ordering::Acquire) {
        return;
    }
    let mut guard = STATE.lock().unwrap_or_else(|e| e.into_inner());
    let s = &mut guard.0;
    if s.views.len() >= VIEWS.len() || !s.textures.iter().any(|t| t.texture.as_raw() as usize == resource as usize) {
        return;
    }
    // SAFETY: live successful SRV result; retain identity so pointers cannot be reused behind our registry.
    if let Some(srv) = unsafe { ID3D11ShaderResourceView::from_raw_borrowed(&raw) } {
        s.views.push(View { srv: srv.clone(), texture: resource as usize });
        publish_views(s);
    }
}
/// # Safety
/// The game's valid PSSetShaderResources array (count live/null pointers).
pub unsafe fn on_bind(count: u32, views: *const *mut c_void) {
    if !HAVE_TEXTURES.load(Ordering::Acquire) || views.is_null() || count == 0 || count > 128 {
        return;
    }
    // SAFETY: inherited hook contract, bounded by the checked array count.
    let incoming = unsafe { std::slice::from_raw_parts(views, count as usize) };
    if VIEWS
        .iter()
        .map(|v| v.load(Ordering::Acquire))
        .take_while(|v| *v != 0)
        .any(|id| incoming.contains(&(id as *mut c_void)))
    {
        let mut guard = STATE.lock().unwrap_or_else(|e| e.into_inner());
        let s = &mut guard.0;
        let mut proven = false;
        for t in &mut s.textures {
            if s.views.iter().any(|v| v.texture == t.texture.as_raw() as usize && incoming.contains(&v.srv.as_raw())) {
                t.bound = true;
                proven |= t.verified;
            }
        }
        if !proven {
            return;
        }
        if !SEEN.swap(true, Ordering::AcqRel) {
            log!("curtain: accessory is being drawn");
        }
        if let Some(b) = bridge::get() {
            b.plugin.curtain_available.store(1, Ordering::Release);
        }
    }
}
pub fn truck_changed() {
    SEEN.store(false, Ordering::Release);
    if let Some(b) = bridge::get() {
        b.plugin.curtain_available.store(0, Ordering::Release);
    }
}
pub fn reset() {
    HAVE_TEXTURES.store(false, Ordering::Release);
    truck_changed();
    let mut guard = STATE.lock().unwrap_or_else(|e| e.into_inner());
    guard.0 = State::default();
    publish_views(&guard.0);
}
pub fn on_present(_frame: u64) {
    if !HAVE_TEXTURES.load(Ordering::Acquire) {
        return;
    }
    let alive = SEEN.load(Ordering::Acquire) && bridge::host_alive();
    let desired = alive && bridge::get().is_some_and(|b| b.host.curtain_closed.load(Ordering::Acquire) == 1);
    let mut guard = STATE.lock().unwrap_or_else(|e| e.into_inner());
    let s = &mut guard.0;
    for texture in &mut s.textures {
        if !texture.verified && texture.bound && texture.attempts < 4 {
            texture.attempts += 1;
            texture.verified = has_signature(&texture.texture).unwrap_or(false);
            if texture.verified {
                log!("curtain: delayed-upload signature verified");
            }
        }
    }
    let rejected: Vec<usize> =
        s.textures.iter().filter(|t| !t.verified && t.attempts >= 4).map(|t| t.texture.as_raw() as usize).collect();
    if !rejected.is_empty() {
        s.textures.retain(|t| !rejected.contains(&(t.texture.as_raw() as usize)));
        s.views.retain(|v| !rejected.contains(&v.texture));
        publish_views(s);
        log!("curtain: rejected {} unsigned candidate textures", rejected.len());
        if s.textures.is_empty() {
            HAVE_TEXTURES.store(false, Ordering::Release);
            return;
        }
    }
    let progress = if alive {
        s.motion.sample(Instant::now(), desired)
    } else {
        s.motion = Motion::default();
        0
    };
    upload(s, progress);
    if !s.textures.iter().filter(|t| t.verified).all(|t| t.version == version(t.pose, progress)) {
        return;
    }
    if let Some(b) = bridge::get() {
        b.plugin.curtain_progress.store(progress as u32, Ordering::Release);
    }
}

fn upload(s: &mut State, progress: u16) {
    for t in &mut s.textures {
        if !t.pose || !t.verified {
            continue;
        }
        let next = version(true, progress);
        if t.version == next {
            continue;
        }
        if s.palette.is_none() {
            match pose::Palette::read(&t.texture) {
                Ok(palette) => s.palette = Some(palette),
                Err(_) => continue,
            }
        }
        if s.palette.as_ref().is_some_and(|p| p.select(&t.texture, t.version, next).is_ok()) {
            t.version = next;
        }
    }
    if s.textures.iter().any(|t| !t.pose && t.verified && t.version != progress) {
        paint(&mut s.pixels, progress);
        for t in &mut s.textures {
            if t.pose || !t.verified || t.version == progress {
                continue;
            }
            // SAFETY: owned private DEFAULT texture, exactly width*height BGRA pixels, on the render thread.
            unsafe {
                let Ok(device) = t.texture.GetDevice() else { continue };
                let Ok(context) = device.GetImmediateContext() else { continue };
                context.UpdateSubresource(&t.texture, 0, None, s.pixels.as_ptr().cast(), CURTAIN_WIDTH * 4, 0);
            }
            t.version = progress;
        }
    }
}

fn version(pose: bool, progress: u16) -> u16 {
    if pose { pose::index(progress) } else { progress }
}

/// Read only the unused two-pixel marker, once for an actual delayed-upload candidate.
fn has_signature(texture: &ID3D11Texture2D) -> windows::core::Result<bool> {
    // SAFETY: owned texture; the private footprint contains this two-pixel region. All COM outputs and maps are checked.
    unsafe {
        let device = texture.GetDevice()?;
        let context = device.GetImmediateContext()?;
        let mut desc = D3D11_TEXTURE2D_DESC::default();
        texture.GetDesc(&mut desc);
        let mut staging = None;
        device.CreateTexture2D(
            &D3D11_TEXTURE2D_DESC {
                Width: 2,
                Height: 1,
                MipLevels: 1,
                ArraySize: 1,
                Format: DXGI_FORMAT_B8G8R8A8_UNORM,
                SampleDesc: DXGI_SAMPLE_DESC { Count: 1, Quality: 0 },
                Usage: D3D11_USAGE_STAGING,
                CPUAccessFlags: D3D11_CPU_ACCESS_READ.0 as u32,
                ..Default::default()
            },
            None,
            Some(&mut staging),
        )?;
        let staging = staging.ok_or_else(windows::core::Error::empty)?;
        let region = D3D11_BOX { left: 0, top: 0, front: 0, right: 2, bottom: 1, back: 1 };
        context.CopySubresourceRegion(&staging, 0, 0, 0, 0, texture, 0, Some(&region));
        let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
        context.Map(&staging, 0, D3D11_MAP_READ, 0, Some(&mut mapped))?;
        let expected = if desc.Width == CURTAIN_POSE_WIDTH { CURTAIN_POSE_MAGIC } else { CURTAIN_MAGIC };
        let signed = std::slice::from_raw_parts(mapped.pData.cast::<u8>(), 8) == expected;
        context.Unmap(&staging, 0);
        Ok(signed)
    }
}

fn paint(pixels: &mut Vec<u8>, progress: u16) {
    pixels.resize((CURTAIN_WIDTH * CURTAIN_HEIGHT * 4) as usize, 0);
    for y in 0..CURTAIN_HEIGHT {
        for x in 0..CURTAIN_WIDTH {
            let i = ((y * CURTAIN_WIDTH + x) * 4) as usize;
            let weave = ((x + y) % 2) as u8 * 2;
            pixels[i..i + 4].copy_from_slice(&[
                38 + weave,
                33 + weave,
                31 + weave / 2,
                if x < (progress as u32) { 255 } else { 0 },
            ]);
        }
    }
    pixels[..8].copy_from_slice(&CURTAIN_MAGIC);
}
#[derive(Default)]
struct Motion {
    from: f32,
    target: bool,
    changed: Option<Instant>,
}
impl Motion {
    fn value(&self, now: Instant) -> f32 {
        let t = self.changed.map_or(1.0, |at| (now.saturating_duration_since(at).as_secs_f32() / 0.6).clamp(0.0, 1.0));
        self.from + ((self.target as u8 as f32) - self.from) * (t * t * (3.0 - 2.0 * t))
    }
    fn sample(&mut self, now: Instant, target: bool) -> u16 {
        if target != self.target {
            self.from = self.value(now);
            self.target = target;
            self.changed = Some(now);
        }
        (self.value(now) * CURTAIN_WIDTH as f32).round() as u16
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;
    #[test]
    #[ignore = "requires the Windows D3D11 software device"]
    fn actual_gpu_pose_selection_preserves_fabric_and_unrelated_textures() {
        use w0rplay_shared::{CURTAIN_POSE_COUNT, CURTAIN_POSE_TILE};
        use windows::Win32::{Foundation::HMODULE, Graphics::Direct3D::D3D_DRIVER_TYPE_WARP};
        // SAFETY: isolated owned D3D11 resources on this test thread. Every mapped resource is unmapped below.
        unsafe {
            let (mut device, mut context) = (None, None);
            D3D11CreateDevice(
                None,
                D3D_DRIVER_TYPE_WARP,
                HMODULE::default(),
                D3D11_CREATE_DEVICE_BGRA_SUPPORT,
                None,
                D3D11_SDK_VERSION,
                Some(&mut device),
                None,
                Some(&mut context),
            )
            .unwrap();
            let (device, context) = (device.unwrap(), context.unwrap());
            let desc = D3D11_TEXTURE2D_DESC {
                Width: CURTAIN_POSE_WIDTH,
                Height: CURTAIN_POSE_HEIGHT,
                MipLevels: 1,
                ArraySize: 1,
                Format: DXGI_FORMAT_B8G8R8A8_UNORM,
                SampleDesc: DXGI_SAMPLE_DESC { Count: 1, Quality: 0 },
                Usage: D3D11_USAGE_DEFAULT,
                BindFlags: D3D11_BIND_SHADER_RESOURCE.0 as u32,
                ..Default::default()
            };
            let mut pixels = vec![0; (CURTAIN_POSE_WIDTH * CURTAIN_POSE_HEIGHT * 4) as usize];
            for index in 0..CURTAIN_POSE_COUNT as u16 {
                let r = pose::region(index);
                for y in 0..CURTAIN_POSE_TILE {
                    for x in 0..CURTAIN_POSE_TILE {
                        let i = (((r.top + y) * CURTAIN_POSE_WIDTH + r.left + x) * 4) as usize;
                        pixels[i..i + 4].copy_from_slice(&[
                            (x % 251) as u8,
                            (y % 251) as u8,
                            91,
                            if index == 0 { 255 } else { 0 },
                        ]);
                    }
                }
            }
            pixels[..8].copy_from_slice(&CURTAIN_POSE_MAGIC);
            let data = D3D11_SUBRESOURCE_DATA {
                pSysMem: pixels.as_ptr().cast(),
                SysMemPitch: CURTAIN_POSE_WIDTH * 4,
                ..Default::default()
            };
            assert!(matches(&desc, &data));
            let mut own = None;
            device.CreateTexture2D(&desc, Some(&data), Some(&mut own)).unwrap();
            let own = own.unwrap();
            assert!(has_signature(&own).unwrap());
            let ordinary_pixels = vec![71; pixels.len()];
            let other_data = D3D11_SUBRESOURCE_DATA { pSysMem: ordinary_pixels.as_ptr().cast(), ..data };
            assert!(!matches(&desc, &other_data));
            let mut other = None;
            device.CreateTexture2D(&desc, Some(&other_data), Some(&mut other)).unwrap();
            let other = other.unwrap();
            assert!(!has_signature(&other).unwrap());
            let mut staging = None;
            device
                .CreateTexture2D(
                    &D3D11_TEXTURE2D_DESC {
                        Usage: D3D11_USAGE_STAGING,
                        BindFlags: 0,
                        CPUAccessFlags: D3D11_CPU_ACCESS_READ.0 as u32,
                        ..desc
                    },
                    None,
                    Some(&mut staging),
                )
                .unwrap();
            let staging = staging.unwrap();
            let mut state = State {
                textures: vec![Texture {
                    texture: own.clone(),
                    version: u16::MAX,
                    verified: true,
                    bound: true,
                    attempts: 0,
                    pose: true,
                }],
                ..Default::default()
            };
            for progress in [0, 256, 512, CURTAIN_WIDTH as u16, 0] {
                upload(&mut state, progress);
                context.CopyResource(&staging, &own);
                let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
                context.Map(&staging, 0, D3D11_MAP_READ, 0, Some(&mut mapped)).unwrap();
                assert_eq!(std::slice::from_raw_parts(mapped.pData.cast::<u8>(), 8), CURTAIN_POSE_MAGIC);
                for i in 0..CURTAIN_POSE_COUNT as u16 {
                    let r = pose::region(i);
                    let at = ((r.top + 128) * mapped.RowPitch + (r.left + 128) * 4) as usize;
                    let rgba = std::slice::from_raw_parts(mapped.pData.cast::<u8>().add(at), 4);
                    assert_eq!(rgba, [128, 128, 91, if i == pose::index(progress) { 255 } else { 0 }]);
                }
                context.Unmap(&staging, 0);
                assert_eq!(state.textures[0].version, pose::index(progress));
            }
            context.CopyResource(&staging, &other);
            let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
            context.Map(&staging, 0, D3D11_MAP_READ, 0, Some(&mut mapped)).unwrap();
            assert_eq!(*mapped.pData.cast::<u8>(), 71);
            context.Unmap(&staging, 0);
            assert!(state.palette.is_some());
        }
    }
    #[test]
    #[ignore = "requires the Windows D3D11 software device"]
    fn actual_gpu_updates_private_mask_and_preserves_other_textures() {
        use windows::Win32::{Foundation::HMODULE, Graphics::Direct3D::D3D_DRIVER_TYPE_WARP};
        // SAFETY: isolated software device and owned resources on this test thread; all maps are paired.
        unsafe {
            let mut device = None;
            let mut context = None;
            D3D11CreateDevice(
                None,
                D3D_DRIVER_TYPE_WARP,
                HMODULE::default(),
                D3D11_CREATE_DEVICE_BGRA_SUPPORT,
                None,
                D3D11_SDK_VERSION,
                Some(&mut device),
                None,
                Some(&mut context),
            )
            .unwrap();
            let device = device.unwrap();
            let context = context.unwrap();
            let desc = D3D11_TEXTURE2D_DESC {
                Width: CURTAIN_WIDTH,
                Height: CURTAIN_HEIGHT,
                MipLevels: 1,
                ArraySize: 1,
                Format: DXGI_FORMAT_B8G8R8A8_UNORM_SRGB,
                SampleDesc: DXGI_SAMPLE_DESC { Count: 1, Quality: 0 },
                Usage: D3D11_USAGE_DEFAULT,
                BindFlags: D3D11_BIND_SHADER_RESOURCE.0 as u32,
                ..Default::default()
            };
            let mut pixels = vec![];
            paint(&mut pixels, 0);
            let initial = D3D11_SUBRESOURCE_DATA {
                pSysMem: pixels.as_ptr().cast(),
                SysMemPitch: CURTAIN_WIDTH * 4,
                ..Default::default()
            };
            assert!(matches(&desc, &initial));
            let mut own = None;
            device.CreateTexture2D(&desc, Some(&initial), Some(&mut own)).unwrap();
            let own = own.unwrap();
            assert!(has_signature(&own).unwrap());
            let ordinary_pixels = vec![71u8; pixels.len()];
            let ordinary_initial = D3D11_SUBRESOURCE_DATA {
                pSysMem: ordinary_pixels.as_ptr().cast(),
                SysMemPitch: CURTAIN_WIDTH * 4,
                ..Default::default()
            };
            assert!(!matches(&desc, &ordinary_initial));
            let mut ordinary = None;
            device.CreateTexture2D(&desc, Some(&ordinary_initial), Some(&mut ordinary)).unwrap();
            let ordinary = ordinary.unwrap();
            assert!(!has_signature(&ordinary).unwrap());
            let mut staging = None;
            device
                .CreateTexture2D(
                    &D3D11_TEXTURE2D_DESC {
                        Usage: D3D11_USAGE_STAGING,
                        BindFlags: 0,
                        CPUAccessFlags: D3D11_CPU_ACCESS_READ.0 as u32,
                        ..desc
                    },
                    None,
                    Some(&mut staging),
                )
                .unwrap();
            let staging = staging.unwrap();
            let alpha = |texture: &ID3D11Texture2D| {
                context.CopyResource(&staging, texture);
                let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
                context.Map(&staging, 0, D3D11_MAP_READ, 0, Some(&mut mapped)).unwrap();
                let offset = (mapped.RowPitch * (CURTAIN_HEIGHT / 2) + 4 * (CURTAIN_WIDTH / 2) + 3) as usize;
                let value = *mapped.pData.cast::<u8>().add(offset);
                context.Unmap(&staging, 0);
                value
            };
            let mut state = State {
                textures: vec![Texture {
                    texture: own.clone(),
                    version: u16::MAX,
                    verified: true,
                    bound: true,
                    attempts: 0,
                    pose: false,
                }],
                ..Default::default()
            };
            upload(&mut state, CURTAIN_WIDTH as u16);
            assert_eq!(alpha(&own), 255);
            assert_eq!(alpha(&ordinary), 71);
            upload(&mut state, 0);
            assert_eq!(alpha(&own), 0);
            assert_eq!(alpha(&ordinary), 71);
        }
    }
    #[test]
    fn mask_opens_and_closes_without_touching_marker() {
        let mut p = vec![];
        paint(&mut p, 0);
        assert_eq!(&p[..8], &CURTAIN_MAGIC);
        assert!(p[(CURTAIN_WIDTH * 4) as usize..].chunks_exact(4).all(|c| c[3] == 0));
        paint(&mut p, CURTAIN_WIDTH as u16);
        assert!(p[(CURTAIN_WIDTH * 4) as usize..].chunks_exact(4).all(|c| c[3] == 255));
    }
    #[test]
    fn motion_reverses_without_jumping_and_finishes() {
        let now = Instant::now();
        let mut m = Motion::default();
        assert_eq!(m.sample(now, true), 0);
        let half = m.sample(now + Duration::from_millis(300), true);
        assert!((half as i32 - 514).abs() < 2);
        assert_eq!(m.sample(now + Duration::from_millis(300), false), half);
        assert_eq!(m.sample(now + Duration::from_millis(1000), false), 0);
    }
    #[test]
    fn rejects_ordinary_game_textures_and_unsigned_data() {
        let mut d = D3D11_TEXTURE2D_DESC {
            Width: 1280,
            Height: 720,
            MipLevels: 1,
            ArraySize: 1,
            Format: DXGI_FORMAT_B8G8R8A8_UNORM,
            ..Default::default()
        };
        d.SampleDesc.Count = 1;
        assert!(!dimensions_match(&d));
        d.Width = CURTAIN_WIDTH;
        d.Height = CURTAIN_HEIGHT;
        let data = vec![0u8; (CURTAIN_WIDTH * CURTAIN_HEIGHT * 4) as usize];
        let initial = D3D11_SUBRESOURCE_DATA {
            pSysMem: data.as_ptr().cast(),
            SysMemPitch: CURTAIN_WIDTH * 4,
            ..Default::default()
        };
        // SAFETY: owned API-shaped fixture with validated backing allocation.
        assert!(!unsafe { matches(&d, &initial) });
    }
}
