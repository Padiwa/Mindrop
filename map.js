// Carte mentale : chaque #tag est un nœud ; en zoomant, les souvenirs liés et leurs liens apparaissent.
import { domainOf } from './storage.js';
import { plainText } from './markdown.js';
import { buildLinkGraph } from './links.js';

const CARD_W = 150;
const IMG_H = 84;
const RING = { gap: 115, step: 165, arc: 205 };
const NOTAG = '∅';
const DARK = '#26241f';
// Jetons lus dans tokens.css : couleurs de la carte et polices du canvas.
const TOKENS = { bg: 'paper', surface: 'sheet', ink: 'ink', muted: 'muted', line: 'rule', accent: 'accent', noteInk: 'note-ink', noteInkDark: 'note-ink-dark' };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ramp = (v, a, b) => clamp((v - a) / (b - a), 0, 1);

function hash(s) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
function tagColor(id) { return id === NOTAG ? 'oklch(60% 0.012 60)' : `oklch(62% 0.13 ${hash(id) % 360})`; }
function sizeOf(it) {
  const img = !!(it.image || it.thumb) && it.type !== 'note' && it.type !== 'quote';
  const per = it.type === 'quote' ? 17 : 20;
  const lines = Math.min(5, Math.max(1, Math.ceil((it.type === 'note' ? plainText(it.text) : String(it.text || '')).length / per)));
  const h = it.type === 'note' || it.type === 'quote' ? 24 + lines * 15.5 : img ? IMG_H + 52 : 62;
  return { w: CARD_W, h, img };
}

export function createMap(root, { onOpen, onZoom }) {
  const canvas = document.createElement('canvas');
  root.prepend(canvas);
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, dpr = 1;
  const view = { x: 0, y: 0, k: 0.5 };
  let tags = [], tagById = new Map(), nodes = [], links = [], itemLinks = [];
  const center = { x: 0, y: 0, r: 70 };
  const saved = new Map();
  const imgs = new Map();
  let visible = false, fitted = false, hover = null, drag = null, anim = 0, raf = 0, colors = {};

  const ready = chrome.storage.local.get('mapLayout').then(r => {
    for (const [t, p] of Object.entries(r.mapLayout || {})) saved.set(t, p);
  });

  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    for (const [k, v] of Object.entries(TOKENS)) colors[k] = cs.getPropertyValue('--color-' + v).trim();
    fonts.ui = cs.getPropertyValue('--font-ui').trim() || 'sans-serif';
    fonts.body = cs.getPropertyValue('--font-body').trim() || 'serif';
    fonts.num = cs.getPropertyValue('--font-outlier').trim() || 'monospace';
  }
  const fonts = {};
  readColors();
  document.fonts?.ready.then(() => { nodes.forEach(n => { delete n._title; delete n._dom; delete n._body; }); requestDraw(); });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { readColors(); requestDraw(); });

  // ---------- mise en page ----------
  async function setData(items, match) {
    await ready;
    const groups = new Map();
    nodes = items.map(it => ({ it, match: match(it), tagIds: it.tags.length ? [...it.tags] : [NOTAG], x: 0, y: 0, ...sizeOf(it) }));
    for (const n of nodes) for (const t of n.tagIds) { if (!groups.has(t)) groups.set(t, []); groups.get(t).push(n); }

    const co = new Map();
    for (const n of nodes) {
      const ts = n.tagIds;
      for (let i = 0; i < ts.length; i++) for (let j = i + 1; j < ts.length; j++) {
        const key = [ts[i], ts[j]].sort().join('\u0001');
        co.set(key, (co.get(key) || 0) + 1);
      }
    }
    links = [...co].map(([k, w]) => { const [a, b] = k.split('\u0001'); return { a, b, w }; });
    // liens [[titre]] entre souvenirs
    const nodeById = new Map(nodes.map(n => [n.it.id, n]));
    itemLinks = buildLinkGraph(items).edges.map(([a, b]) => ({ a: nodeById.get(a), b: nodeById.get(b) })).filter(l => l.a && l.b);

    const prev = new Map(tags.map(t => [t.id, t]));
    tags = [...groups].sort((a, b) => b[1].length - a[1].length).map(([id, list]) => {
      const excl = list.filter(n => n.tagIds[0] === id).sort((a, b) => b.it.createdAt - a.it.createdAt);
      const r = 34 + Math.sqrt(list.length) * 7;
      const slots = [];
      let R = r + RING.gap, cap = Math.max(5, Math.floor(2 * Math.PI * R / RING.arc)), slot = 0, ring = 0;
      for (let i = 0; i < excl.length; i++) {
        if (slot >= cap) { ring++; slot = 0; R += RING.step; cap = Math.floor(2 * Math.PI * R / RING.arc); }
        slots.push({ R, a: (slot / cap) * Math.PI * 2 + ring * 0.45 - Math.PI / 2 });
        slot++;
      }
      const p = prev.get(id) || saved.get(id);
      return {
        id, label: id === NOTAG ? 'sans tag' : '#' + id, count: list.length, r, excl, slots,
        cloud: (excl.length ? R : r) + 130, color: tagColor(id),
        x: p ? p.x : NaN, y: p ? p.y : NaN, fixed: saved.has(id), isNew: !p,
        match: list.some(n => n.match), members: list,
      };
    });
    tagById = new Map(tags.map(t => [t.id, t]));

    // position initiale des nouveaux tags : près d'un tag lié, sinon sur une spirale
    let spiral = tags.filter(t => !t.isNew).length;
    for (const t of tags) {
      if (!t.isNew) continue;
      const l = links.find(l => (l.a === t.id || l.b === t.id) && !tagById.get(l.a === t.id ? l.b : l.a).isNew);
      const o = l && tagById.get(l.a === t.id ? l.b : l.a);
      const a = (hash(t.id) % 628) / 100;
      if (o) { t.x = o.x + Math.cos(a) * (o.cloud + t.cloud); t.y = o.y + Math.sin(a) * (o.cloud + t.cloud); }
      else { const i = spiral++; const ang = i * 2.39996; const rad = 380 * Math.sqrt(i + 1); t.x = Math.cos(ang) * rad; t.y = Math.sin(ang) * rad; }
    }
    simulate(tags.some(t => t.isNew) ? 360 : 60);
    tags.forEach(t => { t.isNew = false; });
    placeItems();
    if (visible && !fitted && tags.length) { fit(true); fitted = true; }
    requestDraw();
  }

  function simulate(iters) {
    const all = [...tags, { x: 0, y: 0, cloud: center.r + 60, fixed: true }];
    const move = (t, dx, dy) => { if (!t.fixed) { t.x += dx; t.y += dy; } };
    for (let s = 0; s < iters; s++) {
      const alpha = 1 - s / iters;
      for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
        const a = all[i], b = all[j];
        let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01;
        const min = a.cloud + b.cloud;
        if (d < min) {
          const m = (min - d) / d * 0.5;
          const fa = a.fixed ? 0 : b.fixed ? 2 : 1, fb = b.fixed ? 0 : a.fixed ? 2 : 1;
          move(a, -dx * m * fa * 0.5, -dy * m * fa * 0.5);
          move(b, dx * m * fb * 0.5, dy * m * fb * 0.5);
        }
      }
      for (const l of links) {
        const a = tagById.get(l.a), b = tagById.get(l.b);
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01;
        const target = (a.cloud + b.cloud) * 1.05;
        if (d > target) {
          const f = (d - target) / d * 0.04 * Math.min(1, l.w / 2) * alpha;
          move(a, dx * f, dy * f); move(b, -dx * f, -dy * f);
        }
      }
      for (const t of tags) move(t, -t.x * 0.012 * alpha, -t.y * 0.012 * alpha);
    }
  }

  function placeItems() {
    for (const t of tags) t.excl.forEach((n, i) => {
      const s = t.slots[i];
      n.x = t.x + Math.cos(s.a) * s.R; n.y = t.y + Math.sin(s.a) * s.R;
    });
  }

  // ---------- dessin ----------
  function requestDraw() { if (!raf && visible) raf = requestAnimationFrame(draw); }

  function draw() {
    raf = 0;
    if (!visible) return;
    const k = view.k, lw = 1 / k;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = colors.bg; ctx.fillRect(0, 0, W, H);
    ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * view.x, dpr * view.y);
    const m = 200 / k;
    const vb = { x0: -view.x / k - m, y0: -view.y / k - m, x1: (W - view.x) / k + m, y1: (H - view.y) / k + m };
    const inView = n => n.x > vb.x0 && n.x < vb.x1 && n.y > vb.y0 && n.y < vb.y1;
    const cardA = ramp(k, 0.34, 0.52), dotA = 1 - cardA, linkA = ramp(k, 0.36, 0.55);
    const focus = focusSet();
    const dim = x => (focus && !focus.has(x) ? 0.25 : 1);

    // branches centre → tags
    ctx.lineCap = 'round';
    for (const t of tags) {
      ctx.globalAlpha = 0.5 * dim(t) * (t.match ? 1 : 0.3);
      ctx.strokeStyle = t.color; ctx.lineWidth = 3 * lw;
      const mx = (t.x + center.x) / 2;
      ctx.beginPath(); ctx.moveTo(center.x, center.y);
      ctx.bezierCurveTo(mx, center.y, mx, t.y, t.x, t.y); ctx.stroke();
    }
    // liens entre tags (souvenirs partagés)
    ctx.setLineDash([8 * lw, 7 * lw]);
    for (const l of links) {
      const a = tagById.get(l.a), b = tagById.get(l.b);
      ctx.globalAlpha = (0.32 - cardA * 0.2) * Math.min(dim(a), dim(b));
      ctx.strokeStyle = colors.muted; ctx.lineWidth = (1 + Math.min(3, Math.sqrt(l.w) * 0.8)) * lw;
      ctx.beginPath(); ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo((a.x + b.x) / 2 + (b.y - a.y) * 0.12, (a.y + b.y) / 2 - (b.x - a.x) * 0.12, b.x, b.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // liens tag → souvenir
    if (linkA > 0.01) {
      for (const n of nodes) {
        if (!inView(n)) continue;
        n.tagIds.forEach((id, i) => {
          const t = tagById.get(id);
          const focused = focus && focus.has(n);
          ctx.globalAlpha = linkA * (i === 0 ? 0.45 : focused ? 0.8 : 0.22) * dim(n) * (n.match ? 1 : 0.25);
          ctx.strokeStyle = t.color; ctx.lineWidth = (i === 0 ? 1.4 : focused ? 2.2 : 1.2) * lw;
          ctx.beginPath(); ctx.moveTo(t.x, t.y);
          if (i === 0) ctx.lineTo(n.x, n.y);
          else ctx.quadraticCurveTo((t.x + n.x) / 2 + (n.y - t.y) * 0.15, (t.y + n.y) / 2 - (n.x - t.x) * 0.15, n.x, n.y);
          ctx.stroke();
        });
      }
    }
    // liens [[titre]] entre souvenirs : courbe orange, point près du souvenir cité
    ctx.strokeStyle = colors.accent; ctx.fillStyle = colors.accent;
    for (const { a, b } of itemLinks) {
      const on = focus && focus.has(a) && focus.has(b) ? 1 : 0;
      ctx.globalAlpha = (0.3 + 0.35 * linkA + 0.35 * on) * Math.min(dim(a), dim(b)) * (a.match && b.match ? 1 : 0.25);
      ctx.lineWidth = (1.6 + on * 1.2) * lw;
      const mx = (a.x + b.x) / 2 - (b.y - a.y) * 0.12, my = (a.y + b.y) / 2 + (b.x - a.x) * 0.12;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(mx, my, b.x, b.y); ctx.stroke();
      const t = 0.8, u = 1 - t;
      ctx.beginPath(); ctx.arc(u * u * a.x + 2 * u * t * mx + t * t * b.x, u * u * a.y + 2 * u * t * my + t * t * b.y, Math.max(3.5, 2 * lw), 0, Math.PI * 2); ctx.fill();
    }

    // points (vue éloignée)
    if (dotA > 0.02) {
      for (const n of nodes) {
        const t = tagById.get(n.tagIds[0]);
        ctx.globalAlpha = dotA * 0.6 * dim(n) * (n.match ? 1 : 0.2);
        ctx.fillStyle = t.color;
        ctx.beginPath(); ctx.arc(n.x, n.y, Math.max(7, 2.5 * lw), 0, Math.PI * 2); ctx.fill();
      }
    }
    // cartes (vue rapprochée)
    if (cardA > 0.02) for (const n of nodes) if (inView(n)) drawCard(n, cardA * dim(n), lw);
    for (const t of tags) drawTag(t, dim(t), lw, k);
    drawCenter(lw, k);

    ctx.globalAlpha = 1;
    if (!nodes.length) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = colors.muted; ctx.textAlign = 'center';
      ctx.font = `18px ${fonts.body}`;
      ctx.fillText('Ajoute des #tags à tes souvenirs pour faire pousser la carte.', W / 2, H / 2 + 110);
    }
  }

  function drawTag(t, a, lw, k) {
    const fs = Math.min(14 / k, 15 + t.cloud * 0.22);
    ctx.font = `600 ${fs}px ${fonts.ui}`;
    const tw = ctx.measureText(t.label).width;
    const r = Math.max(t.r, tw / 2 + fs * 0.7);
    t.br = r;
    ctx.globalAlpha = a * (t.match ? 1 : 0.35);
    ctx.fillStyle = colors.surface;
    ctx.beginPath(); ctx.arc(t.x, t.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha *= hover?.t === t ? 0.32 : 0.16;
    ctx.fillStyle = t.color; ctx.fill();
    ctx.globalAlpha = a * (t.match ? 1 : 0.35);
    ctx.strokeStyle = t.color; ctx.lineWidth = (hover?.t === t ? 3.5 : 2.2) * lw; ctx.stroke();
    ctx.fillStyle = colors.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(t.label, t.x, t.y - fs * 0.18);
    ctx.font = `${fs * 0.6}px ${fonts.num}`;
    ctx.fillStyle = colors.muted;
    ctx.fillText(String(t.count), t.x, t.y + fs * 0.72);
  }

  function drawCenter(lw, k) {
    const fs = Math.max(18, 15 / k);
    ctx.globalAlpha = 1;
    ctx.font = `600 ${fs}px ${fonts.ui}`;
    const tw = ctx.measureText('Mon cerveau').width;
    const w = tw + fs * 1.6, h = fs * 2.2;
    ctx.fillStyle = colors.ink;
    ctx.beginPath(); ctx.roundRect(center.x - w / 2, center.y - h / 2, w, h, h / 2); ctx.fill();
    ctx.fillStyle = colors.bg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Mon cerveau', center.x, center.y + 1);
    center.hw = w / 2; center.hh = h / 2;
  }

  function drawCard(n, a, lw) {
    const { it, w, h } = n;
    const x = n.x - w / 2, y = n.y - h / 2;
    ctx.globalAlpha = a * (n.match ? 1 : 0.15);
    const bg = it.color || colors.surface;
    const fg = it.color ? (it.color === DARK ? colors.noteInkDark : colors.noteInk) : colors.ink;
    const mut = it.color ? fg : colors.muted;
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 10); ctx.fill();
    ctx.strokeStyle = hover?.n === n ? colors.accent : colors.line;
    ctx.lineWidth = (hover?.n === n ? 2.5 : 1) * lw; ctx.stroke();
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    const legible = view.k * 11 > 5;

    if (n.img) {
      const im = getImg(it);
      ctx.save();
      ctx.beginPath(); ctx.roundRect(x, y, w, IMG_H, [10, 10, 0, 0]); ctx.clip();
      if (im) {
        const s = Math.max(w / im.naturalWidth, IMG_H / im.naturalHeight);
        const dw = im.naturalWidth * s, dh = im.naturalHeight * s;
        ctx.drawImage(im, x + (w - dw) / 2, y + (IMG_H - dh) / 2, dw, dh);
      } else { ctx.fillStyle = colors.line; ctx.fillRect(x, y, w, IMG_H); }
      ctx.restore();
      if (it.type === 'video') {
        ctx.fillStyle = colors.ink; ctx.beginPath(); ctx.arc(n.x, y + IMG_H / 2, 14, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = colors.bg; ctx.beginPath(); ctx.moveTo(n.x - 4, y + IMG_H / 2 - 7); ctx.lineTo(n.x + 7, y + IMG_H / 2); ctx.lineTo(n.x - 4, y + IMG_H / 2 + 7); ctx.fill();
      }
      if (legible) {
        text(n, 'title', it.title || it.url, `600 11.5px ${fonts.ui}`, fg, x + 9, y + IMG_H + 7, w - 18, 2, 14);
        if (!it.image && it.type === 'image') return;
        ctx.globalAlpha *= 0.8;
        text(n, 'dom', domainOf(it.url), `10px ${fonts.ui}`, mut, x + 9, y + h - 15, w - 18, 1, 12);
      }
    } else if (it.type === 'note' || it.type === 'quote') {
      if (!legible) return;
      const italic = it.type === 'quote' ? 'italic ' : '';
      if (it.type === 'quote') { ctx.fillStyle = colors.accent; ctx.font = `26px ${fonts.body}`; ctx.fillText('“', x + 7, y + 4); }
      text(n, 'body', it.type === 'note' ? plainText(it.text) : it.text, `${italic}14px ${fonts.body}`, fg, x + (it.type === 'quote' ? 22 : 11), y + 11, w - (it.type === 'quote' ? 32 : 22), 5, 15.5);
    } else if (legible) {
      text(n, 'title', it.title || it.url, `600 11.5px ${fonts.ui}`, fg, x + 10, y + 10, w - 20, 2, 14);
      text(n, 'dom', domainOf(it.url), `10px ${fonts.ui}`, mut, x + 10, y + h - 16, w - 20, 1, 12);
    }
  }

  function text(n, key, str, font, color, x, y, maxW, maxLines, lh) {
    ctx.font = font; ctx.fillStyle = color;
    const cacheKey = '_' + key;
    if (!n[cacheKey]) n[cacheKey] = wrap(String(str || ''), maxW, maxLines);
    n[cacheKey].forEach((line, i) => ctx.fillText(line, x, y + i * lh));
  }

  function wrap(str, maxW, maxLines) {
    const words = str.replace(/\s+/g, ' ').trim().split(' ');
    const lines = []; let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width <= maxW) { line = test; continue; }
      if (line) lines.push(line);
      line = w;
      if (lines.length === maxLines) break;
    }
    if (lines.length < maxLines && line) lines.push(line);
    if (lines.length > maxLines) lines.length = maxLines;
    const used = lines.join(' ').length;
    if (used < str.replace(/\s+/g, ' ').trim().length && lines.length) {
      let last = lines[lines.length - 1];
      while (last && ctx.measureText(last + '…').width > maxW) last = last.slice(0, -1);
      lines[lines.length - 1] = last + '…';
    }
    return lines;
  }

  function getImg(it) {
    for (const src of [it.image, it.thumb].filter(Boolean)) {
      let e = imgs.get(src);
      if (!e) {
        e = { img: new Image(), state: 'loading' };
        e.img.referrerPolicy = 'no-referrer';
        e.img.onload = () => { e.state = 'ok'; requestDraw(); };
        e.img.onerror = () => { e.state = 'err'; requestDraw(); };
        e.img.src = src;
        imgs.set(src, e);
      }
      if (e.state === 'ok') return e.img;
      if (e.state === 'loading') return null;
    }
    return null;
  }

  function focusSet() {
    if (!hover) return null;
    const s = new Set();
    if (hover.t) { s.add(hover.t); hover.t.members.forEach(n => s.add(n)); links.forEach(l => { if (l.a === hover.t.id) s.add(tagById.get(l.b)); if (l.b === hover.t.id) s.add(tagById.get(l.a)); }); }
    if (hover.n) {
      s.add(hover.n); hover.n.tagIds.forEach(id => s.add(tagById.get(id)));
      for (const l of itemLinks) { if (l.a === hover.n) s.add(l.b); if (l.b === hover.n) s.add(l.a); }
    }
    return s;
  }

  // ---------- interaction ----------
  const toWorld = (sx, sy) => [(sx - view.x) / view.k, (sy - view.y) / view.k];

  function hit(sx, sy) {
    const [wx, wy] = toWorld(sx, sy);
    for (let i = tags.length - 1; i >= 0; i--) {
      const t = tags[i];
      if (Math.hypot(wx - t.x, wy - t.y) <= (t.br || t.r)) return { t };
    }
    if (ramp(view.k, 0.34, 0.52) > 0.4) {
      for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i];
        if (Math.abs(wx - n.x) <= n.w / 2 && Math.abs(wy - n.y) <= n.h / 2) return { n };
      }
    }
    if (Math.abs(wx - center.x) <= (center.hw || 60) && Math.abs(wy - center.y) <= (center.hh || 20)) return { center: true };
    return null;
  }

  function moveTag(t, dx, dy) {
    t.x += dx; t.y += dy;
    t.excl.forEach(n => { n.x += dx; n.y += dy; });
  }

  function persist() {
    chrome.storage.local.set({ mapLayout: Object.fromEntries([...saved].map(([id, p]) => [id, { x: Math.round(p.x), y: Math.round(p.y) }])) });
  }

  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    cancelAnimationFrame(anim); anim = 0;
    drag = { h: hit(e.offsetX, e.offsetY), sx: e.offsetX, sy: e.offsetY, lx: e.offsetX, ly: e.offsetY, moved: false };
  });
  canvas.addEventListener('pointermove', e => {
    if (!drag) {
      const h = hit(e.offsetX, e.offsetY);
      if ((h?.t || h?.n) !== (hover?.t || hover?.n)) { hover = h && (h.t || h.n) ? h : null; requestDraw(); }
      canvas.className = h ? 'pointer' : '';
      return;
    }
    const dx = e.offsetX - drag.lx, dy = e.offsetY - drag.ly;
    drag.lx = e.offsetX; drag.ly = e.offsetY;
    if (!drag.moved && Math.hypot(e.offsetX - drag.sx, e.offsetY - drag.sy) < 4) return;
    drag.moved = true;
    if (drag.h?.t) moveTag(drag.h.t, dx / view.k, dy / view.k);
    else { view.x += dx; view.y += dy; canvas.className = 'grabbing'; }
    requestDraw();
  });
  canvas.addEventListener('pointerup', () => {
    if (!drag) return;
    const { h, moved } = drag;
    drag = null; canvas.className = '';
    if (moved && h?.t) { h.t.fixed = true; saved.set(h.t.id, { x: h.t.x, y: h.t.y }); persist(); return; }
    if (moved) return;
    if (h?.t) focusTag(h.t.id);
    else if (h?.n) onOpen(h.n.it.id);
    else if (h?.center) fit();
  });
  canvas.addEventListener('pointerleave', () => { if (!drag && hover) { hover = null; requestDraw(); } });
  canvas.addEventListener('dblclick', e => { if (!hit(e.offsetX, e.offsetY)) zoomAt(e.offsetX, e.offsetY, 1.8, true); });
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    cancelAnimationFrame(anim); anim = 0;
    zoomAt(e.offsetX, e.offsetY, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
  }, { passive: false });

  document.addEventListener('keydown', e => {
    if (!visible || e.target.matches?.('input, textarea') || !root.offsetParent) return;
    if (document.querySelector('#modal:not([hidden])')) return;
    if (e.key === '+' || e.key === '=') zoomAt(W / 2, H / 2, 1.3, true);
    else if (e.key === '-') zoomAt(W / 2, H / 2, 1 / 1.3, true);
    else if (e.key === '0') fit();
  });

  function zoomAt(sx, sy, f, animated) {
    const k2 = clamp(view.k * f, 0.05, 2.5);
    const [wx, wy] = toWorld(sx, sy);
    const target = { k: k2, x: sx - wx * k2, y: sy - wy * k2 };
    if (animated) return animateTo(target);
    Object.assign(view, target); changed();
  }

  function changed() { requestDraw(); onZoom?.(view.k); }

  function animateTo(target, instant) {
    cancelAnimationFrame(anim);
    if (instant) { Object.assign(view, target); return changed(); }
    const from = { ...view }, t0 = performance.now(), dur = 420;
    // interpolation en espace monde pour un zoom fluide
    const step = now => {
      const p = clamp((now - t0) / dur, 0, 1), e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      const k = from.k * Math.pow(target.k / from.k, e);
      const cxF = (W / 2 - from.x) / from.k, cyF = (H / 2 - from.y) / from.k;
      const cxT = (W / 2 - target.x) / target.k, cyT = (H / 2 - target.y) / target.k;
      const cx = cxF + (cxT - cxF) * e, cy = cyF + (cyT - cyF) * e;
      Object.assign(view, { k, x: W / 2 - cx * k, y: H / 2 - cy * k });
      changed();
      if (p < 1) anim = requestAnimationFrame(step); else anim = 0;
    };
    anim = requestAnimationFrame(step);
  }

  function lookAt(cx, cy, k, instant) { animateTo({ k, x: W / 2 - cx * k, y: H / 2 - cy * k }, instant); }

  function fit(instant) {
    if (!tags.length) return lookAt(0, 0, 0.8, instant);
    let x0 = -200, y0 = -100, x1 = 200, y1 = 100;
    for (const t of tags) { x0 = Math.min(x0, t.x - t.cloud); x1 = Math.max(x1, t.x + t.cloud); y0 = Math.min(y0, t.y - t.cloud); y1 = Math.max(y1, t.y + t.cloud); }
    const k = clamp(Math.min(W / (x1 - x0), H / (y1 - y0)) * 0.95, 0.05, 0.9);
    lookAt((x0 + x1) / 2, (y0 + y1) / 2, k, instant);
  }

  function focusTag(id) {
    const t = tagById.get(id);
    if (!t) return;
    lookAt(t.x, t.y, clamp(Math.min(W, H) / (2 * (t.cloud - 40)), 0.58, 1.15));
  }

  function resetLayout() {
    saved.clear(); persist();
    tags.forEach(t => { t.fixed = false; t.isNew = true; t.x = NaN; });
    let i = 0;
    for (const t of tags) { const ang = i * 2.39996, rad = 380 * Math.sqrt(++i); t.x = Math.cos(ang) * rad; t.y = Math.sin(ang) * rad; }
    simulate(400); placeItems(); fit();
  }

  function resize() {
    dpr = window.devicePixelRatio || 1;
    W = root.clientWidth; H = root.clientHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    requestDraw();
  }
  new ResizeObserver(resize).observe(root);

  return {
    setData,
    show() { visible = true; resize(); if (!fitted && tags.length) { fit(true); fitted = true; } requestDraw(); onZoom?.(view.k); },
    hide() { visible = false; },
    focusTag, fit, resetLayout,
    zoom: f => zoomAt(W / 2, H / 2, f, true),
  };
}
