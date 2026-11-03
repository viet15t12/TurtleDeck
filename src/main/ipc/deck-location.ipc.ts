// src/main/ipc/deck-location.ipc.ts — Đăng ký IPC cho các thao tác vị trí và liên kết bộ thẻ
import { IpcDispatcher, IpcContext, registerTypedHandler } from './register.js';
import { DeckLocationService } from '../services/deck-location-service.js';

export function registerDeckLocationIpc(dispatcher: IpcDispatcher, ctx: IpcContext): void {
  const deckLocationService = ctx.deckLocationService || (ctx.dbManager?.deckLocation
    ? new DeckLocationService(ctx.dbManager.deckLocation, null, {
        notify: ctx.notify,
        folderRepo: ctx.dbManager.folder,
        deckRepo: ctx.dbManager.deck,
        libraryDir: () => ctx.paths.defaultLibraryDir(),
      })
    : null);

  registerTypedHandler(dispatcher, 'deck:move', async (_e, req) => {
    if (!deckLocationService) return { ok: false, error: 'Dịch vụ vị trí bộ thẻ chưa sẵn sàng.' };
    return deckLocationService.moveDeck(req.deckId, req.newFolderId);
  });

  registerTypedHandler(dispatcher, 'deck:link', async (_e, req) => {
    if (!deckLocationService) return { ok: false, error: 'Dịch vụ vị trí bộ thẻ chưa sẵn sàng.' };
    return deckLocationService.linkDeck(req.deckId, req.targetFolderId);
  });

  registerTypedHandler(dispatcher, 'deck:unlink', async (_e, req) => {
    if (!deckLocationService) return { ok: false, error: 'Dịch vụ vị trí bộ thẻ chưa sẵn sàng.' };
    return deckLocationService.removeLocation(req.locationId, req.deleteFile);
  });

  registerTypedHandler(dispatcher, 'deck:getLocations', async (_e, req) => {
    if (!deckLocationService) return [];
    return deckLocationService.getLocationsByDeck(req.deckId);
  });
}

