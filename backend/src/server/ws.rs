//! src-tauri/src/server/ws.rs
//! Canonical-path re-export shim: the WebSocket packet dispatch
//! (`WsEvent`, handlers, curtain/viewport fan-out) lives in
//! `server::routes::ws`. This module re-exports it so both
//! `crate::server::ws::…` and `crate::server::routes::ws::…` resolve to the
//! same implementation without duplicating dispatch logic.

pub use super::routes::ws::*;
