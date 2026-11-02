// src/core/assetprotocol.js — logic phục vụ ảnh giao thức asset:// từ bộ nhớ gói .sdeck.
// Pure function, ES module, có thể test bằng node --test mà không phụ thuộc Electron runtime.

export const MIME = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
};

export const IMG_PATH = /^img\/.+\.(png|jpe?g|gif|webp|svg)$/i;

export function handleAssetUrl(urlStr, packagesMap) {
  try {
    const u = new URL(urlStr);
    const pkg = packagesMap?.get(u.hostname); // hostname = deckKey
    if (!pkg || !pkg.assets) return { status: 404, error: 'Deck not found' };

    const decodedPath = decodeURIComponent(u.pathname);
    // Chặn path traversal (.., %2e%2e)
    if (decodedPath.includes('..') || u.pathname.includes('..')) {
      return { status: 404, error: 'Invalid path traversal' };
    }

    const rel = decodedPath.replace(/^\/+/, '');
    if (!IMG_PATH.test(rel)) {
      return { status: 404, error: 'Not a valid image path' };
    }

    const data = pkg.assets.get(rel);
    if (!data) {
      return { status: 404, error: 'Asset not found' };
    }

    const ext = rel.split('.').pop().toLowerCase();
    const contentType = MIME[ext] || 'application/octet-stream';

    return {
      status: 200,
      data,
      headers: {
        'Content-Type': contentType,
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      },
    };
  } catch (e) {
    return { status: 404, error: e.message };
  }
}

