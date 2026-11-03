// src/main/services/asset-protocol.ts — Giao thức tuỳ chỉnh asset:// phục vụ ảnh từ gói .sdeck
import * as assetprotocol from '../../core/assetprotocol.js';
import { PackageStore } from './package-store.js';

export function handleAssetRequest(url: string, packageStore: PackageStore): any {
  return (assetprotocol as any).handleAssetUrl(url, {
    resolveDeckKey: (key: string) => packageStore.get(key),
  });
}

