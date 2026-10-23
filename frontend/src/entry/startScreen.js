// Start screen: three ways in, one editor. Shown on load as a modal; choosing an option closes it.
// It has its own עב/EN switch (the same app-wide setting as the chat's); switching rebuilds its content.
import { el } from '../editor/fields.js';
import { language, t } from '../i18n/app.js';
import { icon } from '../ui/icons.js';
import { languageSwitch } from '../ui/languageSwitch.js';
import { createLogo } from '../ui/logo.js';
import { withTooltip } from '../ui/tooltip.js';
import { ENTRY_POINTS } from './entryPoints.js';

export function mountStartScreen({ onChoose }) {
  const dialog = el('dialog', { className: 'start', attrs: { 'aria-labelledby': 'start-title' } });
  dialog.dataset.testid = 'start-screen';

  const choose = (entry) => {
    unsubscribe();
    dialog.close();
    dialog.remove();
    onChoose(entry);
  };

  const build = () => {
    const s = t();
    dialog.setAttribute('dir', s.dir);
    dialog.setAttribute('lang', language.get());
    const cards = ENTRY_POINTS.map((entry) => {
      const text = s.start.entries[entry.id];
      const action = el('button', { className: 'btn', attrs: { type: 'button' } }, [
        document.createTextNode(`${text.action} `),
        icon('arrow', { size: 18 }),
      ]);
      action.dataset.testid = `entry-${entry.id}`;
      if (entry === ENTRY_POINTS[0]) action.autofocus = true; // the modal opens on the first choice
      withTooltip(action, text.tip);
      action.addEventListener('click', () => choose(entry));
      return el('article', { className: 'entry-card' }, [
        el('span', { className: 'entry-card__icon' }, [icon(entry.icon, { size: 24 })]),
        withTooltip(el('h2', { className: 'entry-card__title', text: text.title }), text.tip),
        el('p', { className: 'entry-card__text', text: text.description }),
        action,
      ]);
    });
    const focusedTestId = dialog.contains(document.activeElement) ? document.activeElement.dataset.testid : undefined;
    dialog.replaceChildren(
      el('header', { className: 'start__bar' }, [
        createLogo({ size: 36 }),
        languageSwitch(language, { label: s.languageLabel, tooltip: s.tips.language, testId: 'start-language' }),
      ]),
      el('main', { className: 'start__main' }, [
        el('h1', { className: 'start__title', text: s.start.title, attrs: { id: 'start-title' } }),
        el('p', { className: 'start__subtitle', text: s.start.subtitle }),
        el('div', { className: 'start__cards' }, cards),
        el('p', { className: 'start__footnote', text: s.start.footnote }),
        withTooltip(el('a', { className: 'start__footnote', text: s.start.statement, attrs: { href: '/accessibility.html', lang: 'he' } }), s.tips.accessibility),
      ]),
    );
    // Keep keyboard focus on the same control after a rebuild (WCAG 2.4.3).
    if (focusedTestId) dialog.querySelector(`[data-testid="${CSS.escape(focusedTestId)}"]`)?.focus();
  };

  const unsubscribe = language.subscribe(build);
  build();
  // A choice is required: Esc must not leave the user on a blank workspace.
  dialog.addEventListener('cancel', (event) => event.preventDefault());
  document.body.append(dialog);
  dialog.showModal();
  return dialog;
}
