import { AMBIENCE_ACTIONS } from './ambience.js';
import { TV_ACTIONS } from './movie-night.js';

export const EXPRESSIONS = ['smile', 'curious', 'surprised', 'mischievous', 'tender', 'proud', 'sleepy'];
export const ACTIVITY_ACTIONS = ['riddle', 'word-game', 'tiny-story', 'connection-note', ...TV_ACTIONS];
export const WORLD_ACTIONS = ['dance', 'wave', 'laugh', 'stretch', 'water', 'read', 'sit', 'rain', 'evening', 'daylight', 'sunflowers', 'moonflowers', 'nod', 'shrug', 'bow', 'clap', 'twirl', 'tea', 'juggle', 'stargaze', 'express', ...ACTIVITY_ACTIONS, ...AMBIENCE_ACTIONS];

export function validateWorldAction(input) {
  if (!input || !WORLD_ACTIONS.includes(input.action) || Object.keys(input).some(key => !['action', 'expression', 'text'].includes(key))) throw new Error('Unsupported world action');
  if (input.expression !== undefined && !EXPRESSIONS.includes(input.expression)) throw new Error('Unsupported expression');
  if (input.text !== undefined && (!ACTIVITY_ACTIONS.includes(input.action) || typeof input.text !== 'string' || !input.text.trim() || input.text.length > 500)) throw new Error('Invalid activity text');
  return { action: input.action, ...(input.expression ? { expression: input.expression } : {}), ...(input.text ? { text: input.text.trim() } : {}) };
}

export const ACTION_DETAILS = {
  dance: { label: 'Pip is doing her little fireside dance', pose: 'dance', position: 'translate(800 466)', duration: 14000 },
  wave: { label: 'Pip is waving hello', pose: 'wave', position: 'translate(740 466)', duration: 4500 },
  laugh: { label: 'Pip has a little giggle', pose: 'laugh', position: 'translate(740 466)', duration: 4500 },
  stretch: { label: 'Pip is having a lovely stretch', pose: 'stretch', position: 'translate(740 466)', duration: 7000 },
  water: { label: 'Pip is giving the fern a little water', pose: 'water', position: 'translate(430 450)', duration: 12000 },
  read: { label: 'Pip is opening her favorite little book', pose: 'read', position: 'translate(570 468)', duration: 16000 },
  sit: { label: 'Pip is settling by the fire with you', pose: 'sit', position: 'translate(1060 468)', duration: 16000 },
  nod: { label: 'Pip is giving you an understanding nod', pose: 'nod', expression: 'tender', duration: 5000 },
  shrug: { label: 'Pip has a very innocent-looking shrug', pose: 'shrug', expression: 'mischievous', duration: 6000 },
  bow: { label: 'Pip is taking an unnecessarily grand bow', pose: 'bow', expression: 'proud', duration: 6000 },
  clap: { label: 'Pip is applauding your little moment', pose: 'clap', expression: 'proud', duration: 7000 },
  twirl: { label: 'Pip is trying a rather fancy twirl', pose: 'twirl', expression: 'smile', duration: 7000 },
  tea: { label: 'Pip is enjoying an imaginary cup of tea', pose: 'tea', expression: 'tender', position: 'translate(880 466)', duration: 16000 },
  juggle: { label: 'Pip is juggling three little woodland treasures', pose: 'juggle', expression: 'mischievous', duration: 14000 },
  stargaze: { label: 'Pip is looking for stories in the stars', pose: 'stargaze', expression: 'curious', position: 'translate(710 435)', duration: 16000 },
  express: { label: 'A little feeling crosses Pip’s face', pose: 'express', expression: 'smile', duration: 9000 }
};

export class CharacterActions {
  constructor({ character, position, label, onChange = () => {}, reducedMotion = false }) {
    Object.assign(this, { character, position, label, onChange, reducedMotion });
    this.active = null;
  }
  perform(input) {
    const { action, expression } = validateWorldAction(input);
    const detail = ACTION_DETAILS[action];
    if (!detail) return { ok: false };
    this.stop();
    this.active = action;
    this.character.dataset.action = detail.pose;
    this.character.dataset.expression = expression || detail.expression || (['laugh', 'dance', 'wave'].includes(action) ? 'smile' : 'curious');
    this.character.dataset.beat = this.reducedMotion ? 'perform' : 'anticipate';
    if (!this.reducedMotion) {
      this.phaseTimer = setTimeout(() => { this.character.dataset.beat = 'perform'; }, 350);
      this.settleTimer = setTimeout(() => { this.character.dataset.beat = 'settle'; }, detail.duration - 900);
    }
    this.character.classList.remove('pip-reading', 'pip-sipping', 'pip-walking');
    if (detail.position) this.position.setAttribute('transform', detail.position);
    this.label.textContent = detail.label;
    this.onChange(action);
    this.timer = setTimeout(() => this.stop(), detail.duration);
    return { ok: true };
  }
  listening(active) {
    this.character.classList.toggle('pip-listening', active);
  }
  stop() {
    clearTimeout(this.timer);
    clearTimeout(this.phaseTimer); clearTimeout(this.settleTimer);
    delete this.character.dataset.action;
    delete this.character.dataset.expression;
    delete this.character.dataset.beat;
    this.active = null;
    this.onChange(null);
  }
}
