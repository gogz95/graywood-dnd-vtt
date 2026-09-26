// src-tauri/tests/epoch_resync.rs
// Integration tests for the EpochBuffer ring behaviour.

use graywood_vtt_lib::server::routes::ws::WsEvent;
use graywood_vtt_lib::state::epoch::EpochBuffer;

fn make_event(n: u32) -> WsEvent {
    WsEvent::TokenMove {
        id: format!("tok-{}", n),
        x: n as f64,
        y: 0.0,
    }
}

/// Push 105 events into a 50-entry ring.
/// Oldest retained epoch = 105 - 50 + 1 = 56.
/// since=50 → evicted (50 < 56) → None (410 Gone).
/// since=90 → present  → returns 15 events (epochs 91..=105).
#[test]
fn push_105_events_ring_overflow() {
    // Cap=50: after 105 pushes the ring holds epochs 56..=105.
    let mut buf = EpochBuffer::new_with_capacity(50);
    for i in 1u32..=105 {
        buf.push_event(make_event(i));
    }

    assert_eq!(buf.current_epoch, 105);

    // since=50 is before oldest (56) → evicted → None
    let result_50 = buf.get_missed_events(50);
    assert!(
        result_50.is_none(),
        "epoch 50 should have been evicted (oldest is 56 after 105 pushes into cap-50 ring)"
    );

    // since=90 is within the ring (90 >= 56) → 15 events (91..=105)
    let result_90 = buf.get_missed_events(90);
    assert!(result_90.is_some(), "epoch 90 should still be in the ring");
    let events = result_90.unwrap();
    assert_eq!(
        events.len(),
        15,
        "expected 15 events (epochs 91..=105), got {}",
        events.len()
    );
}

#[test]
fn acquire_on_empty_buffer_returns_empty_vec() {
    let buf = EpochBuffer::new();
    let result = buf.get_missed_events(0);
    assert_eq!(result, Some(Vec::new()));
}

#[test]
fn caught_up_client_returns_empty_vec() {
    let mut buf = EpochBuffer::new();
    buf.push_event(make_event(1));
    buf.push_event(make_event(2));
    // Client already has epoch 2 — nothing missed.
    let result = buf.get_missed_events(2);
    assert_eq!(result, Some(Vec::new()));
}

#[test]
fn ring_never_exceeds_capacity() {
    let mut buf = EpochBuffer::new();
    for i in 0..200 {
        buf.push_event(make_event(i));
    }
    // We can't directly inspect ring size from outside, but get_missed_events(0)
    // returning None proves the oldest items were evicted.
    assert!(
        buf.get_missed_events(0).is_none(),
        "epoch 0 must have been evicted after 200 pushes"
    );
}
