// src-tauri/src/state/lease.rs
// Ephemeral token lease protocol preventing concurrent drag-and-drop conflicts.

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio::time::{Duration, Instant};

pub const LEASE_TTL: Duration = Duration::from_secs(3);

#[derive(Debug, Clone)]
pub struct TokenLease {
    pub user_id: String,
    pub expires_at: Instant,
}

impl TokenLease {
    pub fn new(user_id: String) -> Self {
        Self {
            user_id,
            expires_at: Instant::now() + LEASE_TTL,
        }
    }

    pub fn is_expired(&self) -> bool {
        Instant::now() >= self.expires_at
    }
}

pub type LeaseMap = Arc<RwLock<HashMap<String, TokenLease>>>;

/// Creates a new, empty shared lease map.
pub fn new_lease_map() -> LeaseMap {
    Arc::new(RwLock::new(HashMap::new()))
}

/// Attempts to acquire an exclusive lease on `instance_id` for `user_id`.
/// Returns `true` if acquired (no holder, expired, or same user renewing).
/// Returns `false` if a different user currently holds a valid lease.
pub async fn acquire_lease(leases: &LeaseMap, instance_id: &str, user_id: &str) -> bool {
    let mut map = leases.write().await;
    match map.get(instance_id) {
        Some(existing) if !existing.is_expired() && existing.user_id != user_id => false,
        _ => {
            map.insert(
                instance_id.to_string(),
                TokenLease::new(user_id.to_string()),
            );
            true
        }
    }
}

/// Renews an existing lease by 3 seconds if `user_id` matches the current holder.
/// Returns `true` if renewed, `false` if the lease is held by a different user or doesn't exist.
pub async fn renew_lease(leases: &LeaseMap, instance_id: &str, user_id: &str) -> bool {
    let mut map = leases.write().await;
    match map.get_mut(instance_id) {
        Some(existing) if existing.user_id == user_id => {
            existing.expires_at = Instant::now() + LEASE_TTL;
            true
        }
        _ => false,
    }
}

/// Returns the current holder's user_id if the lease is active, or None if unleased/expired.
pub async fn current_holder(leases: &LeaseMap, instance_id: &str) -> Option<String> {
    let map = leases.read().await;
    map.get(instance_id)
        .filter(|l| !l.is_expired())
        .map(|l| l.user_id.clone())
}

/// Removes all expired leases from the map. Called by the background pruner.
pub async fn prune_expired(leases: &LeaseMap) {
    let mut map = leases.write().await;
    map.retain(|_, lease| !lease.is_expired());
}

/// Spawns a background Tokio task that prunes expired leases every second.
pub fn spawn_lease_pruner(leases: LeaseMap) {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(1));
        loop {
            interval.tick().await;
            prune_expired(&leases).await;
        }
    });
}
