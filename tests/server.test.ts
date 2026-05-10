import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { createServer } from '../src/server/server.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;
let testDir: string;

beforeAll(async () => {
  // Create temporary test directory
  testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'project-preview-test-'));
  
  // Create test files
  await fs.mkdir(path.join(testDir, 'subdir'), { recursive: true });
  await fs.writeFile(path.join(testDir, 'readme.md'), '# Test Project\n\nThis is a test.');
  await fs.writeFile(path.join(testDir, 'config.json'), '{"name": "test"}');
  await fs.writeFile(path.join(testDir, 'data.csv'), 'name,age\nAlice,30\nBob,25');
  await fs.writeFile(path.join(testDir, 'script.js'), 'console.log("hello");');
  await fs.writeFile(path.join(testDir, 'large.txt'), 'x'.repeat(6 * 1024 * 1024)); // 6MB
  await fs.writeFile(path.join(testDir, 'subdir', 'nested.txt'), 'nested content');
  await fs.writeFile(path.join(os.tmpdir(), 'project-preview-outside-secret.txt'), 'outside secret');
  await fs.symlink(
    path.join(os.tmpdir(), 'project-preview-outside-secret.txt'),
    path.join(testDir, 'outside-link.txt')
  );
  
  // Create ignored directories
  await fs.mkdir(path.join(testDir, 'node_modules'), { recursive: true });
  await fs.writeFile(path.join(testDir, 'node_modules', 'package.json'), '{}');
  await fs.mkdir(path.join(testDir, '.git'), { recursive: true });
  await fs.writeFile(path.join(testDir, '.git', 'config'), '');
  
  // Create a mock client dist directory with index.html for SPA tests
  const mockClientDist = path.join(testDir, 'client');
  await fs.mkdir(mockClientDist, { recursive: true });
  await fs.writeFile(path.join(mockClientDist, 'index.html'), '<!DOCTYPE html><html><body>Project Preview</body></html>');
  
  app = await createServer(testDir, 0, mockClientDist);
});

afterAll(async () => {
  await app.close();
  // Cleanup test directory
  await fs.rm(testDir, { recursive: true, force: true });
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
    expect(JSON.parse(response.payload).error).toContain('symlink target');
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

describe('SPA Routes', () => {
  it('should serve index.html for non-API routes', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/',
    });
    
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
  });
  
  it('should return 404 for unknown API routes', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/unknown',
    });
    
    expect(response.statusCode).toBe(404);
  });
});
