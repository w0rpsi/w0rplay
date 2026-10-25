//! W0rpsiTextureStreamer assets and automatic deployment for Euro Truck Simulator 2 and American Truck Simulator.
//!
//! SCS Prism3D interior cabin models and mods reference `/home/W0rpsiTextureStreamer/gps.tobj`
//! and `/home/W0rpsiTextureStreamer/dashboard.tobj` (as well as legacy `/home/PrismTextureStreamer/`).
//! In the SCS Prism3D engine, `/home/` maps to the user's game document directory
//! (`Documents/Euro Truck Simulator 2/` and `Documents/American Truck Simulator/`).
//!
//! Embedding these assets directly into the W0RPLAY executable ensures that the required fallback and streamer
//! textures are automatically extracted and deployed on setup or application startup without needing loose external files.

use std::io;
use std::path::{Path, PathBuf};

pub const DASHBOARD_DDS: &[u8] = include_bytes!("../../../PrismTextureStreamer/dashboard.dds");
pub const GPS_DDS: &[u8] = include_bytes!("../../../PrismTextureStreamer/gps.dds");

/// Streamer folder names deployed for complete compatibility.
pub const STREAMER_NAMES: &[&str] = &[
    "W0rpsiTextureStreamer",
    "W0rpsiTextureSttreamer",
    "PrismTextureStreamer",
];

const GAME_FOLDERS: &[&str] = &["Euro Truck Simulator 2", "American Truck Simulator"];

/// Constructs an SCS `.tobj` file pointing to `dds_path` (e.g. `"/home/W0rpsiTextureStreamer/gps.dds"`).
pub fn create_tobj(dds_path: &str) -> Vec<u8> {
    const TOBJ_HEADER: [u8; 40] = [
        0x01, 0x0A, 0xB1, 0x70, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00,
        0x02, 0x00, 0x03, 0x03, 0x02, 0x00, 0x02, 0x02,
        0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x01, 0x00,
    ];
    let mut bytes = Vec::with_capacity(40 + 8 + dds_path.len());
    bytes.extend_from_slice(&TOBJ_HEADER);
    bytes.extend_from_slice(&(dds_path.len() as u64).to_le_bytes());
    bytes.extend_from_slice(dds_path.as_bytes());
    bytes
}

fn write_if_changed(path: &Path, content: &[u8]) -> io::Result<()> {
    let needs_write = match std::fs::read(path) {
        Ok(existing) => existing != content,
        Err(_) => true,
    };
    if needs_write {
        std::fs::write(path, content)?;
    }
    Ok(())
}

/// Installs a complete streamer package (`dashboard.dds`, `dashboard.tobj`, `gps.dds`, `gps.tobj`)
/// configured for `streamer_name` into `target_dir`.
pub fn install_streamer(target_dir: &Path, streamer_name: &str) -> io::Result<()> {
    std::fs::create_dir_all(target_dir)?;

    let gps_dds_path = format!("/home/{streamer_name}/gps.dds");
    let dash_dds_path = format!("/home/{streamer_name}/dashboard.dds");

    let gps_tobj = create_tobj(&gps_dds_path);
    let dash_tobj = create_tobj(&dash_dds_path);

    write_if_changed(&target_dir.join("dashboard.dds"), DASHBOARD_DDS)?;
    write_if_changed(&target_dir.join("dashboard.tobj"), &dash_tobj)?;
    write_if_changed(&target_dir.join("gps.dds"), GPS_DDS)?;
    write_if_changed(&target_dir.join("gps.tobj"), &gps_tobj)?;

    Ok(())
}

/// Installs streamer directories (`W0rpsiTextureStreamer`, `W0rpsiTextureSttreamer`, and legacy `PrismTextureStreamer`)
/// into the specified game document directory (`Documents/Euro Truck Simulator 2/` or `Documents/American Truck Simulator/`).
pub fn install_into_documents(game_doc_dir: &Path) -> io::Result<Vec<PathBuf>> {
    let mut installed = Vec::new();
    for name in STREAMER_NAMES {
        let dir = game_doc_dir.join(name);
        install_streamer(&dir, name)?;
        installed.push(dir);
    }
    Ok(installed)
}

/// Installs streamer directories into a user-selected custom directory.
/// If the directory contains `Euro Truck Simulator 2` or `American Truck Simulator` subdirectories,
/// it installs into those; otherwise it installs directly into the selected folder.
pub fn install_into_custom(chosen_dir: &Path) -> io::Result<Vec<PathBuf>> {
    let mut installed = Vec::new();
    let name = chosen_dir.file_name().and_then(|n| n.to_str()).unwrap_or("");
    if name.eq_ignore_ascii_case("Euro Truck Simulator 2") || name.eq_ignore_ascii_case("American Truck Simulator") {
        return install_into_documents(chosen_dir);
    }

    let ets2 = chosen_dir.join("Euro Truck Simulator 2");
    let ats = chosen_dir.join("American Truck Simulator");
    let mut found_any = false;
    if ets2.is_dir() {
        if let Ok(paths) = install_into_documents(&ets2) {
            installed.extend(paths);
            found_any = true;
        }
    }
    if ats.is_dir() {
        if let Ok(paths) = install_into_documents(&ats) {
            installed.extend(paths);
            found_any = true;
        }
    }
    if !found_any {
        installed.extend(install_into_documents(chosen_dir)?);
    }
    Ok(installed)
}

/// Deploys W0rpsiTextureStreamer textures into all known game document folders (ETS2 and ATS)
/// across all discovered document roots on this computer.
pub fn deploy_all() -> Vec<PathBuf> {
    let mut deployed = Vec::new();
    for folder_name in GAME_FOLDERS {
        for doc_root in crate::places::documents_folders() {
            let game_dir = doc_root.join(folder_name);
            if game_dir.is_dir() {
                if let Ok(paths) = install_into_documents(&game_dir) {
                    for path in paths {
                        if !deployed.contains(&path) {
                            deployed.push(path);
                        }
                    }
                }
            }
        }
    }
    deployed
}

/// Checks if W0rpsiTextureStreamer files exist and match in the given game documents directory.
pub fn is_installed(game_doc_dir: &Path) -> bool {
    let primary = game_doc_dir.join("W0rpsiTextureStreamer");
    primary.join("gps.dds").is_file()
        && primary.join("gps.tobj").is_file()
        && primary.join("dashboard.dds").is_file()
        && primary.join("dashboard.tobj").is_file()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn assets_are_embedded_and_non_empty() {
        assert_eq!(DASHBOARD_DDS.len(), 131200);
        assert_eq!(GPS_DDS.len(), 131200);
    }

    #[test]
    fn test_create_tobj_matches_scs_specification() {
        let legacy_gps = create_tobj("/home/PrismTextureStreamer/gps.dds");
        assert_eq!(legacy_gps.len(), 82);
        let expected_gps = include_bytes!("../../../PrismTextureStreamer/gps.tobj");
        assert_eq!(legacy_gps, expected_gps);

        let legacy_dash = create_tobj("/home/PrismTextureStreamer/dashboard.dds");
        assert_eq!(legacy_dash.len(), 88);
        let expected_dash = include_bytes!("../../../PrismTextureStreamer/dashboard.tobj");
        assert_eq!(legacy_dash, expected_dash);

        let w0rpsi_gps = create_tobj("/home/W0rpsiTextureStreamer/gps.dds");
        assert_eq!(w0rpsi_gps.len(), 40 + 8 + "/home/W0rpsiTextureStreamer/gps.dds".len());

        let w0rpsi_dash = create_tobj("/home/W0rpsiTextureStreamer/dashboard.dds");
        assert_eq!(w0rpsi_dash.len(), 40 + 8 + "/home/W0rpsiTextureStreamer/dashboard.dds".len());
    }
}
