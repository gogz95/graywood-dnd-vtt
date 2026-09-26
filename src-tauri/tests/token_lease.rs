// src-tauri/tests/token_lease.rs
// Integration tests for the ephemeral token lease protocol.

use graywood_vtt_lib::state::lease::{acquire_lease, current_holder, new_lease_map, LEASE_TTL};
use tokio::time::{sleep, Duration};

#[tokio::test]
async fn user_a_acquires_lease_success() {
    let leases = new_lease_map();
    let acquired = acquire_lease(&leases, "token-001", "user-a").await;
    assert!(
        acquired,
        "user-a should acquire the lease on an unleased token"
    );
}

#[tokio::test]
async fn user_b_blocked_while_user_a_holds_lease() {
    let leases = new_lease_map();

    // User A acquires first.
    let a_ok = acquire_lease(&leases, "token-002", "user-a").await;
    assert!(a_ok, "user-a should acquire the lease");

    // User B attempts the same token immediately.
    let b_ok = acquire_lease(&leases, "token-002", "user-b").await;
    assert!(
        !b_ok,
        "user-b should be denied while user-a holds the lease (409 semantics)"
    );

    // Holder should still be user-a.
    let holder = current_holder(&leases, "token-002").await;
    assert_eq!(holder.as_deref(), Some("user-a"));
}

#[tokio::test]
async fn user_a_can_renew_own_lease() {
    let leases = new_lease_map();
    acquire_lease(&leases, "token-003", "user-a").await;

    // User A re-requests (renew/acquire) the same token — must succeed.
    let renewed = acquire_lease(&leases, "token-003", "user-a").await;
    assert!(renewed, "user-a should be able to renew their own lease");
}

#[tokio::test]
async fn lease_expires_and_user_b_can_acquire() {
    let leases = new_lease_map();

    // User A acquires the lease.
    acquire_lease(&leases, "token-004", "user-a").await;

    // Wait for TTL to expire.
    sleep(LEASE_TTL + Duration::from_millis(100)).await;

    // User B should now be able to acquire the expired slot.
    let b_ok = acquire_lease(&leases, "token-004", "user-b").await;
    assert!(b_ok, "user-b should acquire the lease after TTL expiry");

    let holder = current_holder(&leases, "token-004").await;
    assert_eq!(holder.as_deref(), Some("user-b"));
}

#[tokio::test]
async fn independent_tokens_do_not_interfere() {
    let leases = new_lease_map();

    acquire_lease(&leases, "token-alpha", "user-a").await;
    let b_ok = acquire_lease(&leases, "token-beta", "user-b").await;
    assert!(b_ok, "user-b should freely acquire a different token");
}
