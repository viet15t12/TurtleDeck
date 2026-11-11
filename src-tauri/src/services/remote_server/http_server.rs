// src-tauri/src/services/remote_server/http_server.rs — Máy chủ HTTP & SSE phục vụ Web Remote Controller
use super::protocol::{AuthRequest, AuthResponse, RemoteAction, RemoteState};
use std::net::SocketAddr;
use std::sync::Arc;
use tauri::Emitter;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{broadcast, mpsc, RwLock};

pub const MOBILE_HTML: &str = include_str!("mobile.html");

#[derive(Clone)]
pub struct ServerContext {
    pub pin: Arc<RwLock<String>>,
    pub auth_token: Arc<RwLock<String>>,
    pub current_state: Arc<RwLock<RemoteState>>,
    pub sse_tx: broadcast::Sender<String>,
    pub action_tx: mpsc::Sender<RemoteAction>,
    pub app_handle: tauri::AppHandle,
}

pub struct HttpServer {
    port: u16,
    ctx: ServerContext,
    stop_tx: Option<tokio::sync::oneshot::Sender<()>>,
}

impl HttpServer {
    pub fn new(
        port: u16,
        pin: String,
        action_tx: mpsc::Sender<RemoteAction>,
        app_handle: tauri::AppHandle,
    ) -> (Self, broadcast::Sender<String>, Arc<RwLock<RemoteState>>) {
        let (sse_tx, _) = broadcast::channel(32);
        let current_state = Arc::new(RwLock::new(RemoteState::default()));
        let auth_token = Arc::new(RwLock::new(uuid::Uuid::new_v4().to_string()));

        let ctx = ServerContext {
            pin: Arc::new(RwLock::new(pin)),
            auth_token,
            current_state: Arc::clone(&current_state),
            sse_tx: sse_tx.clone(),
            action_tx,
            app_handle,
        };

        let server = Self {
            port,
            ctx,
            stop_tx: None,
        };

        (server, sse_tx, current_state)
    }

    pub async fn start(&mut self) -> Result<u16, String> {
        let addr = SocketAddr::from(([0, 0, 0, 0], self.port));
        let listener = TcpListener::bind(addr)
            .await
            .map_err(|e| format!("Không thể mở cổng {}: {}", self.port, e))?;

        let actual_port = listener.local_addr().map_err(|e| e.to_string())?.port();
        self.port = actual_port;

        let (stop_tx, mut stop_rx) = tokio::sync::oneshot::channel::<()>();
        self.stop_tx = Some(stop_tx);

        let ctx = self.ctx.clone();

        tokio::spawn(async move {
            loop {
                tokio::select! {
                    _ = &mut stop_rx => {
                        log::info!("Máy chủ Remote Controller đang dừng...");
                        break;
                    }
                    accept_res = listener.accept() => {
                        match accept_res {
                            Ok((stream, peer)) => {
                                let c = ctx.clone();
                                tokio::spawn(async move {
                                    if let Err(e) = handle_connection(stream, peer, c).await {
                                        log::debug!("Lỗi xử lý kết nối từ {}: {}", peer, e);
                                    }
                                });
                            }
                            Err(e) => {
                                log::warn!("Lỗi tiếp nhận kết nối: {}", e);
                            }
                        }
                    }
                }
            }
        });

        Ok(actual_port)
    }

    pub fn stop(&mut self) {
        if let Some(tx) = self.stop_tx.take() {
            let _ = tx.send(());
        }
    }

    pub async fn get_pin(&self) -> String {
        self.ctx.pin.read().await.clone()
    }

    pub async fn set_pin(&self, new_pin: String) {
        *self.ctx.pin.write().await = new_pin;
    }

    pub async fn get_token(&self) -> String {
        self.ctx.auth_token.read().await.clone()
    }
}

async fn handle_connection(
    mut stream: TcpStream,
    _peer: SocketAddr,
    ctx: ServerContext,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let mut buf = vec![0u8; 8192];
    let n = stream.read(&mut buf).await?;
    if n == 0 {
        return Ok(());
    }

    let raw_req = String::from_utf8_lossy(&buf[..n]);
    let mut lines = raw_req.lines();
    let request_line = match lines.next() {
        Some(l) => l,
        None => return Ok(()),
    };

    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or("GET");
    let full_path = parts.next().unwrap_or("/");

    let (path, query) = match full_path.split_once('?') {
        Some((p, q)) => (p, q),
        None => (full_path, ""),
    };

    // Tìm header Authorization
    let mut auth_header = None;
    for line in lines {
        if line.is_empty() {
            break;
        }
        if let Some((k, v)) = line.split_once(':') {
            if k.trim().eq_ignore_ascii_case("authorization") {
                auth_header = Some(v.trim().to_string());
            }
        }
    }

    // CORS preflight
    if method == "OPTIONS" {
        let resp = "HTTP/1.1 204 No Content\r\n\
                    Access-Control-Allow-Origin: *\r\n\
                    Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n\
                    Access-Control-Allow-Headers: Content-Type, Authorization\r\n\
                    Content-Length: 0\r\n\r\n";
        stream.write_all(resp.as_bytes()).await?;
        return Ok(());
    }

    match (method, path) {
        ("GET", "/") | ("GET", "/index.html") => {
            let html_bytes = MOBILE_HTML.as_bytes();
            let header = format!(
                "HTTP/1.1 200 OK\r\n\
                 Content-Type: text/html; charset=utf-8\r\n\
                 Content-Length: {}\r\n\
                 Access-Control-Allow-Origin: *\r\n\
                 Connection: close\r\n\r\n",
                html_bytes.len()
            );
            stream.write_all(header.as_bytes()).await?;
            stream.write_all(html_bytes).await?;
        }

        ("POST", "/api/auth") => {
            // Đọc body JSON
            let body_str = extract_body(&raw_req);
            let auth_req: Result<AuthRequest, _> = serde_json::from_str(body_str);
            let current_pin = ctx.pin.read().await.clone();
            let token = ctx.auth_token.read().await.clone();

            let resp_data = match auth_req {
                Ok(req) if req.pin == current_pin => AuthResponse {
                    success: true,
                    token: Some(token),
                    message: None,
                },
                Ok(_) => AuthResponse {
                    success: false,
                    token: None,
                    message: Some("Mã PIN không chính xác".to_string()),
                },
                Err(_) => AuthResponse {
                    success: false,
                    token: None,
                    message: Some("Dữ liệu không hợp lệ".to_string()),
                },
            };

            let json_bytes = serde_json::to_vec(&resp_data).unwrap_or_default();
            let header = format!(
                "HTTP/1.1 200 OK\r\n\
                 Content-Type: application/json; charset=utf-8\r\n\
                 Content-Length: {}\r\n\
                 Access-Control-Allow-Origin: *\r\n\
                 Connection: close\r\n\r\n",
                json_bytes.len()
            );
            stream.write_all(header.as_bytes()).await?;
            stream.write_all(&json_bytes).await?;
        }

        ("GET", "/api/events") => {
            // Xác thực token qua query (?token=...) hoặc Authorization header
            let token_in_query = extract_query_param(query, "token");
            let token_in_header = auth_header
                .as_ref()
                .and_then(|h| h.strip_prefix("Bearer ").map(|s| s.trim().to_string()));

            let req_token = token_in_query.or(token_in_header);
            let valid_token = ctx.auth_token.read().await.clone();

            if req_token != Some(valid_token) {
                let err_resp = "HTTP/1.1 401 Unauthorized\r\n\
                                Content-Type: application/json\r\n\
                                Content-Length: 32\r\n\
                                Access-Control-Allow-Origin: *\r\n\r\n\
                                {\"error\":\"Unauthorized: Bad Token\"}";
                stream.write_all(err_resp.as_bytes()).await?;
                return Ok(());
            }

            // Thiết lập Server-Sent Events stream
            let header = "HTTP/1.1 200 OK\r\n\
                          Content-Type: text/event-stream\r\n\
                          Cache-Control: no-cache\r\n\
                          Connection: keep-alive\r\n\
                          Access-Control-Allow-Origin: *\r\n\r\n";
            stream.write_all(header.as_bytes()).await?;

            // Báo cho giao diện desktop biết điện thoại vừa kết nối để đồng bộ câu hỏi mới nhất
            let _ = ctx.app_handle.emit("remote-client-connected", ());

            // Gửi state hiện tại ngay lập tức
            {
                let current_state = ctx.current_state.read().await.clone();
                if let Ok(state_json) = serde_json::to_string(&current_state) {
                    let init_msg = format!("event: state\ndata: {}\n\n", state_json);
                    stream.write_all(init_msg.as_bytes()).await?;
                }
            }

            let mut sse_rx = ctx.sse_tx.subscribe();
            let mut interval = tokio::time::interval(std::time::Duration::from_secs(15));

            loop {
                tokio::select! {
                    msg_res = sse_rx.recv() => {
                        match msg_res {
                            Ok(msg) => {
                                let payload = format!("event: state\ndata: {}\n\n", msg);
                                if stream.write_all(payload.as_bytes()).await.is_err() {
                                    break;
                                }
                            }
                            Err(broadcast::error::RecvError::Lagged(_)) => continue,
                            Err(broadcast::error::RecvError::Closed) => break,
                        }
                    }
                    _ = interval.tick() => {
                        // Keep-alive comment
                        if stream.write_all(b": keepalive\n\n").await.is_err() {
                            break;
                        }
                    }
                }
            }
        }

        ("POST", "/api/action") => {
            // Xác thực token
            let token_in_header = auth_header
                .as_ref()
                .and_then(|h| h.strip_prefix("Bearer ").map(|s| s.trim().to_string()));
            let valid_token = ctx.auth_token.read().await.clone();

            if token_in_header != Some(valid_token) {
                let err_resp = "HTTP/1.1 401 Unauthorized\r\n\
                                Content-Type: application/json\r\n\
                                Content-Length: 32\r\n\
                                Access-Control-Allow-Origin: *\r\n\r\n\
                                {\"error\":\"Unauthorized: Bad Token\"}";
                stream.write_all(err_resp.as_bytes()).await?;
                return Ok(());
            }

            let body_str = extract_body(&raw_req);
            match serde_json::from_str::<RemoteAction>(body_str) {
                Ok(action) => {
                    let _ = ctx.action_tx.send(action).await;
                    let resp = "HTTP/1.1 200 OK\r\n\
                                Content-Type: application/json\r\n\
                                Content-Length: 16\r\n\
                                Access-Control-Allow-Origin: *\r\n\r\n\
                                {\"success\":true}";
                    stream.write_all(resp.as_bytes()).await?;
                }
                Err(e) => {
                    let err_body = format!("{{\"error\":\"{}\"}}", e);
                    let resp = format!(
                        "HTTP/1.1 400 Bad Request\r\n\
                         Content-Type: application/json\r\n\
                         Content-Length: {}\r\n\
                         Access-Control-Allow-Origin: *\r\n\r\n{}",
                        err_body.len(),
                        err_body
                    );
                    stream.write_all(resp.as_bytes()).await?;
                }
            }
        }

        _ => {
            let resp = "HTTP/1.1 404 Not Found\r\n\
                        Content-Length: 9\r\n\
                        Access-Control-Allow-Origin: *\r\n\r\n\
                        Not Found";
            stream.write_all(resp.as_bytes()).await?;
        }
    }

    Ok(())
}

fn extract_body(raw_req: &str) -> &str {
    if let Some((_, body)) = raw_req.split_once("\r\n\r\n") {
        body
    } else if let Some((_, body)) = raw_req.split_once("\n\n") {
        body
    } else {
        ""
    }
}

fn extract_query_param(query: &str, param_name: &str) -> Option<String> {
    for part in query.split('&') {
        if let Some((k, v)) = part.split_once('=') {
            if k == param_name {
                return Some(v.to_string());
            }
        }
    }
    None
}
