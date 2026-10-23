import { describe, expect, it, vi } from 'vitest';
import { MAX_RESULT_CHARS, createLiveVoice } from '../../../src/chat/liveVoice.js';

/** A WebRTC stand-in: records what the module sends and lets the test play server events. */
function fakes() {
  const track = { stop: vi.fn() };
  const microphone = { getAudioTracks: () => [track], getTracks: () => [track] };
  const media = { getUserMedia: vi.fn(async () => microphone) };
  const channel = {
    readyState: 'open',
    sent: [],
    listeners: {},
    addEventListener(type, listener) { this.listeners[type] = listener; },
    send(data) { this.sent.push(JSON.parse(data)); },
    close: vi.fn(),
    emit(event) { this.listeners.message({ data: JSON.stringify(event) }); },
  };
  class Peer {
    constructor() {
      Peer.instance = this;
      this.iceGatheringState = 'complete';
      this.localDescription = null;
      this.close = vi.fn();
    }
    addEventListener() {}
    removeEventListener() {}
    addTrack() {}
    createDataChannel(label) {
      this.label = label;
      return channel;
    }
    async createOffer() { return { type: 'offer', sdp: 'v=0 offer' }; }
    async setLocalDescription(description) { this.localDescription = description; }
    async setRemoteDescription(description) { this.remote = description; }
  }
  class AudioImpl {}
  const createSession = vi.fn(async () => ({ sessionId: 'live_1', sdp: 'v=0 answer' }));
  return { media, channel, Peer, AudioImpl, createSession, track };
}

async function connected(options = {}) {
  const f = fakes();
  const states = [];
  const heard = [];
  const live = createLiveVoice({
    getLanguage: () => 'he',
    onDelegation: vi.fn(async (text) => `reply to: ${text}`),
    onState: (state) => states.push(state),
    onHeard: (text) => heard.push(text),
    settleMs: 0,
    ...f,
    ...options,
  });
  await live.start();
  f.channel.emit({ type: 'session.started', session: { id: 'live_1' } });
  return { live, states, heard, ...f };
}

describe('live voice', () => {
  it('opens the session through the server with the WebRTC offer and the UI language', async () => {
    const { live, states, createSession, Peer } = await connected();
    expect(createSession).toHaveBeenCalledWith({ sdp: 'v=0 offer', language: 'he' });
    expect(Peer.instance.label).toBe('oai-events');
    expect(Peer.instance.remote).toEqual({ type: 'answer', sdp: 'v=0 answer' });
    expect(states).toEqual(['connecting', 'live']);
    expect(live.isActive()).toBe(true);
  });

  it('sends what the customer said since the last delegation, and speaks the reply', async () => {
    const onDelegation = vi.fn(async (text) => `reply to: ${text}`);
    const { channel, heard } = await connected({ onDelegation });
    channel.emit({ type: 'session.input_transcript.delta', delta: 'תוסיף ', start_ms: 0, end_ms: 100 });
    channel.emit({ type: 'session.input_transcript.delta', delta: 'מגירה', start_ms: 100, end_ms: 200 });
    expect(heard.at(-1)).toBe('תוסיף מגירה');
    channel.emit({ type: 'session.delegation.created', delegation: { id: 'item_1', type: 'delegation', target: 'client' } });
    await vi.waitFor(() => expect(channel.sent).toHaveLength(1));
    expect(onDelegation).toHaveBeenCalledWith('תוסיף מגירה');
    expect(channel.sent[0]).toEqual({ type: 'session.commentary.append', event_id: 'result_1', delegation_id: 'item_1', content: 'reply to: תוסיף מגירה' });
    // The next request starts from an empty transcript.
    channel.emit({ type: 'session.input_transcript.delta', delta: 'ועוד מדף' });
    channel.emit({ type: 'session.delegation.created', delegation: { id: 'item_2', target: 'client' } });
    await vi.waitFor(() => expect(channel.sent).toHaveLength(2));
    expect(onDelegation).toHaveBeenLastCalledWith('ועוד מדף');
    expect(channel.sent[1].delegation_id).toBe('item_2');
  });

  it('runs delegations one at a time, in order', async () => {
    let release;
    const first = new Promise((resolve) => { release = resolve; });
    const onDelegation = vi.fn().mockReturnValueOnce(first).mockResolvedValueOnce('second');
    const { channel } = await connected({ onDelegation });
    channel.emit({ type: 'session.delegation.created', delegation: { id: 'a', target: 'client' } });
    channel.emit({ type: 'session.delegation.created', delegation: { id: 'b', target: 'client' } });
    await vi.waitFor(() => expect(onDelegation).toHaveBeenCalledTimes(1));
    release('first');
    await vi.waitFor(() => expect(channel.sent.map((e) => e.delegation_id)).toEqual(['a', 'b']));
  });

  it('caps the spoken result at the documented update size', async () => {
    const { channel } = await connected({ onDelegation: async () => 'x'.repeat(MAX_RESULT_CHARS + 50) });
    channel.emit({ type: 'session.delegation.created', delegation: { id: 'a', target: 'client' } });
    await vi.waitFor(() => expect(channel.sent).toHaveLength(1));
    expect(channel.sent[0].content).toHaveLength(MAX_RESULT_CHARS);
  });

  it('ignores non-client delegations, malformed events and empty results', async () => {
    const { channel } = await connected({ onDelegation: async () => '  ' });
    channel.emit({ type: 'session.delegation.created', delegation: { id: 'r', target: 'responses' } });
    channel.listeners.message({ data: 'not json' });
    channel.emit({ type: 'session.delegation.created', delegation: { id: 'a', target: 'client' } });
    await new Promise((resolve) => { setTimeout(resolve, 20); });
    expect(channel.sent).toEqual([]);
  });

  it('stops gracefully: session.close, then cleanup on session.closed', async () => {
    const { live, channel, states, track, Peer } = await connected();
    live.stop();
    expect(channel.sent).toEqual([{ type: 'session.close' }]);
    expect(states.at(-1)).toBe('closing');
    channel.emit({ type: 'session.closed', reason: 'close_requested', usage: { seconds: 3 } });
    expect(states.at(-1)).toBe('idle');
    expect(track.stop).toHaveBeenCalled();
    expect(Peer.instance.close).toHaveBeenCalled();
    expect(live.isActive()).toBe(false);
  });

  it('reports a denied microphone as an error and releases nothing it did not open', async () => {
    const f = fakes();
    const denied = Object.assign(new Error('denied'), { name: 'NotAllowedError' });
    f.media.getUserMedia = vi.fn(async () => { throw denied; });
    const onState = vi.fn();
    const live = createLiveVoice({ getLanguage: () => 'en', onDelegation: vi.fn(), onState, ...f });
    await live.start();
    expect(onState).toHaveBeenLastCalledWith('error', denied);
    expect(f.createSession).not.toHaveBeenCalled();
    expect(live.isActive()).toBe(false);
  });

  it('reports a server error and can start again afterwards', async () => {
    const f = fakes();
    f.createSession.mockRejectedValueOnce(new Error('502'));
    const states = [];
    const live = createLiveVoice({ getLanguage: () => 'he', onDelegation: vi.fn(), onState: (s) => states.push(s), settleMs: 0, ...f });
    await live.start();
    expect(states).toEqual(['connecting', 'error']);
    expect(f.track.stop).toHaveBeenCalled();
    await live.start();
    expect(states.at(-1)).toBe('connecting');
    expect(f.createSession).toHaveBeenCalledTimes(2);
  });
});
