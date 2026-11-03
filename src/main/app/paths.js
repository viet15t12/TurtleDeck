// src/main/app/paths.ts — Quản lý đường dẫn dữ liệu người dùng
import path from 'node:path';
import electron from 'electron';
const { app } = electron || {};
export function createPaths(getUserData = () => app.getPath('userData'), getHome = () => app.getPath('home')) {
    return {
        userDataDir: () => getUserData(),
        progressFile: () => path.join(getUserData(), 'progress.json'),
        settingsFile: () => path.join(getUserData(), 'settings.json'),
        backupsDir: () => path.join(getUserData(), 'backups'),
        draftsDir: () => path.join(getUserData(), 'drafts'),
        defaultLibraryDir: () => path.join(getHome(), 'StudyDecks'),
    };
}
export const defaultPaths = createPaths();
//# sourceMappingURL=paths.js.map