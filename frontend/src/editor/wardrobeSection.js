// Always-visible wardrobe settings: overall dimensions, doors and main materials.
// Inputs report their own errors inline; buttons/selects report under their section.
import { appearanceControls } from './appearanceControls.js';
import { actionResult, cmField, countField, el, section, segmented } from './fields.js';
import { dimensionOps, doorTypeOps } from './opsFromForm.js';
import { t } from '../i18n/app.js';

function dimensionsRow(design, run) {
  const { width, height, depth } = design.dimensions;
  const s = t().properties;
  const tips = t().propertyTips;
  return el('div', { className: 'field-row field-row--3' }, [
    cmField({ label: s.width, mm: width, testId: 'dim-width', tooltip: tips.width, onCommit: (mm) => run(dimensionOps('width', mm)) }),
    cmField({ label: s.height, mm: height, testId: 'dim-height', tooltip: tips.height, onCommit: (mm) => run(dimensionOps('height', mm)) }),
    cmField({ label: s.depth, mm: depth, testId: 'dim-depth', tooltip: tips.depth, onCommit: (mm) => run(dimensionOps('depth', mm)) }),
  ]);
}

export function wardrobeSection({ design, catalog, run }) {
  const { doors } = design;
  const s = t().properties;
  const tips = t().propertyTips;
  const wardrobe = section(s.wardrobe, [dimensionsRow(design, run)], t().sectionTips.wardrobe);
  const runDoors = (ops) => actionResult(wardrobe, run(ops));
  wardrobe.append(segmented({
    label: s.doors,
    testId: 'door-type',
    value: doors.type,
    tooltip: tips.doors,
    options: ['hinged', 'sliding', 'none'].map((type) => ({ value: type, label: s.doorTypes[type] })),
    onChange: (type) => runDoors(doorTypeOps(type)),
  }));
  if (doors.type === 'sliding') {
    wardrobe.append(countField({
      label: s.slidingPanels, value: doors.items.length, testId: 'sliding-count', tooltip: tips.slidingPanels,
      onCommit: (count) => run(doorTypeOps('sliding', count)),
    }));
  }

  const materials = section(s.materials, [], t().sectionTips.materials);
  const runMaterials = (ops) => actionResult(materials, run(ops));
  materials.append(appearanceControls({ catalog, appearance: design.carcass.appearance, target: 'carcass', run: runMaterials, label: s.carcassAndInterior }));
  if (doors.type !== 'none') {
    materials.append(appearanceControls({ catalog, appearance: doors.appearance, target: 'doors', run: runMaterials, label: s.doors }));
  }
  return [wardrobe, materials];
}
