//! Read-only live bridge inspection; never sends game input or changes shared state.
use std::{sync::atomic::Ordering, time::Duration};
use w0rplay_shared::BridgeMapping;
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mapping = BridgeMapping::open()?;
    if !mapping.matches() {
        return Err("bridge version mismatch".into());
    }
    let b = mapping.bridge();
    for _ in 0..5 {
        if let Some(t) = b.plugin.telemetry.read() {
            println!(
                "game={} host={} frame={} screen={} typing={}/{} x={:.1} z={:.1} speed={:.2} paused={} beacon={} electric={}",
                b.plugin.pid.load(Ordering::Acquire),
                b.host.pid.load(Ordering::Acquire),
                b.plugin.heartbeat.load(Ordering::Acquire),
                b.plugin.screen_frame.load(Ordering::Acquire),
                b.typing.selection.load(Ordering::Acquire),
                b.typing.state.load(Ordering::Acquire),
                t.x,
                t.z,
                t.speed,
                t.paused,
                t.beacon,
                t.electric_enabled
            );
        }
        std::thread::sleep(Duration::from_millis(500));
    }
    Ok(())
}
