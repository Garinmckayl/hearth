import { spawnSync } from 'node:child_process';
import { cp, mkdir, access, readdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const webBuild = spawnSync(process.execPath, ['scripts/build.mjs'], { stdio: 'inherit' });
if (webBuild.status !== 0) process.exit(1);
let gradle = process.env.GRADLE_BIN || 'gradle';
const installed = spawnSync(gradle, ['--version'], { stdio: 'ignore' });
if (installed.error && !process.env.GRADLE_BIN) {
  const cache = path.join(os.homedir(), '.gradle/wrapper/dists/gradle-8.14.3-bin');
  try {
    for (const entry of await readdir(cache)) {
      const candidate = path.join(cache, entry, 'gradle-8.14.3/bin/gradle');
      try { await access(candidate); gradle = candidate; break; } catch {}
    }
  } catch {}
}
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || path.join(os.homedir(), 'android-sdk');
const args = ['-p', 'android', 'assembleDebug', '--console=plain'];
if (process.env.HEARTH_BACKEND_URL) args.push(`-PhearthBackendUrl=${process.env.HEARTH_BACKEND_URL}`);
const result = spawnSync(gradle, args, {
  stdio: 'inherit', env: { ...process.env, ANDROID_HOME: sdk }
});
if (result.error || result.status !== 0) {
  console.error(result.error?.message || 'Android build failed. See Gradle output above.');
  process.exit(1);
}
await mkdir('artifacts', { recursive: true });
await cp('android/app/build/outputs/apk/debug/app-debug.apk', 'artifacts/hearth-firetv-debug.apk');
console.log('Fire TV debug APK: artifacts/hearth-firetv-debug.apk');
