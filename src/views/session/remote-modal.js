// src/views/session/remote-modal.js — Hộp thoại kết nối điều khiển từ xa
import { h } from '../dom.js';
import { generateQrSvg } from './qr-svg.js';
import { invokeTyped } from '../../platform/tauri-api.js';

let activeModalEl = null;

export async function openRemoteModal(onStatusChange) {
  closeRemoteModal();

  const backdrop = h('div', { class: 'modal-backdrop' });
  const modal = h('div', { class: 'modal-card', style: 'max-width: 440px; text-align: center;' });
  backdrop.append(modal);

  modal.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
      <h3 style="margin: 0; font-size: 18px; display: flex; align-items: center; gap: 8px;">
        <span>📱</span> Điều khiển từ xa (Phone Remote)
      </h3>
      <button class="ux-btn ghost close-btn" style="padding: 4px 8px; font-size: 16px;">✕</button>
    </div>
    <div id="remote-modal-content">
      <div class="muted" style="padding: 24px 0;">Đang kiểm tra trạng thái máy chủ...</div>
    </div>
  `;

  document.body.appendChild(backdrop);
  activeModalEl = backdrop;

  modal.querySelector('.close-btn').onclick = closeRemoteModal;
  backdrop.onclick = (e) => {
    if (e.target === backdrop) closeRemoteModal();
  };

  await refreshModalContent(modal, onStatusChange);
}

export function closeRemoteModal() {
  if (activeModalEl && activeModalEl.parentNode) {
    activeModalEl.parentNode.removeChild(activeModalEl);
    activeModalEl = null;
  }
}

async function refreshModalContent(modal, onStatusChange) {
  const container = modal.querySelector('#remote-modal-content');
  if (!container) return;

  try {
    const info = await invokeTyped('remote:status');
    const isRunning = !!info?.running;

    if (!isRunning) {
      container.innerHTML = `
        <div style="padding: 16px 0;">
          <div style="font-size: 42px; margin-bottom: 12px;">📱🔌</div>
          <p style="margin-bottom: 16px; color: var(--c-text-muted, #64748b);">
            Bật tính năng này để điều khiển chọn đáp án (A/B/C/D), lật thẻ Flashcard và đọc lời giải thích trực tiếp trên điện thoại qua Wi-Fi.
          </p>
          <button class="ux-btn primary start-remote-btn" style="width: 100%; padding: 12px; font-weight: 600;">
            Bật điều khiển từ xa
          </button>
        </div>
      `;
      container.querySelector('.start-remote-btn').onclick = async () => {
        container.innerHTML = '<div class="muted" style="padding: 24px 0;">Đang khởi động máy chủ...</div>';
        await invokeTyped('remote:start');
        if (onStatusChange) onStatusChange(true);
        await refreshModalContent(modal, onStatusChange);
      };
      return;
    }

    if (onStatusChange) onStatusChange(true);

    // Server đang chạy
    const url = info.url || `http://${info.lan_ips?.[0] || '127.0.0.1'}:${info.port || 8765}`;
    const qrSvg = generateQrSvg(url, 180);

    container.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center; gap: 14px;">
        <div style="background: #ffffff; padding: 12px; border-radius: 12px; display: inline-flex; box-shadow: 0 4px 12px rgba(0,0,0,0.08);">
          ${qrSvg}
        </div>
        <p style="margin: 0; font-size: 13px; color: var(--c-text-muted, #64748b);">
          Quét mã QR bằng Camera điện thoại hoặc truy cập địa chỉ:
        </p>
        <div style="font-weight: 700; font-size: 15px; color: var(--c-primary, #3b82f6); user-select: text;">
          ${url}
        </div>

        <div style="width: 100%; background: var(--c-bg-subtle, rgba(0,0,0,0.03)); border: 1px solid var(--c-border, #e2e8f0); border-radius: 12px; padding: 12px; margin-top: 4px;">
          <div style="font-size: 12px; color: var(--c-text-muted, #64748b); text-transform: uppercase; margin-bottom: 4px;">
            Mã PIN xác thực
          </div>
          <div style="display: flex; align-items: center; justify-content: center; gap: 10px;">
            <span style="font-size: 26px; font-weight: 800; letter-spacing: 6px; color: var(--c-text, #0f172a);">
              ${info.pin}
            </span>
            <button class="ux-btn ghost change-pin-btn" style="padding: 4px 8px; font-size: 12px;" title="Tạo mã PIN mới">
              🔄 Đổi PIN
            </button>
          </div>
        </div>

        <div style="display: flex; gap: 8px; width: 100%; margin-top: 8px;">
          <button class="ux-btn stop-remote-btn" style="flex: 1; border-color: var(--c-danger, #ef4444); color: var(--c-danger, #ef4444);">
            Tắt điều khiển
          </button>
          <button class="ux-btn primary done-btn" style="flex: 1;">
            Xong
          </button>
        </div>
      </div>
    `;

    container.querySelector('.done-btn').onclick = closeRemoteModal;

    container.querySelector('.change-pin-btn').onclick = async () => {
      const newPin = String(Math.floor(1000 + Math.random() * 9000));
      await invokeTyped('remote:setPin', { pin: newPin });
      await refreshModalContent(modal, onStatusChange);
    };

    container.querySelector('.stop-remote-btn').onclick = async () => {
      await invokeTyped('remote:stop');
      if (onStatusChange) onStatusChange(false);
      await refreshModalContent(modal, onStatusChange);
    };
  } catch (err) {
    container.innerHTML = `
      <div style="color: var(--c-danger, #ef4444); padding: 16px 0;">
        Lỗi kết nối máy chủ điều khiển: ${err.message || err}
      </div>
    `;
  }
}
