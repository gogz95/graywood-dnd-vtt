// src-tauri/src/state/epoch.rs
// Monotonic epoch ring buffer for WebSocket resync of missed token events.

use std::collections::VecDeque;
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::server::routes::ws::WsEvent;

pub const RING_CAPACITY: usize = 100;

#[derive(Debug)]
pub struct EpochBuffer {
    /// Monotonically increasing counter. Starts at 0; first event gets epoch 1.
    pub current_epoch: u64,
    cap: usize,
    /// Ring of (epoch, event) pairs, oldest at front, newest at back.
    ring: VecDeque<(u64, WsEvent)>,
}

impl EpochBuffer {
    pub fn new() -> Self {
        Self::new_with_capacity(RING_CAPACITY)
    }

    pub fn new_with_capacity(cap: usize) -> Self {
        Self {
            current_epoch: 0,
            cap,
            ring: VecDeque::with_capacity(cap + 1),
        }
    }

    /// Stamps `event` with the next epoch, appends it to the ring (evicting
    /// the oldest entry when the ring is full), and returns the assigned epoch.
    pub fn push_event(&mut self, event: WsEvent) -> u64 {
        self.current_epoch += 1;
        self.ring.push_back((self.current_epoch, event));
        if self.ring.len() > self.cap {
            self.ring.pop_front();
        }
        self.current_epoch
    }

    /// Returns all events that occurred *after* `since_epoch`.
    ///
    /// * `Some(vec)` – the caller missed some events and here they are.
    /// * `None`      – `since_epoch` has been evicted from the ring; the
    ///                 caller must fall back to a full DB snapshot (HTTP 410).
    pub fn get_missed_events(&self, since_epoch: u64) -> Option<Vec<WsEvent>> {
        // If the buffer is empty or the client is fully caught up, return an
        // empty slice (no missed events, no need for a snapshot).
        if self.ring.is_empty() || since_epoch >= self.current_epoch {
            return Some(Vec::new());
        }

        // The oldest epoch still in the ring.
        let oldest_epoch = self.ring.front().map(|(e, _)| *e).unwrap_or(0);

        // The client's last-seen epoch has been evicted → 410 Gone.
        // Any since_epoch that is strictly less than oldest_epoch means
        // we cannot guarantee a contiguous replay.
        if since_epoch < oldest_epoch {
            return None;
        }

        let events: Vec<WsEvent> = self
            .ring
            .iter()
            .filter(|(e, _)| *e > since_epoch)
            .map(|(_, ev)| ev.clone())
            .collect();

        Some(events)
    }
}

impl Default for EpochBuffer {
    fn default() -> Self {
        Self::new()
    }
}

pub type SharedEpochBuffer = Arc<RwLock<EpochBuffer>>;

pub fn new_epoch_buffer() -> SharedEpochBuffer {
    Arc::new(RwLock::new(EpochBuffer::new()))
}
