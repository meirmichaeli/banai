// Proposal card: a structured list of proposed changes with Confirm / Cancel. Pure DOM render
// from { proposal, status }. All text uses textContent (proposal text is untrusted data).
import { el } from '../editor/fields.js';
import { icon } from '../ui/icons.js';
import { STRINGS } from './i18n.js';
import { withTooltip } from '../ui/tooltip.js';

export function renderProposalCard(proposal, status, { onConfirm, onCancel, strings: t = STRINGS.he }) {
  const stale = status === 'stale';
  const rows = proposal.changes.map((change) => el('li', { className: 'proposal__row' }, [
    el('span', { className: 'proposal__title', text: change.title }),
    el('span', { className: 'proposal__detail', text: change.detail }),
  ]));

  const confirm = el('button', { className: 'btn btn--primary', attrs: { type: 'button' } }, [icon('check', { size: 18 }), document.createTextNode(` ${t.confirm}`)]);
  confirm.dataset.testid = 'proposal-confirm';
  withTooltip(confirm, t.tips?.confirm);
  confirm.disabled = stale;
  confirm.addEventListener('click', () => onConfirm(proposal));

  const cancel = el('button', { className: 'btn', text: t.cancel, attrs: { type: 'button' } });
  cancel.dataset.testid = 'proposal-cancel';
  withTooltip(cancel, t.tips?.cancel);
  cancel.addEventListener('click', () => onCancel(proposal));

  const card = el('section', { className: `proposal${stale ? ' proposal--stale' : ''}`, attrs: { 'aria-label': t.proposalHeading, dir: t.dir } }, [
    el('header', { className: 'proposal__header' }, [
      el('h3', { className: 'proposal__heading', text: t.proposalHeading }),
      el('span', { className: 'proposal__count', text: t.changeCount(proposal.changes.length) }),
    ]),
    el('p', { className: 'proposal__summary', text: proposal.summary }),
    el('ul', { className: 'proposal__list' }, rows),
    el('p', { className: 'proposal__note', text: t.proposalNote }),
    el('div', { className: 'button-row' }, [confirm, cancel]),
  ]);
  card.dataset.testid = 'proposal-card';

  if (stale) {
    card.append(el('p', { className: 'proposal__stale', text: t.stale, attrs: { role: 'status' } }));
  }
  return card;
}
