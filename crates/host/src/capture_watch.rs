//! Recover a stalled capture only after input that should have painted a new frame.
//! A static page, a held key without movement and an unfocused game are allowed to remain idle.
use std::time::{Duration, Instant};

const PAINT_TIMEOUT: Duration = Duration::from_secs(2);
const RECOVERY_COOLDOWN: Duration = Duration::from_secs(10);

#[derive(Default)]
pub struct CaptureWatch {
    received: u64,
    pending: Option<Instant>,
    recovered: Option<Instant>,
}

impl CaptureWatch {
    pub fn input(&mut self, now: Instant, received: u64) {
        if self.pending.is_none() {
            self.received = received;
            self.pending = Some(now);
        }
    }

    pub fn observe(&mut self, now: Instant, received: u64, focused: bool) -> bool {
        if received != self.received || !focused {
            self.received = received;
            self.pending = None;
            return false;
        }
        let overdue = self.pending.is_some_and(|at| now.duration_since(at) >= PAINT_TIMEOUT);
        let cooled = self.recovered.is_none_or(|at| now.duration_since(at) >= RECOVERY_COOLDOWN);
        if overdue && cooled {
            self.pending = None;
            self.recovered = Some(now);
            return true;
        }
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn idle_capture_and_a_held_key_are_not_failures() {
        let now = Instant::now();
        let mut watch = CaptureWatch::default();
        assert!(!watch.observe(now + Duration::from_secs(60), 0, true));
        watch.input(now, 0);
        assert!(!watch.observe(now + Duration::from_secs(1), 0, true));
        assert!(watch.observe(now + PAINT_TIMEOUT, 0, true));
        assert!(!watch.observe(now + Duration::from_secs(60), 0, true));
    }

    #[test]
    fn delivered_paints_and_alt_tab_cancel_recovery() {
        let now = Instant::now();
        let mut watch = CaptureWatch::default();
        watch.input(now, 0);
        assert!(!watch.observe(now + PAINT_TIMEOUT, 1, true));
        watch.input(now + PAINT_TIMEOUT, 1);
        assert!(!watch.observe(now + PAINT_TIMEOUT * 2, 1, false));
        assert!(!watch.observe(now + PAINT_TIMEOUT * 3, 1, true));
    }

    #[test]
    fn continuous_input_does_not_postpone_detection_or_restart_in_a_loop() {
        let now = Instant::now();
        let mut watch = CaptureWatch::default();
        watch.input(now, 0);
        watch.input(now + Duration::from_secs(1), 0);
        assert!(watch.observe(now + PAINT_TIMEOUT, 0, true));
        watch.input(now + Duration::from_secs(3), 0);
        assert!(!watch.observe(now + Duration::from_secs(5), 0, true));
        assert!(watch.observe(now + PAINT_TIMEOUT + RECOVERY_COOLDOWN, 0, true));
    }
}
