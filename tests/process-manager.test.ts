import { afterEach, describe, expect, it, vi } from 'vitest';
import { isProcessAlive, projectSlug, projectUrl } from '../src/server/process-manager.js';

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
  it('should create stable project URL slugs from root names', () => {
    expect(projectSlug('/tmp/My Project')).toBe('My-Project');
    expect(projectSlug('/tmp/project%20name')).toBe('project-20name');
    expect(projectUrl(8101, '/tmp/新业态治理国际比较')).toBe(
      `http://127.0.0.1:8101/p/${encodeURIComponent('新业态治理国际比较')}/`,
    );
  });

  it('should treat a live port with the expected root as alive', async () => {
    mockHealth('/tmp/project-a');

    await expect(isProcessAlive(999999, 8098, '/tmp/project-a')).resolves.toBe(true);
  });

  it('should reject a live port that belongs to a different root', async () => {
    mockHealth('/tmp/project-a');

    await expect(isProcessAlive(999999, 8098, '/tmp/project-b')).resolves.toBe(false);
  });
});
