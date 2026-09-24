(() => {
  const peer = Math.random().toString(36).slice(2, 10);
  const ch = new BroadcastChannel('fake-room');
  const others = new Map(); let mine = {}; const hs = []; let maxBytes = 0;
  const snapshot = () => [{ peer, by: null, isMe: true, sameTab: true, kind: 'viewer', guest: false, presence: Object.freeze({ ...mine }), updatedAt: Date.now() }, ...[...others.entries()].map(([p, pr]) => ({ peer: p, by: null, isMe: false, sameTab: false, kind: 'viewer', guest: false, presence: pr, updatedAt: Date.now() }))];
  let pend = false;
  const fire = () => { if (pend) return; pend = true; requestAnimationFrame(() => { pend = false; const ps = snapshot(); for (const h of hs) h({ peers: ps, joined: [], left: [], updated: [] }); }); };
  let sendT = null;
  const send = () => { if (sendT) return; sendT = setTimeout(() => { sendT = null; ch.postMessage({ t: 'p', peer, pr: mine }); }, 33); };
  ch.onmessage = ev => { const m = ev.data; if (m.t === 'p') { others.set(m.peer, Object.freeze(m.pr)); fire(); } if (m.t === 'hello') { send(); others.has(m.peer) || others.set(m.peer, {}); fire(); } if (m.t === 'bye') { others.delete(m.peer); fire(); } };
  window.addEventListener('beforeunload', () => ch.postMessage({ t: 'bye', peer }));
  const room = {
    presence(patch) { for (const k in patch) { if (patch[k] === null) delete mine[k]; else mine[k] = patch[k]; } const b = new TextEncoder().encode(JSON.stringify(mine)).length; maxBytes = Math.max(maxBytes, b); window.__maxPresence = maxBytes; if (b > 4096) { console.error('PRESENCE TOO BIG ' + b); return Promise.reject({ code: 'invalid_argument' }); } send(); fire(); return Promise.resolve(); },
    onPeers(h) { hs.push(h); setTimeout(fire, 0); return () => {}; },
    onConnection(h) { setTimeout(() => h(true), 0); return () => {}; },
    peers: snapshot, connected: () => true, emit: () => Promise.resolve(), on: () => () => {},
  };
  window.claude = { use: async n => n === 'room' ? room : null };
  setTimeout(() => ch.postMessage({ t: 'hello', peer }), 50);
})();
