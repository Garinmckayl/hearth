import test from 'node:test';
import assert from 'node:assert/strict';
import { validateWorldAction, CharacterActions } from '../public/actions.js';
import { SonicSession, voicePrompt } from '../lib/sonic.mjs';
import { validateReply } from '../lib/dialogue.mjs';
import { RealtimeVoice } from '../public/voice.js';

test('only safe fictional world actions are allowed', () => {
  assert.deepEqual(validateWorldAction({ action: 'dance' }), { action: 'dance' });
  for (const input of [{ action: 'send-message' }, { action: 'dance', script: 'unsafe' }, null]) assert.throws(() => validateWorldAction(input));
  assert.equal(validateReply('{"text":"My fireside shuffle!","action":"dance"}').action, 'dance');
  assert.equal(validateReply('{"text":"No","action":"delete-files"}').action, 'none');
});

test('character actions replace older poses and clean up their timers', () => {
  const character = { dataset: {}, classList: { remove() {}, toggle() {} } };
  const position = { setAttribute: (_name, value) => { position.value = value; } };
  const label = {};
  const controller = new CharacterActions({ character, position, label });
  controller.perform({ action: 'dance' });
  assert.equal(character.dataset.action, 'dance');
  controller.perform({ action: 'wave' });
  assert.equal(character.dataset.action, 'wave');
  assert.equal(controller.active, 'wave');
  controller.stop();
  assert.equal(character.dataset.action, undefined);
  assert.equal(controller.active, null);
});

test('Sonic tool responses report performed actions and reject unknown tools without executing', async () => {
  const calls = [];
  const session = new SonicSession({ client: { destroy() {} }, executeAction: async action => { calls.push(action); return { ok: true }; } });
  try {
    const tool = { toolUseId: 'dance-1', toolName: 'perform_world_action', content: '{"action":"dance"}' };
    await session.processTool(tool); await session.processTool(tool);
    assert.equal(calls.length, 1);
    const events = session.queue.items.map(item => JSON.parse(Buffer.from(item.chunk.bytes).toString()).event);
    assert.equal(events[0].contentStart.toolResultInputConfiguration.toolUseId, 'dance-1');
    assert.equal(JSON.parse(events[1].toolResult.content).ok, true);
    await session.processTool({ toolUseId: 'bad-1', toolName: 'run_code', content: '{}' });
    assert.equal(calls.length, 1);
    const rejected = JSON.parse(Buffer.from(session.queue.items[4].chunk.bytes).toString()).event;
    assert.equal(JSON.parse(rejected.toolResult.content).ok, false);
    assert.match(voicePrompt(), /Only describe success after the tool confirms it/);
  } finally { session.stop(); }
});

test('real Sonic contentId events produce captions and speculative text is excluded', () => {
  const captions = [];
  const voice = new RealtimeVoice({ onText: (role, text, final) => captions.push({ role, text, final }) });
  voice.event({ contentStart: { contentId: 'user-real', role: 'USER' } });
  voice.event({ textOutput: { contentId: 'user-real', content: 'Please dance.' } });
  voice.event({ contentEnd: { contentId: 'user-real' } });
  assert.deepEqual(captions.at(-1), { role: 'USER', text: 'Please dance.', final: true });
  voice.event({ contentStart: { contentId: 'speculative', role: 'ASSISTANT', additionalModelFields: '{"generationStage":"SPECULATIVE"}' } });
  voice.event({ textOutput: { contentId: 'speculative', content: 'Not final.' } });
  voice.event({ contentEnd: { contentId: 'speculative' } });
  assert.equal(captions.length, 2);
  voice.event({ contentStart: { contentId: 'answer-real', role: 'ASSISTANT', additionalModelFields: '{"generationStage":"FINAL"}' } });
  voice.event({ textOutput: { contentId: 'answer-real', content: 'Here is my shuffle.' } });
  voice.event({ contentEnd: { contentId: 'answer-real' } });
  assert.equal(captions.at(-1).text, 'Here is my shuffle.');
  assert.equal(voice.blocks.size, 0);
});
