import { spawnSync } from 'node:child_process';
import { access } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const args = process.argv.slice(2);
const serial = args.find(argument => !argument.startsWith('--'));
let adb = process.env.ADB_BIN || 'adb';
if (spawnSync(adb, ['version'], { stdio: 'ignore' }).error) adb = path.join(process.env.ANDROID_HOME || path.join(os.homedir(), 'android-sdk'), 'platform-tools/adb');
function run(commands) {
  const result = spawnSync(adb, commands, { encoding: 'utf8' });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr || 'ADB operation failed.');
  return result.stdout.trim();
}
try {
  if (!serial) {
    console.log(run(['devices']));
    console.log('Use: npm run firetv -- FIRE_TV_IP:5555 --install');
    console.log('A real Amazon Fire TV is required. Browser TV mode is a layout preview, not an official simulator.');
    process.exit(0);
  }
  if (serial.includes(':')) console.log(run(['connect', serial]));
  const prefix = ['-s', serial];
  const manufacturer = run([...prefix, 'shell', 'getprop', 'ro.product.manufacturer']);
  const model = run([...prefix, 'shell', 'getprop', 'ro.product.model']);
  if (!/amazon/i.test(manufacturer)) throw new Error(`Device ${model} is manufactured by ${manufacturer}; it is not evidence of Fire TV validation.`);
  console.log(`Amazon device detected: ${model}`);
  console.log(`Fire OS build: ${run([...prefix, 'shell', 'getprop', 'ro.build.display.id'])}`);
  if (args.includes('--install')) {
    await access('artifacts/hearth-firetv-debug.apk');
    console.log(run([...prefix, 'install', '-r', 'artifacts/hearth-firetv-debug.apk']));
    console.log(run([...prefix, 'shell', 'am', 'start', '-n', 'com.hearth.tv/.MainActivity']));
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
