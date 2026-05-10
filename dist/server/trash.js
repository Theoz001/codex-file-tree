import path from 'path';
import fs from 'fs/promises';
import os from 'os';
async function pathExists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    }
    catch {
        return false;
    }
}
export async function moveToTrash(filePath) {
    const homeDir = os.homedir();
    const trashDir = process.env.PROJECT_PREVIEW_TRASH_DIR || path.join(homeDir, '.Trash');
    // Ensure trash directory exists
    await fs.mkdir(trashDir, { recursive: true });
    const basename = path.basename(filePath);
    let destPath = path.join(trashDir, basename);
    // Handle name collisions by appending a counter
    let counter = 1;
    const ext = path.extname(basename);
    const nameWithoutExt = path.basename(basename, ext);
    while (await pathExists(destPath)) {
        destPath = path.join(trashDir, `${nameWithoutExt} ${counter}${ext}`);
        counter++;
    }
    await fs.rename(filePath, destPath);
}
//# sourceMappingURL=trash.js.map