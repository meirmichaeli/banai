// Live voice conversation (GPT-Live with client delegation, ADR-008). The live model listens and
// talks in real time, but it never designs: each time it delegates, the customer's words since the
// previous delegation go through the normal chat turn (scope rules, signed proposal), and the
// designer's reply is handed back for the live model to say. Changes still apply only when the
// customer clicks Confirm. The OpenAI key stays on the server: it opens the session for this offer.
import { createLiveSession } from '../api/client.js';

export const canTalkLive = () => typeof globalThis.RTCPeerConnection === 'function'
  && Boolean(globalThis.navigator?.mediaDevices?.getUserMedia);

const ICE_TIMEOUT_MS = 10_000;
const START_TIMEOUT_MS = 15_000;
const CLOSE_TIMEOUT_MS = 5_000;
// The delegation can arrive just before the last transcript words: give them a moment to land.
const TRANSCRIPT_SETTLE_MS = 400;
// GPT-Live accepts up to 500 tokens per update; designer replies are a sentence or two.
export const MAX_RESULT_CHARS = 1500;

const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

function iceGathered(peer) {
  if (peer.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      peer.removeEventListener('icegatheringstatechange', onChange);
      reject(new Error('Timed out while gathering ICE candidates'));
    }, ICE_TIMEOUT_MS);
    function onChange() {
      if (peer.iceGatheringState !== 'complete') return;
      clearTimeout(timer);
      peer.removeEventListener('icegatheringstatechange', onChange);
      resolve();
    }
    peer.addEventListener('icegatheringstatechange', onChange);
  });
}

/**
 * @param getLanguage   () => 'he' | 'en': the language the conversation starts in
 * @param onDelegation  async (text) => string: runs the customer's request (text may be empty when
 *                      nothing was heard) and resolves to what the live model should say
 * @param onState       (state, error?) => void, state: 'idle' | 'connecting' | 'live' | 'closing' | 'error'
 * @param onHeard       (text) => void: the customer's words since the last delegation (captions)
 */
export function createLiveVoice({
  getLanguage,
  onDelegation,
  onState = () => {},
  onHeard = () => {},
  createSession = createLiveSession,
  Peer = globalThis.RTCPeerConnection,
  media = globalThis.navigator?.mediaDevices,
  AudioImpl = globalThis.Audio,
  settleMs = TRANSCRIPT_SETTLE_MS,
} = {}) {
  let state = 'idle';
  let peer = null;
  let events = null;
  let microphone = null;
  let audio = null;
  let heard = '';
  let queue = Promise.resolve();
  let updates = 0;
  let timer = null;
  let attempt = 0; // a stopped attempt must not touch the next one

  const setState = (next, error) => {
    state = next;
    onState(next, error);
  };
  const send = (event) => {
    if (events?.readyState === 'open') events.send(JSON.stringify(event));
  };

  function cleanup(next = 'idle', error) {
    attempt += 1;
    clearTimeout(timer);
    microphone?.getTracks().forEach((track) => track.stop()); // releases the microphone indicator
    events?.close();
    peer?.close();
    if (audio) audio.srcObject = null;
    peer = null;
    events = null;
    microphone = null;
    audio = null;
    heard = '';
    onHeard('');
    setState(next, error);
  }

  async function delegate(delegationId, current) {
    await wait(settleMs);
    if (current !== attempt) return;
    const text = heard.trim();
    heard = '';
    onHeard('');
    let content = '';
    try {
      content = String(await onDelegation(text) ?? '');
    } catch {
      content = '';
    }
    if (current !== attempt || !content.trim()) return;
    updates += 1;
    send({ type: 'session.commentary.append', event_id: `result_${updates}`, delegation_id: delegationId, content: content.slice(0, MAX_RESULT_CHARS) });
  }

  function onEvent(event, current) {
    if (current !== attempt) return;
    if (event.type === 'session.started') {
      clearTimeout(timer);
      setState('live');
    } else if (event.type === 'session.input_transcript.delta') {
      heard += event.delta ?? '';
      onHeard(heard);
    } else if (event.type === 'session.delegation.created' && event.delegation?.target === 'client') {
      // Requests run one at a time, in the order the customer made them.
      const { id } = event.delegation;
      queue = queue.then(() => delegate(id, current));
    } else if (event.type === 'session.closed') {
      cleanup('idle');
    }
  }

  async function start() {
    if (state !== 'idle' && state !== 'error') return;
    const current = attempt;
    setState('connecting');
    try {
      microphone = await media.getUserMedia({ audio: true });
      if (current !== attempt) return;
      peer = new Peer();
      audio = new AudioImpl();
      audio.autoplay = true;
      peer.addEventListener('track', (event) => {
        audio.srcObject = new MediaStream([event.track]);
        audio.play?.()?.catch?.(() => {});
      });
      microphone.getAudioTracks().forEach((track) => peer.addTrack(track, microphone));
      // The event channel must exist before the offer is created.
      events = peer.createDataChannel('oai-events');
      events.addEventListener('message', ({ data }) => {
        let event;
        try {
          event = JSON.parse(data);
        } catch {
          return;
        }
        onEvent(event, current);
      });
      events.addEventListener('close', () => {
        if (current === attempt && state !== 'idle') cleanup('idle');
      });
      await peer.setLocalDescription(await peer.createOffer());
      await iceGathered(peer);
      const { sdp } = await createSession({ sdp: peer.localDescription.sdp, language: getLanguage() });
      if (current !== attempt) return;
      await peer.setRemoteDescription({ type: 'answer', sdp });
      timer = setTimeout(() => {
        if (current === attempt && state === 'connecting') cleanup('error', new Error('The live session did not start'));
      }, START_TIMEOUT_MS);
    } catch (error) {
      if (current === attempt) cleanup('error', error);
    }
  }

  /** Ends the conversation gracefully (pending work drains until session.closed). */
  function stop() {
    if (state === 'connecting') {
      cleanup('idle');
      return;
    }
    if (state !== 'live') return;
    setState('closing');
    send({ type: 'session.close' });
    const current = attempt;
    timer = setTimeout(() => {
      if (current === attempt) cleanup('idle');
    }, CLOSE_TIMEOUT_MS);
  }

  return {
    start,
    stop,
    getState: () => state,
    isActive: () => state === 'connecting' || state === 'live' || state === 'closing',
  };
}
