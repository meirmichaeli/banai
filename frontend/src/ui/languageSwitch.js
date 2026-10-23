// The עב/EN switch. One language setting drives the whole app, so every copy of the switch (chat
// header, start screen) changes the same setting.
import { el } from '../editor/fields.js';
import { LANGUAGES } from '../chat/i18n.js';
import { withTooltip } from './tooltip.js';

const LANGUAGE_NAMES = Object.freeze({ he: 'עב', en: 'EN' });
const FULL_NAMES = Object.freeze({ he: 'עברית', en: 'English' });

/** `testId` prefixes the group and its options (`${testId}-he`, `${testId}-en`). */
export function languageSwitch(language, { label, tooltip, testId = 'chat-language' }) {
  const group = el('div', { className: 'lang-switch', attrs: { role: 'group', 'aria-label': label } });
  group.dataset.testid = testId;
  LANGUAGES.forEach((code) => {
    const option = el('button', {
      className: 'lang-switch__option',
      text: LANGUAGE_NAMES[code],
      attrs: { type: 'button', lang: code, 'aria-pressed': String(code === language.get()), 'aria-label': FULL_NAMES[code] },
    });
    withTooltip(option, tooltip ? `${FULL_NAMES[code]} · ${tooltip}` : FULL_NAMES[code]);
    option.dataset.testid = `${testId}-${code}`;
    option.addEventListener('click', () => language.set(code));
    group.append(option);
  });
  return group;
}
