//! Taking W0RPLAY out of the game, for the companion's uninstall: its screens mod (from W0RPLAY's own folder,
//! and from the game's `mod` folder, where W0RPLAY up to 1.2 put it), and its entry from each profile's
//! active mods (so no profile asks for a mod that's gone). Installing does the last two as well, for a game
//! W0RPLAY 1.2 set up: the mod is the plugin's to mount now. The plugin is `plugin::uninstall`'s; W0RPLAY's
//! own data is the app's to remove.
//!
//! A profile is changed in its list of active mods only (`save::without_mods`: a binary profile byte for
//! byte but that list), checked before it's written (the profile without W0RPLAY reads back as the same
//! profile but for its entry), and written beside the old one and moved over it, so a profile is never left
//! half-written. It's written as the game reads it, decrypted; the game encrypts it again when it next saves.

use std::io;
use std::path::{Path, PathBuf};

use w0rplay_mapdata::save;
use w0rplay_mapdata::sii::Unit;

use crate::game_mod;
use crate::profiles;

/// Removes W0RPLAY's screens mod (and a copy left half-written) from the game's `mod` folder in Documents,
/// where W0RPLAY up to 1.2 put it (its own folder now: `game_mod`).
pub fn remove_mod(game_documents: &Path) -> io::Result<()> {
    remove_mod_from(&game_documents.join("mod"))
}

/// Removes W0RPLAY's screens mod (and a copy left half-written) from `dir`.
pub fn remove_mod_from(dir: &Path) -> io::Result<()> {
    for file in [dir.join(game_mod::FILE_NAME), dir.join(format!("{}.partial", game_mod::FILE_NAME))] {
        match std::fs::remove_file(&file) {
            Ok(()) => {}
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => return Err(error),
        }
    }
    Ok(())
}

/// How a profile lists W0RPLAY's mod: its package is the mod's file without `.scs` (`w0rplay|W0RPLAY`).
pub fn is_w0rplay(entry: &str) -> bool {
    entry.split('|').next() == Some(game_mod::FILE_NAME.trim_end_matches(".scs"))
}

/// What taking W0RPLAY out of the profiles did.
#[derive(Debug, Default, PartialEq)]
pub struct ProfilesReport {
    /// Profiles that listed it, and no longer do.
    pub changed: usize,
    /// Those it couldn't be taken out of, and why.
    pub failed: Vec<(PathBuf, String)>,
}

/// Takes W0RPLAY's mod out of every profile's active mods, in the game's Documents folder and Steam Cloud's
/// (`steam_userdata`).
pub fn remove_from_profiles(game_documents: &Path, steam_userdata: Option<&Path>) -> ProfilesReport {
    let mut report = ProfilesReport::default();
    for profile in profiles::find(game_documents, steam_userdata, None) {
        let file = profile.dir.join("profile.sii");
        match remove_from_profile(&file) {
            Ok(true) => report.changed += 1,
            Ok(false) => {}
            Err(error) => report.failed.push((file, error)),
        }
    }
    report
}

/// Takes W0RPLAY out of one profile file: `true` if it was listed.
pub fn remove_from_profile(file: &Path) -> Result<bool, String> {
    let data = std::fs::read(file).map_err(|e| e.to_string())?;
    let Some(changed) = save::without_mods(&data, is_w0rplay).map_err(|e| e.to_string())? else {
        return Ok(false);
    };
    check(&data, &changed)?;
    let partial = file.with_extension("sii.w0rplay-partial");
    std::fs::write(&partial, &changed).map_err(|e| e.to_string())?;
    if let Err(error) = std::fs::rename(&partial, file) {
        let _ = std::fs::remove_file(&partial);
        return Err(error.to_string());
    }
    Ok(true)
}

/// That the profile without W0RPLAY is the same profile in everything but its active mods, and those are
/// the same but for W0RPLAY's.
fn check(before: &[u8], after: &[u8]) -> Result<(), String> {
    let before = save::read(before).map_err(|e| e.to_string())?;
    let after = save::read(after).map_err(|e| e.to_string())?;
    let expected: Vec<String> = save::active_mods(&before).into_iter().filter(|m| !is_w0rplay(m)).collect();
    if save::active_mods(&after) != expected || without_mods(&before) != without_mods(&after) {
        return Err("the profile wouldn't read back the same: left as it was".into());
    }
    Ok(())
}

/// A unit's class, name and attributes, as compared.
type Compared<'a> = (&'a str, &'a str, Vec<&'a (String, String)>);

/// Every unit's class, name and attributes but its active mods (their entries, and a text profile's count).
fn without_mods(units: &[Unit]) -> Vec<Compared<'_>> {
    units
        .iter()
        .map(|unit| {
            let attributes = unit
                .attributes
                .iter()
                .filter(|(key, value)| !(key == "active_mods" && (value.contains('|') || value.parse::<u32>().is_ok())))
                .collect();
            (unit.class.as_str(), unit.name.as_str(), attributes)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn folder(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("w0rplay-uninstall-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn knows_w0rplay_by_its_package() {
        assert!(is_w0rplay("w0rplay|W0RPLAY"));
        assert!(!is_w0rplay("w0rplay_extras|Something"));
        assert!(!is_w0rplay("promods|ProMods"));
    }

    /// A text profile listing W0RPLAY loses that entry (and nothing else); one that doesn't is left alone,
    /// not even written.
    #[test]
    fn takes_w0rplay_out_of_a_profile() {
        let dir = folder("profile");
        let file = dir.join("profile.sii");
        std::fs::write(
            &file,
            "SiiNunit\n{\nuser_profile : _nameless.1 {\n profile_name: Western\n active_mods: 2\n \
             active_mods[0]: \"w0rplay|W0RPLAY\"\n active_mods[1]: \"promods|ProMods\"\n}\n}\n",
        )
        .unwrap();
        assert_eq!(remove_from_profile(&file), Ok(true));
        let text = std::fs::read_to_string(&file).unwrap();
        assert!(text.contains(" active_mods: 1\n active_mods[0]: \"promods|ProMods\"\n"));
        assert!(text.contains("profile_name: Western"));
        let written = std::fs::metadata(&file).unwrap().modified().unwrap();
        assert_eq!(remove_from_profile(&file), Ok(false));
        assert_eq!(std::fs::metadata(&file).unwrap().modified().unwrap(), written);
        assert!(!dir.join("profile.sii.w0rplay-partial").exists());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn removes_the_mod_and_only_it() {
        let docs = folder("mod");
        let mods = docs.join("mod");
        std::fs::create_dir_all(&mods).unwrap();
        std::fs::write(mods.join(game_mod::FILE_NAME), b"mod").unwrap();
        std::fs::write(mods.join("promods.scs"), b"theirs").unwrap();
        remove_mod(&docs).unwrap();
        remove_mod(&docs).unwrap();
        assert!(!mods.join(game_mod::FILE_NAME).exists());
        assert!(mods.join("promods.scs").exists());
        // W0RPLAY's own folder, its half-written copy too.
        let ours = docs.join("W0RPLAY");
        std::fs::create_dir_all(&ours).unwrap();
        std::fs::write(ours.join(game_mod::FILE_NAME), b"mod").unwrap();
        std::fs::write(ours.join(format!("{}.partial", game_mod::FILE_NAME)), b"half").unwrap();
        std::fs::write(ours.join("settings.json"), b"{}").unwrap();
        remove_mod_from(&ours).unwrap();
        assert!(!ours.join(game_mod::FILE_NAME).exists());
        assert!(!ours.join(format!("{}.partial", game_mod::FILE_NAME)).exists());
        assert!(ours.join("settings.json").exists());
        let _ = std::fs::remove_dir_all(&docs);
    }
}
