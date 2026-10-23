// Save and share dialog. Saving stores the design on the server and gives a private link; nothing is
// faked: the link field stays empty until a save has really succeeded.
import { el, button } from '../editor/fields.js';
import { createDialog } from '../ui/dialog.js';
import { t } from '../i18n/app.js';

/**
 * `available`: whether the server can store designs. `onSave()` saves the current design and resolves
 * to its private link. `link`: the link of a design that was reopened from one, if any.
 * Texts are in the app language at creation time; the host rebuilds the dialog on a language switch.
 */
export function createSaveDialog({ available, onSave, link = '' }) {
  const s = t().dialogs.save;
  const linkField = el('input', { className: 'field__input', attrs: { id: 'share-link', type: 'text', readonly: '', dir: 'ltr', placeholder: s.linkPlaceholder, 'aria-label': s.linkLabel } });
  linkField.dataset.testid = 'share-link';
  linkField.value = link;
  const status = el('p', { className: 'dialog__status', text: available ? s.ready : s.unavailable, attrs: { role: 'status' } });
  status.dataset.testid = 'save-status';

  const copy = button(s.copy, async () => {
    try {
      await navigator.clipboard.writeText(linkField.value);
      status.textContent = s.copied;
    } catch {
      linkField.select(); // clipboard blocked: leave it selected for a manual copy
      status.textContent = s.copyManually;
    }
  }, { variant: 'secondary', testId: 'copy-link', disabled: !link, tooltip: s.tips.copy });

  const save = button(s.saveDesign, async () => {
    save.disabled = true;
    status.textContent = s.saving;
    try {
      linkField.value = await onSave();
      copy.disabled = false;
      status.textContent = s.saved;
    } catch (error) {
      status.textContent = error?.message || s.failed;
    } finally {
      save.disabled = false;
    }
  }, { variant: 'primary', testId: 'save-confirm', disabled: !available, tooltip: s.tips.saveDesign });

  const dialog = createDialog({
    title: s.title,
    labelId: 'save-dialog-title',
    testId: 'save-dialog',
    body: [
      el('p', { className: 'dialog__text', text: s.text }),
      el('div', { className: 'field' }, [
        el('label', { className: 'field__label', text: s.linkLabel, attrs: { for: 'share-link' } }),
        linkField,
      ]),
      el('p', { className: 'dialog__note', text: s.note }),
      status,
    ],
    actions: [copy, save, button(t().dialogs.close, () => dialog.close(), { variant: 'ghost', testId: 'save-close', tooltip: s.tips.close })],
  });
  return dialog;
}
