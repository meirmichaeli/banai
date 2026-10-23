// Photorealistic render dialog. Rendering needs the backend image service (Phase 8), so the action
// is disabled and says so. The image is always labelled as illustrative, never as the accurate model.
import { el, button } from '../editor/fields.js';
import { icon } from '../ui/icons.js';
import { createDialog } from '../ui/dialog.js';
import { t } from '../i18n/app.js';

export function createRenderDialog() {
  const s = t().dialogs.render;
  const placeholder = el('div', { className: 'render__placeholder' }, [icon('image', { size: 48 }), el('span', { text: s.placeholder })]);
  // A disabled button gets no hover or focus, so its tooltip sits on a wrapper.
  const generate = button(s.generate, () => {}, { variant: 'primary', testId: 'render-generate', disabled: true });
  const dialog = createDialog({
    title: s.title,
    labelId: 'render-dialog-title',
    testId: 'render-dialog',
    body: [
      el('p', { className: 'dialog__text', text: s.text }),
      placeholder,
      el('span', { className: 'chip', text: s.disclaimer }),
      el('p', { className: 'dialog__status', text: s.unavailable, attrs: { role: 'status' } }),
    ],
    actions: [
      el('span', { className: 'tooltip-host', attrs: { 'data-tooltip': s.tips.generate } }, [generate]),
      button(t().dialogs.close, () => dialog.close(), { variant: 'ghost', testId: 'render-close', tooltip: s.tips.close }),
    ],
  });
  return dialog;
}
