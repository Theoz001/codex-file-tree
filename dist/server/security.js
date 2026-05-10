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
export const WRITE_TOKEN_HEADER = 'x-project-preview-write-token';
function isWithinRoot(candidatePath, rootPath) {
    const relative = path.relative(rootPath, candidatePath);
    return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}
export function isPathSafe(requestedPath, rootDir) {
    const resolvedPath = path.resolve(rootDir, requestedPath);
    const resolvedRoot = path.resolve(rootDir);
    // Check if resolved path is within root
    return isWithinRoot(resolvedPath, resolvedRoot);
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
        await assertExistingPathInsideRoot(filePath, rootDir);
        return true;
    }
    catch (err) {
        // If the file doesn't exist, it's not an unsafe symlink
        if (err.code === 'ENOENT') {
            return true;
        }
        return false;
    }
}
export function sanitizePath(inputPath) {
    // Remove null bytes
    let sanitized = inputPath.replace(/\0/g, '');
    if (!sanitized) {
        return '';
    }
    // Normalize path separators
    sanitized = path.normalize(sanitized);
    return sanitized;
}
export function hasIgnoredSegment(requestedPath) {
    return requestedPath
        .split(/[\\/]+/)
        .filter(Boolean)
        .some(segment => shouldIgnore(segment));
}
export async function assertExistingPathInsideRoot(filePath, rootDir) {
    const resolvedPath = path.resolve(filePath);
    const resolvedRoot = path.resolve(rootDir);
    if (!isWithinRoot(resolvedPath, resolvedRoot)) {
        throw Object.assign(new Error('Access denied: path is outside root directory'), { code: 'EACCES' });
    }
    const [realPath, realRoot] = await Promise.all([
        fs.realpath(resolvedPath),
        fs.realpath(resolvedRoot),
    ]);
    if (!isWithinRoot(realPath, realRoot)) {
        throw Object.assign(new Error('Access denied: real path is outside root directory'), { code: 'EACCES' });
    }
}
export async function assertParentInsideRoot(filePath, rootDir) {
    const resolvedPath = path.resolve(filePath);
    const resolvedRoot = path.resolve(rootDir);
    if (!isWithinRoot(resolvedPath, resolvedRoot)) {
        throw Object.assign(new Error('Access denied: path is outside root directory'), { code: 'EACCES' });
    }
    const [realParent, realRoot] = await Promise.all([
        fs.realpath(path.dirname(resolvedPath)),
        fs.realpath(resolvedRoot),
    ]);
    if (!isWithinRoot(realParent, realRoot)) {
        throw Object.assign(new Error('Access denied: parent path is outside root directory'), { code: 'EACCES' });
    }
}
//# sourceMappingURL=security.js.map