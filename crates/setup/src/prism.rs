//! PrismTextureStreamer assets and deployment for Euro Truck Simulator 2 and American Truck Simulator.
//!
//! SCS Prism3D interior cabin models and mods reference `/home/PrismTextureStreamer/gps.tobj`
//! and `/home/PrismTextureStreamer/dashboard.tobj`. In the SCS engine, `/home/` maps to the user's
//! game document directory (`Documents/Euro Truck Simulator 2/` and `Documents/American Truck Simulator/`).
//!
//! Embedding these assets directly into W0RPLAY ensures that the required fallback and streamer textures
//! are automatically deployed on setup or application startup without relying on external file presence.

use std::path::{Path, PathBuf};

pub const DASHBOARD_DDS: &[u8] = include_bytes!("../../../PrismTextureStreamer/dashboard.dds");
pub const DASHBOARD_TOBJ: &[u8] = include_bytes!("../../../PrismTextureStreamer/dashboard.tobj");
pub const GPS_DDS: &[u8] = include_bytes!("../../../PrismTextureStreamer/gps.dds");
pub const GPS_TOBJ: &[u8] = include_bytes!("../../../PrismTextureStreamer/gps.tobj");

pub const FILES: &[(&str, &[u8])] = &[
    ("dashboard.dds", DASHBOARD_DDS),
    ("dashboard.tobj", DASHBOARD_TOBJ),
    ("gps.dds", GPS_DDS),
    ("gps.tobj", GPS_TOBJ),
];

const GAME_FOLDERS: &[&str] = &["Euro Truck Simulator 2", "American Truck Simulator"];

/// Installs or updates PrismTextureStreamer textures into a target game document directory
/// (e.g. `Documents/Euro Truck Simulator 2/` or `Documents/American Truck Simulator/`).
pub fn install_into_documents(game_doc_dir: &Path) -> std::io::Result<PathBuf> {
    let target_dir = game_doc_dir.join("PrismTextureStreamer");
    std::fs::create_dir_all(&target_dir)?;
    for (name, content) in FILES {
        let file_path = target_dir.join(name);
        let needs_write = match std::fs::read(&file_path) {
            Ok(existing) => existing != *content,
            Err(_) => true,
        };
        if needs_write {
            std::fs::write(&file_path, content)?;
        }
    }
    Ok(target_dir)
}

/// Deploys PrismTextureStreamer textures into all known game document folders (ETS2 and ATS)
/// across all discovered document roots on this computer.
pub fn deploy_all() -> Vec<PathBuf> {
    let mut deployed = Vec::new();
    for folder_name in GAME_FOLDERS {
        for doc_root in crate::places::documents_folders() {
            let game_dir = doc_root.join(folder_name);
            if game_dir.is_dir() {
                if let Ok(path) = install_into_documents(&game_dir) {
                    if !deployed.contains(&path) {
                        deployed.push(path);
                    }
                }
            }
        }
    }
    deployed
}

/// Checks if PrismTextureStreamer files exist and match in the given game documents directory.
pub fn is_installed(game_doc_dir: &Path) -> bool {
    let target_dir = game_doc_dir.join("PrismTextureStreamer");
    FILES.iter().all(|(name, content)| {
        std::fs::read(target_dir.join(name)).map_or(false, |bytes| bytes == *content)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn assets_are_embedded_and_non_empty() {
        assert_eq!(DASHBOARD_DDS.len(), 131200);
        assert_eq!(DASHBOARD_TOBJ.len(), 88);
        assert_eq!(GPS_DDS.len(), 131200);
        assert_eq!(GPS_TOBJ.len(), 82);
    }

    #[test]
    fn test_install_into_documents() {
        let temp = std::env::temp_dir().join("w0rplay_prism_test");
        let _ = std::fs::remove_dir_all(&temp);
        let installed = install_into_documents(&temp).expect("install should succeed");
        assert!(installed.is_dir());
        assert!(is_installed(&temp));
        let _ = std::fs::remove_dir_all(&temp);
    }
}
