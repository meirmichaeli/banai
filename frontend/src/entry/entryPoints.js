// The three ways to start (spec section 6). All of them land in the same editor and data model.
// Card texts per language: i18n/app.js start.entries[id].
export const ENTRY_POINTS = Object.freeze([
  Object.freeze({
    id: 'guided',
    icon: 'chat',
    focusesChat: true, // placeholder text per language: chat/i18n.js composerHints.guided
  }),
  Object.freeze({
    id: 'freeText',
    icon: 'edit',
    focusesChat: true, // composerHints.freeText
  }),
  Object.freeze({
    id: 'basic',
    icon: 'wardrobe',
    focusesChat: false,
  }),
]);

export const getEntryPoint = (id) => ENTRY_POINTS.find((entry) => entry.id === id) ?? null;
