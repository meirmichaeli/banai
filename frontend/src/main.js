import '@fontsource/bricolage-grotesque/600.css';
import '@fontsource/bricolage-grotesque/700.css';
import '@fontsource/bricolage-grotesque/800.css';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import '@fontsource/dm-sans/700.css';
import {
  applyProposal, createSavedDesign, getCatalog, getDefaultDesign, getHealth, getSavedDesign, sendChat, updateSavedDesign,
} from './api/client.js';
import { createStore } from './state/store.js';
import { mountPanel } from './editor/panel.js';
import { createViewer } from './viewer/viewer.js';
import { renderSnapshot } from './viewer/snapshot.js';
import { createChatModel } from './chat/chatModel.js';
import { language, t } from './i18n/app.js';
import { mountChat } from './chat/chatPanel.js';
import { mountStartScreen } from './entry/startScreen.js';
import { createSaveDialog } from './share/saveDialog.js';
import { parseShareHash, shareHash } from './share/link.js';
import { createExportDialog } from './export/exportDialog.js';
import { createRenderDialog } from './render/renderDialog.js';
import { createLogo } from './ui/logo.js';
import { installRipple } from './ui/ripple.js';
import { icon } from './ui/icons.js';
import { installTooltips } from './ui/tooltip.js';

// Errors are kept by key, so a banner that is showing follows a language switch.
let errorKey = null;

function showError(key) {
  errorKey = key;
  const banner = document.getElementById('error-banner');
  banner.textContent = t().errors[key];
  banner.hidden = false;
}

const lookup = (path) => path.split('.').reduce((node, key) => node?.[key], t());

/**
 * Static page text (index.html) in the app language: `data-i18n` sets the text, `data-i18n-label`
 * the accessible name, `data-i18n-tooltip` the tooltip, and `data-i18n-dir` the text direction.
 */
function applyStaticText() {
  const code = language.get();
  document.documentElement.lang = code;
  document.title = t().appName;
  document.querySelectorAll('[data-i18n]').forEach((node) => { node.textContent = lookup(node.dataset.i18n); });
  document.querySelectorAll('[data-i18n-label]').forEach((node) => node.setAttribute('aria-label', lookup(node.dataset.i18nLabel)));
  document.querySelectorAll('[data-i18n-tooltip]').forEach((node) => { node.dataset.tooltip = lookup(node.dataset.i18nTooltip); });
  document.querySelectorAll('[data-i18n-dir]').forEach((node) => {
    node.setAttribute('dir', t().dir);
    node.setAttribute('lang', code);
  });
  document.getElementById('topbar-logo').replaceChildren(createLogo({ size: 34, tagline: t().tagline }));
  if (errorKey) showError(errorKey);
}

// The skip link moves focus without touching the hash: the hash may hold the private design link.
function bindSkipLink() {
  const link = document.querySelector('.skip-link');
  link.addEventListener('click', (event) => {
    event.preventDefault();
    document.querySelector(link.getAttribute('href')).focus();
  });
}

function bindInteriorToggle(store) {
  const toggle = document.getElementById('toggle-interior');
  toggle.addEventListener('change', () => store.setDoorsVisible(!toggle.checked));
  store.subscribe((state) => { toggle.checked = !state.ui.doorsVisible; });
}

/**
 * The design to open: the saved one when the page was opened from its private link, else the basic
 * wardrobe. `session` ({ designId, token, revision }) is what the next save writes over.
 */
async function loadInitial(code) {
  const link = parseShareHash(window.location.hash);
  if (link) {
    try {
      const saved = await getSavedDesign({ ...link, language: code });
      return { initial: { design: saved.design, revision: 1 }, session: { ...link, revision: saved.revision } };
    } catch {
      showError('badLink');
    }
  }
  return { initial: await getDefaultDesign(), session: null };
}

function createSaver(store, initialSession) {
  let session = initialSession;
  const save = async () => {
    const { design } = store.getState();
    if (session) {
      const { revision } = await updateSavedDesign({ ...session, design, language: language.get() });
      session = { ...session, revision };
    } else {
      const created = await createSavedDesign({ design, language: language.get() });
      session = { designId: created.designId, token: created.accessToken, revision: created.revision };
    }
    window.history.replaceState(null, '', shareHash(session));
    return window.location.href;
  };
  // The private link of the design being edited, once it has one.
  const link = () => (session ? window.location.href : '');
  return { save, link };
}

/**
 * Builds a dialog in the app language and rebuilds it after a language switch. An open dialog is
 * rebuilt when it closes, so nothing changes under the customer's hands.
 */
function localizedDialog(create) {
  let dialog = null;
  let stale = false;
  const build = () => {
    dialog?.remove();
    dialog = create();
    dialog.element.addEventListener('close', () => {
      if (!stale) return;
      stale = false;
      build();
    });
  };
  build();
  language.subscribe(() => {
    if (dialog.isOpen()) stale = true;
    else build();
  });
  return { open: () => dialog.open() };
}

function bindDialogs({ storage, saver }) {
  const save = localizedDialog(() => createSaveDialog({ available: storage, onSave: saver.save, link: saver.link() }));
  const render = localizedDialog(createRenderDialog);
  document.getElementById('open-save').addEventListener('click', save.open);
  document.getElementById('open-render').addEventListener('click', render.open);
}

async function boot() {
  installRipple();
  installTooltips();
  document.querySelector('.viewer__help').append(icon('info', { size: 20 }));
  applyStaticText();
  language.subscribe(applyStaticText);
  let catalog;
  let initial;
  let session;
  let health;
  try {
    // A failed health check only means "agent and saving unknown": the editor still works without it.
    [catalog, { initial, session }, health] = await Promise.all([
      getCatalog(), loadInitial(language.get()), getHealth().catch(() => null),
    ]);
  } catch {
    showError('unreachable');
    return;
  }
  // Validates the server data before anything is rendered (throws on invalid data).
  const store = createStore({ design: initial.design, revision: initial.revision, catalog });
  const viewer = createViewer(document.getElementById('viewer'), store);
  bindInteriorToggle(store);
  bindSkipLink();
  const exporter = localizedDialog(() => createExportDialog({
    getDesign: () => store.getState().design,
    getLanguage: () => language.get(),
    getSnapshot: (design) => renderSnapshot(design, store.getState().catalog),
  }));
  mountPanel(document.getElementById('properties-content'), store, { onExport: exporter.open });
  bindDialogs({ storage: health?.data.storage === true, saver: createSaver(store, session) });

  // The agent is optional: without an OpenAI key on the server the panel says so honestly.
  const agent = health?.data.agent === true
    ? ({ messages, language: chatLanguage }) => {
      const { design, revision } = store.getState();
      return sendChat({ messages, design, revision, language: chatLanguage });
    }
    : null;
  const chatModel = createChatModel({ getRevision: () => store.getState().revision, agent, getLanguage: language.get });
  const chatText = () => language.strings();

  let applying = false;
  const confirmProposal = async (proposal) => {
    if (applying) return;
    if (!proposal.signed) {
      chatModel.resolveProposal(chatText().notApplied);
      return;
    }
    applying = true;
    const { design, revision } = store.getState();
    try {
      const result = await applyProposal({ design, revision, proposal: proposal.signed, language: language.get() });
      store.replaceDesign(result.design, result.revision);
      chatModel.resolveProposal(chatText().applied);
      chatModel.noteDesignReady(); // the final step: Generate Style Profile
    } catch (error) {
      chatModel.resolveProposal(error?.code === 'STALE' ? chatText().stale : chatText().notApplied);
    } finally {
      applying = false;
    }
  };
  const chat = mountChat(document.getElementById('chat-panel'), {
    model: chatModel, onConfirm: confirmProposal, language, onExport: exporter.open,
  });
  // A manual edit changes the revision, which may turn a pending proposal stale.
  store.subscribe(() => chat.refresh());

  if (import.meta.env.DEV) {
    window.__banai = Object.freeze({ store, viewer, chat: chatModel });
  }

  if (session) return; // reopened from a link: straight into the editor
  mountStartScreen({
    onChoose: (entry) => {
      // All three entry points open the same editor; the chat ones focus the composer, the manual
      // one the properties panel, so keyboard focus never falls out of the page when the modal closes.
      if (entry.focusesChat) chat.focus(entry.id);
      else document.getElementById('properties-panel').focus();
    },
  });
}

boot().catch(() => {
  showError('startFailed');
});
