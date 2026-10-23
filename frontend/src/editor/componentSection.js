// Properties of the selected component; only the fields that apply to its kind.
import { appearanceControls } from './appearanceControls.js';
import { actionResult, button, cmField, el, section, segmented } from './fields.js';
import { addItemOps, clearAppearanceOps, doorHingeOps, removeOps } from './opsFromForm.js';
import { partitionLeftEdge } from '../domain/geometry.js';
import { t } from '../i18n/app.js';

function findItem(design, kind, id) {
  const key = { shelf: 'shelves', drawer: 'drawers', rail: 'rails' }[kind];
  for (const compartment of design.compartments) {
    const item = compartment[key]?.find((candidate) => candidate.id === id);
    if (item) return item;
  }
  return null;
}

function overrideControls({ catalog, item, inherited, run, label, fromDoors }) {
  const s = t().properties;
  const appearance = item.appearance ?? inherited;
  return [
    appearanceControls({ catalog, appearance, target: item.id, run, label }),
    ...(item.appearance ? [button(fromDoors ? s.useDoorFinish : s.useCarcassFinish, () => run(clearAppearanceOps(item.id)), { variant: 'ghost', tooltip: t().propertyTips.useFinish })] : []),
  ];
}

function fieldsFor(kind, { design, catalog, selection, run, runAction }) {
  const s = t().properties;
  const tips = t().propertyTips;
  const { id } = selection;
  const move = (op, field) => (mm) => run([{ op, id, [field]: mm }]);
  if (kind === 'shelf') {
    const shelf = findItem(design, kind, id);
    return [
      cmField({ label: s.heightFromBase, mm: shelf.y, testId: 'shelf-y', tooltip: tips.heightFromBase, onCommit: move('modify_shelf', 'y') }),
      cmField({ label: s.thickness, mm: shelf.thickness, testId: 'shelf-thickness', tooltip: tips.shelfThickness, onCommit: move('modify_shelf', 'thickness') }),
      ...overrideControls({ catalog, item: shelf, inherited: design.carcass.appearance, run: runAction, label: s.shelfFinish }),
    ];
  }
  if (kind === 'drawer') {
    const drawer = findItem(design, kind, id);
    return [
      cmField({ label: s.heightFromBase, mm: drawer.y, testId: 'drawer-y', tooltip: tips.heightFromBase, onCommit: move('modify_drawer', 'y') }),
      cmField({ label: s.drawerHeight, mm: drawer.height, testId: 'drawer-height', tooltip: tips.drawerHeight, onCommit: move('modify_drawer', 'height') }),
      ...overrideControls({ catalog, item: drawer, inherited: design.carcass.appearance, run: runAction, label: s.drawerFront }),
    ];
  }
  if (kind === 'rail') {
    const rail = findItem(design, kind, id);
    return [cmField({ label: s.heightFromBase, mm: rail.y, testId: 'rail-y', tooltip: tips.heightFromBase, onCommit: move('modify_rail', 'y') })];
  }
  if (kind === 'compartment') {
    const compartment = design.compartments.find((c) => c.id === id);
    return [
      cmField({ label: s.width, mm: compartment.width, testId: 'compartment-width', tooltip: tips.compartmentWidth, onCommit: (mm) => run([{ op: 'modify_compartment', compartmentId: id, width: mm }]) }),
      el('div', { className: 'button-row' }, ['shelf', 'drawer', 'rail'].map((item) =>
        button(s.add[item], () => runAction(addItemOps(design, id, item)), { testId: `add-${item}`, tooltip: tips.add[item] }))),
    ];
  }
  if (kind === 'partition') {
    const index = design.partitions.findIndex((p) => p.id === id);
    return [
      cmField({ label: s.positionFromLeft, mm: partitionLeftEdge(design, index), testId: 'partition-position', tooltip: tips.positionFromLeft, onCommit: (mm) => run([{ op: 'modify_partition', partitionId: id, position: mm }]) }),
      cmField({ label: s.thickness, mm: design.partitions[index].thickness, testId: 'partition-thickness', tooltip: tips.partitionThickness, onCommit: (mm) => run([{ op: 'modify_partition', partitionId: id, thickness: mm }]) }),
    ];
  }
  if (kind === 'door') {
    const door = design.doors.items.find((d) => d.id === id);
    return [
      ...(design.doors.type === 'hinged' ? [segmented({
        label: s.hingeSide, value: door.hingeSide, testId: 'hinge-side', tooltip: tips.hingeSide,
        options: ['left', 'right'].map((side) => ({ value: side, label: s.sides[side] })),
        onChange: (side) => runAction(doorHingeOps(design, id, side)),
      })] : []),
      ...overrideControls({ catalog, item: door, inherited: design.doors.appearance, run: runAction, label: s.doorFinish, fromDoors: true }),
    ];
  }
  return [el('p', { className: 'panel__note', text: s.carcassNote })];
}

export function componentSection({ design, catalog, selection, run, select }) {
  const s = t().properties;
  const tips = t().propertyTips;
  const kindName = s.kinds[selection.kind];
  const container = section(s.selected(kindName), [], t().sectionTips.selected);
  container.dataset.testid = 'selected-section';
  // Inputs report their own errors inline; buttons/selects report under the section.
  const runAction = (ops) => actionResult(container, run(ops));
  container.append(...fieldsFor(selection.kind, { design, catalog, selection, run, runAction }));
  const actions = [button(s.deselect, () => select(null), { variant: 'ghost', tooltip: tips.deselect })];
  if (selection.kind !== 'carcass') {
    actions.unshift(button(s.delete(kindName), () => runAction(removeOps(selection.id)), { variant: 'danger', testId: 'delete-selected', tooltip: tips.delete }));
  }
  container.append(el('div', { className: 'button-row' }, actions));
  return container;
}
