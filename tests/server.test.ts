import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { createServer } from '../src/server/server.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;
let testDir: string;
let outsideDir: string;
let trashDir: string;
let writeToken: string;
let previousTrashDir: string | undefined;

function writeHeaders() {
  return { 'x-project-preview-write-token': writeToken };
}

beforeAll(async () => {
  // Create temporary test directory
  testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'project-preview-test-'));
  outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), 'project-preview-outside-'));
  trashDir = await fs.mkdtemp(path.join(os.tmpdir(), 'project-preview-trash-'));
  previousTrashDir = process.env.PROJECT_PREVIEW_TRASH_DIR;
  process.env.PROJECT_PREVIEW_TRASH_DIR = trashDir;

  // Create test files
  await fs.mkdir(path.join(testDir, 'subdir'), { recursive: true });
  await fs.writeFile(path.join(testDir, 'readme.md'), '# Test Project\n\nThis is a test.');
  await fs.writeFile(path.join(testDir, 'config.json'), '{"name": "test"}');
  await fs.writeFile(path.join(testDir, 'data.csv'), 'name,age\nAlice,30\nBob,25');
  await fs.writeFile(path.join(testDir, 'script.js'), 'console.log("hello");');
  await fs.writeFile(path.join(testDir, 'large.txt'), 'x'.repeat(6 * 1024 * 1024)); // 6MB
  await fs.writeFile(path.join(testDir, 'subdir', 'nested.txt'), 'nested content');
  await fs.writeFile(path.join(testDir, 'binary.bin'), Buffer.from([0x00, 0x01, 0x02, 0x03]));
  await fs.writeFile(path.join(outsideDir, 'secret.txt'), 'outside secret');
  await fs.symlink(
    path.join(outsideDir, 'secret.txt'),
    path.join(testDir, 'outside-link.txt')
  );
  await fs.symlink(outsideDir, path.join(testDir, 'outside-dir-link'));

  // Create ignored directories
  await fs.mkdir(path.join(testDir, 'node_modules'), { recursive: true });
  await fs.writeFile(path.join(testDir, 'node_modules', 'package.json'), '{}');
  await fs.mkdir(path.join(testDir, '.git'), { recursive: true });
  await fs.writeFile(path.join(testDir, '.git', 'config'), '');

  // Create a mock client dist directory with index.html for SPA tests
  const mockClientDist = path.join(testDir, 'client');
  await fs.mkdir(mockClientDist, { recursive: true });
  await fs.writeFile(path.join(mockClientDist, 'index.html'), '<!DOCTYPE html><html><head><title>Project Preview</title></head><body>Project Preview</body></html>');
  app = await createServer(testDir, 0, mockClientDist);

  const metaResponse = await app.inject({
    method: 'GET',
    url: '/api/meta',
  });
  writeToken = JSON.parse(metaResponse.payload).writeToken;
});

afterAll(async () => {
  await app.close();
  // Cleanup test directory
  await fs.rm(testDir, { recursive: true, force: true });
  await fs.rm(outsideDir, { recursive: true, force: true });
  await fs.rm(trashDir, { recursive: true, force: true });
  if (previousTrashDir === undefined) {
    delete process.env.PROJECT_PREVIEW_TRASH_DIR;
  } else {
    process.env.PROJECT_PREVIEW_TRASH_DIR = previousTrashDir;
  }
});

describe('Security', () => {
  it('should reject paths outside root directory', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/tree?path=../..',
    });

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.payload).error).toContain('outside root');
  });

  it('should reject absolute path traversal', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/file?path=/etc/passwd',
    });

    // Absolute paths are sanitized to relative paths, so it returns 500 (file not found)
    // rather than 403, because the sanitized path is still within root
    expect([403, 500]).toContain(response.statusCode);
  });

  it('should sanitize null byte in path', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/file?path=readme.md%00',
    });

    // Null bytes are sanitized/removed, so the file can be read normally
    // This is the expected behavior - the null byte is stripped
    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.payload);
    expect(data.name).toBe('readme.md');
  });

  it('should reject symlink targets outside root for file API', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/file?path=outside-link.txt',
    });

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.payload).error).toContain('outside root');
  });

  it('should reject traversal through a symlinked parent directory', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/file?path=outside-dir-link/secret.txt',
    });

    expect(response.statusCode).toBe(403);
    expect(response.payload).not.toContain('outside secret');
  });

  it('should not allow arbitrary cross-origin CORS preflight for writes', async () => {
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/api/file/save',
      headers: {
        origin: 'https://evil.example',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type,x-project-preview-write-token',
      },
    });

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('should require a valid write token for mutating APIs', async () => {
    const missingToken = await app.inject({
      method: 'POST',
      url: '/api/file/save',
      payload: { path: 'readme.md', content: 'blocked' },
    });
    const invalidToken = await app.inject({
      method: 'POST',
      url: '/api/file/save',
      headers: { 'x-project-preview-write-token': 'wrong' },
      payload: { path: 'readme.md', content: 'blocked' },
    });

    expect(missingToken.statusCode).toBe(403);
    expect(invalidToken.statusCode).toBe(403);
  });
});

describe('Tree API', () => {
  it('should return directory listing', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/tree',
    });

    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.payload);
    expect(data.nodes).toBeDefined();
    expect(Array.isArray(data.nodes)).toBe(true);
  });

  it('should ignore node_modules and .git', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/tree',
    });

    const data = JSON.parse(response.payload);
    const names = data.nodes.map((n: { name: string }) => n.name);

    expect(names).not.toContain('node_modules');
    expect(names).not.toContain('.git');
  });

  it('should include regular files and directories', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/tree',
    });

    const data = JSON.parse(response.payload);
    const names = data.nodes.map((n: { name: string }) => n.name);

    expect(names).toContain('readme.md');
    expect(names).toContain('subdir');
    expect(names).toContain('script.js');
  });

  it('should sort directories before files', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/tree',
    });

    const data = JSON.parse(response.payload);
    const types = data.nodes.map((n: { type: string }) => n.type);

    const firstFileIndex = types.indexOf('file');
    const lastDirIndex = types.lastIndexOf('directory');

    expect(firstFileIndex).toBeGreaterThan(lastDirIndex);
  });
});

describe('File API', () => {
  it('should read text file content', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/file?path=readme.md',
    });

    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.payload);
    expect(data.name).toBe('readme.md');
    expect(data.isText).toBe(true);
    expect(data.content).toContain('# Test Project');
    expect(data.absolutePath).toBe(path.join(testDir, 'readme.md'));
  });

  it('should detect large files', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/file?path=large.txt',
    });

    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.payload);
    expect(data.isLarge).toBe(true);
    expect(data.content).toBeUndefined();
  });

  it('should return JSON file info', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/file?path=config.json',
    });

    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.payload);
    expect(data.mimeType).toBe('application/json');
    expect(data.isText).toBe(true);
  });

  it('should return CSV file info', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/file?path=data.csv',
    });

    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.payload);
    expect(data.mimeType).toBe('text/csv');
    expect(data.isText).toBe(true);
  });

  it('should return 400 for directories', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/file?path=subdir',
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.payload).error).toContain('Not a file');
  });

  it('should return 400 for missing path', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/file',
    });

    expect(response.statusCode).toBe(400);
  });
});

describe('Raw API', () => {
  it('should serve raw file content', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/raw?path=readme.md',
    });

    expect(response.statusCode).toBe(200);
    expect(response.payload).toContain('# Test Project');
  });

  it('should reject paths outside root', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/raw?path=../secret.txt',
    });

    expect(response.statusCode).toBe(403);
  });

  it('should reject symlink targets outside root for raw API', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/raw?path=outside-link.txt',
    });

    expect(response.statusCode).toBe(403);
    expect(response.payload).not.toContain('outside secret');
  });
});

describe('Save API', () => {
  it('should save text file content', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/file/save',
      headers: writeHeaders(),
      payload: { path: 'readme.md', content: '# Updated Content' },
    });

    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.payload);
    expect(data.success).toBe(true);

    // Verify file was actually written
    const content = await fs.readFile(path.join(testDir, 'readme.md'), 'utf-8');
    expect(content).toBe('# Updated Content');

    // Restore original content for other tests
    await fs.writeFile(path.join(testDir, 'readme.md'), '# Test Project\n\nThis is a test.');
  });

  it('should reject saving a directory', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/file/save',
      headers: writeHeaders(),
      payload: { path: 'subdir', content: 'test' },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.payload).error).toContain('Not a file');
  });

  it('should reject saving a binary file', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/file/save',
      headers: writeHeaders(),
      payload: { path: 'binary.bin', content: 'test' },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.payload).error).toContain('Not a text file');
  });

  it('should reject saving content exceeding 5MB', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/file/save',
      headers: writeHeaders(),
      payload: { path: 'readme.md', content: 'x'.repeat(6 * 1024 * 1024) },
    });

    // Fastify returns 413 when the raw request body exceeds its limit;
    // our custom 5MB check runs only for bodies that make it past Fastify.
    expect([400, 413]).toContain(response.statusCode);
  });

  it('should reject paths outside root', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/file/save',
      headers: writeHeaders(),
      payload: { path: '../secret.txt', content: 'test' },
    });

    expect(response.statusCode).toBe(403);
  });

  it('should reject symlink targets outside root', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/file/save',
      headers: writeHeaders(),
      payload: { path: 'outside-link.txt', content: 'test' },
    });

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.payload).error).toContain('outside root');
  });

  it('should reject saving through a symlinked parent directory', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/file/save',
      headers: writeHeaders(),
      payload: { path: 'outside-dir-link/secret.txt', content: 'changed' },
    });

    expect(response.statusCode).toBe(403);
    await expect(fs.readFile(path.join(outsideDir, 'secret.txt'), 'utf-8')).resolves.toBe('outside secret');
  });

  it('should reject saving protected ignored paths', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/file/save',
      headers: writeHeaders(),
      payload: { path: '.git/config', content: 'changed' },
    });

    expect(response.statusCode).toBe(403);
  });
});

describe('Rename API', () => {
  it('should rename a file', async () => {
    await fs.writeFile(path.join(testDir, 'rename-me.txt'), 'rename me');

    const response = await app.inject({
      method: 'POST',
      url: '/api/fs/rename',
      headers: writeHeaders(),
      payload: { path: 'rename-me.txt', newName: 'renamed.txt' },
    });

    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.payload);
    expect(data.success).toBe(true);
    expect(data.newPath).toBe('renamed.txt');

    // Verify old file is gone and new file exists
    await expect(fs.access(path.join(testDir, 'rename-me.txt'))).rejects.toThrow();
    const content = await fs.readFile(path.join(testDir, 'renamed.txt'), 'utf-8');
    expect(content).toBe('rename me');

    // Cleanup
    await fs.unlink(path.join(testDir, 'renamed.txt'));
  });

  it('should reject renaming a directory', async () => {
    await fs.mkdir(path.join(testDir, 'rename-dir'), { recursive: true });
    await fs.writeFile(path.join(testDir, 'rename-dir', 'file.txt'), 'inside');

    const response = await app.inject({
      method: 'POST',
      url: '/api/fs/rename',
      headers: writeHeaders(),
      payload: { path: 'rename-dir', newName: 'renamed-dir' },
    });

    expect(response.statusCode).toBe(400);

    // Cleanup
    await fs.rm(path.join(testDir, 'rename-dir'), { recursive: true, force: true });
  });

  it('should reject rename when destination already exists', async () => {
    await fs.writeFile(path.join(testDir, 'existing-a.txt'), 'a');
    await fs.writeFile(path.join(testDir, 'existing-b.txt'), 'b');

    const response = await app.inject({
      method: 'POST',
      url: '/api/fs/rename',
      headers: writeHeaders(),
      payload: { path: 'existing-a.txt', newName: 'existing-b.txt' },
    });

    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.payload).error).toContain('already exists');

    // Cleanup
    await fs.unlink(path.join(testDir, 'existing-a.txt'));
    await fs.unlink(path.join(testDir, 'existing-b.txt'));
  });

  it('should reject new names containing path separators', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/fs/rename',
      headers: writeHeaders(),
      payload: { path: 'readme.md', newName: 'foo/bar.md' },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.payload).error).toContain('Invalid new name');
  });

  it('should reject new names containing ..', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/fs/rename',
      headers: writeHeaders(),
      payload: { path: 'readme.md', newName: '..' },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.payload).error).toContain('Invalid new name');
  });

  it('should reject paths outside root', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/fs/rename',
      headers: writeHeaders(),
      payload: { path: '../secret.txt', newName: 'safe.txt' },
    });

    expect(response.statusCode).toBe(403);
  });

  it('should reject renaming through a symlinked parent directory', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/fs/rename',
      headers: writeHeaders(),
      payload: { path: 'outside-dir-link/secret.txt', newName: 'renamed.txt' },
    });

    expect(response.statusCode).toBe(403);
    await expect(fs.readFile(path.join(outsideDir, 'secret.txt'), 'utf-8')).resolves.toBe('outside secret');
  });
});

describe('Trash API', () => {
  it('should move a file to trash', async () => {
    const trashFile = path.join(testDir, 'trash-me.txt');
    await fs.writeFile(trashFile, 'trash me');

    const response = await app.inject({
      method: 'POST',
      url: '/api/fs/trash',
      headers: writeHeaders(),
      payload: { path: 'trash-me.txt' },
    });

    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.payload);
    expect(data.success).toBe(true);

    // Verify file is gone from source
    await expect(fs.access(trashFile)).rejects.toThrow();
  });

  it('should reject paths outside root', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/fs/trash',
      headers: writeHeaders(),
      payload: { path: '../secret.txt' },
    });

    expect(response.statusCode).toBe(403);
  });

  it('should return 404 for non-existent path', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/fs/trash',
      headers: writeHeaders(),
      payload: { path: 'does-not-exist.txt' },
    });

    expect(response.statusCode).toBe(404);
  });

  it('should reject moving directories to trash', async () => {
    const dirPath = path.join(testDir, 'trash-dir');
    await fs.mkdir(dirPath, { recursive: true });

    const response = await app.inject({
      method: 'POST',
      url: '/api/fs/trash',
      headers: writeHeaders(),
      payload: { path: 'trash-dir' },
    });

    expect(response.statusCode).toBe(400);
    await expect(fs.access(dirPath)).resolves.toBeUndefined();
    await fs.rm(dirPath, { recursive: true, force: true });
  });

  it('should reject moving protected paths to trash', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/fs/trash',
      headers: writeHeaders(),
      payload: { path: '.git/config' },
    });

    expect(response.statusCode).toBe(403);
  });

  it('should reject trashing through a symlinked parent directory', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/fs/trash',
      headers: writeHeaders(),
      payload: { path: 'outside-dir-link/secret.txt' },
    });

    expect(response.statusCode).toBe(403);
    await expect(fs.readFile(path.join(outsideDir, 'secret.txt'), 'utf-8')).resolves.toBe('outside secret');
  });
});

describe('Health Check', () => {
  it('should return health status', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
    });

    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.payload);
    expect(data.status).toBe('ok');
    expect(data.root).toBe(testDir);
  });
});

describe('Meta API', () => {
  it('should return project identity for browser titles', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/meta',
    });

    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.payload);
    expect(data.name).toBe(path.basename(testDir));
    expect(data.root).toBe(testDir);
    expect(data.port).toBe(0);
    expect(typeof data.writeToken).toBe('string');
    expect(data.writeToken.length).toBeGreaterThan(20);
  });
});

describe('SPA Routes', () => {
  it('should serve index.html for non-API routes', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/',
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.payload).toContain(`${path.basename(testDir)} - Project Preview`);
  });

  it('should return 404 for unknown API routes', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/unknown',
    });

    expect(response.statusCode).toBe(404);
  });
});
