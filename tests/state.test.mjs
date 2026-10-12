import test from 'node:test';
import assert from 'node:assert/strict';
import { STORAGE_KEY, freshState, loadState, remember, forget, hasMemory, replyFor } from '../public/state.js';

test('saved memories survive a return visit and an elapsed day advances continuity', () => {
  const state = freshState();
  remember(state, 'recital', 'A granddaughter’s recital');
  state.lastVisit = '2020-01-01';
  const loaded = loadState({ getItem: key => key === STORAGE_KEY ? JSON.stringify(state) : null });
  assert.equal(loaded.day, 2);
  assert.equal(loaded.memories[0].text, 'A granddaughter’s recital');
});

test('same-day visits do not advance the day', () => {
  const state = freshState();
  assert.equal(loadState({ getItem: () => JSON.stringify(state) }).day, 1);
});

test('opting out prevents new memories and stops use of earlier memories', () => {
  const state = freshState();
  remember(state, 'recital', 'A recital');
  remember(state, 'recital', 'A recital again');
  assert.equal(state.memories.length, 1);
  state.remember = false;
  assert.equal(remember(state, 'other', 'Private moment'), false);
  assert.equal(hasMemory(state, 'recital'), false);
  assert.equal(state.memories.length, 1);
});

test('forgetting a recital removes its drawing and related follow-up', () => {
  const state = freshState();
  for (const id of ['recital', 'recital-drawing', 'connection', 'fireside-game']) remember(state, id, id);
  forget(state, 'recital');
  assert.deepEqual(state.memories.map(memory => memory.id), ['fireside-game']);
});

test('corrupt storage and malformed memories recover safely', () => {
  assert.deepEqual(loadState({ getItem: () => '{broken' }).memories, []);
  const loaded = loadState({ getItem: () => JSON.stringify({ version: 1, memories: [null, { id: 7 }], day: -1, name: {}, sound: 'true' }) });
  assert.equal(loaded.day, 1);
  assert.equal(loaded.name, '');
  assert.equal(loaded.sound, false);
  assert.deepEqual(loaded.memories, []);
});

test('contextual dialogue routes loneliness, activities, and urgent requests', () => {
  assert.equal(replyFor('The house has been quiet lately'), 'quiet');
  assert.equal(replyFor('My granddaughter has a recital'), 'recital');
  assert.equal(replyFor('Can we play together?'), 'game');
  assert.equal(replyFor('I have chest pain'), 'urgent');
});
