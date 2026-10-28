//! Nonblocking key relay for explicitly configured cabin accessory controls.
use serde::Deserialize;
use std::time::{Duration, Instant};
use windows::Win32::UI::Input::KeyboardAndMouse::*;
use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};

#[derive(Clone, Copy, Debug, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Control {
    Light,
    Curtain,
}

pub fn allowed_key(key: u16) -> bool {
    matches!(key, 0x30..=0x39 | 0x41..=0x5a | 0x60..=0x69 | 0x7c..=0x87)
}

#[derive(Default)]
pub struct Relay {
    pending: Option<Press>,
}
struct Press {
    id: u32,
    key: u16,
    at: Instant,
    down: bool,
}

pub fn message(id: u32, state: &str) -> String {
    serde_json::json!({"type":"cabinAction", "id":id, "state":state}).to_string()
}

impl Relay {
    pub fn request(&mut self, id: u32, key: Option<u16>, now: Instant) -> &'static str {
        if self.pending.is_some() {
            return "busy";
        }
        let Some(key) = key.filter(|k| allowed_key(*k)) else {
            return "unassigned";
        };
        self.pending = Some(Press { id, key, at: now, down: false });
        "waiting"
    }

    pub fn cancel(&mut self) -> Option<(u32, &'static str)> {
        let p = self.pending.take()?;
        if p.down {
            send(p.key, false);
        }
        Some((p.id, "cancelled"))
    }

    pub fn tick(&mut self, now: Instant, game: u32, running: bool) -> Option<(u32, &'static str)> {
        self.pending.as_ref()?;
        let mut foreground = 0;
        // SAFETY: query writes only to this local process id.
        unsafe { GetWindowThreadProcessId(GetForegroundWindow(), Some(&mut foreground)) };
        let focused = running && game != 0 && foreground == game;
        // SAFETY: keyboard queries have no pointer arguments or side effects.
        let held = |key| unsafe { GetAsyncKeyState(key) < 0 };
        let modifiers = [0x10, 0x11, 0x12, 0x5b, 0x5c].into_iter().any(held);
        let key_held = self.pending.as_ref().is_some_and(|p| !p.down && held(p.key as i32));
        self.advance(now, focused, modifiers || key_held, send)
    }

    fn advance(
        &mut self,
        now: Instant,
        focused: bool,
        held: bool,
        mut emit: impl FnMut(u16, bool) -> bool,
    ) -> Option<(u32, &'static str)> {
        let p = self.pending.as_mut()?;
        let elapsed = now.saturating_duration_since(p.at);
        let result = if !focused || elapsed > Duration::from_secs(8) {
            if p.down {
                emit(p.key, false);
            }
            Some("cancelled")
        } else if p.down && elapsed >= Duration::from_millis(100) {
            Some(if emit(p.key, false) { "sent" } else { "failed" })
        } else if !p.down && !held {
            if !emit(p.key, true) {
                Some("failed")
            } else {
                p.down = true;
                p.at = now;
                None
            }
        } else {
            None
        };
        let id = p.id;
        if let Some(state) = result {
            self.pending = None;
            Some((id, state))
        } else {
            None
        }
    }
}

impl Drop for Relay {
    fn drop(&mut self) {
        if let Some(p) = &self.pending
            && p.down
        {
            send(p.key, false);
        }
    }
}

fn send(key: u16, down: bool) -> bool {
    // SAFETY: pure conversion for a validated virtual key.
    let scan = unsafe { MapVirtualKeyW(key as u32, MAPVK_VK_TO_VSC) } as u16;
    if scan == 0 {
        return false;
    }
    let input = INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: VIRTUAL_KEY(0),
                wScan: scan,
                dwFlags: KEYEVENTF_SCANCODE | if down { KEYBD_EVENT_FLAGS(0) } else { KEYEVENTF_KEYUP },
                ..Default::default()
            },
        },
    };
    // SAFETY: a single correctly sized INPUT, valid for the duration of SendInput.
    unsafe { SendInput(&[input], std::mem::size_of::<INPUT>() as i32) == 1 }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn waits_for_alt_then_holds_without_blocking_and_releases() {
        let mut relay = Relay::default();
        let now = Instant::now();
        let mut keys = Vec::new();
        assert_eq!(relay.request(1, Some(0x4f), now), "waiting");
        assert_eq!(
            relay.advance(now, true, true, |k, d| {
                keys.push((k, d));
                true
            }),
            None
        );
        assert!(keys.is_empty());
        relay.advance(now, true, false, |k, d| {
            keys.push((k, d));
            true
        });
        assert_eq!(
            relay.advance(now + Duration::from_millis(110), true, false, |k, d| {
                keys.push((k, d));
                true
            }),
            Some((1, "sent"))
        );
        assert_eq!(keys, [(0x4f, true), (0x4f, false)]);
    }
    #[test]
    fn focus_loss_releases_and_expired_requests_never_press() {
        let now = Instant::now();
        let mut r = Relay::default();
        r.request(2, Some(0x41), now);
        assert_eq!(r.advance(now + Duration::from_secs(9), true, false, |_, _| panic!()), Some((2, "cancelled")));
        r.request(3, Some(0x41), now);
        r.advance(now, true, false, |_, d| {
            assert!(d);
            true
        });
        assert_eq!(
            r.advance(now, false, false, |_, d| {
                assert!(!d);
                true
            }),
            Some((3, "cancelled"))
        );
    }
    #[test]
    fn rejects_system_keys_and_preserves_pending_request() {
        let mut r = Relay::default();
        let now = Instant::now();
        for key in [0, 0x12, 0x5b, 0x73, 0xff] {
            assert_eq!(r.request(1, Some(key), now), "unassigned");
        }
        assert_eq!(r.request(2, Some(0x4f), now), "waiting");
        assert_eq!(r.request(3, Some(0x41), now), "busy");
        r.pending = None;
    }
}
