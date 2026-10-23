// Compartment list: widths, selection, add and remove, plus the carpenter PDF export.
import { actionResult, button, cmField, el, section } from './fields.js';
import { addCompartmentOps, removeOps } from './opsFromForm.js';
import { t } from '../i18n/app.js';

export function compartmentsSection({ design, selection, run, select, onExport }) {
  const s = t().properties;
  const tips = t().propertyTips;
  const list = el('ol', { className: 'compartment-list' });
  const single = design.compartments.length === 1;
  design.compartments.forEach((compartment, index) => {
    const selected = selection?.id === compartment.id;
    const row = el('li', { className: `compartment-row${selected ? ' is-selected' : ''}` });
    row.append(
      button(s.compartment(index + 1), () => select(compartment.id), { variant: 'link', testId: `select-${compartment.id}`, tooltip: tips.selectCompartment }),
      cmField({
        label: s.width, mm: compartment.width, testId: `width-${compartment.id}`, tooltip: tips.compartmentWidth,
        onCommit: (mm) => run([{ op: 'modify_compartment', compartmentId: compartment.id, width: mm }]),
      }),
      button(s.remove, () => actionResult(row, run(removeOps(compartment.id))), {
        variant: 'ghost', disabled: single, testId: `remove-${compartment.id}`, tooltip: tips.removeCompartment,
      }),
    );
    list.append(row);
  });
  const container = section(s.compartments, [list], t().sectionTips.compartments);
  const actions = el('div', { className: onExport ? 'button-row button-row--pair' : 'button-row' }, [
    button(s.addCompartment, () => actionResult(container, run(addCompartmentOps(design))), { variant: 'secondary', testId: 'add-compartment', tooltip: tips.addCompartment }),
  ]);
  if (onExport) actions.append(button(s.generateProfile, onExport, { variant: 'primary', testId: 'open-export', tooltip: tips.generateProfile }));
  container.append(actions);
  return container;
}
