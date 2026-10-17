import { spawnSync } from 'node:child_process';
import { access, cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const project = path.resolve('vega');
let vega = process.env.VEGA_BIN || 'vega';
if (spawnSync(vega, ['--version'], { stdio: 'ignore' }).error) {
  vega = path.join(os.homedir(), 'vega/bin/vega');
}
const target = process.env.HEARTH_VEGA_TARGET || (process.arch === 'arm64' ? 'aarch64' : 'x86_64');

try {
  if (!['x86_64', 'aarch64', 'armv7'].includes(target)) throw new Error('Unsupported HEARTH_VEGA_TARGET.');
  await access(path.join(project, 'node_modules/@amazon-devices/webview'));
  {
    const existing = await readFile(path.join(project, 'src/config.ts'), 'utf8');
    const currentUrl = existing.match(/export const HEARTH_URL = ['"]([^'"]+)['"]/);
    const url = new URL(process.env.HEARTH_BACKEND_URL || currentUrl?.[1] || '');
    if (url.protocol !== 'https:' || url.username || url.password || (process.env.HEARTH_BACKEND_URL && url.search) || url.hash) {
      throw new Error('HEARTH_BACKEND_URL must be an HTTPS URL without credentials, query or fragment.');
    }
    url.searchParams.set('tv', '1');
    const targets = JSON.parse(process.env.HEARTH_VEGA_TARGETS_JSON || '[]');
    if (!Array.isArray(targets) || targets.length > 50) throw new Error('HEARTH_VEGA_TARGETS_JSON must be an array of at most 50 approved links.');
    const ids = new Set();
    for (const target of targets) {
      if (!target || typeof target.id !== 'string' || !/^(?:prime|[A-Z0-9]{10})$/.test(target.id) || ids.has(target.id) || typeof target.title !== 'string' || !target.title.trim() || target.title.length > 160 || typeof target.url !== 'string' || target.url.length > 2048) throw new Error('Invalid or duplicate Vega launch target.');
      const launchUrl = new URL(target.url);
      if (['http:', 'javascript:', 'data:', 'file:', 'content:', 'intent:'].includes(launchUrl.protocol) || launchUrl.username || launchUrl.password) throw new Error('Unsafe Vega launch target.');
      ids.add(target.id);
    }
    await writeFile(path.join(project, 'src/config.ts'), `export const HEARTH_URL = ${JSON.stringify(url.href)};\nexport const HEARTH_TV_TARGETS: {id: string; title: string; url: string}[] = ${JSON.stringify(targets)};\n`);
  }
  const result = spawnSync(vega, ['exec', 'npm', 'run', 'build:release', '--', '--target', target, '--build-number', '1', '--max-workers', '2'], { cwd: project, stdio: 'inherit' });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || 'Vega build failed.');
  async function findPackage(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const candidate = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        const found = await findPackage(candidate);
        if (found) return found;
      } else if (entry.name === `hearth-vega_${target}.vpkg`) return candidate;
    }
  }
  const built = await findPackage(path.join(project, 'build/private/kepler'));
  if (!built) throw new Error('Build completed without the expected Vega package.');
  await mkdir('artifacts', { recursive: true });
  const artifact = `artifacts/hearth-vega-${target}.vpkg`;
  await cp(built, artifact);
  const validation = spawnSync(vega, ['exec', 'vpt', 'validate', artifact], { stdio: 'inherit' });
  if (validation.error || validation.status !== 0) throw new Error(validation.error?.message || 'Vega package validation failed.');
  console.log(`Official Vega package: ${artifact}`);
} catch (error) {
  console.error(error.message);
  console.error('Install Amazon’s Vega SDK and run npm ci --prefix vega before building.');
  process.exitCode = 1;
}
