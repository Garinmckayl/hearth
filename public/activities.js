export const RIDDLES = [
  { prompt: 'What has keys but cannot open a door?', answer: 'A piano', choices: ['A piano', 'A sleepy badger', 'A garden gate'] },
  { prompt: 'What gets wetter the more it dries?', answer: 'A towel', choices: ['A towel', 'A cloud', 'A teacup'] },
  { prompt: 'What has a neck, but no head?', answer: 'A bottle', choices: ['A bottle', 'A scarf', 'A sunflower'] }
];

export class CompanionActivities {
  constructor({ mount, onGesture = () => {}, onTurn = () => {} }) {
    this.mount = mount; this.onGesture = onGesture; this.onTurn = onTurn; this.round = 0;
  }
  show(action, text) {
    this.stop();
    const card = document.createElement('section'); card.className = 'companion-activity'; card.id = 'companion-activity';
    card.setAttribute('aria-label', 'Something with Pip');
    const title = document.createElement('h3'); const words = document.createElement('p'); words.setAttribute('aria-live', 'polite');
    const controls = document.createElement('div'); controls.className = 'activity-controls';
    const button = (label, handler) => { const control = document.createElement('button'); control.textContent = label; control.onclick = handler; controls.append(control); return control; };
    card.append(title, words, controls); this.mount.append(card);
    let summary;
    if (action === 'riddle') {
      const riddle = RIDDLES[this.round++ % RIDDLES.length];
      title.textContent = 'A little fireside riddle'; words.textContent = riddle.prompt;
      summary = `Displayed riddle: ${riddle.prompt} Answer: ${riddle.answer}. Let the user guess before revealing it.`;
      for (const choice of riddle.choices) button(choice, () => { words.textContent = choice === riddle.answer ? `Exactly! ${riddle.answer}. A very small victory deserves a very grand bow.` : `A fine guess. The answer is ${riddle.answer}. My first guess was a badger, so you are in good company.`; this.onGesture(choice === riddle.answer ? 'bow' : 'shrug'); this.onTurn(`My guess for the riddle is ${choice}.`); });
      button('Another riddle', () => { if (!this.onTurn('Please open another fireside riddle for me.')) this.show('riddle'); });
    } else if (action === 'word-game') {
      title.textContent = 'The wonderfully unlikely picnic'; words.textContent = text || 'We are packing an imaginary picnic. I am bringing a tiny umbrella for the cheese. What would you bring?';
      summary = `Displayed word game: ${words.textContent} Take turns inventing absurd picnic items, responding playfully to the user's contribution.`;
      for (const [item, response] of [['Dancing biscuits', 'Excellent. They can do the entertainment while we eat the audience.'], ['A scarf for the teapot', 'Practical. Nobody enjoys a draughty teapot.'], ['An enormous strawberry', 'We may need a second picnic blanket. Or a very small ladder.']]) button(item, () => { words.textContent = response; this.onGesture('laugh'); this.onTurn(`For our imaginary picnic, I am bringing ${item.toLowerCase()}.`); });
    } else if (action === 'tiny-story') {
      title.textContent = 'A story we make together'; words.textContent = text || 'A mouse found a tiny door in the oldest tree. Behind it was a room full of umbrellas, each labelled with a different kind of weather. Which one should she open?';
      summary = `Displayed collaborative story opening: ${words.textContent} Ask for one choice and build on it. Keep each turn short.`;
      if (text) button('What happens next?', () => this.onTurn('Please continue our tiny story with a little surprise.'));
      else {
      button('An umbrella of stars', () => { words.textContent = 'Stars spilled gently onto the ceiling. One was shaped suspiciously like a biscuit. The mouse decided astronomy could wait until after tea.'; this.onGesture('stargaze'); this.onTurn('For our tiny story, I choose the umbrella of stars.'); });
      button('An umbrella of sunshine', () => { words.textContent = 'A warm breeze carried the scent of toast. The mouse found a note: “For rainy Tuesdays.” She saved a little sunshine for a friend.'; this.onGesture('tea'); this.onTurn('For our tiny story, I choose the umbrella of sunshine.'); });
      }
    } else if (action === 'connection-note') {
      title.textContent = 'A little hello, in your words'; words.textContent = 'A draft for someone you care about. Edit it, then copy and share it yourself. Nothing is sent by Pip.';
      const draft = document.createElement('textarea'); draft.setAttribute('aria-label', 'Your message draft'); draft.maxLength = 500; draft.value = text || 'Thinking of you today. I would love a little catch-up whenever you have time.';
      card.insertBefore(draft, controls);
      summary = 'Opened an editable local message draft. No message was sent or call arranged. The user controls copying and sharing.';
      button('Copy my note', async () => { try { await navigator.clipboard.writeText(draft.value); words.textContent = 'Copied. You decide who to send it to and when.'; } catch { words.textContent = 'Copy is unavailable here. Select the note and copy it manually.'; } });
    } else { this.stop(); return { ok: false }; }
    button('Close this activity', () => this.stop());
    return { ok: true, summary };
  }
  stop() { this.mount.querySelector('#companion-activity')?.remove(); }
}
