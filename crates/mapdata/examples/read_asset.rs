//! Local modelling helper: inspect a directory or extract one asset from the player's own game.
use std::{error::Error, path::Path};
use w0rplay_mapdata::archive::Archive;
fn main() -> Result<(), Box<dyn Error>> {
    let args: Vec<_> = std::env::args().collect();
    if args.len() < 4 {
        return Err("usage: read_asset ARCHIVE list|read VIRTUAL_PATH [OUTPUT]".into());
    }
    let archive = Archive::open(Path::new(&args[1]))?;
    match args[2].as_str() {
        "list" => {
            let listing = archive.list(&args[3])?.ok_or("directory not found")?;
            for name in listing.dirs {
                println!("{name}/");
            }
            for name in listing.files {
                println!("{name}");
            }
        }
        "read" => {
            let data = archive.read(&args[3])?.ok_or("asset not found")?;
            if let Some(output) = args.get(4) {
                std::fs::write(output, data)?;
            } else {
                println!("{}", std::str::from_utf8(&data)?);
            }
        }
        _ => return Err("expected list or read".into()),
    }
    Ok(())
}
