//! Bounded SDK event journal. Delivery is never inferred from a disappearing job.
use crate::{
    bridge,
    scs::{ConfigurationEvent, SCS_VALUE_TYPE_S64},
};
use std::ffi::CStr;
use std::sync::{Mutex, OnceLock};
use w0rplay_shared::{GameplayBatch, GameplayEvent};

static JOURNAL: Mutex<Option<GameplayBatch>> = Mutex::new(None);
pub static LAST_JOB: Mutex<Option<w0rplay_shared::JobInfo>> = Mutex::new(None);
static SESSION: OnceLock<u64> = OnceLock::new();

/// # Safety
/// Called only during the SDK gameplay callback. Its attribute layout matches configuration.
unsafe fn parse(info: &ConfigurationEvent, game_time: u32) -> Option<GameplayEvent> {
    if info.id.is_null() {
        return None;
    }
    // SAFETY: SDK strings and attributes remain valid throughout this callback.
    let name = unsafe { CStr::from_ptr(info.id) }.to_bytes();
    let kind = match name {
        b"job.delivered" | b"car_job.delivered" => 1,
        b"job.cancelled" | b"car_job.cancelled" => 2,
        b"player.fined" => 3,
        _ => return None,
    };
    let job = if kind == 3 {
        bridge::get().and_then(|b| b.plugin.job.read()).unwrap_or_default()
    } else {
        LAST_JOB.lock().unwrap_or_else(|e| e.into_inner()).unwrap_or_default()
    };
    let mut event = GameplayEvent { kind, game_time, job, ..Default::default() };
    // SAFETY: SDK-owned terminated attribute array, borrowed only within its callback.
    for attribute in unsafe { info.attributes() } {
        // SAFETY: non-null, terminated SDK attribute name.
        let key = unsafe { CStr::from_ptr(attribute.name) }.to_bytes();
        let value = &attribute.value;
        match (key, value.value_type) {
            (b"revenue" | b"cancel.penalty" | b"fine.amount", SCS_VALUE_TYPE_S64) => {
                event.amount = value.u64() as i64;
                event.provided |= 1;
            }
            (b"cargo.damage", 5) if value.float().is_finite() => {
                event.damage = value.float().clamp(0.0, 1.0);
                event.provided |= 2;
            }
            (b"distance.km", 5) if value.float().is_finite() => {
                event.distance_km = value.float().max(0.0);
                event.provided |= 4;
            }
            (b"earned.xp", 2) => {
                event.xp = value.s32();
                event.provided |= 8;
            }
            (b"autopark.used", 1) => {
                event.autopark = value.bool();
                event.provided |= 16;
            }
            _ => {}
        }
    }
    Some(event)
}

/// # Safety
/// SDK-owned gameplay info, alive for this callback.
pub unsafe fn record(info: &ConfigurationEvent, game_time: u32) {
    // SAFETY: inherited SDK callback contract.
    let Some(mut event) = (unsafe { parse(info, game_time) }) else { return };
    let session = *SESSION.get_or_init(|| {
        std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis() as u64
            ^ ((std::process::id() as u64) << 32)
    });
    let mut journal = JOURNAL.lock().unwrap_or_else(|e| e.into_inner());
    let batch = journal.get_or_insert_with(|| GameplayBatch { session, ..Default::default() });
    batch.sequence += 1;
    event.sequence = batch.sequence;
    batch.events[(event.sequence as usize - 1) % batch.events.len()] = event;
    if let Some(mapping) = bridge::get() {
        mapping.plugin.gameplay.write(batch);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scs::named_fixture as attr;
    #[test]
    fn decodes_sdk_signed_amount_damage_and_missing_fields() {
        let attrs = [
            attr(Some(c"revenue"), 13, (-50_i64) as u64),
            attr(Some(c"cargo.damage"), 5, 0.03_f32.to_bits() as u64),
            attr(Some(c"autopark.used"), 1, 1),
            attr(None, 0, 0),
        ];
        let info = ConfigurationEvent { id: c"job.delivered".as_ptr(), attributes: attrs.as_ptr() };
        // SAFETY: owned terminated fixture, all strings live through this call.
        let e = unsafe { parse(&info, 1200) }.unwrap();
        assert_eq!(e.kind, 1);
        assert_eq!(e.amount, -50);
        assert_eq!(e.provided, 19);
        assert!((e.damage - 0.03).abs() < 0.0001);
        assert!(e.autopark);
    }
    #[test]
    fn cancellation_fine_unknown_types_and_nan_are_distinct() {
        let attrs = [
            attr(Some(c"cargo.damage"), 5, f32::NAN.to_bits() as u64),
            attr(Some(c"fine.amount"), 3, 100),
            attr(None, 0, 0),
        ];
        for (name, kind) in [(c"job.cancelled", Some(2)), (c"player.fined", Some(3)), (c"player.use.ferry", None)] {
            let info = ConfigurationEvent { id: name.as_ptr(), attributes: attrs.as_ptr() };
            // SAFETY: owned terminated fixture; fields match the SDK layout.
            let result = unsafe { parse(&info, 0) };
            assert_eq!(result.map(|e| e.kind), kind);
            if let Some(e) = result {
                assert_eq!(e.provided, 0);
            }
        }
    }
}
