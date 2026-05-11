import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export async function openWithDefaultApp(targetPath: string): Promise<void> {
  if (process.platform === 'darwin') {
    await execFileAsync('open', [targetPath]);
    return;
  }

  if (process.platform === 'win32') {
    await execFileAsync('explorer.exe', [targetPath], { windowsHide: true });
    return;
  }

  await execFileAsync('xdg-open', [targetPath]);
}
