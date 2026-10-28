//! A signed atlas stores the same fabric in each cell, with one complete mesh pose visible.
//! Read one 256px cell once; subsequent changes upload only the previous/next cells.
use w0rplay_shared::{CURTAIN_POSE_COLUMNS, CURTAIN_POSE_COUNT, CURTAIN_POSE_TILE, CURTAIN_WIDTH};
use windows::Win32::Graphics::{Direct3D11::*, Dxgi::Common::*};

pub struct Palette {
    on: Vec<u8>,
    off: Vec<u8>,
}

pub fn index(progress: u16) -> u16 {
    ((u32::from(progress).min(CURTAIN_WIDTH) * (CURTAIN_POSE_COUNT - 1) + CURTAIN_WIDTH / 2) / CURTAIN_WIDTH) as u16
}

pub fn region(index: u16) -> D3D11_BOX {
    let index = u32::from(index).min(CURTAIN_POSE_COUNT - 1);
    let left = 4 + (index % CURTAIN_POSE_COLUMNS) * CURTAIN_POSE_TILE;
    let top = 8 + (index / CURTAIN_POSE_COLUMNS) * CURTAIN_POSE_TILE;
    D3D11_BOX { left, top, front: 0, right: left + CURTAIN_POSE_TILE, bottom: top + CURTAIN_POSE_TILE, back: 1 }
}

impl Palette {
    /// Called only after the private marker was verified and the accessory was bound.
    pub fn read(texture: &ID3D11Texture2D) -> windows::core::Result<Self> {
        // SAFETY: owned signed texture with a complete 256px cell, render thread; mapped staging is unmapped below.
        unsafe {
            let device = texture.GetDevice()?;
            let context = device.GetImmediateContext()?;
            let mut staging = None;
            device.CreateTexture2D(
                &D3D11_TEXTURE2D_DESC {
                    Width: CURTAIN_POSE_TILE,
                    Height: CURTAIN_POSE_TILE,
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
            context.CopySubresourceRegion(&staging, 0, 0, 0, 0, texture, 0, Some(&region(0)));
            let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
            context.Map(&staging, 0, D3D11_MAP_READ, 0, Some(&mut mapped))?;
            let row = CURTAIN_POSE_TILE as usize * 4;
            let mut on = vec![0; row * CURTAIN_POSE_TILE as usize];
            for y in 0..CURTAIN_POSE_TILE as usize {
                let source =
                    std::slice::from_raw_parts(mapped.pData.cast::<u8>().add(y * mapped.RowPitch as usize), row);
                on[y * row..(y + 1) * row].copy_from_slice(source);
            }
            context.Unmap(&staging, 0);
            let mut off = on.clone();
            for pixel in on.chunks_exact_mut(4) {
                pixel[3] = 255;
            }
            for pixel in off.chunks_exact_mut(4) {
                pixel[3] = 0;
            }
            Ok(Self { on, off })
        }
    }

    pub fn select(&self, texture: &ID3D11Texture2D, previous: u16, next: u16) -> windows::core::Result<()> {
        let previous = if previous == u16::MAX { 0 } else { previous };
        // SAFETY: owned verified atlas, bounded cell boxes and exact BGRA row pitches; no unrelated resource writes.
        unsafe {
            let context = texture.GetDevice()?.GetImmediateContext()?;
            if previous != next {
                context.UpdateSubresource(
                    texture,
                    0,
                    Some(&region(previous)),
                    self.off.as_ptr().cast(),
                    CURTAIN_POSE_TILE * 4,
                    0,
                );
            }
            context.UpdateSubresource(
                texture,
                0,
                Some(&region(next)),
                self.on.as_ptr().cast(),
                CURTAIN_POSE_TILE * 4,
                0,
            );
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn all_pose_cells_are_disjoint_and_avoid_the_marker() {
        assert_eq!(index(0), 0);
        assert_eq!(index(CURTAIN_WIDTH as u16), CURTAIN_POSE_COUNT as u16 - 1);
        for a in 0..CURTAIN_POSE_COUNT as u16 {
            let ra = region(a);
            assert!(ra.left >= 4 && ra.top >= 8);
            assert!(ra.right <= w0rplay_shared::CURTAIN_POSE_WIDTH && ra.bottom <= w0rplay_shared::CURTAIN_POSE_HEIGHT);
            for b in a + 1..CURTAIN_POSE_COUNT as u16 {
                let rb = region(b);
                assert!(ra.right <= rb.left || rb.right <= ra.left || ra.bottom <= rb.top || rb.bottom <= ra.top);
            }
        }
    }
}
