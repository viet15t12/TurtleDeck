// src/main/services/asset-protocol.ts — Giao thức tuỳ chỉnh asset:// phục vụ ảnh từ gói .sdeck
import * as assetprotocol from '../../core/assetprotocol.js';
export function handleAssetRequest(url, packageStore) {
    return assetprotocol.handleAssetUrl(url, {
        resolveDeckKey: (key) => packageStore.get(key),
    });
}
//# sourceMappingURL=asset-protocol.js.map