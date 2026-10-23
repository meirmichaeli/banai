import { afterEach, describe, expect, it } from 'vitest';
import { APP_STRINGS, catalogName, language, t } from '../../../src/i18n/app.js';
import { STRINGS } from '../../../src/chat/i18n.js';
import { ENTRY_POINTS } from '../../../src/entry/entryPoints.js';
import { describeSelection } from '../../../src/viewer/format.js';
import { loadCatalog, loadDesign } from '../domain/helpers.js';

/** Every leaf path of a nested string table (functions count as leaves). */
function paths(node, prefix = '') {
  return Object.entries(node).flatMap(([key, value]) => (value && typeof value === 'object' && !Array.isArray(value)
    ? paths(value, `${prefix}${key}.`)
    : [`${prefix}${key}`]));
}

describe('app strings', () => {
  afterEach(() => language.set('he'));

  it('Hebrew and English have exactly the same keys (catalog names aside)', () => {
    const keys = (code) => paths(APP_STRINGS[code]).filter((path) => !path.startsWith('catalog.')).sort();
    expect(keys('he')).toEqual(keys('en'));
  });

  it('has no empty texts, and every function returns text', () => {
    for (const code of ['he', 'en']) {
      for (const path of paths(APP_STRINGS[code])) {
        const value = path.split('.').reduce((node, key) => node[key], APP_STRINGS[code]);
        const text = typeof value === 'function' ? value('1', 'x', '2') : value;
        expect(typeof text, `${code}.${path}`).toBe('string');
        expect(text.trim(), `${code}.${path}`).not.toBe('');
      }
    }
  });

  it('chat strings have tooltips in both languages', () => {
    expect(Object.keys(STRINGS.he.tips).sort()).toEqual(Object.keys(STRINGS.en.tips).sort());
  });

  it('defaults to Hebrew and follows the language switch', () => {
    expect(language.get()).toBe('he');
    expect(t().dir).toBe('rtl');
    language.set('en');
    expect(t().dir).toBe('ltr');
    expect(t().properties.title).toBe('Properties');
  });

  it('has a start-screen card text for every entry point', () => {
    for (const code of ['he', 'en']) {
      for (const entry of ENTRY_POINTS) expect(APP_STRINGS[code].start.entries[entry.id]?.action).toBeTruthy();
    }
  });

  it('names every catalog entry in Hebrew, and keeps the server name in English', () => {
    const catalog = loadCatalog();
    const entries = [...catalog.materials, ...catalog.colors, ...catalog.finishes];
    for (const entry of entries) expect(APP_STRINGS.he.catalog[entry.id], entry.id).toBeTruthy();
    expect(catalogName({ id: 'walnut', name: 'Walnut' })).toBe('אגוז');
    expect(catalogName({ id: 'not_in_table', name: 'Server name' })).toBe('Server name');
    language.set('en');
    expect(catalogName({ id: 'walnut', name: 'Walnut' })).toBe('Walnut');
  });

  it('describes a selected part in the app language', () => {
    const design = loadDesign('basic');
    const selection = { id: 'carcass', kind: 'carcass' };
    expect(describeSelection(design, selection)).toBe('ארון · 200.0 × 240.0 × 60.0 ס״מ');
    language.set('en');
    expect(describeSelection(design, selection)).toBe('Wardrobe · 200.0 × 240.0 × 60.0 cm');
  });
});
