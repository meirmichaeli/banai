// M3 dialog on the native <dialog> element (focus trap, Esc and inert background come for free).
import { el } from '../editor/fields.js';
import { language, t } from '../i18n/app.js';

export function createDialog({ title, body, actions, testId, labelId }) {
  const heading = el('h2', { className: 'dialog__title', text: title, attrs: { id: labelId } });
  const dialog = el('dialog', { className: 'dialog', attrs: { 'aria-labelledby': labelId, dir: t().dir, lang: language.get() } }, [
    heading,
    el('div', { className: 'dialog__body' }, body),
    el('div', { className: 'dialog__actions' }, actions),
  ]);
  if (testId) dialog.dataset.testid = testId;
  // Click on the scrim (the <dialog> itself, outside its content box) closes it.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  document.body.append(dialog);
  return {
    element: dialog,
    open: () => { if (!dialog.open) dialog.showModal(); },
    close: () => dialog.close(),
    isOpen: () => dialog.open,
    remove: () => dialog.remove(),
  };
}
