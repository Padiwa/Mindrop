// Imitation minimale des API chrome.* utilisées par l'extension, pour tester ses modules dans une page ordinaire.
// window.__legacyItems : contenu de l'ancien stockage chrome.storage.local (pour tester la migration).
// window.__fakeHost : fonction (message) => réponses, qui joue le pont local pour connectNative.
(() => {
  const store = { items: window.__legacyItems || [] };
  const listeners = [];
  const runtime = {
    lastError: undefined,
    getURL: p => location.origin + '/' + p.replace(/^\//, ''),
    connectNative() {
      const onMessage = [], onDisconnect = [];
      let closed = false;
      const disconnect = err => {
        if (closed) return; closed = true;
        runtime.lastError = err ? { message: err } : undefined;
        onDisconnect.forEach(f => f());
        runtime.lastError = undefined;
      };
      if (!window.__fakeHost) setTimeout(() => disconnect('Specified native messaging host not found.'));
      return {
        onMessage: { addListener: f => onMessage.push(f) },
        onDisconnect: { addListener: f => onDisconnect.push(f) },
        postMessage(msg) {
          if (closed) throw new Error('port fermé');
          const copy = JSON.parse(JSON.stringify(msg));            // comme Chrome : sérialisation JSON
          setTimeout(() => {
            let replies;
            try { replies = window.__fakeHost(copy); } catch (e) { replies = [{ ok: false, error: e.message }]; }
            for (const r of replies) onMessage.forEach(f => f(JSON.parse(JSON.stringify(r))));
          });
        },
        disconnect() { closed = true; },
      };
    },
  };
  window.chrome = {
    storage: {
      local: {
        get: async k => Object.fromEntries((Array.isArray(k) ? k : [k]).map(x => [x, store[x]])),
        set: async o => {
          const changes = {};
          for (const [k, v] of Object.entries(o)) { if (store[k] !== v) changes[k] = { oldValue: store[k], newValue: v }; store[k] = v; }
          if (Object.keys(changes).length) listeners.forEach(l => l(changes, 'local'));
        },
      },
      onChanged: { addListener: f => listeners.push(f) },
    },
    runtime,
  };

  // Petit harnais : test(nom, fn) puis done() ; le lanceur lit window.__results.
  const queue = [];
  window.test = (name, fn) => queue.push({ name, fn });
  window.assert = (cond, msg) => { if (!cond) throw new Error(msg || 'assertion échouée'); };
  window.run = async () => {
    const results = [];
    for (const t of queue) {
      try { await t.fn(); results.push({ name: t.name, ok: true }); }
      catch (e) { results.push({ name: t.name, ok: false, error: String(e.stack || e) }); }
    }
    window.__results = results;
  };
})();
