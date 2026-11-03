// src/main/ipc/asset.ipc.ts — Handlers IPC cho quản lý ảnh trong bộ thẻ
import electron from 'electron';
const { dialog } = electron || {};
import { registerTypedHandler } from './register.js';
import * as assetService from '../services/asset-service.js';
export function registerAssetIpc(dispatcher, ctx) {
    registerTypedHandler(dispatcher, 'asset:add', async (event, req) => {
        const deckKey = typeof req === 'object' && req !== null ? req.deckKey : req;
        const pkg = ctx.packageStore.get(deckKey);
        if (!pkg)
            return [];
        const win = ctx.winOf ? ctx.winOf(event) : undefined;
        const r = await dialog.showOpenDialog(win, {
            title: 'Thêm ảnh vào bộ thẻ',
            properties: ['openFile', 'multiSelections'],
            filters: [{ name: 'Hình ảnh', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] }],
        });
        if (r.canceled || !r.filePaths.length)
            return [];
        return await assetService.addAssetFiles(ctx.packageStore, deckKey, r.filePaths);
    });
    registerTypedHandler(dispatcher, 'asset:addBytes', async (_event, req) => {
        const deckKey = typeof req === 'object' && req !== null && !Array.isArray(req) ? req.deckKey : req;
        const name = typeof req === 'object' && req !== null && !Array.isArray(req) ? req.name : arguments[2];
        const bytes = typeof req === 'object' && req !== null && !Array.isArray(req) ? req.bytes : arguments[3];
        return assetService.addAssetBytes(ctx.packageStore, deckKey, name, bytes);
    });
    registerTypedHandler(dispatcher, 'asset:list', async (_event, req) => {
        const deckKey = typeof req === 'object' && req !== null ? req.deckKey : req;
        return assetService.listAssets(ctx.packageStore, deckKey);
    });
    registerTypedHandler(dispatcher, 'asset:remove', async (_event, req) => {
        const deckKey = typeof req === 'object' && req !== null && !Array.isArray(req) ? req.deckKey : req;
        const assetPath = typeof req === 'object' && req !== null && !Array.isArray(req) ? req.assetPath : arguments[2];
        return assetService.removeAsset(ctx.packageStore, deckKey, assetPath);
    });
}
//# sourceMappingURL=asset.ipc.js.map