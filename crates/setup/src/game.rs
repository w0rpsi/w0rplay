//! Finding the game: every install of Euro Truck Simulator 2 and American Truck Simulator on the PC
//! (Steam's, in any of its libraries, and others Windows lists as installed), each with its version
//! (its executable's) and its DLCs.

use std::fmt;
use std::path::{Path, PathBuf};

use windows::Win32::Storage::FileSystem::{
    GetFileVersionInfoSizeW, GetFileVersionInfoW, VS_FIXEDFILEINFO, VerQueryValueW,
};
use windows::core::w;

use crate::{places, vdf};

/// The game app ids on Steam (manifests, Workshop folders, Steam Cloud folders): ETS2 and ATS.
pub const STEAM_APPS: &[&str] = &["227300", "270880"];
/// The game's primary app id on Steam (ETS2).
pub const STEAM_APP: &str = "227300";
/// The games' executables, in their folders.
const EXECUTABLES: &[&str] = &["bin/win_x64/eurotrucks2.exe", "bin/win_x64/amtrucks.exe"];
/// The games' processes, as Windows names them (TruckersMP's clients run the same).
const PROCESSES: &[&str] = &["eurotrucks2.exe", "amtrucks.exe"];
/// The game versions W0RPLAY has been tried with. Others may well work (the plugin finds what it needs in
/// the game by its shape), but haven't been tried.
pub const TESTED_VERSIONS: &str = "1.61.*";

/// An install of the game.
#[derive(Clone, Debug, PartialEq)]
pub struct Game {
    /// Its folder (with `base.scs`).
    pub dir: PathBuf,
    pub found_by: FoundBy,
    /// Its version, from its executable (`None`: it couldn't be read).
    pub version: Option<Version>,
    /// Its DLCs' archives, by name (`dlc_balkan_e`…), in order.
    pub dlcs: Vec<String>,
}

/// How an install was found.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FoundBy {
    /// In one of Steam's libraries.
    Steam,
    /// In Windows' list of installed programs (another store's, or SCS's own installer).
    Installed,
    /// The player chose its folder.
    Chosen,
}

/// The game's version: `1.61.1.9`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct Version(pub [u16; 4]);

impl Version {
    /// Whether a version pattern of the game's (`1.61.*`, `1.61.1.9`) takes in this version.
    pub fn matches(&self, pattern: &str) -> bool {
        let parts: Vec<&str> = pattern.trim().split('.').collect();
        parts.iter().enumerate().all(|(index, part)| {
            *part == "*" || (index < 4 && part.parse::<u16>().is_ok_and(|number| number == self.0[index]))
        }) && !parts.is_empty()
    }
}

impl fmt::Display for Version {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let [a, b, c, d] = self.0;
        write!(f, "{a}.{b}.{c}.{d}")
    }
}

impl Game {
    /// The game in `dir`, if it's an install of it: its archives and an executable (ETS2 or ATS) are there.
    pub fn at(dir: &Path, found_by: FoundBy) -> Option<Self> {
        if !dir.join("base.scs").is_file() {
            return None;
        }
        let exe = EXECUTABLES.iter().find(|exe| dir.join(exe).is_file())?;
        let mut dlcs: Vec<String> = std::fs::read_dir(dir)
            .ok()?
            .flatten()
            .filter_map(|entry| {
                let name = entry.file_name().to_str()?.to_owned();
                let dlc = name.strip_prefix("dlc_").is_some() && name.ends_with(".scs");
                dlc.then(|| name.trim_end_matches(".scs").to_owned())
            })
            .collect();
        dlcs.sort();
        Some(Self { dir: dir.to_path_buf(), found_by, version: executable_version(&dir.join(exe)), dlcs })
    }

    /// The game in `dir`, found as [`find`] finds it (Steam's, or listed as installed) or else as chosen.
    pub fn recognise(dir: &Path) -> Option<Self> {
        find().into_iter().find(|game| same_folder(&game.dir, dir)).or_else(|| Self::at(dir, FoundBy::Chosen))
    }

    /// Whether W0RPLAY has been tried with this version of the game ([`TESTED_VERSIONS`]).
    pub fn tested(&self) -> bool {
        self.version.is_some_and(|version| version.matches(TESTED_VERSIONS))
    }

    /// Where Steam keeps the game's Workshop mods, for an install in a Steam library (however it was found:
    /// a folder chosen there too).
    pub fn workshop(&self) -> Option<PathBuf> {
        let common = self.dir.parent()?;
        let steamapps = common.parent()?;
        let named = |path: &Path, name: &str| path.file_name().is_some_and(|n| n.eq_ignore_ascii_case(name));
        if !named(common, "common") || !named(steamapps, "steamapps") {
            return None;
        }
        for app in STEAM_APPS {
            let workshop = steamapps.join("workshop").join("content").join(app);
            if workshop.is_dir() {
                return Some(workshop);
            }
        }
        None
    }

    /// Where the plugin goes.
    pub fn plugins_dir(&self) -> PathBuf {
        self.dir.join("bin").join("win_x64").join("plugins")
    }

    /// The display name of the game (Euro Truck Simulator 2 or American Truck Simulator).
    pub fn name(&self) -> &'static str {
        if self.dir.join("bin/win_x64/amtrucks.exe").is_file()
            || self.dir.to_string_lossy().to_lowercase().contains("american")
        {
            "American Truck Simulator"
        } else {
            "Euro Truck Simulator 2"
        }
    }
}

/// Every install of the game found on the PC: Steam's first (in each of its libraries), then others Windows
/// lists as installed. Each folder once.
pub fn find() -> Vec<Game> {
    let mut found: Vec<Game> = Vec::new();
    let mut add = |game: Option<Game>| {
        if let Some(game) = game
            && !found.iter().any(|known| same_folder(&known.dir, &game.dir))
        {
            found.push(game);
        }
    };
    if let Some(steam) = places::steam() {
        for library in places::steam_libraries(&steam) {
            let steamapps = library.join("steamapps");
            for app in STEAM_APPS {
                let manifest = std::fs::read_to_string(steamapps.join(format!("appmanifest_{app}.acf"))).ok();
                if let Some(folder) = manifest.as_deref().and_then(steam_install_dir) {
                    add(Game::at(&steamapps.join("common").join(folder), FoundBy::Steam));
                }
            }
        }
    }
    for (name, location) in places::installed_programs() {
        if is_the_game(&name) {
            add(Game::at(&location, FoundBy::Installed));
        }
    }
    found
}

/// Whether the game is running (any install of it: ETS2 or ATS).
pub fn running() -> bool {
    running_process().is_some()
}

/// The executable name of the running game if active (e.g. "eurotrucks2.exe" or "amtrucks.exe").
pub fn running_process() -> Option<&'static str> {
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, PROCESSENTRY32W, Process32FirstW, Process32NextW, TH32CS_SNAPPROCESS,
    };
    // SAFETY: takes a snapshot of running processes on the system.
    let Ok(snapshot) = (unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) }) else { return None };
    let mut entry = PROCESSENTRY32W { dwSize: size_of::<PROCESSENTRY32W>() as u32, ..Default::default() };
    let mut found = None;
    // SAFETY: snapshot handle is valid; entry points to a properly sized struct.
    let mut more = unsafe { Process32FirstW(snapshot, &mut entry) }.is_ok();
    while more {
        let length = entry.szExeFile.iter().position(|&c| c == 0).unwrap_or(entry.szExeFile.len());
        let proc_name = String::from_utf16_lossy(&entry.szExeFile[..length]);
        if let Some(&p) = PROCESSES.iter().find(|p| proc_name.eq_ignore_ascii_case(p)) {
            found = Some(p);
            break;
        }
        // SAFETY: snapshot handle is valid; entry points to a properly sized struct.
        more = unsafe { Process32NextW(snapshot, &mut entry) }.is_ok();
    }
    // SAFETY: closes the process snapshot handle.
    unsafe { let _ = CloseHandle(snapshot); };
    found
}

/// The game install currently running, if one is active.
pub fn running_game() -> Option<Game> {
    let proc = running_process()?;
    let games = find();
    games.into_iter().find(|g| {
        if proc.eq_ignore_ascii_case("amtrucks.exe") {
            g.name() == "American Truck Simulator"
        } else {
            g.name() == "Euro Truck Simulator 2"
        }
    })
}

/// The game's folder name in its Steam library, from its `appmanifest_<appid>.acf`.
pub fn steam_install_dir(manifest: &str) -> Option<String> {
    let file = vdf::parse(manifest)?;
    let state = file.get("AppState")?;
    let appid = state.get("appid")?.text()?;
    STEAM_APPS.contains(&appid).then_some(())?;
    Some(state.get("installdir")?.text()?.to_owned())
}

/// Whether a program Windows lists is the game (Euro Truck Simulator 2 or American Truck Simulator).
pub fn is_the_game(name: &str) -> bool {
    let name = name.to_lowercase();
    (name.contains("euro truck simulator 2") || name.contains("american truck simulator")) && !name.contains("demo")
}

fn same_folder(a: &Path, b: &Path) -> bool {
    a.canonicalize().ok().is_some_and(|a| b.canonicalize().ok().is_some_and(|b| a == b))
}

fn executable_version(path: &Path) -> Option<Version> {
    let wide: Vec<u16> = path.as_os_str().encode_wide().chain(std::iter::once(0)).collect();
    // SAFETY: path is null-terminated wide string.
    let size = unsafe { GetFileVersionInfoSizeW(windows::core::PCWSTR(wide.as_ptr()), None) };
    if size == 0 {
        return None;
    }
    let mut data = vec![0u8; size as usize];
    // SAFETY: wide is null-terminated and data buffer has length `size`.
    unsafe { GetFileVersionInfoW(windows::core::PCWSTR(wide.as_ptr()), None, size, data.as_mut_ptr().cast()) }
        .ok()?;

    let mut info_ptr: *mut VS_FIXEDFILEINFO = std::ptr::null_mut();
    let mut info_len = 0u32;
    // SAFETY: data contains valid version info block; root block query returns a pointer to VS_FIXEDFILEINFO.
    unsafe {
        VerQueryValueW(
            data.as_ptr().cast(),
            w!(r"\"),
            (&raw mut info_ptr).cast(),
            &raw mut info_len,
        )
    }
    .as_bool()
    .then_some(())?;
    if info_ptr.is_null() || (info_len as usize) < size_of::<VS_FIXEDFILEINFO>() {
        return None;
    }
    // SAFETY: info_ptr is non-null and points to a validated VS_FIXEDFILEINFO struct within data.
    let info = unsafe { &*info_ptr };
    Some(Version([
        (info.dwFileVersionMS >> 16) as u16,
        (info.dwFileVersionMS & 0xFFFF) as u16,
        (info.dwFileVersionLS >> 16) as u16,
        (info.dwFileVersionLS & 0xFFFF) as u16,
    ]))
}

use std::os::windows::ffi::OsStrExt;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_wildcards_and_exact_parts() {
        let v = Version([1, 61, 1, 9]);
        assert!(v.matches("1.61.*"));
        assert!(v.matches("1.61.1.9"));
        assert!(!v.matches("1.60.*"));
        assert!(!v.matches("1.61.2.*"));
    }

    #[test]
    fn reads_the_install_dir_from_a_manifest() {
        let manifest = "\"AppState\"\n{\n\t\"appid\"\t\t\"227300\"\n\t\"installdir\"\t\t\"Euro Truck Simulator 2\"\n}";
        assert_eq!(steam_install_dir(manifest).as_deref(), Some("Euro Truck Simulator 2"));
        let ats_manifest = "\"AppState\"\n{\n\t\"appid\"\t\t\"270880\"\n\t\"installdir\"\t\t\"American Truck Simulator\"\n}";
        assert_eq!(steam_install_dir(ats_manifest).as_deref(), Some("American Truck Simulator"));
        assert_eq!(steam_install_dir("\"AppState\" { \"appid\" \"999999\" \"installdir\" \"OtherGame\" }"), None);
    }

    #[test]
    fn knows_the_game_in_windows_list_of_programs() {
        assert!(is_the_game("Euro Truck Simulator 2"));
        assert!(is_the_game("American Truck Simulator"));
        assert!(!is_the_game("Euro Truck Simulator 2 Demo"));
        assert!(!is_the_game("Other Simulator"));
    }
}
