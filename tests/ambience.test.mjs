import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAmbience } from '../public/ambience.js';
import { freshState, loadState } from '../public/state.js';
import { validateWorldAction } from '../public/actions.js';

test('vibe presets and independent window changes survive a visit without changing memories', () => {
  const state = freshState(); state.memories.push({ id: 'hello', text: 'A little memory', day: 1 });
  assert.equal(applyAmbience(state, 'cold'), true);
  assert.equal(state.vibe, 'cold'); assert.equal(state.window, 'open'); assert.equal(state.atmosphere, 'day');
  applyAmbience(state, 'close-window');
  const restored = loadState({ getItem: () => JSON.stringify(state) });
  assert.equal(restored.vibe, 'cold'); assert.equal(restored.window, 'closed');
  assert.equal(restored.memories[0].text, 'A little memory');
  applyAmbience(state, 'cozy'); assert.equal(state.atmosphere, 'evening'); assert.equal(state.window, 'closed');
  assert.equal(applyAmbience(state, 'real-heating'), false);
  assert.deepEqual(validateWorldAction({ action: 'open-window' }), { action: 'open-window' });
});

test('older and malformed saved preferences retain a safe cozy closed-window default', () => {
  const restored = loadState({ getItem: () => JSON.stringify({ version: 1, vibe: 'script', window: 'invalid' }) });
  assert.equal(restored.vibe, 'cozy'); assert.equal(restored.window, 'closed');
});
