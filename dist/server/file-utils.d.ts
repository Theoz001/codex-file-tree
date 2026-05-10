export interface FileNode {
    name: string;
    path: string;
    type: 'file' | 'directory';
    size?: number;
    mtime?: string;
    mimeType?: string;
}
export interface FileInfo {
    name: string;
    path: string;
    size: number;
    mtime: string;
    mimeType: string;
    isText: boolean;
    content?: string;
    isLarge?: boolean;
}
export declare function getDirectoryTree(dirPath: string, rootDir: string): Promise<FileNode[]>;
export declare function getFileInfo(filePath: string, rootDir: string): Promise<FileInfo>;
export declare function getMimeType(filename: string): string;
export declare function isTextFile(filename: string, mimeType: string): boolean;
//# sourceMappingURL=file-utils.d.ts.map