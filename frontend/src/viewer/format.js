// Display formatting. The domain is integer mm; the UI shows centimetres (1 decimal).
import { t } from '../i18n/app.js';

export const cm = (mm) => (mm / 10).toFixed(1);

/** One-line description of a selected component, for labels and readouts (in the app language). */
export function describeSelection(design, selection, strings = t().viewer) {
  if (!selection) return '';
  const { id, kind } = selection;
  const { width, height, depth } = design.dimensions;
  if (kind === 'carcass') return strings.wardrobe(cm(width), cm(height), cm(depth));
  for (const [ci, compartment] of design.compartments.entries()) {
    if (compartment.id === id) return strings.compartment(ci + 1, cm(compartment.width));
    const shelf = compartment.shelves.find((s) => s.id === id);
    if (shelf) return strings.shelf(cm(shelf.y), cm(shelf.thickness));
    const drawer = compartment.drawers.find((d) => d.id === id);
    if (drawer) return strings.drawer(cm(drawer.y), cm(drawer.height));
    const rail = compartment.rails.find((r) => r.id === id);
    if (rail) return strings.rail(cm(rail.y));
  }
  const pi = design.partitions.findIndex((p) => p.id === id);
  if (pi >= 0) return strings.partition(pi + 1, cm(design.partitions[pi].thickness));
  const door = design.doors.items.find((d) => d.id === id);
  if (door) return strings.door(design.doors.type === 'sliding', door.hingeSide);
  return kind;
}
