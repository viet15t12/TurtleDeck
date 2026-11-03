// src/main/services/settings-service.ts — Quản lý nạp và lưu file cài đặt (settings.json)
import * as fsutil from '../../core/fsutil.js';
export async function loadSettings(settingsFile) {
    return await fsutil.loadSettingsFile(settingsFile);
}
export async function saveSettings(settingsFile, data) {
    return await fsutil.saveSettingsFile(settingsFile, data);
}
//# sourceMappingURL=settings-service.js.map