use crate::server::error::ServerError;
use crate::server::routes::ws::WsEvent;
use hmac::{Hmac, Mac};
use rusqlite::Connection;
use sha2::Sha256;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::{broadcast, mpsc, oneshot, Mutex};

type HmacSha256 = Hmac<Sha256>;

pub const DEFAULT_TOKEN_TTL_SECONDS: i64 = 86400 * 7; // 7 days session

type DatabaseJob = Box<dyn FnOnce(&mut Connection) + Send + 'static>;

/// Thread-safe serialized write queue for SQLite to eliminate LAN write contention and deadlocks.
#[derive(Clone)]
pub struct SerializedDbQueue {
    sender: mpsc::Sender<DatabaseJob>,
}

impl SerializedDbQueue {
    pub fn new(db: Connection) -> (Self, Arc<Mutex<Connection>>) {
        let (sender, mut receiver) = mpsc::channel::<DatabaseJob>(256);
        let shared_db = Arc::new(Mutex::new(db));
        let worker_db = shared_db.clone();

        tokio::spawn(async move {
            while let Some(job) = receiver.recv().await {
                let mut conn = worker_db.lock().await;
                job(&mut conn);
            }
        });

        (Self { sender }, shared_db)
    }

    /// Serializes and executes a write transaction on the database connection,
    /// returning the result through an asynchronous oneshot channel.
    pub async fn execute_write<F, R>(&self, action: F) -> Result<R, ServerError>
    where
        F: FnOnce(&mut Connection) -> Result<R, ServerError> + Send + 'static,
        R: Send + 'static,
    {
        let (resp_tx, resp_rx) = oneshot::channel();

        let job: DatabaseJob = Box::new(move |conn| {
            let res = action(conn);
            let _ = resp_tx.send(res);
        });

        self.sender
            .send(job)
            .await
            .map_err(|e| ServerError::Internal(format!("Database queue closed: {}", e)))?;

        resp_rx
            .await
            .map_err(|e| ServerError::Internal(format!("Database queue response error: {}", e)))?
    }
}

#[derive(Clone)]
pub struct AppState {
    pub db: Arc<Mutex<Connection>>,
    pub db_queue: SerializedDbQueue,
    pub ws_sender: broadcast::Sender<WsEvent>,
    pub token_secret: Vec<u8>,
    pub assets_dir: PathBuf,
    pub campaign_dir: Arc<tokio::sync::RwLock<Option<PathBuf>>>,
    pub companion_hub: Arc<crate::server::companion_hub::CompanionHub>,
    pub lease_map: crate::state::lease::LeaseMap,
    pub epoch_buffer: crate::state::epoch::SharedEpochBuffer,
}

impl AppState {
    pub fn new(db: Connection, token_secret: Vec<u8>, assets_dir: PathBuf) -> Self {
        let (ws_sender, _) = broadcast::channel(512);
        let (db_queue, shared_db) = SerializedDbQueue::new(db);

        Self {
            db: shared_db,
            db_queue,
            ws_sender,
            token_secret,
            assets_dir,
            campaign_dir: Arc::new(tokio::sync::RwLock::new(None)),
            companion_hub: Arc::new(crate::server::companion_hub::CompanionHub::new(
                "1337",
                "Graywood Campaign",
            )),
            lease_map: crate::state::lease::new_lease_map(),
            epoch_buffer: crate::state::epoch::new_epoch_buffer(),
        }
    }

    /// Generates a tamper-proof HMAC-SHA256 signed session token for a claimed character.
    pub fn generate_token(
        &self,
        character_id: &str,
        ttl_seconds: i64,
    ) -> Result<(String, i64), ServerError> {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|e| ServerError::Internal(e.to_string()))?
            .as_secs() as i64;
        let expires_at = now + ttl_seconds;

        let payload = format!("{}:{}", character_id, expires_at);
        let mut mac = HmacSha256::new_from_slice(&self.token_secret)
            .map_err(|e| ServerError::Internal(format!("HMAC init error: {}", e)))?;
        mac.update(payload.as_bytes());
        let signature = hex::encode(mac.finalize().into_bytes());

        let token = format!("{}.{}.{}", character_id, expires_at, signature);
        Ok((token, expires_at))
    }

    /// Verifies the token signature and expiration, returning the authenticated character_id.
    pub fn verify_token(&self, token: &str) -> Result<String, ServerError> {
        let parts: Vec<&str> = token.split('.').collect();
        if parts.len() != 3 {
            return Err(ServerError::Unauthorized(
                "Malformed authentication token".to_string(),
            ));
        }

        let character_id = parts[0];
        let expires_at: i64 = parts[1]
            .parse()
            .map_err(|_| ServerError::Unauthorized("Invalid token expiration".to_string()))?;
        let provided_sig = parts[2];

        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|e| ServerError::Internal(e.to_string()))?
            .as_secs() as i64;

        if now > expires_at {
            return Err(ServerError::Unauthorized(
                "Authentication token has expired".to_string(),
            ));
        }

        let payload = format!("{}:{}", character_id, expires_at);
        let mut mac = HmacSha256::new_from_slice(&self.token_secret)
            .map_err(|e| ServerError::Internal(format!("HMAC init error: {}", e)))?;
        mac.update(payload.as_bytes());

        let expected_sig = hex::encode(mac.finalize().into_bytes());
        if provided_sig != expected_sig {
            return Err(ServerError::Unauthorized(
                "Invalid token signature".to_string(),
            ));
        }

        Ok(character_id.to_string())
    }
}
