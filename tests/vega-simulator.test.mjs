import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const launcher = fileURLToPath(new URL('../scripts/vega-simulator.mjs', import.meta.url));

async function simulate(output, callback) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'hearth-vega-test-'));
  try {
    await mkdir(path.join(directory, 'artifacts'));
    await writeFile(path.join(directory, 'artifacts/hearth-vega-aarch64.vpkg'), 'test package');
    const executable = path.join(directory, 'vega');
    await writeFile(executable, `#!${process.execPath}\nif (process.argv[2] === 'run-app') console.log(${JSON.stringify(output)});\n`, {mode: 0o700});
    callback(spawnSync(process.execPath, [launcher, '--headless'], {
      cwd: directory,
      encoding: 'utf8',
      env: {...process.env, VEGA_BIN: executable, HEARTH_VEGA_TARGET: 'aarch64'},
    }));
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
}

test('simulator launcher rejects SDK installation failures even with exit code zero', async () => {
  await simulate('Vega operation FAILED: Module dependency not found', result => {
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Vega command failed: run-app/);
    assert.doesNotMatch(result.stdout, /Hearth launched/);
  });
});

test('simulator launcher reports launch only after successful install command', async () => {
  await simulate('Installed and launched', result => {
    assert.equal(result.status, 0);
    assert.match(result.stdout, /Hearth launched/);
  });
});
