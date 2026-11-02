// src/views/editor/services.js — Giao tiếp API (window.api) và các tác vụ I/O
export function createServices(api, state) {
  async function loadLayoutSettings({ listColEl, previewColEl, onLayoutChange }) {
    if (!api?.loadSettings) return;
    try {
      const s = await api.loadSettings();
      if (typeof s?.editorListWidth === 'number') {
        state.listWidth = Math.max(200, Math.min(400, s.editorListWidth));
        if (listColEl) listColEl.style.width = `${state.listWidth}px`;
      }
      if (typeof s?.editorPreviewWidth === 'number') {
        state.previewWidth = Math.max(320, Math.min(640, s.editorPreviewWidth));
        if (previewColEl) previewColEl.style.width = `${state.previewWidth}px`;
      }
      if (typeof s?.editorPreviewCollapsed === 'boolean') {
        state.previewCollapsed = s.editorPreviewCollapsed;
        if (onLayoutChange) onLayoutChange();
      }
      if (Array.isArray(s?.recentMathSnippets)) {
        state.recentMathSnippets = s.recentMathSnippets.slice(0, 8);
      }
    } catch {
      // Bỏ qua nếu không đọc được settings
    }
  }

  async function persistLayoutSettings() {
    if (!api?.saveSettings) return;
    try {
      await api.saveSettings({
        editorListWidth: state.listWidth,
        editorPreviewWidth: state.previewWidth,
        editorPreviewCollapsed: state.previewCollapsed,
        recentMathSnippets: state.recentMathSnippets,
      });
    } catch {
      // Bỏ qua
    }
  }

  async function refreshAssets(onAssetsRefreshed) {
    if (!api?.listAssets) return [];
    try {
      const res = await api.listAssets(state.deckKey);
      if (res?.ok) {
        state.assetsList = res.assets || [];
        if (onAssetsRefreshed) onAssetsRefreshed(state.assetsList);
        return state.assetsList;
      }
    } catch {
      // Bỏ qua
    }
    return [];
  }

  async function uploadImageFile(file, { showToast, onAssetsRefreshed, onMarkDirty }) {
    if (!api?.addImageBytes) return null;
    try {
      const buf = await file.arrayBuffer();
      const res = await api.addImageBytes(state.deckKey, new Uint8Array(buf), file.name || 'clipboard.png');
      if (!res?.ok) {
        if (showToast) showToast('Không chèn được ảnh: ' + (res?.error || 'Lỗi'));
        return null;
      }
      await refreshAssets(onAssetsRefreshed);
      if (onMarkDirty) onMarkDirty();
      return res.path;
    } catch (e) {
      if (showToast) showToast('Lỗi đọc ảnh: ' + (e?.message || e));
      return null;
    }
  }

  async function pickImageFromDialog({ showToast, onAssetsRefreshed, onMarkDirty }) {
    if (!api?.addImages) return null;
    try {
      const res = await api.addImages(state.deckKey);
      if (!res?.length) return null;
      const first = res[0];
      if (!first.ok) {
        if (showToast) showToast('Không thêm được ảnh: ' + (first.error || 'Lỗi'));
        return null;
      }
      await refreshAssets(onAssetsRefreshed);
      if (onMarkDirty) onMarkDirty();
      return first.path;
    } catch (e) {
      if (showToast) showToast('Lỗi chọn ảnh: ' + (e?.message || e));
      return null;
    }
  }

  async function saveDeck(jsonText, opts = {}) {
    if (!api?.saveDeck) return { ok: false, error: 'API lưu không khả dụng.' };
    return api.saveDeck(state.deckKey, jsonText, opts);
  }

  async function removeAsset(assetPath) {
    if (!api?.removeAsset) return { ok: false };
    return api.removeAsset(state.deckKey, assetPath);
  }

  return {
    loadLayoutSettings,
    persistLayoutSettings,
    refreshAssets,
    uploadImageFile,
    pickImageFromDialog,
    saveDeck,
    removeAsset,
  };
}

