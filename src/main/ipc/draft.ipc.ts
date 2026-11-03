// src/main/ipc/draft.ipc.ts — Handlers IPC cho bản nháp Editor (Auto-save)
import { IpcDispatcher, IpcContext, registerTypedHandler } from './register.js';
import * as draftService from '../services/draft-service.js';
import { getActiveLibraryDir } from '../services/library-service.js';

export function registerDraftIpc(dispatcher: IpcDispatcher, ctx: IpcContext): void {
  const getDeckDeps = () => ({
    packageStore: ctx.packageStore,
    draftsDir: () => ctx.paths.draftsDir(),
    getActiveLibraryDir: () => getActiveLibraryDir(ctx.paths.settingsFile(), ctx.paths.defaultLibraryDir()),
    dbManager: ctx.dbManager,
    watchPath: ctx.watchPath,
    knownSaves: ctx.knownSaves,
  });

  registerTypedHandler(dispatcher, 'draft:save', async (_event, req: any) => {
    return await draftService.saveDraft(ctx.paths.draftsDir(), ctx.packageStore, req);
  });

  registerTypedHandler(dispatcher, 'draft:delete', async (_event, req: any) => {
    const metaId = typeof req === 'object' && req !== null ? req.metaId : req;
    return await draftService.deleteDraft(ctx.paths.draftsDir(), metaId);
  });

  registerTypedHandler(dispatcher, 'draft:list', async () => {
    return await draftService.listDrafts(ctx.paths.draftsDir());
  });

  registerTypedHandler(dispatcher, 'draft:load', async (_event, req: any) => {
    const draftId = typeof req === 'object' && req !== null ? req.draftId : req;
    return await draftService.loadDraft(ctx.paths.draftsDir(), draftId, getDeckDeps());
  });
}

