export const WORLD_ACTIONS = ['dance', 'wave', 'laugh', 'stretch', 'water', 'read', 'sit', 'rain', 'evening', 'daylight', 'sunflowers', 'moonflowers'];

export function validateWorldAction(input) {
  if (!input || !WORLD_ACTIONS.includes(input.action) || Object.keys(input).some(key => key !== 'action')) throw new Error('Unsupported world action');
  return { action: input.action };
}

export const ACTION_DETAILS = {
  dance: { label: 'Pip is doing her little fireside dance', pose: 'dance', position: 'translate(800 466)', duration: 14000 },
  wave: { label: 'Pip is waving hello', pose: 'wave', position: 'translate(740 466)', duration: 4500 },
  laugh: { label: 'Pip has a little giggle', pose: 'laugh', position: 'translate(740 466)', duration: 4500 },
  stretch: { label: 'Pip is having a lovely stretch', pose: 'stretch', position: 'translate(740 466)', duration: 7000 },
  water: { label: 'Pip is giving the fern a little water', pose: 'water', position: 'translate(430 450)', duration: 12000 },
  read: { label: 'Pip is opening her favorite little book', pose: 'read', position: 'translate(570 468)', duration: 16000 },
  sit: { label: 'Pip is settling by the fire with you', pose: 'sit', position: 'translate(1060 468)', duration: 16000 }
};

export class CharacterActions {
  constructor({ character, position, label, onChange = () => {} }) {
    Object.assign(this, { character, position, label, onChange });
    this.active = null;
  }
  perform(input) {
    const { action } = validateWorldAction(input);
    const detail = ACTION_DETAILS[action];
    if (!detail) return { ok: false };
    this.stop();
    this.active = action;
    this.character.dataset.action = detail.pose;
    this.character.classList.remove('pip-reading', 'pip-sipping', 'pip-walking');
    this.position.setAttribute('transform', detail.position);
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
    delete this.character.dataset.action;
    this.active = null;
    this.onChange(null);
  }
}
