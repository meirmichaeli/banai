// Every selectable part as a button: the keyboard and screen-reader path to what
// the 3D view selects by pointer (WCAG 2.1.1).
import { button, el, section } from './fields.js';
import { t } from '../i18n/app.js';

const ITEM_GROUPS = Object.freeze([['shelves', 'shelf'], ['drawers', 'drawer'], ['rails', 'rail']]);

function parts(design) {
  const s = t().properties;
  const doors = design.doors.items.map((door, i) => ({ id: door.id, label: s.doorN(i + 1) }));
  const partitions = design.partitions.map((partition, i) => ({ id: partition.id, label: s.partitionN(i + 1) }));
  const items = design.compartments.flatMap((compartment, c) => ITEM_GROUPS.flatMap(([key, kind]) =>
    (compartment[key] ?? []).map((item, i) => ({ id: item.id, label: s.itemInCompartment(c + 1, s.kinds[kind], i + 1) }))));
  return [{ id: 'carcass', label: s.kinds.carcass }, ...doors, ...partitions, ...items];
}

export function partsSection({ design, selection, select }) {
  const tip = t().propertyTips.selectPart;
  const list = el('ul', { className: 'parts-list' }, parts(design).map(({ id, label }) => {
    const node = button(label, () => select(id), { variant: 'link', testId: `part-${id}`, tooltip: tip });
    if (selection?.id === id) node.setAttribute('aria-current', 'true');
    return el('li', {}, [node]);
  }));
  return section(t().properties.allParts, [list], t().sectionTips.allParts);
}
