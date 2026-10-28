//! Release unused media browsers, retaining visible, playing and signing-in players.
use std::time::{Duration, Instant};

pub const IDLE_TIMEOUT: Duration = Duration::from_secs(60);

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MediaApp {
    Youtube,
    Spotify,
    AppleMusic,
    YoutubeMusic,
}

impl MediaApp {
    #[cfg(test)]
    pub const ALL: [Self; 4] = [Self::Youtube, Self::Spotify, Self::AppleMusic, Self::YoutubeMusic];
    const fn index(self) -> usize {
        self as usize
    }
}

pub struct PlayerLifetimes {
    visible: Option<MediaApp>,
    used: [Instant; 4],
    busy: [bool; 4],
}

impl PlayerLifetimes {
    pub fn new(now: Instant) -> Self {
        Self { visible: None, used: [now; 4], busy: [false; 4] }
    }

    pub fn visible(&mut self, app: Option<MediaApp>, now: Instant) {
        if let Some(previous) = self.visible {
            self.touch(previous, now);
        }
        self.visible = app;
        if let Some(app) = app {
            self.touch(app, now);
        }
    }

    pub fn touch(&mut self, app: MediaApp, now: Instant) {
        self.used[app.index()] = now;
    }

    pub fn report(&mut self, app: MediaApp, busy: bool, now: Instant) {
        // A pause starts its grace period now, even if the preceding playback was long.
        if busy || self.busy[app.index()] {
            self.touch(app, now);
        }
        self.busy[app.index()] = busy;
    }

    pub fn releasable(&self, app: MediaApp, now: Instant, signing_in: bool, auto_paused: bool) -> bool {
        self.visible != Some(app)
            && !self.busy[app.index()]
            && !signing_in
            && !auto_paused
            && now.saturating_duration_since(self.used[app.index()]) >= IDLE_TIMEOUT
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_releases_a_hidden_idle_player_after_its_grace_period() {
        let start = Instant::now();
        let mut players = PlayerLifetimes::new(start);
        let later = start + IDLE_TIMEOUT;
        let app = MediaApp::Spotify;
        assert!(!players.releasable(app, later - Duration::from_millis(1), false, false));
        assert!(players.releasable(app, later, false, false));
        players.visible(Some(app), later);
        assert!(!players.releasable(app, later + IDLE_TIMEOUT, false, false));
        players.visible(None, later + IDLE_TIMEOUT);
        assert!(!players.releasable(app, later + IDLE_TIMEOUT, false, false));
        assert!(players.releasable(app, later + IDLE_TIMEOUT * 2, false, false));
    }

    #[test]
    fn never_interrupts_playback_loading_sign_in_or_automatic_pause() {
        let start = Instant::now();
        for app in MediaApp::ALL {
            let mut players = PlayerLifetimes::new(start);
            let later = start + IDLE_TIMEOUT * 10;
            players.report(app, true, start);
            assert!(!players.releasable(app, later, false, false));
            players.report(app, false, later);
            assert!(!players.releasable(app, later, false, false));
            let expired = later + IDLE_TIMEOUT;
            assert!(!players.releasable(app, expired, true, false));
            assert!(!players.releasable(app, expired, false, true));
            assert!(players.releasable(app, expired, false, false));
            players.touch(app, expired);
            assert!(!players.releasable(app, expired, false, false));
        }
    }
}
