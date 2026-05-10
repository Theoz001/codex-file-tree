import { afterEach, describe, expect, it, vi } from 'vitest';
import { isProcessAlive } from '../src/server/process-manager.js';

function mockHealth(root: string) {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    json: async () => ({ status: 'ok', root }),
  })));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('process manager', () => {
  it('should treat a live port with the expected root as alive', async () => {
    mockHealth('/tmp/project-a');

    await expect(isProcessAlive(999999, 8098, '/tmp/project-a')).resolves.toBe(true);
  });

  it('should reject a live port that belongs to a different root', async () => {
    mockHealth('/tmp/project-a');

    await expect(isProcessAlive(999999, 8098, '/tmp/project-b')).resolves.toBe(false);
  });
});
