export declare const IGNORED_PATTERNS: string[];
export declare const MAX_FILE_SIZE: number;
export declare const WRITE_TOKEN_HEADER = "x-project-preview-write-token";
export declare function isPathSafe(requestedPath: string, rootDir: string): boolean;
export declare function shouldIgnore(name: string): boolean;
export declare function isSymlinkSafe(filePath: string, rootDir: string): Promise<boolean>;
export declare function sanitizePath(inputPath: string): string;
export declare function hasIgnoredSegment(requestedPath: string): boolean;
export declare function assertExistingPathInsideRoot(filePath: string, rootDir: string): Promise<void>;
export declare function assertParentInsideRoot(filePath: string, rootDir: string): Promise<void>;
//# sourceMappingURL=security.d.ts.map