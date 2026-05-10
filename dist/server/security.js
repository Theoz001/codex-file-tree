import path from 'path';
import fs from 'fs/promises';
export const IGNORED_PATTERNS = [
    '.git',
    'node_modules',
    'dist',
    'build',
    '.next',
    'coverage',
    '.DS_Store',
    '.npm',
    '.yarn',
    '.pnpm-store',
    '.turbo',
    '.cache',
    '.parcel-cache',
    '.eslintcache',
    '.stylelintcache',
    '*.log',
    '*.tmp',
    '*.temp',
    '.idea',
    '.vscode',
    '__pycache__',
    '.pytest_cache',
    '.mypy_cache',
    '*.egg-info',
    'target', // Rust
    'Cargo.lock',
];
export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
export function isPathSafe(requestedPath, rootDir) {
    const resolvedPath = path.resolve(rootDir, requestedPath);
    const resolvedRoot = path.resolve(rootDir);
    // Check if resolved path is within root
    if (!resolvedPath.startsWith(resolvedRoot + path.sep) && resolvedPath !== resolvedRoot) {
        return false;
    }
    return true;
}
export function shouldIgnore(name) {
    return IGNORED_PATTERNS.some(pattern => {
        if (pattern.includes('*')) {
            const regex = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
            return regex.test(name);
        }
        return name === pattern;
    });
}
export async function isSymlinkSafe(filePath, rootDir) {
    try {
        const stats = await fs.lstat(filePath);
        if (stats.isSymbolicLink()) {
            const target = await fs.readlink(filePath);
            const resolvedTarget = path.resolve(path.dirname(filePath), target);
            const resolvedRoot = path.resolve(rootDir);
            return resolvedTarget.startsWith(resolvedRoot + path.sep) || resolvedTarget === resolvedRoot;
        }
        return true;
    }
    catch {
        return false;
    }
}
export function sanitizePath(inputPath) {
    // Remove null bytes
    let sanitized = inputPath.replace(/\0/g, '');
    // Normalize path separators
    sanitized = path.normalize(sanitized);
    // Remove leading path separators to prevent absolute path traversal
    sanitized = sanitized.replace(/^[/\\]+/, '');
    return sanitized;
}
//# sourceMappingURL=security.js.map