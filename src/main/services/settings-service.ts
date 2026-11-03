// src/main/services/settings-service.ts — Quản lý nạp và lưu file cài đặt (settings.json)
import * as fsutil from '../../core/fsutil.js';

export async function loadSettings(settingsFile: string): Promise<any> {
  return await fsutil.loadSettingsFile(settingsFile);
}

export async function saveSettings(settingsFile: string, data: any): Promise<{ ok: boolean; error?: string }> {
  return await fsutil.saveSettingsFile(settingsFile, data);
}

