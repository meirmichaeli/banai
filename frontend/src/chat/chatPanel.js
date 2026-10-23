// Left column: header (with a Hebrew/English switch), a welcome with starter prompts, the
// conversation, the proposal card and the composer. This panel never changes the design by
// itself: the agent only proposes, and the host applies a proposal when the customer confirms it.
// Switching the language rebuilds the panel's chrome; the conversation and the draft stay.
import { el } from '../editor/fields.js';
import { icon } from '../ui/icons.js';
import { MAX_MESSAGE_LENGTH } from './chatModel.js';
import { createLanguage, detectLanguage, STRINGS, stringsFor } from './i18n.js';
import { renderProposalCard } from './proposalCard.js';
import { canRecord, createSpeaker, readAloudPreference, startRecording } from './voice.js';
import { canTalkLive, createLiveVoice } from './liveVoice.js';
import { transcribe } from '../api/client.js';
import { languageSwitch } from '../ui/languageSwitch.js';
import { withTooltip } from '../ui/tooltip.js';

/** onExport() opens the carpenter PDF dialog (Generate Style Profile); without it no note is shown. */
export function mountChat(container, {
  model, onConfirm, language = createLanguage(), speaker = createSpeaker(), readAloud = readAloudPreference(),
  onExport = null, voiceMode = 'chained', liveFactory = createLiveVoice,
}) {
  container.classList.add('panel--chat');
  let draft = '';
  let hintKey = null; // a localized placeholder chosen on the start screen
  let view = null;
  // Voice state outlives a rebuild (language switch). status: null | 'recording' | 'transcribing'.
  const voice = { recording: null, status: null, notice: null };
  let spokenCount = model.getMessages().length; // replies already present are never read aloud
  // Live mode (ADR-008): the mic button starts a real-time conversation instead of a recording.
  const liveMode = voiceMode === 'live';
  const liveText = { state: 'idle', heard: '' };
  let live = null;

  const showLiveState = () => {
    const { t, hint, mic } = view;
    const { state, heard } = liveText;
    const states = { connecting: t.liveConnecting, live: heard ? t.liveHeard(heard) : t.liveActive, closing: t.liveClosing };
    hint.textContent = voice.notice ?? states[state] ?? t.hint;
    if (!mic) return;
    const on = state !== 'idle' && state !== 'error';
    mic.classList.toggle('chat__mic--recording', on);
    mic.setAttribute('aria-pressed', String(on));
    mic.setAttribute('aria-label', on ? t.liveStop : t.liveStart);
    mic.dataset.tooltip = on ? t.tips.liveStop : t.tips.liveStart;
    mic.replaceChildren(icon(on ? 'stop' : 'mic'));
    mic.disabled = state === 'closing';
  };

  const showVoiceState = () => {
    if (liveMode) {
      showLiveState();
      return;
    }
    const { t, hint, mic } = view;
    hint.textContent = voice.notice ?? (voice.status ? t[voice.status] : t.hint);
    if (!mic) return;
    const recording = voice.status === 'recording';
    mic.classList.toggle('chat__mic--recording', recording);
    mic.setAttribute('aria-pressed', String(recording));
    mic.setAttribute('aria-label', recording ? t.micStop : t.mic);
    mic.dataset.tooltip = recording ? t.tips.micStop : t.tips.mic;
    mic.replaceChildren(icon(recording ? 'stop' : 'mic'));
    mic.disabled = voice.status === 'transcribing' || (!recording && model.isBusy());
  };

  const idle = () => new Promise((resolve) => {
    if (!model.isBusy()) {
      resolve();
      return;
    }
    const off = model.subscribe(() => {
      if (model.isBusy()) return;
      off();
      resolve();
    });
  });

  /** A live delegation: the customer's spoken request as a normal chat turn; resolves to what to say. */
  async function delegate(text) {
    const t = () => language.strings();
    if (!text) return t().liveRepeat;
    // Speaking Hebrew or English switches the chat (and the app) to it, as typing does.
    const written = detectLanguage(text);
    if (written && written !== language.get()) language.set(written);
    await idle();
    const sent = model.send(text);
    if (!sent.ok) return t().liveRepeat;
    if (!sent.reply) return t().notConnected;
    const { reply, proposed } = await sent.reply;
    return proposed ? `${reply} ${t().liveConfirmHint}` : reply;
  }

  function toggleLive() {
    voice.notice = null;
    live ??= liveFactory({
      getLanguage: language.get,
      onDelegation: delegate,
      onHeard: (heard) => {
        liveText.heard = heard;
        if (view) showVoiceState();
      },
      onState: (state, error) => {
        liveText.state = state;
        if (state === 'live') speaker.stop(); // the live voice replaces read-aloud
        if (state === 'error') voice.notice = error?.name === 'NotAllowedError' ? view.t.micDenied : view.t.liveError;
        if (view) showVoiceState();
      },
    });
    if (live.isActive()) live.stop();
    else live.start();
  }

  async function toggleMic() {
    if (voice.recording) {
      voice.recording.stop();
      return;
    }
    voice.notice = null;
    try {
      voice.recording = await startRecording();
    } catch {
      voice.notice = view.t.micDenied;
      showVoiceState();
      return;
    }
    voice.status = 'recording';
    showVoiceState();
    const blob = await voice.recording.done;
    voice.recording = null;
    voice.status = 'transcribing';
    showVoiceState();
    try {
      const { text } = await transcribe(blob, language.get());
      view.input.value = text;
      draft = text;
      voice.status = null;
      showVoiceState();
      view.submit(); // the normal send path: language detection, then a proposal to confirm
    } catch (error) {
      voice.notice = error?.status ? error.message : view.t.voiceError;
    } finally {
      voice.status = null;
      showVoiceState();
    }
  }

  function readAloudToggle(t) {
    const button = el('button', {
      className: 'icon-btn chat__read-aloud',
      attrs: { type: 'button', 'aria-pressed': String(readAloud.get()), 'aria-label': t.readAloud },
    }, [icon('volume', { size: 18 })]);
    withTooltip(button, t.tips.readAloud);
    button.dataset.testid = 'chat-read-aloud';
    button.addEventListener('click', () => {
      readAloud.set(!readAloud.get());
      button.setAttribute('aria-pressed', String(readAloud.get()));
      if (!readAloud.get()) speaker.stop();
      voice.notice = readAloud.get() ? view.t.readAloudOn : null; // the AI-voice disclosure
      showVoiceState();
    });
    return button;
  }

  /** The final step: one pinned note with Generate Style Profile (the carpenter PDF). */
  function profileNote(code) {
    const s = stringsFor(code);
    const profile = el('button', { className: 'btn btn--primary', text: s.generateProfile, attrs: { type: 'button' } });
    profile.dataset.testid = 'chat-export';
    withTooltip(profile, s.tips.profile);
    profile.addEventListener('click', () => onExport());
    const note = el('div', { className: 'chat__bubble chat__bubble--system chat__built', attrs: { dir: s.dir, lang: code } }, [
      icon('check', { size: 16 }),
      el('div', { className: 'chat__built-body' }, [
        el('span', { text: s.readyForProfile }),
        el('div', { className: 'button-row' }, [profile]),
      ]),
    ]);
    note.dataset.testid = 'profile-note';
    return note;
  }

  function build() {
    const t = language.strings();
    container.setAttribute('dir', t.dir);
    container.setAttribute('lang', language.get());

    const header = el('header', { className: 'chat__header' }, [
      el('span', { className: 'chat__avatar' }, [icon('sparkle', { size: 22 })]),
      el('div', { className: 'chat__heading' }, [
        withTooltip(el('h2', { className: 'chat__title', text: t.title }), t.tips.title),
        el('p', { className: 'chat__subtitle', text: t.subtitle }),
      ]),
      model.isConnected()
        ? el('span', { className: 'chat__status chat__status--online', text: t.online, attrs: { 'data-tooltip': t.onlineTitle } })
        : el('span', { className: 'chat__status', text: t.comingSoon, attrs: { 'data-tooltip': t.comingSoonTitle } }),
    ]);

    const input = el('textarea', { className: 'chat__input', attrs: { rows: '2', maxlength: String(MAX_MESSAGE_LENGTH), placeholder: (hintKey && t.composerHints[hintKey]) || t.placeholder, dir: 'auto', 'aria-label': t.inputLabel } });
    input.dataset.testid = 'chat-input';
    withTooltip(input, t.tips.input);
    input.value = draft;
    input.addEventListener('input', () => { draft = input.value; });
    const sendButton = el('button', { className: 'icon-btn icon-btn--filled chat__send', attrs: { type: 'submit', 'aria-label': t.send } }, [icon('send')]);
    sendButton.dataset.testid = 'chat-send';
    withTooltip(sendButton, t.tips.send);
    const voiceReady = model.isConnected() && (liveMode ? canTalkLive() : canRecord());
    const mic = voiceReady ? el('button', { className: 'icon-btn chat__mic', attrs: { type: 'button' } }) : null;
    if (mic) {
      mic.dataset.testid = 'chat-mic';
      mic.addEventListener('click', liveMode ? toggleLive : toggleMic);
    }
    const composer = el('form', { className: 'chat__composer' }, mic ? [input, mic, sendButton] : [input, sendButton]);
    const hint = el('p', { className: 'chat__hint', text: t.hint, attrs: { 'aria-live': 'polite' } });
    hint.dataset.testid = 'chat-hint';

    const chips = t.suggestions.map((text) => {
      const chip = el('button', { className: 'suggestion', attrs: { type: 'button' } }, [icon('sparkle', { size: 16 }), el('span', { text })]);
      chip.dataset.testid = 'suggestion';
      withTooltip(chip, t.tips.suggestion);
      chip.addEventListener('click', () => {
        input.value = text; // only fills the composer: nothing is sent until the customer presses send
        draft = text;
        input.focus();
      });
      return chip;
    });
    const welcome = el('section', { className: 'welcome', attrs: { 'aria-label': t.welcomeLabel } }, [
      el('h3', { className: 'welcome__title', text: t.welcomeTitle }),
      el('p', { className: 'welcome__text', text: t.welcomeText }),
      el('div', { className: 'welcome__chips' }, chips),
    ]);
    welcome.dataset.testid = 'chat-welcome';

    const builtSlot = el('div', { className: 'chat__built-slot' });
    const list = el('div', { className: 'chat__messages', attrs: { role: 'log', 'aria-live': 'polite', 'aria-label': t.conversation } });
    list.dataset.testid = 'chat-messages';
    const proposalSlot = el('div', { className: 'chat__proposal' });
    const typing = el('div', { className: 'chat__bubble chat__bubble--assistant chat__typing', attrs: { role: 'status', 'aria-label': t.thinking } }, [
      el('span', { className: 'chat__dot' }), el('span', { className: 'chat__dot' }), el('span', { className: 'chat__dot' }),
    ]);
    typing.dataset.testid = 'chat-typing';
    typing.hidden = true;

    const submit = () => {
      if (model.isBusy() || !input.value.trim()) return;
      voice.notice = null; // a new message clears an old mic/read-aloud notice
      // Writing in Hebrew or English switches the chat to that language first, so the reply (and
      // the UI) come back only in the language the customer wrote in.
      const written = detectLanguage(input.value);
      if (written && written !== language.get()) {
        draft = input.value;
        language.set(written); // rebuilds the panel; the draft is carried over
        view.submit();
        return;
      }
      if (model.send(input.value).ok) {
        input.value = '';
        draft = '';
      }
    };
    composer.addEventListener('submit', (event) => {
      event.preventDefault();
      submit();
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        submit();
      }
    });

    const switcher = languageSwitch(language, { label: t.switchLabel, tooltip: t.tips.language });
    const controls = model.isConnected() ? [readAloudToggle(t), switcher] : [switcher];
    const footerRow = el('div', { className: 'chat__footer-row' }, [hint, el('div', { className: 'chat__footer-controls' }, controls)]);
    container.replaceChildren(header, el('div', { className: 'chat__body' }, [welcome, list, builtSlot, proposalSlot]), el('div', { className: 'chat__footer' }, [composer, footerRow]));
    view = { t, input, sendButton, composer, welcome, list, proposalSlot, typing, submit, hint, mic, renderedCount: 0, renderedProposalKey: null, builtSlot, renderedBuiltKey: null };
    showVoiceState();
  }

  function speakNewReplies(messages) {
    const reply = messages.slice(spokenCount).filter((message) => message.role === 'assistant').at(-1);
    spokenCount = messages.length;
    if (!reply || !readAloud.get() || live?.isActive()) return; // in a live conversation the live voice speaks
    speaker.speak(reply.text, reply.language, reply.signature).catch(() => {
      voice.notice = view.t.voiceError;
      showVoiceState();
    });
  }

  function render() {
    const { t, sendButton, composer, welcome, list, proposalSlot, typing } = view;
    const messages = model.getMessages();
    welcome.hidden = messages.length > 0 || model.getProposal() !== null || model.getBuilt() !== null;
    list.hidden = messages.length === 0;
    // Only newly added bubbles are created (and animate in); existing ones stay untouched.
    if (messages.length < view.renderedCount) {
      list.replaceChildren();
      view.renderedCount = 0;
    }
    messages.slice(view.renderedCount).forEach((message) => {
      // Designer and system bubbles keep the language (and direction) they were written in; the
      // customer's own text takes its direction from its content. Switching language changes neither.
      const written = message.role !== 'user' && STRINGS[message.language];
      const bubble = el('div', {
        className: `chat__bubble chat__bubble--${message.role}`,
        attrs: written ? { dir: written.dir, lang: message.language } : { dir: 'auto' },
      });
      if (message.role === 'system') bubble.append(icon('info', { size: 16 }));
      bubble.append(el('span', { text: message.text }));
      list.append(bubble);
    });
    view.renderedCount = messages.length;
    // One pinned note offering the PDF step: replaced, never added, so it never piles up.
    const built = model.getBuilt();
    const builtKey = built && onExport ? built.language : '';
    if (builtKey !== view.renderedBuiltKey) {
      view.renderedBuiltKey = builtKey;
      view.builtSlot.replaceChildren(...(builtKey ? [profileNote(built.language)] : []));
    }
    const busy = model.isBusy();
    typing.hidden = !busy;
    if (busy) list.append(typing); // keep the indicator last, under the newest message
    sendButton.disabled = busy;
    composer.setAttribute('aria-busy', String(busy));
    list.scrollTop = list.scrollHeight;
    showVoiceState();
    speakNewReplies(messages);

    // Re-render the card only when the proposal or its status changed (keeps its entrance animation calm).
    const proposal = model.getProposal();
    const status = model.getProposalStatus();
    const key = proposal ? `${proposal.id}:${status}` : '';
    if (key === view.renderedProposalKey) return;
    view.renderedProposalKey = key;
    proposalSlot.replaceChildren();
    if (proposal) {
      proposalSlot.append(renderProposalCard(proposal, status, {
        onConfirm,
        onCancel: () => model.cancelProposal(),
        strings: proposal.language ? stringsFor(proposal.language) : t, // the card stays in its own language
      }));
    }
  }

  build();
  model.subscribe(render);
  render();
  language.subscribe(() => {
    const hadFocus = document.activeElement === view.input;
    build();
    render();
    if (hadFocus) view.input.focus();
  });

  return {
    /** Focus the composer. `hintKey` picks a localized placeholder ('guided' | 'freeText'). */
    focus: (key) => {
      hintKey = key ?? null;
      view.input.placeholder = (hintKey && view.t.composerHints[hintKey]) || view.t.placeholder;
      view.input.focus();
    },
    /** Re-render, e.g. after the design revision changed (a pending proposal may now be stale). */
    refresh: render,
  };
}
