// One shared tooltip for every element with a `data-tooltip` attribute (WCAG 1.4.13): it shows on
// pointer hover and on keyboard focus, Esc dismisses it, the pointer can move onto it without it
// closing, and while shown it is linked to its element through aria-describedby. It is a manual
// popover, so it also draws above open modal dialogs. Text is set with textContent only.
const TOOLTIP_ID = 'app-tooltip';
const SHOW_DELAY = 300; // ms
const HIDE_DELAY = 120; // ms: time to move the pointer onto the tooltip
const GAP = 8; // px between the element and the tooltip
const MARGIN = 8; // px kept clear of the window edges

// The installed tooltip, for surfaces without DOM elements per item (the 3D canvas).
let active = null;

/**
 * Shows `text` next to the pointer at (x, y) in viewport px, e.g. the part under the cursor in
 * the 3D view; null text hides it. A no-op before installTooltips().
 */
export function pointerTooltip(text, x, y, { dir = 'auto', lang } = {}) {
  active?.atPointer(text, x, y, { dir, lang });
}

/** Marks `node` as having a tooltip and returns it, for use inside DOM builders. */
export function withTooltip(node, text) {
  if (text) node.dataset.tooltip = text;
  return node;
}

function addDescribedBy(node) {
  const ids = (node.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
  if (!ids.includes(TOOLTIP_ID)) node.setAttribute('aria-describedby', [...ids, TOOLTIP_ID].join(' '));
}

function removeDescribedBy(node) {
  const ids = (node.getAttribute('aria-describedby') ?? '').split(/\s+/).filter((id) => id && id !== TOOLTIP_ID);
  if (ids.length) node.setAttribute('aria-describedby', ids.join(' '));
  else node.removeAttribute('aria-describedby');
}

export function installTooltips(doc = document) {
  const tip = doc.createElement('div');
  tip.id = TOOLTIP_ID;
  tip.className = 'tooltip';
  tip.setAttribute('role', 'tooltip');
  tip.dataset.testid = 'tooltip';
  const usePopover = typeof tip.showPopover === 'function';
  if (usePopover) tip.setAttribute('popover', 'manual');
  else tip.hidden = true;
  doc.body.append(tip);

  let target = null;
  let showTimer = null;
  let hideTimer = null;
  // Focus shows a tooltip only for keyboard users: focus that a script or a dialog moves on load, or
  // that a click puts on an input, must not pop one up.
  let keyboard = false;
  let atPointer = false; // shown by pointerTooltip(), not by an element

  const place = () => {
    const box = target.getBoundingClientRect();
    const { offsetWidth: width, offsetHeight: height } = tip;
    const { innerWidth, innerHeight } = doc.defaultView;
    let top = box.bottom + GAP;
    if (top + height > innerHeight - MARGIN) top = Math.max(MARGIN, box.top - GAP - height);
    const left = Math.min(Math.max(MARGIN, box.left + box.width / 2 - width / 2), innerWidth - width - MARGIN);
    tip.style.top = `${Math.round(top)}px`;
    tip.style.left = `${Math.round(left)}px`;
  };

  const close = () => {
    if (usePopover) {
      if (tip.matches(':popover-open')) tip.hidePopover();
    } else {
      tip.hidden = true;
    }
  };

  const open = () => {
    if (usePopover) {
      // Re-open so the tooltip goes to the top of the top layer (above a modal opened since).
      if (tip.matches(':popover-open')) tip.hidePopover();
      tip.showPopover();
    } else {
      tip.hidden = false;
    }
  };

  const hide = () => {
    clearTimeout(showTimer);
    clearTimeout(hideTimer);
    if (atPointer) {
      atPointer = false;
      close();
    }
    if (!target) return;
    removeDescribedBy(target);
    target = null;
    close();
  };

  const show = (node) => {
    clearTimeout(hideTimer);
    if (target === node) return;
    hide();
    const text = node.dataset.tooltip;
    if (!text || !node.isConnected) return;
    target = node;
    tip.textContent = text;
    const directed = node.closest('[dir]');
    tip.setAttribute('dir', directed?.getAttribute('dir') ?? 'auto');
    const lang = node.closest('[lang]')?.getAttribute('lang');
    if (lang) tip.setAttribute('lang', lang);
    addDescribedBy(node);
    open();
    place();
  };

  const showSoon = (node, delay) => {
    clearTimeout(showTimer);
    clearTimeout(hideTimer);
    if (target === node) return;
    showTimer = setTimeout(() => show(node), delay);
  };

  const hideSoon = () => {
    clearTimeout(showTimer);
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hide, HIDE_DELAY);
  };

  const owner = (node) => (node instanceof Element ? node.closest('[data-tooltip]') : null);

  doc.addEventListener('pointerover', (event) => {
    if (event.pointerType === 'touch') return;
    if (tip.contains(event.target)) {
      clearTimeout(hideTimer); // hovering the tooltip itself keeps it open
      return;
    }
    const node = owner(event.target);
    if (node) showSoon(node, SHOW_DELAY);
    else if (target) hideSoon();
  });
  doc.addEventListener('pointerout', (event) => {
    if (!target) {
      clearTimeout(showTimer);
      return;
    }
    const next = event.relatedTarget;
    if (next instanceof Node && (target.contains(next) || tip.contains(next))) return;
    hideSoon();
  });
  doc.addEventListener('pointerdown', () => { keyboard = false; }, true);
  doc.addEventListener('focusin', (event) => {
    const node = owner(event.target);
    if (node && keyboard) show(node);
    else hide();
  });
  doc.addEventListener('focusout', (event) => {
    if (target && target.contains(event.target)) hide();
  });
  doc.addEventListener('keydown', (event) => {
    if (event.key === 'Tab' || event.key.startsWith('Arrow')) keyboard = true;
    if (event.key === 'Escape' && target) {
      hide();
      // Esc closes only the tooltip, not an open dialog underneath it.
      event.stopPropagation();
      event.preventDefault();
    }
  }, true);
  doc.addEventListener('click', hide, true);
  doc.addEventListener('scroll', hide, true);
  doc.defaultView.addEventListener('resize', hide);

  active = {
    atPointer(text, x, y, { dir, lang }) {
      if (!text) {
        if (atPointer) hide();
        return;
      }
      if (target) hide();
      if (!atPointer || tip.textContent !== text) {
        tip.textContent = text;
        tip.setAttribute('dir', dir);
        if (lang) tip.setAttribute('lang', lang);
        if (!atPointer) open();
        atPointer = true;
      }
      const { offsetWidth: width, offsetHeight: height } = tip;
      const { innerWidth, innerHeight } = doc.defaultView;
      const left = Math.min(Math.max(MARGIN, x + 14), innerWidth - width - MARGIN);
      const top = y + 18 + height > innerHeight - MARGIN ? y - 12 - height : y + 18;
      tip.style.left = `${Math.round(left)}px`;
      tip.style.top = `${Math.round(top)}px`;
    },
  };
  return { element: tip, hide };
}
