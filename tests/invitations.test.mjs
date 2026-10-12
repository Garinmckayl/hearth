import test from 'node:test';
import assert from 'node:assert/strict';
import { freshState, remember, loadState, STORAGE_KEY } from '../public/state.js';
import { invitationFor } from '../public/invitations.js';

test('invitations prioritize a remembered follow-up only after another day', () => {
  const state = freshState();
  remember(state, 'recital', 'A recital');
  assert.equal(invitationFor(state).action, 'garden');
  state.day += 1;
  assert.equal(invitationFor(state).action, 'followup');
  remember(state, 'recital-drawing', 'A drawing');
  assert.equal(invitationFor(state).action, 'garden');
});

test('memory opt-out excludes personal follow-ups and invitations can be disabled persistently', () => {
  const state = freshState();
  remember(state, 'connection', 'A call');
  assert.equal(invitationFor(state).action, 'followup');
  state.remember = false;
  assert.equal(invitationFor(state).action, 'garden');
  state.gentleInvitations = false;
  const restored = loadState({ getItem: key => key === STORAGE_KEY ? JSON.stringify(state) : null });
  assert.equal(invitationFor(restored), null);
});
