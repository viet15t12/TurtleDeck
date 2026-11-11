// src-tauri/src/services/remote_server/mod.rs — Quản lý vòng đời và sự kiện của Remote Server
pub mod http_server;
pub mod protocol;

use http_server::HttpServer;
use protocol::{RemoteAction, RemoteServerInfo, RemoteState};
use std::net::UdpSocket;
use std::sync::Arc;
use tauri::Emitter;
use tokio::sync::{broadcast, mpsc, RwLock};

pub struct RemoteService {
    server: Option<HttpServer>,
    sse_tx: Option<broadcast::Sender<String>>,
    current_state: Option<Arc<RwLock<RemoteState>>>,
    port: u16,
    pin: String,
}

impl Default for RemoteService {
    fn default() -> Self {
        Self::new()
    }
}

impl RemoteService {
    pub fn new() -> Self {
        Self {
            server: None,
            sse_tx: None,
            current_state: None,
            port: 8765,
            pin: generate_random_pin(),
        }
    }

    pub async fn start(
        &mut self,
        custom_port: Option<u16>,
        custom_pin: Option<String>,
        app_handle: tauri::AppHandle,
    ) -> Result<RemoteServerInfo, String> {
        self.stop();

        let port = custom_port.unwrap_or(self.port);
        let pin = custom_pin.unwrap_or_else(|| self.pin.clone());
        self.pin = pin.clone();

        let (action_tx, mut action_rx) = mpsc::channel::<RemoteAction>(64);
        let (mut server, sse_tx, current_state) =
            HttpServer::new(port, pin.clone(), action_tx, app_handle.clone());

        let actual_port = server.start().await?;
        self.port = actual_port;
        self.sse_tx = Some(sse_tx);
        self.current_state = Some(current_state);
        self.server = Some(server);

        // Spawn task chuyển tiếp action từ mobile sang Tauri event
        let handle = app_handle.clone();
        tokio::spawn(async move {
            while let Some(action) = action_rx.recv().await {
                if let Err(e) = handle.emit("remote-action", &action) {
                    log::warn!("Lỗi emit remote-action tới webview: {}", e);
                }
            }
        });

        Ok(self.get_info().await)
    }

    pub fn stop(&mut self) {
        if let Some(mut server) = self.server.take() {
            server.stop();
        }
        self.sse_tx = None;
        self.current_state = None;
    }

    pub async fn broadcast_state(&self, state: RemoteState) -> Result<(), String> {
        if let Some(ref current_state_lock) = self.current_state {
            *current_state_lock.write().await = state.clone();
        }

        if let Some(ref tx) = self.sse_tx {
            let json = serde_json::to_string(&state).map_err(|e| e.to_string())?;
            let _ = tx.send(json);
        }
        Ok(())
    }

    pub async fn get_info(&self) -> RemoteServerInfo {
        let running = self.server.is_some();
        let lan_ips = get_lan_ips();
        let primary_ip = lan_ips
            .first()
            .cloned()
            .unwrap_or_else(|| "127.0.0.1".to_string());
        let url = format!("http://{}:{}", primary_ip, self.port);

        RemoteServerInfo {
            running,
            port: self.port,
            pin: self.pin.clone(),
            lan_ips,
            url,
        }
    }

    pub async fn set_pin(&mut self, new_pin: String) {
        self.pin = new_pin.clone();
        if let Some(ref server) = self.server {
            server.set_pin(new_pin).await;
        }
    }
}

pub fn generate_random_pin() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .subsec_nanos();
    format!("{:04}", nanos % 10000)
}

pub fn get_lan_ips() -> Vec<String> {
    let mut ips = Vec::new();

    // Dùng UDP connect probe để tìm IP route mặc định
    if let Ok(socket) = UdpSocket::bind("0.0.0.0:0") {
        if socket.connect("8.8.8.8:80").is_ok() {
            if let Ok(local_addr) = socket.local_addr() {
                let ip = local_addr.ip().to_string();
                if ip != "0.0.0.0" && !ip.starts_with("127.") {
                    ips.push(ip);
                }
            }
        }
    }

    if ips.is_empty() {
        ips.push("127.0.0.1".to_string());
    }

    ips
}
