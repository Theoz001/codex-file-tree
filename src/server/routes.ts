import path from 'path';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import { timingSafeEqual } from 'crypto';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  assertExistingPathInsideRoot,
  assertParentInsideRoot,
  hasIgnoredSegment,
  isPathSafe,
  sanitizePath,
  MAX_FILE_SIZE,
  WRITE_TOKEN_HEADER,
} from './security.js';
import { getDirectoryTree, getFileInfo, getMimeType, isTextFile } from './file-utils.js';
import { moveToTrash } from './trash.js';

interface TreeQuery {
  path?: string;
}

interface FileQuery {
  path: string;
}

interface SaveBody {
  path: string;
  content: string;
}

interface RenameBody {
  path: string;
  newName: string;
}

interface MoveBody {
  path: string;
  targetDir: string;
}

interface TrashBody {
  path: string;
}

interface FolderInfo {
  name: string;
  path: string;
}

function getHeaderValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || '' : value || '';
}

function hasValidWriteToken(request: FastifyRequest, writeToken: string): boolean {
  const provided = getHeaderValue(request.headers[WRITE_TOKEN_HEADER]);
  if (!provided || !writeToken) {
    return false;
  }

  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(writeToken);
  return providedBuffer.length === expectedBuffer.length && timingSafeEqual(providedBuffer, expectedBuffer);
}

function requireWriteToken(request: FastifyRequest, reply: FastifyReply, writeToken: string): boolean {
  if (hasValidWriteToken(request, writeToken)) {
    return true;
  }

  void reply.status(403).send({ error: 'Write access denied' });
  return false;
}

function isErrno(err: unknown, code: string): boolean {
  return (err as NodeJS.ErrnoException).code === code;
}

function isAccessDenied(err: unknown): boolean {
  return isErrno(err, 'EACCES') || (err as Error).message.includes('outside root');
}

function isProtectedWritePath(safePath: string): boolean {
  return hasIgnoredSegment(safePath);
}

function isWithinRelativePath(candidatePath: string, parentPath: string): boolean {
  const relative = path.relative(parentPath, candidatePath);
  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

async function getFolderList(rootDir: string): Promise<FolderInfo[]> {
  const folders: FolderInfo[] = [{ name: path.basename(rootDir) || 'Project root', path: '' }];

  async function walk(directoryPath: string) {
    const entries = await fs.readdir(directoryPath, { withFileTypes: true });
    const directories = entries
      .filter(entry => entry.isDirectory() && !hasIgnoredSegment(entry.name))
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of directories) {
      const fullPath = path.join(directoryPath, entry.name);
      const relativePath = path.relative(rootDir, fullPath);
      if (hasIgnoredSegment(relativePath)) continue;

      try {
        await assertExistingPathInsideRoot(fullPath, rootDir);
        const stats = await fs.stat(fullPath);
        if (!stats.isDirectory()) continue;
        folders.push({ name: entry.name, path: relativePath });
        await walk(fullPath);
      } catch (err) {
        if (isAccessDenied(err) || isErrno(err, 'ENOENT')) continue;
        throw err;
      }
    }
  }

  await walk(rootDir);
  return folders;
}

function encodeContentDispositionFilename(filename: string): string {
  const fallback = filename.replace(/[^\x20-\x7e]|["\\;]/g, '_') || 'file';
  const encoded = encodeURIComponent(filename).replace(/['()]/g, char => `%${char.charCodeAt(0).toString(16)}`);
  return `inline; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

function parseRangeHeader(rangeHeader: string, fileSize: number): { start: number; end: number } | null {
  if (fileSize <= 0) return null;

  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match) return null;

  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) return null;

  if (!rawStart) {
    const suffixLength = Number(rawEnd);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
    return {
      start: Math.max(fileSize - suffixLength, 0),
      end: fileSize - 1,
    };
  }

  const start = Number(rawStart);
  const end = rawEnd ? Number(rawEnd) : fileSize - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end < start ||
    start >= fileSize
  ) {
    return null;
  }

  return {
    start,
    end: Math.min(end, fileSize - 1),
  };
}

export async function registerRoutes(fastify: FastifyInstance, rootDir: string, writeToken: string) {
  // GET /api/tree?path=...
  fastify.get('/api/tree', async (request: FastifyRequest<{ Querystring: TreeQuery }>, reply: FastifyReply) => {
    const rawPath = request.query.path || '';
    const safePath = sanitizePath(rawPath);

    if (!isPathSafe(safePath, rootDir)) {
      return reply.status(403).send({ error: 'Access denied: path is outside root directory' });
    }

    const targetPath = path.join(rootDir, safePath);

    try {
      await assertExistingPathInsideRoot(targetPath, rootDir);

      const stats = await fs.stat(targetPath);
      if (!stats.isDirectory()) {
        return reply.status(400).send({ error: 'Not a directory' });
      }

      const tree = await getDirectoryTree(targetPath, rootDir);
      return reply.send({ path: safePath, nodes: tree });
    } catch (err) {
      const error = err as Error;
      if (isAccessDenied(err)) {
        return reply.status(403).send({ error: error.message });
      }
      return reply.status(500).send({ error: error.message });
    }
  });

  // GET /api/folders
  fastify.get('/api/folders', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const folders = await getFolderList(rootDir);
      return reply.send({ folders });
    } catch (err) {
      const error = err as Error;
      if (isAccessDenied(err)) {
        return reply.status(403).send({ error: error.message });
      }
      return reply.status(500).send({ error: error.message });
    }
  });

  // GET /api/file?path=...
  fastify.get('/api/file', async (request: FastifyRequest<{ Querystring: FileQuery }>, reply: FastifyReply) => {
    const rawPath = request.query.path || '';
    const safePath = sanitizePath(rawPath);

    if (!safePath) {
      return reply.status(400).send({ error: 'Path is required' });
    }

    if (!isPathSafe(safePath, rootDir)) {
      return reply.status(403).send({ error: 'Access denied: path is outside root directory' });
    }

    const targetPath = path.join(rootDir, safePath);

    try {
      await assertExistingPathInsideRoot(targetPath, rootDir);

      const stats = await fs.stat(targetPath);
      if (!stats.isFile()) {
        return reply.status(400).send({ error: 'Not a file' });
      }

      const info = await getFileInfo(targetPath, rootDir);
      return reply.send(info);
    } catch (err) {
      const error = err as Error;
      if (isAccessDenied(err)) {
        return reply.status(403).send({ error: error.message });
      }
      return reply.status(500).send({ error: error.message });
    }
  });

  // GET /api/raw?path=...
  fastify.get('/api/raw', async (request: FastifyRequest<{ Querystring: FileQuery }>, reply: FastifyReply) => {
    const rawPath = request.query.path || '';
    const safePath = sanitizePath(rawPath);

    if (!safePath) {
      return reply.status(400).send({ error: 'Path is required' });
    }

    if (!isPathSafe(safePath, rootDir)) {
      return reply.status(403).send({ error: 'Access denied: path is outside root directory' });
    }

    const targetPath = path.join(rootDir, safePath);

    try {
      await assertExistingPathInsideRoot(targetPath, rootDir);

      const stats = await fs.stat(targetPath);
      if (!stats.isFile()) {
        return reply.status(400).send({ error: 'Not a file' });
      }

      const mimeType = getMimeType(targetPath);
      const rangeHeader = getHeaderValue(request.headers.range);

      reply
        .header('Accept-Ranges', 'bytes')
        .header('Content-Type', mimeType)
        .header('Content-Disposition', encodeContentDispositionFilename(path.basename(targetPath)));

      if (rangeHeader) {
        const range = parseRangeHeader(rangeHeader, stats.size);
        if (!range) {
          return reply
            .status(416)
            .header('Content-Range', `bytes */${stats.size}`)
            .send();
        }

        return reply
          .status(206)
          .header('Content-Length', String(range.end - range.start + 1))
          .header('Content-Range', `bytes ${range.start}-${range.end}/${stats.size}`)
          .send(createReadStream(targetPath, { start: range.start, end: range.end }));
      }

      return reply
        .header('Content-Length', String(stats.size))
        .send(createReadStream(targetPath));
    } catch (err) {
      const error = err as Error;
      if (isAccessDenied(err)) {
        return reply.status(403).send({ error: error.message });
      }
      return reply.status(500).send({ error: error.message });
    }
  });

  // POST /api/file/save
  fastify.post('/api/file/save', async (request: FastifyRequest<{ Body: SaveBody }>, reply: FastifyReply) => {
    if (!requireWriteToken(request, reply, writeToken)) {
      return reply;
    }

    const rawPath = request.body.path || '';
    const safePath = sanitizePath(rawPath);

    if (!safePath) {
      return reply.status(400).send({ error: 'Path is required' });
    }

    if (!isPathSafe(safePath, rootDir)) {
      return reply.status(403).send({ error: 'Access denied: path is outside root directory' });
    }

    if (isProtectedWritePath(safePath)) {
      return reply.status(403).send({ error: 'Access denied: protected path cannot be modified' });
    }

    const targetPath = path.join(rootDir, safePath);

    try {
      await assertExistingPathInsideRoot(targetPath, rootDir);

      const stats = await fs.stat(targetPath);
      if (!stats.isFile()) {
        return reply.status(400).send({ error: 'Not a file' });
      }

      // Verify it's a text file
      const mimeType = getMimeType(targetPath);
      if (!isTextFile(path.basename(targetPath), mimeType)) {
        return reply.status(400).send({ error: 'Not a text file' });
      }

      // Check content size
      const content = request.body.content || '';
      const encoder = new TextEncoder();
      const contentBytes = encoder.encode(content);
      if (contentBytes.length > MAX_FILE_SIZE) {
        return reply.status(400).send({ error: 'Content exceeds 5MB limit' });
      }

      await fs.writeFile(targetPath, content, 'utf-8');
      return reply.send({ success: true });
    } catch (err) {
      const error = err as Error;
      if (isErrno(err, 'ENOENT')) {
        return reply.status(404).send({ error: 'File not found' });
      }
      if (isAccessDenied(err)) {
        return reply.status(403).send({ error: error.message });
      }
      return reply.status(500).send({ error: error.message });
    }
  });

  // POST /api/fs/rename
  fastify.post('/api/fs/rename', async (request: FastifyRequest<{ Body: RenameBody }>, reply: FastifyReply) => {
    if (!requireWriteToken(request, reply, writeToken)) {
      return reply;
    }

    const rawPath = request.body.path || '';
    const newName = request.body.newName || '';
    const safePath = sanitizePath(rawPath);

    if (!safePath) {
      return reply.status(400).send({ error: 'Path is required' });
    }

    if (
      !newName ||
      newName.includes('\0') ||
      newName.includes('/') ||
      newName.includes('\\') ||
      newName === '..' ||
      newName === '.' ||
      newName.trim().length === 0 ||
      isProtectedWritePath(newName)
    ) {
      return reply.status(400).send({ error: 'Invalid new name' });
    }

    if (!isPathSafe(safePath, rootDir)) {
      return reply.status(403).send({ error: 'Access denied: path is outside root directory' });
    }

    if (isProtectedWritePath(safePath)) {
      return reply.status(403).send({ error: 'Access denied: protected path cannot be modified' });
    }

    const targetPath = path.join(rootDir, safePath);
    const parentDir = path.dirname(targetPath);
    const newPath = path.join(parentDir, newName);

    try {
      // Ensure new path is still within root
      if (!isPathSafe(path.relative(rootDir, newPath), rootDir)) {
        return reply.status(403).send({ error: 'Access denied: new path is outside root directory' });
      }

      await assertExistingPathInsideRoot(targetPath, rootDir);
      await assertParentInsideRoot(newPath, rootDir);

      const stats = await fs.lstat(targetPath);
      if (!stats.isFile() && !stats.isDirectory()) {
        return reply.status(400).send({ error: 'Only files and directories can be renamed' });
      }

      // Check destination doesn't exist
      try {
        await fs.lstat(newPath);
        return reply.status(409).send({ error: 'Destination already exists' });
      } catch (err) {
        if (!isErrno(err, 'ENOENT')) {
          throw err;
        }
      }

      await fs.rename(targetPath, newPath);
      return reply.send({ success: true, newPath: path.relative(rootDir, newPath) });
    } catch (err) {
      const error = err as Error;
      if (isErrno(err, 'ENOENT')) {
        return reply.status(404).send({ error: 'Source not found' });
      }
      if (isAccessDenied(err)) {
        return reply.status(403).send({ error: error.message });
      }
      return reply.status(500).send({ error: error.message });
    }
  });

  // POST /api/fs/move
  fastify.post('/api/fs/move', async (request: FastifyRequest<{ Body: MoveBody }>, reply: FastifyReply) => {
    if (!requireWriteToken(request, reply, writeToken)) {
      return reply;
    }

    const rawPath = request.body.path || '';
    const rawTargetDir = request.body.targetDir || '';
    const safePath = sanitizePath(rawPath);
    const safeTargetDir = sanitizePath(rawTargetDir);

    if (!safePath) {
      return reply.status(400).send({ error: 'Path is required' });
    }

    if (!isPathSafe(safePath, rootDir) || !isPathSafe(safeTargetDir, rootDir)) {
      return reply.status(403).send({ error: 'Access denied: path is outside root directory' });
    }

    if (isProtectedWritePath(safePath) || isProtectedWritePath(safeTargetDir)) {
      return reply.status(403).send({ error: 'Access denied: protected path cannot be modified' });
    }

    const sourcePath = path.join(rootDir, safePath);
    const targetDirPath = path.join(rootDir, safeTargetDir);
    const newPath = path.join(targetDirPath, path.basename(sourcePath));

    try {
      await assertExistingPathInsideRoot(sourcePath, rootDir);
      await assertExistingPathInsideRoot(targetDirPath, rootDir);
      await assertParentInsideRoot(newPath, rootDir);

      const sourceStats = await fs.lstat(sourcePath);
      if (!sourceStats.isFile() && !sourceStats.isDirectory()) {
        return reply.status(400).send({ error: 'Only files and directories can be moved' });
      }

      const targetStats = await fs.stat(targetDirPath);
      if (!targetStats.isDirectory()) {
        return reply.status(400).send({ error: 'Target is not a directory' });
      }

      if (sourceStats.isDirectory() && isWithinRelativePath(path.resolve(targetDirPath), path.resolve(sourcePath))) {
        return reply.status(400).send({ error: 'Cannot move a directory into itself' });
      }

      try {
        await fs.lstat(newPath);
        return reply.status(409).send({ error: 'Destination already exists' });
      } catch (err) {
        if (!isErrno(err, 'ENOENT')) {
          throw err;
        }
      }

      await fs.rename(sourcePath, newPath);
      return reply.send({
        success: true,
        newPath: path.relative(rootDir, newPath),
      });
    } catch (err) {
      const error = err as Error;
      if (isErrno(err, 'ENOENT')) {
        return reply.status(404).send({ error: 'Source or target not found' });
      }
      if (isAccessDenied(err)) {
        return reply.status(403).send({ error: error.message });
      }
      return reply.status(500).send({ error: error.message });
    }
  });

  // POST /api/fs/trash
  fastify.post('/api/fs/trash', async (request: FastifyRequest<{ Body: TrashBody }>, reply: FastifyReply) => {
    if (!requireWriteToken(request, reply, writeToken)) {
      return reply;
    }

    const rawPath = request.body.path || '';
    const safePath = sanitizePath(rawPath);

    if (!safePath) {
      return reply.status(400).send({ error: 'Path is required' });
    }

    if (!isPathSafe(safePath, rootDir)) {
      return reply.status(403).send({ error: 'Access denied: path is outside root directory' });
    }

    if (isProtectedWritePath(safePath)) {
      return reply.status(403).send({ error: 'Access denied: protected path cannot be modified' });
    }

    const targetPath = path.join(rootDir, safePath);

    try {
      await assertExistingPathInsideRoot(targetPath, rootDir);

      const stats = await fs.lstat(targetPath);
      if (!stats.isFile() && !stats.isDirectory()) {
        return reply.status(400).send({ error: 'Only files and directories can be moved to trash' });
      }

      await moveToTrash(targetPath);
      return reply.send({ success: true });
    } catch (err) {
      const error = err as Error;
      if (isErrno(err, 'ENOENT')) {
        return reply.status(404).send({ error: 'Path not found' });
      }
      if (isAccessDenied(err)) {
        return reply.status(403).send({ error: error.message });
      }
      return reply.status(500).send({ error: error.message });
    }
  });
}
