export declare const IGNORED_PATTERNS: string[];
export declare const MAX_FILE_SIZE: number;
export declare function isPathSafe(requestedPath: string, rootDir: string): boolean;
export declare function shouldIgnore(name: string): boolean;
export declare function isSymlinkSafe(filePath: string, rootDir: string): Promise<boolean>;
export declare function sanitizePath(inputPath: string): string;
//# sourceMappingURL=security.d.ts.map