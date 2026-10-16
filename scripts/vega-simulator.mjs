import { spawnSync } from 'node:child_process';
import { access } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

let vega = process.env.VEGA_BIN || 'vega';
if (spawnSync(vega, ['--version'], { stdio: 'ignore' }).error) {
  vega = path.join(os.homedir(), 'vega/bin/vega');
}
const options = process.argv.slice(2);
const target = process.env.HEARTH_VEGA_TARGET || (process.arch === 'arm64' ? 'aarch64' : 'x86_64');
const artifact = `artifacts/hearth-vega-${target}.vpkg`;
const timeout = Number(process.env.HEARTH_SIMULATOR_TIMEOUT || 1200);

function run(args) {
  const result = spawnSync(vega, args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  if (result.error || result.status !== 0 || /operation FAILED|irrecoverable error|Module dependency not found/i.test(output)) {
    throw new Error(result.error?.message || `Vega command failed: ${args[0]}`);
  }
}

try {
  if (options.some(option => !['--headless', '--software-graphics', '--stop'].includes(option))) {
    throw new Error('Use --headless, --software-graphics, or --stop.');
  }
  if (options.includes('--stop')) {
    run(['virtual-device', 'stop']);
  } else {
    if (!Number.isInteger(timeout) || timeout < 60 || timeout > 3600) throw new Error('HEARTH_SIMULATOR_TIMEOUT must be 60–3600 seconds.');
    await access(artifact);
    const start = ['virtual-device', 'start', '--timeout', String(timeout), '--display-res', '1920,1080'];
    if (options.includes('--headless')) start.push('--no-gui');
    if (options.includes('--software-graphics')) start.push('--no-gl-accel');
    run(start);
    run(['run-app', artifact, 'com.hearth.tv.main', '-d', 'VirtualDevice']);
    console.log('Hearth launched on Amazon’s official Vega Virtual Device. Verify the rendered home before recording your demo.');
  }
} catch (error) {
  console.error(error.message);
  console.error('Build first with npm run build:vega. The Android APK and browser TV preview cannot replace the Vega package.');
  process.exitCode = 1;
}
