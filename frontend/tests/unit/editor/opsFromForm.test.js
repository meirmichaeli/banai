import { afterEach, describe, expect, it } from 'vitest';
import { applyOps } from '../../../src/domain/apply.js';
import { language } from '../../../src/i18n/app.js';
import {
  addCompartmentOps, addItemOps, doorHingeOps, doorTypeOps, friendlyError, materialOps, parseCm, toCmText,
} from '../../../src/editor/opsFromForm.js';
import { DomainError } from '../../../src/domain/errors.js';
import { loadCatalog, loadDesign } from '../domain/helpers.js';

const catalog = loadCatalog();
const basic = loadDesign('basic');

describe('parseCm', () => {
  it('converts centimetres (1 decimal) to integer millimetres', () => {
    expect(parseCm('64.3')).toEqual({ ok: true, mm: 643 });
    expect(parseCm(' 200 ')).toEqual({ ok: true, mm: 2000 });
    expect(parseCm('64,35')).toEqual({ ok: true, mm: 644 });
  });

  it('rejects empty, non-numeric and absurd input', () => {
    for (const text of ['', '   ', 'abc', '12cm', 'Infinity', '1e9', '--5']) {
      expect(parseCm(text).ok).toBe(false);
    }
  });

  it('formats millimetres back to centimetres', () => {
    expect(toCmText(643)).toBe('64.3');
    expect(toCmText(2000)).toBe('200.0');
  });
});

describe('door and material ops', () => {
  it('maps door types to configure_doors', () => {
    expect(doorTypeOps('hinged')).toEqual([{ op: 'configure_doors', type: 'hinged' }]);
    expect(doorTypeOps('sliding', 3)).toEqual([{ op: 'configure_doors', type: 'sliding', count: 3 }]);
    expect(doorTypeOps('none')).toEqual([{ op: 'configure_doors', type: 'none' }]);
  });

  it('changes one hinge side while keeping every other door', () => {
    const ops = doorHingeOps(basic, 'dr_middle', 'left');
    const result = applyOps(basic, ops, catalog);
    expect(result.doors.items.map((d) => [d.id, d.hingeSide])).toEqual([
      ['dr_left', 'left'], ['dr_middle', 'left'], ['dr_right', 'left'],
    ]);
  });

  it('builds catalog and custom appearance refs', () => {
    expect(materialOps('carcass', 'color', { catalogId: 'walnut' }))
      .toEqual([{ op: 'set_material', target: 'carcass', color: { catalogId: 'walnut' } }]);
    expect(materialOps('shf_l1', 'color', { custom: true, name: 'Sage', hex: '#9caf88' }))
      .toEqual([{ op: 'set_material', target: 'shf_l1', color: { custom: true, name: 'Sage', hex: '#9caf88' } }]);
  });
});

describe('structure ops produce valid designs', () => {
  it('adds a compartment by splitting space from the last one', () => {
    const result = applyOps(basic, addCompartmentOps(basic), catalog);
    expect(result.compartments).toHaveLength(4);
  });

  it.each(['shelf', 'drawer', 'rail'])('adds a %s into free space of every compartment', (kind) => {
    for (const compartment of basic.compartments) {
      const result = applyOps(basic, addItemOps(basic, compartment.id, kind), catalog);
      const key = { shelf: 'shelves', drawer: 'drawers', rail: 'rails' }[kind];
      const after = result.compartments.find((c) => c.id === compartment.id)[key].length;
      expect(after).toBe(compartment[key].length + 1);
    }
  });
});

describe('friendlyError', () => {
  afterEach(() => language.set('he'));

  it('turns domain errors into short user messages', () => {
    language.set('en');
    expect(friendlyError(new DomainError('OVERLAP', 'compartments[0].shelves[4]', 'x'))).toMatch(/overlap/i);
    expect(friendlyError(new DomainError('OUT_OF_BOUNDS', 'x', 'x'))).toMatch(/inside the wardrobe/i);
    expect(friendlyError(new DomainError('OUT_OF_RANGE', 'ops[0].width', 'x'))).toMatch(/allowed range/i);
    expect(friendlyError(new DomainError('SOMETHING_NEW', 'x', 'x'))).toMatch(/could not be applied/i);
  });

  it('follows the app language', () => {
    language.set('he');
    expect(friendlyError(new DomainError('OVERLAP', 'x', 'x'))).toBe('זה יחפוף מדף או מגירה אחרים. בחר מיקום אחר.');
    expect(friendlyError(new DomainError('SOMETHING_NEW', 'x', 'x'))).toBe('לא ניתן היה להחיל את השינוי.');
    expect(parseCm('abc').message).toBe('הזן מספר בס״מ, למשל 64.5');
    language.set('en');
    expect(parseCm('abc').message).toBe('Enter a number in cm, e.g. 64.5');
  });
});
