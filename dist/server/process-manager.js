import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { createHash } from 'crypto';
const STATE_DIR = path.join(os.homedir(), '.cache', 'project-preview');
function getInstanceId(root) {
    return createHash('sha256').update(path.resolve(root)).digest('hex').slice(0, 16);
}
function getStateFile(instanceId) {
    return path.join(STATE_DIR, `${instanceId}.json`);
}
async function ensureStateDir() {
    await fs.mkdir(STATE_DIR, { recursive: true });
}
export async function saveInstance(root, port, pid) {
    await ensureStateDir();
    const instanceId = getInstanceId(root);
    const state = {
        pid,
        port,
        root: path.resolve(root),
        startedAt: new Date().toISOString(),
    };
    await fs.writeFile(getStateFile(instanceId), JSON.stringify(state, null, 2));
}
export async function getInstance(root) {
    try {
        const instanceId = getInstanceId(root);
        const content = await fs.readFile(getStateFile(instanceId), 'utf-8');
        return JSON.parse(content);
    }
    catch {
        return null;
    }
}
export async function removeInstance(root) {
    try {
        const instanceId = getInstanceId(root);
        await fs.unlink(getStateFile(instanceId));
    }
    catch {
        // Ignore errors
    }
}
export async function listInstances() {
    try {
        await ensureStateDir();
        const files = await fs.readdir(STATE_DIR);
        const instances = [];
        for (const file of files) {
            if (!file.endsWith('.json'))
                continue;
            try {
                const content = await fs.readFile(path.join(STATE_DIR, file), 'utf-8');
                const state = JSON.parse(content);
                const alive = await isProcessAlive(state.pid, state.port, state.root);
                instances.push({
                    ...state,
                    id: file.replace('.json', ''),
                    alive,
                });
            }
            catch {
                // Skip invalid state files
            }
        }
        return instances;
    }
    catch {
        return [];
    }
}
export async function isProcessAlive(pid, port, expectedRoot) {
    // Health check is the authoritative signal. In Codex sandboxed runs,
    // process.kill(pid, 0) can fail even when a localhost server is reachable.
    try {
        const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
            signal: AbortSignal.timeout(2000)
        });
        if (!response.ok)
            return false;
        const health = await response.json();
        if (health.status !== 'ok')
            return false;
        if (expectedRoot !== undefined) {
            if (!health.root)
                return false;
            if (path.resolve(health.root) !== path.resolve(expectedRoot))
                return false;
        }
    }
    catch {
        return false;
    }
    try {
        process.kill(pid, 0);
    }
    catch {
        // The process may be hidden from the current sandbox, but health is enough.
    }
    return true;
}
export async function cleanupDeadInstances() {
    const instances = await listInstances();
    for (const instance of instances) {
        if (!instance.alive) {
            await removeInstance(instance.root);
        }
    }
}
//# sourceMappingURL=process-manager.js.map