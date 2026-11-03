// src/main/ipc/settings.ipc.ts — Handlers IPC cho cài đặt (settings.json)
import { registerTypedHandler } from './register.js';
import * as settingsService from '../services/settings-service.js';
export function registerSettingsIpc(dispatcher, ctx) {
    registerTypedHandler(dispatcher, 'settings:load', async () => {
        return await settingsService.loadSettings(ctx.paths.settingsFile());
    });
    registerTypedHandler(dispatcher, 'settings:save', async (_event, data) => {
        return await settingsService.saveSettings(ctx.paths.settingsFile(), data);
    });
}
//# sourceMappingURL=settings.ipc.js.map