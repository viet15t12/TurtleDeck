export declare class ExternalFilesManager {
    private readonly sendToRenderer;
    private rendererReady;
    private readonly pendingExternalFiles;
    constructor(sendToRenderer: (channel: string, payload: any) => void);
    extractSdeckFilesFromArgv(argv: string[]): string[];
    handleExternalFiles(filePaths: string[]): Promise<void>;
    onRendererReady(): void;
    isRendererReady(): boolean;
}
//# sourceMappingURL=external-files.d.ts.map