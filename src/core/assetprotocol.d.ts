// src/core/assetprotocol.d.ts
export declare const IMG_PATH: RegExp;
export declare const MIME: Record<string, string>;
export declare function handleAssetUrl(url: string, context: { resolveDeckKey: (deckKey: string) => any } | Map<string, any>): {
  status: number;
  data?: any;
  headers?: Record<string, string>;
  error?: string;
};
