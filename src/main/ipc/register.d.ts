import { IpcChannel, IpcRequest, IpcResponse } from '../../core/types/ipc.types.js';
import { DatabaseManager } from '../db/index.js';
import { PackageStore } from '../services/package-store.js';
import { AppPaths } from '../app/paths.js';
export interface IpcDispatcher {
    handle(channel: string, listener: (event: any, ...args: any[]) => any): void;
    on?(channel: string, listener: (event: any, ...args: any[]) => any): void;
}
export interface IpcContext {
    dbManager?: DatabaseManager;
    packageStore: PackageStore;
    paths: AppPaths;
    winOf?: (event?: any) => any;
    notify?: (channel: string, payload: any) => void;
    watchPath?: (dir: string) => void;
    knownSaves?: Map<string, number>;
}
export declare const defaultDispatcher: IpcDispatcher;
export declare function getFallbackErrorResponse(channel: string, errorMsg: string): any;
export declare function isValidSenderFrame(url?: string): boolean;
export declare function registerTypedHandler<C extends IpcChannel>(dispatcher: IpcDispatcher, channel: C, fn: (event: any, request: IpcRequest<C>) => Promise<IpcResponse<C>> | IpcResponse<C>): void;
export declare function registerAll(dispatcher: IpcDispatcher, ctx: IpcContext): void;
//# sourceMappingURL=register.d.ts.map