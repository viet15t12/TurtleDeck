import { DatabaseManager } from './db/index.js';
export interface IpcDispatcher {
    handle(channel: string, listener: (event: any, ...args: any[]) => any): void;
}
export declare function registerTypedIpcHandlers(dbManager: DatabaseManager, dispatcher?: IpcDispatcher): void;
//# sourceMappingURL=ipc-handlers.d.ts.map