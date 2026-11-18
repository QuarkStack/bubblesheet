/* Bubblesheet: timed SBA / CDP practice papers from JSON question banks,
   with per-person answer logs saved to a private GitHub repository.
   No build step and no libraries. Question authors never need to touch this file:
   see docs/QUESTION-SCHEMA.md. */
(function () {
'use strict';

/* =========================================================== CONSTANTS */
var APP_VERSION = '1.6.0';
var API = 'https://api.github.com';
var API_VERSION = '2022-11-28';
// Paper style changes the names of the two formats only. Questions, scoring and timing are identical.
var STYLES = {
  racgp: { label: 'RACGP', sba: 'AKT', cdp: 'KFP' },
  other: { label: 'Others', sba: 'SBA', cdp: 'CDP' }
};
function fmtName(fmt, style) { return (STYLES[style] || STYLES.other)[fmt]; }
var PACES = {
  working: { label: 'Working pace', sba: 84, cdp: 180, note: 'Leaves about 30 minutes of a 4-hour paper for review' },
  exam: { label: 'Full allowance', sba: 96, cdp: 205, note: 'The full time per question in a 4-hour paper' },
  relaxed: { label: 'Relaxed', sba: 120, cdp: 270, note: 'For learning rather than exam practice' }
};
var DEFAULT_PENALTY = 0.245; // share of one CDP item lost per option chosen beyond the number asked
var SLOW_FACTOR = 1.5;
var LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
var CODE_CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; // share codes: no 0, 1, I, L or O, so they are easy to read out and type
var STATUS_FILTERS = [
  ['unseen', 'Unseen'], ['incorrect', 'Incorrect'], ['partial', 'Partly correct'], ['correct', 'Correct'],
  ['flagged', 'Flagged'], ['critical', 'Missed a critical answer'], ['over', 'Over-selected'],
  ['slow', 'Answered slowly'], ['wrong2', 'Wrong 2+ times'], ['stale', 'Not seen recently']
];
var DEFAULT_BUILDER = {
  style: 'racgp', by: 'time', minutes: 30, share: 50, nSba: 10, nCdp: 5, pace: 'working', mode: 'exam',
  status: [], topics: [], exams: [], banks: [], staleDays: 30, priority: 'unseen', useIds: false, ids: ''
};

/* =========================================================== HELPERS */
var app = document.getElementById('app');
function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function uid(prefix) { return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function iso() { return new Date().toISOString(); }
function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
function pct(x) { return Math.round(x * 100); }
function fmtClock(secs) {
  var a = Math.abs(Math.round(secs)); var h = Math.floor(a / 3600); var m = Math.floor((a % 3600) / 60); var s = a % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
}
function fmtMins(secs) { var m = Math.round(secs / 60); return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + (m % 60) + ' min'; }
function fmtDate(isoStr) {
  var d = new Date(isoStr); if (isNaN(d)) return '';
  var dd = String(d.getDate()).padStart(2, '0'), mm = String(d.getMonth() + 1).padStart(2, '0');
  return dd + '/' + mm + '/' + d.getFullYear();
}
function fmtDateTime(isoStr) {
  var d = new Date(isoStr); if (isNaN(d)) return '';
  return fmtDate(isoStr) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
function daysSince(isoStr) { return (Date.now() - Date.parse(isoStr)) / 86400000; }
function hash(str) { var h = 5381; for (var i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0; return h.toString(36); }
function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
function debounce(fn, ms) { var t; return function () { var args = arguments, self = this; clearTimeout(t); t = setTimeout(function () { fn.apply(self, args); }, ms); }; }
var LS = {
  get: function (k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
};
function b64encode(str) {
  var bytes = new TextEncoder().encode(str); var bin = '';
  for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function b64decode(b64) {
  var bin = atob(String(b64).replace(/\s/g, ''));
  var bytes = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
function b64url(str) { return b64encode(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function unb64url(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return b64decode(s); }
var toastTimer;
function toast(msg) {
  var t = document.getElementById('toast'); if (!t) return;
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2600);
}
function copyText(text, el) {
  function fallback() {
    if (el) { var r = document.createRange(); r.selectNodeContents(el); var s = getSelection(); s.removeAllRanges(); s.addRange(r); }
    toast('Selected. Use your device’s Copy.');
  }
  try {
    navigator.clipboard.writeText(text).then(function () { toast('Copied'); }, fallback);
  } catch (e) { fallback(); }
}

var I = {
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7z"/></svg>',
  auto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor"/></svg>',
  flag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V4M5 4h11l-2 4 2 4H5"/></svg>',
  grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="6" r="2.2"/><circle cx="12" cy="6" r="2.2"/><circle cx="18" cy="6" r="2.2"/><circle cx="6" cy="12" r="2.2"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/><circle cx="18" cy="12" r="2.2"/><circle cx="6" cy="18" r="2.2"/><circle cx="12" cy="18" r="2.2"/><circle cx="18" cy="18" r="2.2"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1.2"/><rect x="14" y="5" width="4" height="14" rx="1.2"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  devices: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="4.5" width="13" height="9.5" rx="1.5"/><path d="M1.5 17.5h11"/><rect x="15.5" y="8.5" width="6.5" height="12" rx="1.6"/><path d="M18 18h1.5"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3.5M7.5 7.6L12 3.2l4.5 4.4M7.5 11.5h-2A1.5 1.5 0 0 0 4 13v6.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V13a1.5 1.5 0 0 0-1.5-1.5h-2"/></svg>'
};

/* =========================================================== STATE */
var S = {
  qs: new Map(), qList: [], banks: [], topics: [], exams: [], bankErrors: [], bankLoaded: false,
  profiles: null, firstRun: false, log: null, meta: null, stats: new Map(), rev: 0,
  view: { name: 'home' }, ui: { sheet: null, ulPending: null, armed: null, setupMsg: null, setupLink: null, hold: null, setupErr: null, connected: null,
    confirm: null, share: null, tip: false, code: { val: '', msg: null, busy: false } },
  sync: { state: 'local', msg: '' }, builder: null
};

/* =========================================================== THEME */
function themeChoice() { return LS.get('bs.theme', 'system'); }
function applyTheme() {
  var c = themeChoice(); var root = document.documentElement;
  if (c === 'day') root.setAttribute('data-theme', 'light');
  else if (c === 'night') root.setAttribute('data-theme', 'dark');
  else root.removeAttribute('data-theme');
  var meta = document.getElementById('themeColor');
  if (meta) {
    var dark = c === 'night' || (c === 'system' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    meta.setAttribute('content', dark ? '#0d131a' : '#eaf2f8');
  }
}
function cycleTheme() {
  var order = ['system', 'day', 'night']; var c = themeChoice();
  var n = order[(order.indexOf(c) + 1) % 3]; LS.set('bs.theme', n); applyTheme();
  toast(n === 'system' ? 'Theme follows your device' : n === 'day' ? 'Day theme' : 'Night theme');
  rerender();
}
function themeButton() {
  var c = themeChoice();
  var icon = c === 'day' ? I.sun : c === 'night' ? I.moon : I.auto;
  var label = c === 'day' ? 'Theme: day. Tap for night.' : c === 'night' ? 'Theme: night. Tap to follow device.' : 'Theme: follows device. Tap for day.';
  return '<button class="icon-btn" data-act="theme" aria-label="' + label + '" title="' + label + '">' + icon + '</button>';
}

/* =========================================================== PROFILES */
function loadProfiles() {
  var p = LS.get('bs.profiles', null);
  S.firstRun = !p;
  S.profiles = p && p.list ? p : { active: 'local', list: {} };
  if (S.profiles.active !== 'local' && !S.profiles.list[S.profiles.active]) S.profiles.active = 'local';
}
function saveProfiles() { LS.set('bs.profiles', S.profiles); S.firstRun = false; }
function activeProfile() {
  var a = S.profiles.active;
  if (a !== 'local' && S.profiles.list[a]) return S.profiles.list[a];
  return { pid: 'local', name: 'This device', local: true };
}
function isRemote() { return !activeProfile().local; }
function makeProfile(owner, repo, user, name, token) {
  owner = String(owner || '').trim(); repo = String(repo || '').trim(); user = String(user || '').trim().toLowerCase();
  name = String(name || '').trim() || user; token = String(token || '').trim();
  if (!/^[A-Za-z0-9-]{1,39}$/.test(owner)) throw new Error('The GitHub owner name doesn’t look right.');
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(repo)) throw new Error('The repository name doesn’t look right.');
  if (!/^[a-z0-9][a-z0-9-]{0,30}$/.test(user)) throw new Error('Profile ID: use lowercase letters, numbers and hyphens only.');
  if (token.length < 20) throw new Error('The access token looks incomplete.');
  return { pid: owner + '/' + repo + '/' + user, owner: owner, repo: repo, user: user, name: name.slice(0, 40), token: token };
}
function setupCode(p) { return b64url(JSON.stringify({ v: 1, o: p.owner, r: p.repo, u: p.user, n: p.name, t: p.token })); }
function setupLink(p) { return location.origin + location.pathname + '#setup=' + setupCode(p); }
function parseSetup(str) {
  str = String(str || '').trim();
  var m = str.match(/setup=([A-Za-z0-9_-]+)/); var code = m ? m[1] : str;
  var d;
  try { d = JSON.parse(unb64url(code)); } catch (e) { throw new Error('That setup link isn’t complete. Copy the whole link and try again.'); }
  if (!d || d.v !== 1) throw new Error('That setup link isn’t one this app understands.');
  return makeProfile(d.o, d.r, d.u, d.n, d.t);
}
function addProfile(p) {
  S.profiles.list[p.pid] = p; S.profiles.active = p.pid; saveProfiles(); loadLog();
  if (!p.local) setTimeout(function () { syncRefs(true); }, 0);
}
function deviceKind() {
  var ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  return /Android/.test(ua) ? 'android' : 'computer';
}
function canReadClipboard() { return !!(navigator.clipboard && navigator.clipboard.readText && window.isSecureContext); }
function isStandalone() { return !!((window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone); }
function textChoice() { return LS.get('bs.text', 'default'); }
function applyText() { var t = textChoice(); if (t === 'default') document.documentElement.removeAttribute('data-text'); else document.documentElement.setAttribute('data-text', t); }
/* ---------- full screen (phones and tablets in the browser) ----------
   Browsers only allow full screen from a tap, so it's requested when a tap moves from the
   dashboard or Settings into any other screen, and released on the way back. iPhone Safari
   has no full-screen mode for pages; there the Home Screen icon hides Safari's bars instead. */
var FS_FREE = ['home', 'prefs', 'welcome', 'connected', 'install', 'device'];
function fsWanted(name) { return FS_FREE.indexOf(name) === -1; }
function fsSupported() {
  var d = document.documentElement;
  return !!((document.fullscreenEnabled || document.webkitFullscreenEnabled) && (d.requestFullscreen || d.webkitRequestFullscreen));
}
function isTouchDevice() { return navigator.maxTouchPoints > 0 && !!(window.matchMedia && matchMedia('(pointer: coarse)').matches); }
function fsAvailable() { return fsSupported() && isTouchDevice() && !isStandalone(); }
function fsActive() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
function fsEnter() {
  var d = document.documentElement; var r;
  try { r = d.requestFullscreen ? d.requestFullscreen({ navigationUI: 'hide' }) : d.webkitRequestFullscreen(); } catch (e) { return; }
  S.ui.fsByApp = true;
  if (r && r.catch) r.catch(function () { S.ui.fsByApp = false; });
}
function fsExit() {
  S.ui.fsByApp = false;
  try { var r = document.exitFullscreen ? document.exitFullscreen() : document.webkitExitFullscreen(); if (r && r.catch) r.catch(function () {}); } catch (e) {}
}
function fsAfterTap(from) {
  var to = S.ui.navTo; S.ui.navTo = null;
  if (!to || !LS.get('bs.fullscreen', true) || !fsAvailable()) return;
  if (fsWanted(to) && !fsWanted(from) && !fsActive()) fsEnter();
}
function fsOnRender() { if (S.ui.fsByApp && fsActive() && !fsWanted(S.view.name)) fsExit(); }
function cleanUrl() { history.replaceState(null, '', location.pathname + location.search); }
function markLinkSeen(p) {
  var seen = LS.get('bs.seenLinks', []); if (!Array.isArray(seen)) seen = [];
  var tag = hash(setupCode(p)); if (seen.indexOf(tag) === -1) { seen.push(tag); LS.set('bs.seenLinks', seen.slice(-30)); }
}
// A setup link opened in the address bar is used once and then removed, so the secret
// isn't kept in the page address, bookmarks, Home Screen icons or back history.
// A link already used on this device (for example, an older Home Screen icon that still
// carries one) only switches profile; it never overwrites a token renewed since.
function consumeSetupHash() {
  var h = location.hash.slice(1);
  try { h = decodeURIComponent(h); } catch (e) {}
  if (h.indexOf('setup=') !== 0) return false;
  cleanUrl(); S.ui.setupErr = null; S.ui.connected = null;
  var p;
  try { p = parseSetup(h); } catch (e) { S.ui.setupErr = e.message; S.ui.hold = 'connected'; return true; }
  var known = S.profiles.list[p.pid];
  var seen = LS.get('bs.seenLinks', []);
  if (known && (known.token === p.token || (Array.isArray(seen) && seen.indexOf(hash(setupCode(p))) !== -1))) {
    markLinkSeen(p);
    if (S.profiles.active !== p.pid) { S.profiles.active = p.pid; saveProfiles(); loadLog(); setTimeout(function () { toast('Using ' + known.name); }, 300); }
    S.ui.hold = null; return true;
  }
  addProfile(p); markLinkSeen(p); syncNow();
  S.ui.connected = { updated: !!known }; S.ui.hold = 'connected';
  return true;
}

/* =========================================================== LOG (answers) */
function emptyLog(user) {
  return { schema: 1, user: user, createdAt: iso(), updatedAt: iso(), attempts: [], notes: {}, flags: {}, papers: [], current: null, currentAt: 0 };
}
function normLog(d, user) {
  d = d && typeof d === 'object' ? d : {};
  var num = function (o, keys) { keys.forEach(function (k) { if (o[k] != null && typeof o[k] !== 'number') o[k] = +o[k] || 0; }); };
  var str = function (o, keys) { keys.forEach(function (k) { if (o[k] != null && typeof o[k] !== 'string') o[k] = String(o[k]); }); };
  // Logs live in a repository that other profiles can write to, so nothing in one is trusted to be
  // the type it should be: numbers are forced to numbers and ids to text before anything is shown.
  if (Array.isArray(d.papers)) d.papers.forEach(function (p) { if (p) { str(p, ['id', 'label', 'mode', 'pace', 'style', 'share']); num(p, ['n', 'pct', 'elapsed', 'limit', 'sba', 'cdp']); if (p.qids && !Array.isArray(p.qids)) delete p.qids; } });
  if (Array.isArray(d.attempts)) d.attempts.forEach(function (a) { if (a) { str(a, ['id', 'paper', 'q', 'bank', 'fmt', 'mode']); num(a, ['secs', 'frac', 'earned', 'max', 'extra']); if (!Array.isArray(a.sel)) a.sel = []; } });
  if (d.current && Array.isArray(d.current.items)) { str(d.current, ['id', 'label', 'mode', 'pace', 'style', 'share']); num(d.current, ['idx', 'elapsed', 'limit']); }
  return {
    schema: 1,
    user: d.user || user || '',
    createdAt: d.createdAt || iso(),
    updatedAt: d.updatedAt || d.createdAt || iso(),
    attempts: Array.isArray(d.attempts) ? d.attempts.filter(function (a) { return a && a.id && a.q; }) : [],
    notes: d.notes && typeof d.notes === 'object' ? d.notes : {},
    flags: d.flags && typeof d.flags === 'object' ? d.flags : {},
    papers: Array.isArray(d.papers) ? d.papers.filter(function (p) { return p && p.id; }) : [],
    current: d.current && Array.isArray(d.current.items) ? d.current : null,
    currentAt: +d.currentAt || 0
  };
}
function logKey(pid) { return 'bs.log.' + pid; }
function metaKey(pid) { return 'bs.meta.' + pid; }
function loadLog() {
  var p = activeProfile();
  S.log = normLog(LS.get(logKey(p.pid), null) || emptyLog(p.user || 'local'), p.user);
  S.meta = LS.get(metaKey(p.pid), null) || { sha: null, dirty: false, lastSync: 0, err: null };
  S.builder = Object.assign({}, DEFAULT_BUILDER, LS.get('bs.builder.' + p.pid, {}));
  S.sync = { state: p.local ? 'local' : (S.meta.err ? 'err' : S.meta.dirty ? 'pending' : 'ok'), msg: S.meta.err ? S.meta.err.msg : '' };
  loadRefs();
  computeStats();
}
function saveLocal() {
  var p = activeProfile();
  if (!LS.set(logKey(p.pid), S.log)) toast('This device’s storage is full. Answers may not be kept here.');
}
function saveMeta() { LS.set(metaKey(activeProfile().pid), S.meta); }
function saveBuilder() { LS.set('bs.builder.' + activeProfile().pid, S.builder); }
// Every change to the log goes through touch(): it saves locally and queues a sync.
function touch(kind, delay) {
  S.rev++;
  S.log.updatedAt = iso();
  if (kind === 'paper') S.log.currentAt = Date.now();
  saveLocal();
  if (kind !== 'stats-only') computeStats();
  if (isRemote()) { S.meta.dirty = true; saveMeta(); setSync('pending'); scheduleSync(delay == null ? 3000 : delay); }
}
function mergeStamped(b, a) {
  var out = {}; var k;
  for (k in b) if (b[k]) out[k] = b[k];
  for (k in a) if (a[k] && (!out[k] || (+a[k].at || 0) >= (+out[k].at || 0))) out[k] = a[k];
  return out;
}
function mergeLogs(a, b) { // a = this device, b = GitHub copy. Nothing is ever dropped.
  a = normLog(a); b = normLog(b);
  var att = new Map();
  b.attempts.forEach(function (x) { att.set(x.id, x); });
  a.attempts.forEach(function (x) { var y = att.get(x.id); if (!y || (+x.ulAt || 0) >= (+y.ulAt || 0)) att.set(x.id, x); });
  var attempts = Array.from(att.values()).sort(function (p, q) { return p.at < q.at ? -1 : p.at > q.at ? 1 : 0; });
  var pap = new Map();
  b.papers.forEach(function (x) { pap.set(x.id, x); });
  a.papers.forEach(function (x) { var y = pap.get(x.id); pap.set(x.id, y && y.share && !x.share ? Object.assign({}, x, { share: y.share }) : x); });
  var papers = Array.from(pap.values()).sort(function (p, q) { return p.finishedAt < q.finishedAt ? -1 : p.finishedAt > q.finishedAt ? 1 : 0; });
  var useA = a.currentAt >= b.currentAt;
  var current = useA ? a.current : b.current;
  var currentAt = Math.max(a.currentAt, b.currentAt);
  if (current && pap.has(current.id)) current = null;
  return {
    schema: 1, user: a.user || b.user,
    createdAt: a.createdAt < b.createdAt ? a.createdAt : b.createdAt,
    updatedAt: a.updatedAt > b.updatedAt ? a.updatedAt : b.updatedAt,
    attempts: attempts, notes: mergeStamped(b.notes, a.notes), flags: mergeStamped(b.flags, a.flags),
    papers: papers, current: current, currentAt: currentAt
  };
}

/* =========================================================== GITHUB SYNC */
function SyncError(kind, msg) { var e = new Error(msg); e.kind = kind; return e; }
function gh(p, method, path, body, accept) {
  var headers = { Accept: accept || 'application/vnd.github+json', Authorization: 'Bearer ' + p.token, 'X-GitHub-Api-Version': API_VERSION };
  if (body) headers['Content-Type'] = 'application/json';
  return fetch(API + '/repos/' + encodeURIComponent(p.owner) + '/' + encodeURIComponent(p.repo) + path, {
    method: method, headers: headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store'
  }).catch(function () { throw SyncError('offline', 'No connection to GitHub. Answers are kept on this device until it reconnects.'); });
}
function classify(res) {
  return res.text().then(function (t) {
    var msg = ''; try { msg = JSON.parse(t).message || ''; } catch (e) {}
    if (res.status === 401) return SyncError('auth', 'GitHub rejected the access token. It may have expired or been deleted.');
    if (res.status === 403 && /rate limit/i.test(msg)) return SyncError('rate', 'GitHub is limiting requests for a few minutes. It will retry.');
    if (res.status === 403) return SyncError('auth', 'The access token isn’t allowed to change this repository. It needs Contents: Read and write.');
    if (res.status === 404) return SyncError('repo', 'Repository not found, or the access token can’t see it.');
    if (res.status === 409 || res.status === 422) return SyncError('conflict', 'Another device saved at the same time.');
    return SyncError('http', 'GitHub error ' + res.status + (msg ? ': ' + msg : ''));
  });
}
function logPath(p) { return '/contents/logs/' + encodeURIComponent(p.user) + '.json'; }
async function remoteGet(p) {
  var res = await gh(p, 'GET', logPath(p));
  if (res.status === 404) {
    var r2 = await gh(p, 'GET', '');
    if (r2.ok) return { sha: null, data: null };
    throw await classify(r2);
  }
  if (!res.ok) throw await classify(res);
  var j = await res.json(); var text;
  if (j.encoding === 'base64' && j.content) text = b64decode(j.content);
  else if (j.size === 0) text = '';
  else {
    var r3 = await gh(p, 'GET', logPath(p), null, 'application/vnd.github.raw+json');
    if (!r3.ok) throw await classify(r3);
    text = await r3.text();
  }
  if (!text.trim()) return { sha: j.sha, data: null };
  var data;
  try { data = JSON.parse(text); } catch (e) { throw SyncError('corrupt', 'The answer file on GitHub is damaged, so it wasn’t overwritten. Ask the person who set this up to check it.'); }
  return { sha: j.sha, data: data };
}
async function remotePut(p, text, sha) {
  var body = { message: 'Update answers (' + p.user + ')', content: b64encode(text) };
  if (sha) body.sha = sha;
  var res = await gh(p, 'PUT', logPath(p), body);
  if (!res.ok) throw await classify(res);
  var j = await res.json();
  return j && j.content ? j.content.sha : null;
}
/* =========================================================== SHARED PAPERS
   A share code names a small file, papers/<CODE>.json, in the same private repository as the
   answer logs. The file lists a paper's questions in order, with its mode, pace and style. It
   holds no answers. Anyone whose profile saves to that repository can start a fresh copy. */
function newCode() {
  var a = new Uint32Array(6); crypto.getRandomValues(a); var c = '';
  for (var i = 0; i < 6; i++) c += CODE_CHARS[a[i] % CODE_CHARS.length];
  return c;
}
function normCode(str) { return String(str || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function fmtCode(c) { return c.slice(0, 3) + '-' + c.slice(3); }
function validCode(c) { return c.length === 6 && c.split('').every(function (ch) { return CODE_CHARS.indexOf(ch) !== -1; }); }
function paperPath(code) { return '/contents/papers/' + code + '.json'; }
function shareErrText(e) {
  if (e.kind === 'offline') return 'No internet connection. Share codes need one. Try again when you’re back online.';
  return e.message || 'Something went wrong. Try again.';
}
async function publishPaper(src) { // src: { label, style, mode, pace, qids }
  var p = activeProfile();
  var body = { schema: 1, code: '', createdAt: iso(), by: p.user, label: src.label || '', style: src.style, mode: src.mode, pace: src.pace, qids: src.qids };
  for (var tries = 0; tries < 4; tries++) {
    if (tries) await new Promise(function (ok) { setTimeout(ok, 400 * tries); });
    body.code = newCode();
    var res = await gh(p, 'PUT', paperPath(body.code), { message: 'Share paper ' + body.code, content: b64encode(JSON.stringify(body, null, 1)) });
    if (res.ok) return body.code;
    if (res.status === 409 || res.status === 422) continue; // code already taken, or another save landed at the same moment
    throw await classify(res);
  }
  throw SyncError('http', 'Couldn’t create a share code just now. Try again.');
}
async function fetchPaper(code) {
  var p = activeProfile();
  var res = await gh(p, 'GET', paperPath(code));
  if (res.status === 404) {
    var r2 = await gh(p, 'GET', '');
    if (r2.ok) throw SyncError('nocode', 'No paper has the code ' + fmtCode(code) + '. Check it and try again.');
    throw await classify(r2);
  }
  if (!res.ok) throw await classify(res);
  var d;
  try { d = JSON.parse(b64decode((await res.json()).content || '')); } catch (e) { d = null; }
  if (!d || !Array.isArray(d.qids) || !d.qids.length) throw SyncError('corrupt', 'That paper’s file is damaged. Ask for a new code.');
  return d;
}
// The paper being shared: the one in progress, or a finished one on its results page.
function shareTarget() {
  if (S.view.name === 'paper') return S.log.current;
  if (S.view.name === 'results') return S.log.papers.find(function (x) { return x.id === S.view.pid; }) || null;
  return null;
}
async function openShare() {
  var t = shareTarget(); if (!t) return;
  var qids = t.items ? t.items.map(function (it) { return it.q; }) : (t.qids || []).slice();
  if (t.share) { S.ui.share = { state: 'ok', code: t.share }; rerender(); return; }
  if (!isRemote()) { S.ui.share = { state: 'local' }; rerender(); return; }
  if (!qids.length) { S.ui.share = { state: 'err', msg: 'This paper has no questions to share.' }; rerender(); return; }
  var mine = S.ui.share = { state: 'busy' }; rerender();
  var id = t.id; var code, err;
  try { code = await publishPaper({ label: t.label, style: t.style || 'other', mode: t.mode, pace: t.pace, qids: qids }); } catch (e) { err = e; }
  if (code) { // a sync may have swapped the log object while we waited, so find the paper again
    var again = S.log.current && S.log.current.id === id ? S.log.current : S.log.papers.find(function (x) { return x.id === id; });
    if (again) { again.share = code; touch(again.items ? 'paper' : 'share', 3000); }
  }
  if (S.ui.share !== mine) return; // closed, or moved on, while waiting
  S.ui.share = code ? { state: 'ok', code: code } : { state: 'err', msg: shareErrText(err) };
  rerender();
}
function shareBody() {
  var sh = S.ui.share; if (!sh) return '';
  if (sh.state === 'busy') return '<p class="share-wait"><span class="dot busy" aria-hidden="true"></span>Creating a share code…</p>';
  if (sh.state === 'local') return '<p class="callout">Share codes work once this device is connected to a profile. Right now it’s practising on its own, so there’s nowhere to keep the paper for someone else. You can connect a profile in Settings.</p>';
  if (sh.state === 'err') return '<p class="callout bad" role="alert">' + esc(sh.msg) + '</p><button class="btn" data-act="share-open">Try again</button>';
  return '<div class="share-code" id="shareCode" aria-label="Share code">' + fmtCode(sh.code) + '</div>' +
    '<div class="row" style="justify-content:center"><button class="btn" data-act="share-copy">Copy code</button>' + (navigator.share ? '<button class="btn" data-act="share-send">Send…</button>' : '') + '</div>' +
    '<p>This code starts a <b>fresh copy</b> of this paper: the same questions, in the same order. You, or anyone you study with on this Bubblesheet, can use it under <b>Build a paper</b>, then <b>Use an existing paper</b>.</p>' +
    '<p class="small muted">It doesn’t include your answers, and it can’t be used to resume or continue this session.</p>';
}
async function useCode() {
  var cu = S.ui.code; var c = normCode(cu.val);
  cu.busy = true; cu.msg = null; rerender();
  try {
    var d = await fetchPaper(c);
    var qs = d.qids.map(function (id) { return S.qs.get(id); }).filter(Boolean);
    var missing = d.qids.length - qs.length;
    if (!qs.length) throw SyncError('gone', 'None of that paper’s questions are in the question bank any more.');
    cu.busy = false;
    if (S.view.name !== 'build') return;
    cu.val = '';
    createPaper(qs, d.mode === 'tutor' ? 'tutor' : 'exam', PACES[d.pace] ? d.pace : 'working', d.label || 'Shared paper', d.style, missing ? null : c);
    if (missing) toast(missing + (missing === 1 ? ' question has' : ' questions have') + ' left the bank since, so ' + (missing === 1 ? 'it was' : 'they were') + ' left out');
  } catch (e) {
    cu.busy = false; cu.msg = shareErrText(e);
    if (S.view.name === 'build') rerender();
  }
}
/* ---------- "discard the paper in progress?" pop-up ----------
   Only one paper can be in progress. Anything that would start another asks first, in a small
   pop-up beside the button that was tapped. A tap anywhere else closes it. */
function guardNewPaper(id, run) {
  if (!S.log.current) { run(); return; }
  S.ui.confirm = { id: id, run: run }; rerender();
  var pop = app.querySelector('.popover'); if (pop && pop.scrollIntoView) pop.scrollIntoView({ block: 'nearest' });
}
function discardPop(id, caret, below) {
  var c = S.ui.confirm; if (!c || c.id !== id) return '';
  return '<div class="popover' + (below ? ' below' : '') + '" role="alertdialog" aria-label="Discard the paper in progress?" style="--caret:' + caret + '">' +
    '<p><b>A paper is in progress.</b> Starting a new one discards it, and its answers so far won’t be saved.</p>' +
    '<div class="row"><button class="btn btn-sm" data-act="confirm-no">Keep it</button><button class="btn btn-sm btn-danger" data-act="confirm-yes">Discard and start</button></div></div>';
}

/* =========================================================== PRIVATE REFERENCES
   Citations that mustn't be public (course slides, recall papers, page numbers, short quotes)
   live in refs/<bank-id>.json in the private answers repository, not in the public banks.
   Signed-in profiles fetch them and see them after answering; the public site never has them.
   File: { schema: 1, bank, sources: [...], refs: { "<question id>": { source, quote? } } } */
var REFS_EVERY = 10 * 60 * 1000;
function refsKey(pid) { return 'bs.refs.' + pid; }
function loadRefs() {
  var p = activeProfile(); S.refs = {}; S.refsInfo = { files: 0, n: 0, at: 0 };
  if (p.local) return;
  var c = LS.get(refsKey(p.pid), null); if (!c || !c.files) return;
  Object.keys(c.files).forEach(function (name) {
    var r = c.files[name] && c.files[name].refs; if (!r || typeof r !== 'object') return;
    Object.keys(r).forEach(function (qid) {
      var x = r[qid]; if (!x || typeof x !== 'object' || typeof x.source !== 'string' || !x.source) return;
      S.refs[qid] = { source: x.source.slice(0, 400), quote: typeof x.quote === 'string' ? x.quote.slice(0, 600) : '' };
    });
    S.refsInfo.files++;
  });
  S.refsInfo.n = Object.keys(S.refs).length; S.refsInfo.at = c.at || 0;
}
var REFS_BUSY = false;
async function syncRefs(force) {
  var p = activeProfile(); if (p.local || REFS_BUSY) return;
  var key = refsKey(p.pid); var c = LS.get(key, null) || { files: {}, at: 0 };
  if (!force && Date.now() - (c.at || 0) < REFS_EVERY) return;
  REFS_BUSY = true;
  try {
    var res = await gh(p, 'GET', '/contents/refs');
    var listing = res.status === 404 ? [] : res.ok ? await res.json() : null;
    if (!Array.isArray(listing)) return; // a token or network problem: keep what we have; the sync dot reports those
    var files = {}, changed = false;
    for (var i = 0; i < listing.length; i++) {
      var f = listing[i]; if (!f || f.type !== 'file' || !/\.json$/i.test(f.name || '')) continue;
      var old = c.files[f.name];
      if (old && old.sha === f.sha) { files[f.name] = old; continue; }
      var r = await gh(p, 'GET', '/contents/refs/' + encodeURIComponent(f.name)); if (!r.ok) continue;
      var d; try { d = JSON.parse(b64decode((await r.json()).content || '')); } catch (e) { d = null; }
      if (d && d.refs && typeof d.refs === 'object') { files[f.name] = { sha: f.sha, refs: d.refs }; changed = true; }
    }
    if (Object.keys(files).length !== Object.keys(c.files).length) changed = true;
    if (activeProfile().pid !== p.pid) return; // switched profile while fetching
    LS.set(key, { files: files, at: Date.now() });
    if (changed) { loadRefs(); rerender(); } else S.refsInfo.at = Date.now();
  } catch (e) { /* offline: try again next time */ }
  finally { REFS_BUSY = false; }
}
function refBlock(q) {
  var r = S.refs && S.refs[q.id]; if (!r) return '';
  return '<div class="private-ref"><span class="private-ref-h">' + I.lock + 'Your reference</span><span>' + esc(r.source) + '</span>' +
    (r.quote ? '<q>' + esc(r.quote) + '</q>' : '') + '</div>';
}

/* =========================================================== KEEPING HOME SCREEN APPS UP TO DATE
   A Home Screen app (iPhone, iPad, Android) is often only paused in the background, so it can run
   an old copy of the app for days. When it comes back to the screen:
   - loaded more than 72 hours ago: reload;
   - away for 30 minutes or more: check quietly for a new app version or new questions, and reload if there are any.
   The reload waits while a paper is on screen (it happens when you next leave it) or while typing.
   Answers and papers in progress are saved on the device first, so nothing is lost. */
var LOADED_AT = Date.now(), HIDDEN_AT = 0, STALE_AFTER = 72 * 3600 * 1000, CHECK_AFTER = 30 * 60 * 1000;
var UPDATE = { ready: false, checking: false, manifest: null };
function scriptStamp(html) { var m = /assets\/app\.js\?v=([\w-]+)/.exec(html || ''); return m ? m[1] : ''; }
var MY_STAMP = scriptStamp(document.documentElement.innerHTML);
async function checkForUpdate() {
  if (UPDATE.checking || UPDATE.ready) return; UPDATE.checking = true;
  try {
    var r1 = await fetch('./?check=' + Date.now(), { cache: 'no-store' });
    var stamp = r1.ok ? scriptStamp(await r1.text()) : '';
    var r2 = await fetch('bank/manifest.json', { cache: 'no-store' });
    var man = r2.ok ? await r2.text() : null;
    if ((stamp && MY_STAMP && stamp !== MY_STAMP) || (man && UPDATE.manifest && hash(man) !== UPDATE.manifest)) { UPDATE.ready = true; reloadIfIdle(); }
  } catch (e) { /* offline: try next time */ }
  finally { UPDATE.checking = false; }
}
function reloadIfIdle() {
  if (!UPDATE.ready || document.visibilityState !== 'visible') return;
  if (S.view.name === 'paper' || S.ui.share || S.ui.confirm || S.ui.code.busy) return;
  var a = document.activeElement; if (a && /^(INPUT|TEXTAREA)$/.test(a.tagName) && a.value) return;
  try { saveLocal(); } catch (e) {}
  location.reload();
}
function onReturn() {
  var away = HIDDEN_AT ? Date.now() - HIDDEN_AT : 0;
  if (Date.now() - LOADED_AT > STALE_AFTER) { UPDATE.ready = true; reloadIfIdle(); return; }
  if (away >= CHECK_AFTER) checkForUpdate();
  if (away >= REFS_EVERY) syncRefs();
}

var SYNC = { busy: false, again: false, timer: null };
function scheduleSync(ms) { if (!isRemote()) return; clearTimeout(SYNC.timer); SYNC.timer = setTimeout(syncNow, ms); }
async function syncNow() {
  var p = activeProfile();
  if (p.local) return;
  if (SYNC.busy) { SYNC.again = true; return; }
  clearTimeout(SYNC.timer);
  SYNC.busy = true; setSync('busy');
  try {
    for (var tries = 0; tries < 4; tries++) {
      var remote = await remoteGet(p);
      if (activeProfile().pid !== p.pid) return;
      var merged = remote.data ? mergeLogs(S.log, remote.data) : normLog(S.log, p.user);
      merged.user = p.user;
      var revAtMerge = S.rev;
      var mergedText = JSON.stringify(merged, null, 1);
      var remoteText = remote.data ? JSON.stringify(normLog(remote.data), null, 1) : null;
      var changedHere = JSON.stringify(merged) !== JSON.stringify(S.log);
      S.log = merged; saveLocal();
      if (changedHere) { computeStats(); refreshAfterSync(); }
      if (mergedText === remoteText) { S.meta.sha = remote.sha; break; }
      try {
        S.meta.sha = await remotePut(p, mergedText, remote.sha);
        break;
      } catch (e) {
        if (e.kind === 'conflict' && tries < 3) continue;
        throw e;
      }
    }
    S.meta.dirty = S.rev !== revAtMerge;
    S.meta.lastSync = Date.now(); S.meta.err = null; saveMeta();
    setSync(S.meta.dirty ? 'pending' : 'ok');
    if (S.meta.dirty) scheduleSync(2000);
  } catch (e) {
    if (activeProfile().pid === p.pid) {
      S.meta.err = { kind: e.kind || 'http', msg: e.message || 'Sync failed', at: Date.now() }; saveMeta();
      setSync(e.kind === 'offline' ? 'offline' : 'err', S.meta.err.msg);
      if (e.kind === 'rate' || e.kind === 'offline') scheduleSync(60000);
    }
  } finally {
    SYNC.busy = false;
    if (SYNC.again) { SYNC.again = false; scheduleSync(1500); }
  }
}
function refreshAfterSync() {
  // A sync can bring in answers from another device. Only redraw views that don't hold unsaved typing or a selection.
  var n = S.view.name;
  if (n === 'home' || n === 'history' || n === 'notes' || n === 'build') rerender();
}
function syncLabel() {
  var s = S.sync.state;
  if (s === 'local') return 'Saved on this device only';
  if (s === 'ok') return 'All answers saved to GitHub' + (S.meta && S.meta.lastSync ? ' (' + fmtDateTime(new Date(S.meta.lastSync).toISOString()) + ')' : '');
  if (s === 'busy') return 'Saving to GitHub…';
  if (s === 'pending') return 'Waiting to save to GitHub';
  if (s === 'offline') return 'Offline. Saved on this device, will upload later.';
  return 'Not saving to GitHub: ' + (S.sync.msg || 'unknown problem');
}
function dotClass() {
  var s = S.sync.state;
  return s === 'ok' ? 'ok' : s === 'busy' ? 'busy' : s === 'pending' || s === 'offline' ? 'pending' : s === 'err' ? 'err' : '';
}
function setSync(state, msg) {
  S.sync = { state: state, msg: msg || '' };
  document.querySelectorAll('[data-sync]').forEach(function (el) {
    var d = el.querySelector('.dot'); if (d) d.className = 'dot ' + dotClass();
    el.setAttribute('title', syncLabel()); el.setAttribute('aria-label', activeProfile().name + '. ' + syncLabel() + '. Open settings.');
  });
  var line = document.getElementById('syncLine'); if (line) line.textContent = syncLabel();
}
function syncPill() {
  var p = activeProfile();
  return '<button class="pill" data-sync data-act="nav" data-to="prefs" title="' + esc(syncLabel()) + '" aria-label="' + esc(p.name + '. ' + syncLabel() + '. Open settings.') + '"><span class="dot ' + dotClass() + '"></span><span class="name">' + esc(p.name) + '</span></button>';
}

/* =========================================================== QUESTION BANK */
function lightCheck(q) {
  if (!q || typeof q !== 'object' || !q.id) return 'missing id';
  if (q.format !== 'sba' && q.format !== 'cdp') return 'format must be sba or cdp';
  if (!Array.isArray(q.stem) || !q.stem.length) return 'missing stem';
  if (!q.lead) return 'missing lead';
  if (!Array.isArray(q.options) || q.options.length < 2) return 'missing options';
  if (q.format === 'sba' && q.options.filter(function (o) { return o && o.correct === true; }).length !== 1) return 'needs exactly one correct option';
  if (q.format === 'cdp' && !(q.select > 0)) return 'needs "select"';
  if (!Array.isArray(q.topics) || !q.topics.length) return 'missing topics';
  return '';
}
async function loadBank() {
  var manifest;
  try {
    var r = await fetch('bank/manifest.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    var mtext = await r.text(); UPDATE.manifest = hash(mtext); manifest = JSON.parse(mtext);
  } catch (e) {
    S.bankErrors.push('Couldn’t load the list of question banks (' + e.message + ').');
    S.bankLoaded = true; return;
  }
  var files = (manifest.banks || []).map(function (b) { return b.file; });
  var results = await Promise.all(files.map(function (f) {
    return fetch('bank/' + encodeURIComponent(f), { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status); return r.json();
    }).then(function (d) { return { file: f, data: d }; }, function (e) { return { file: f, err: e.message }; });
  }));
  var topics = new Set(), exams = new Set();
  results.forEach(function (res) {
    if (res.err) { S.bankErrors.push(res.file + ': couldn’t load (' + res.err + ')'); return; }
    var b = res.data && res.data.bank; var qs = res.data && res.data.questions;
    if (!b || !Array.isArray(qs)) { S.bankErrors.push(res.file + ': not a question bank'); return; }
    var bank = { id: b.id, title: b.title || b.id, reviewBy: b.reviewBy || '', count: 0, file: res.file };
    qs.forEach(function (q) {
      var problem = lightCheck(q);
      if (problem) { S.bankErrors.push(res.file + ' ' + ((q && q.id) || '?') + ': ' + problem); return; }
      if (S.qs.has(q.id)) { S.bankErrors.push(res.file + ' ' + q.id + ': duplicate id, skipped'); return; }
      q._bank = bank.id; q._bankTitle = bank.title;
      q._hash = hash(q.format + '|' + q.options.map(function (o) { return o.text; }).join('|'));
      q._reviewBy = q.reviewBy || bank.reviewBy || '';
      if (q.format === 'cdp') q._max = q.options.reduce(function (n, o) { return n + (o.score > 0 ? o.score : 0); }, 0) || 1;
      S.qs.set(q.id, q); S.qList.push(q); bank.count++;
      q.topics.forEach(function (t) { topics.add(t); });
      (q.exams || []).forEach(function (x) { exams.add(x); });
    });
    S.banks.push(bank);
  });
  S.topics = Array.from(topics).sort(); S.exams = Array.from(exams).sort();
  S.bankLoaded = true;
}

/* =========================================================== SCORING + STATS */
function scoreItem(q, sel) {
  sel = sel || [];
  if (q.format === 'sba') {
    var ok = sel.length === 1 && q.options[sel[0]] && q.options[sel[0]].correct === true;
    return { earned: ok ? 1 : 0, max: 1, extra: 0, frac: ok ? 1 : 0, critMissed: false };
  }
  var earned = 0;
  sel.forEach(function (i) { var o = q.options[i]; if (o && o.score > 0) earned += o.score; });
  var extra = Math.max(0, sel.length - q.select);
  var pen = typeof q.penalty === 'number' ? q.penalty : DEFAULT_PENALTY;
  var frac = Math.round((earned / q._max - pen * extra) * 1000) / 1000;
  var critMissed = q.options.some(function (o, i) { return o.critical && sel.indexOf(i) === -1; });
  return { earned: earned, max: q._max, extra: extra, frac: frac, critMissed: critMissed };
}
function resultClass(frac) { return frac >= 0.999 ? 'good' : frac > 0 ? 'part' : 'bad'; }
function computeStats() {
  var st = new Map();
  if (!S.log) { S.stats = st; return; }
  S.log.attempts.forEach(function (a) {
    if (!S.qs.has(a.q)) return;
    var s = st.get(a.q) || { n: 0, wrong: 0, last: null };
    s.n++; if (!(a.frac >= 0.999)) s.wrong++;
    if (!s.last || a.at >= s.last.at) s.last = a;
    st.set(a.q, s);
  });
  S.stats = st;
}
function statusOf(qid) {
  var s = S.stats.get(qid); if (!s) return 'unseen';
  var f = s.last.frac; return f >= 0.999 ? 'correct' : f > 0 && s.last.fmt === 'cdp' ? 'partial' : 'incorrect';
}
function isFlagged(qid) { var f = S.log.flags[qid]; return !!(f && f.on); }
function noteOf(qid) { var n = S.log.notes[qid]; return n && n.text ? n.text : ''; }
function matchesStatus(q, key, b) {
  var s = S.stats.get(q.id); var last = s && s.last;
  switch (key) {
    case 'unseen': return !s;
    case 'incorrect': return statusOf(q.id) === 'incorrect';
    case 'partial': return statusOf(q.id) === 'partial';
    case 'correct': return statusOf(q.id) === 'correct';
    case 'flagged': return isFlagged(q.id);
    case 'critical': return !!(last && last.critMissed);
    case 'over': return !!(last && last.extra > 0);
    case 'slow': return !!(last && last.secs > SLOW_FACTOR * PACES.working[q.format]);
    case 'wrong2': return !!(s && s.wrong >= 2);
    case 'stale': return !!(last && daysSince(last.at) >= (b.staleDays || 30));
  }
  return false;
}
function baseFilter(q, b) {
  if (b.topics.length && !q.topics.some(function (t) { return b.topics.indexOf(t) !== -1; })) return false;
  if (b.exams.length && !(q.exams || []).some(function (x) { return b.exams.indexOf(x) !== -1; })) return false;
  if (b.banks.length && b.banks.indexOf(q._bank) === -1) return false;
  return true;
}
function pool(b) {
  return S.qList.filter(function (q) {
    if (!baseFilter(q, b)) return false;
    if (!b.status.length) return true;
    return b.status.some(function (k) { return matchesStatus(q, k, b); });
  });
}
function topicStats() {
  var map = new Map();
  S.topics.forEach(function (t) { map.set(t, { topic: t, total: 0, seen: 0, sum: 0 }); });
  S.qList.forEach(function (q) {
    var s = S.stats.get(q.id);
    q.topics.forEach(function (t) {
      var r = map.get(t); r.total++;
      if (s) { r.seen++; r.sum += clamp(s.last.frac, 0, 1); }
    });
  });
  return Array.from(map.values()).map(function (r) { r.acc = r.seen ? r.sum / r.seen : null; return r; });
}
function plannedCounts(b) {
  if (b.by === 'number') return { sba: b.nSba, cdp: b.nCdp };
  var pace = PACES[b.pace] || PACES.working; var secs = b.minutes * 60;
  var sba = Math.floor(secs * b.share / 100 / pace.sba);
  var cdp = Math.floor(secs * (100 - b.share) / 100 / pace.cdp);
  if (sba + cdp === 0) { if (b.share >= 50) sba = 1; else cdp = 1; }
  return { sba: sba, cdp: cdp };
}
function pickQuestions(list, n, priority) {
  var tacc = new Map(); topicStats().forEach(function (r) { tacc.set(r.topic, r.acc == null ? 0.5 : r.acc); });
  var scored = list.map(function (q) {
    var st = statusOf(q.id); var s = S.stats.get(q.id); var r = Math.random();
    var score;
    if (priority === 'random') score = r;
    else if (priority === 'weak') {
      var acc = Math.min.apply(null, q.topics.map(function (t) { return tacc.has(t) ? tacc.get(t) : 0.5; }));
      score = (1 - acc) * 2 + (st === 'incorrect' ? 0.6 : st === 'partial' ? 0.4 : st === 'unseen' ? 0.3 : 0) + r * 0.6;
    } else {
      score = (st === 'unseen' ? 3 : st === 'incorrect' ? 2 : st === 'partial' ? 1.5 : 0) + (s ? Math.min(daysSince(s.last.at), 365) / 365 : 0) + r * 0.9;
    }
    return { q: q, s: score };
  });
  scored.sort(function (a, b) { return b.s - a.s; });
  return scored.slice(0, n).map(function (x) { return x.q; });
}
function latestUl(qid) {
  var s = S.stats.get(qid);
  return s && s.last && s.last.ul ? JSON.parse(JSON.stringify(s.last.ul)) : {};
}
function createPaper(questions, mode, paceKey, label, style, share) {
  var pace = PACES[paceKey] || PACES.working;
  var limit = 0;
  questions.forEach(function (q) { limit += pace[q.format]; });
  var paper = {
    id: uid('p'), createdAt: iso(), mode: mode, pace: paceKey, style: STYLES[style] ? style : 'racgp', limit: mode === 'exam' ? limit : null,
    elapsed: 0, idx: 0, paused: false, label: label,
    items: questions.map(function (q) { return { q: q.id, sel: [], secs: 0, ul: latestUl(q.id), checked: false }; })
  };
  if (share) paper.share = share; // made from a share code: sharing it again gives the same code
  S.log.current = paper; touch('paper', 1500);
  go('paper', true);
}
function builderLabel(b, counts) {
  var bits = [];
  if (b.topics.length) bits.push(b.topics.join(', '));
  if (b.status.length) bits.push(b.status.map(function (k) { return STATUS_FILTERS.find(function (s) { return s[0] === k; })[1].toLowerCase(); }).join(' or '));
  var parts = [];
  if (counts.sba) parts.push(counts.sba + ' ' + fmtName('sba', b.style)); if (counts.cdp) parts.push(counts.cdp + ' ' + fmtName('cdp', b.style));
  return parts.join(' + ') + (bits.length ? ' · ' + bits.join(' · ') : '');
}
// "Specific questions": a typed or pasted list of question IDs, used in the order given.
function parseIdList(text) {
  var seen = {}, found = [], unknown = [];
  String(text || '').toLowerCase().split(/[\s,;]+/).forEach(function (id) {
    if (!id || seen[id]) return; seen[id] = 1;
    var q = S.qs.get(id); if (q) found.push(q); else unknown.push(id);
  });
  return { found: found, unknown: unknown };
}
function buildFromBuilder(custom) {
  var b = custom || S.builder;
  if (b.useIds) {
    var r = parseIdList(b.ids);
    if (!r.found.length) { toast(r.unknown.length ? 'None of those question IDs are in the bank' : 'Type or paste at least one question ID'); return; }
    if (r.unknown.length) toast('Not found, so left out: ' + r.unknown.slice(0, 4).join(', ') + (r.unknown.length > 4 ? '…' : ''));
    createPaper(r.found, b.mode, b.pace, r.found.length === 1 ? 'Question ' + r.found[0].id : r.found.length + ' chosen questions', b.style);
    return;
  }
  var want = plannedCounts(b); var list = pool(b);
  var sba = pickQuestions(list.filter(function (q) { return q.format === 'sba'; }), want.sba, b.priority);
  var cdp = pickQuestions(list.filter(function (q) { return q.format === 'cdp'; }), want.cdp, b.priority);
  if (!sba.length && !cdp.length) { toast('No questions match those choices'); return; }
  createPaper(sba.concat(cdp), b.mode, b.pace, builderLabel(b, { sba: sba.length, cdp: cdp.length }), b.style);
}
function finishPaper() {
  var p = S.log.current; if (!p) return;
  var at = iso(); var sum = { sbaN: 0, sbaOk: 0, cdpN: 0, cdpScore: 0, total: 0 }; var qids = [];
  p.items.forEach(function (it) {
    var q = S.qs.get(it.q); if (!q) return;
    var r = scoreItem(q, it.sel);
    var a = { id: uid('a'), paper: p.id, q: q.id, bank: q._bank, fmt: q.format, at: at, sel: it.sel.slice(), secs: it.secs,
      frac: r.frac, earned: r.earned, max: r.max, extra: r.extra, critMissed: r.critMissed, h: q._hash, mode: p.mode };
    if (it.ul && Object.keys(it.ul).length) { a.ul = it.ul; a.ulAt = Date.now(); }
    S.log.attempts.push(a); qids.push(q.id);
    sum.total += r.frac;
    if (q.format === 'sba') { sum.sbaN++; if (r.frac >= 0.999) sum.sbaOk++; } else { sum.cdpN++; sum.cdpScore += r.frac; }
  });
  S.log.papers.push({
    id: p.id, createdAt: p.createdAt, finishedAt: at, mode: p.mode, pace: p.pace, style: p.style || 'other', label: p.label,
    n: qids.length, qids: qids, elapsed: p.elapsed, limit: p.limit,
    sbaN: sum.sbaN, sbaOk: sum.sbaOk, cdpN: sum.cdpN, cdpScore: Math.round(sum.cdpScore * 100) / 100,
    pct: qids.length ? Math.round(sum.total / qids.length * 1000) / 10 : 0
  });
  if (p.share && qids.length === p.items.length) S.log.papers[S.log.papers.length - 1].share = p.share;
  S.log.current = null; S.ui.sheet = null;
  touch('paper', 0);
  go('results-' + p.id, true);
}

/* =========================================================== ROUTER */
function go(hash, replace) {
  S.ui.hold = null; S.ui.navTo = String(hash).split('-')[0] || 'home';
  if (replace) { history.replaceState(null, '', '#' + hash); route(); render(true); }
  else if (location.hash === '#' + hash) { route(); render(true); }
  else location.hash = hash;
}
function route() {
  var h = location.hash.slice(1);
  try { h = decodeURIComponent(h); } catch (e) {}
  if (h.indexOf('setup=') === 0) { consumeSetupHash(); h = ''; }
  // "Held" views (connected, install) show with no hash in the address, so an icon or
  // bookmark made from them opens the dashboard rather than that page.
  if (!h && S.ui.hold) {
    S.view = { name: S.firstRun && S.ui.hold !== 'connected' ? 'welcome' : S.ui.hold };
    S.ui.sheet = null; S.ui.ulPending = null; S.ui.armed = null; S.ui.confirm = null; S.ui.share = null; return;
  }
  var name = h.split('-')[0] || 'home'; var rest = h.slice(name.length + 1);
  var v = { name: name };
  if (name === 'results') v.pid = rest;
  else if (name === 'review') { var parts = rest.split('-'); v.pid = parts[0]; v.n = Math.max(0, (parseInt(parts[1], 10) || 1) - 1); }
  else if (name === 'question') v.qid = rest;
  else if (['home', 'build', 'paper', 'history', 'notes', 'prefs', 'welcome', 'device'].indexOf(name) === -1) v = { name: 'home' };
  if (S.firstRun && (v.name === 'home' || v.name === 'device')) v = { name: 'welcome' };
  S.view = v; S.ui.sheet = null; S.ui.ulPending = null; S.ui.armed = null; S.ui.confirm = null; S.ui.share = null; S.ui.code.msg = null; closeZoom();
  if (v.name !== 'prefs') S.ui.focusLink = false;
}

/* =========================================================== RENDER */
var lastViewKey = '';
function render(scrollTop) {
  var v = S.view; var fn = VIEWS[v.name] || VIEWS.home; var html;
  try { html = fn(v); } catch (e) { console.error(e); html = topbar('') + '<main class="wrap narrow"><div class="card callout bad">Something went wrong showing this page. ' + esc(e.message) + '</div></main>'; }
  app.innerHTML = html;
  document.body.classList.toggle('has-bottombar', !!app.querySelector('.bottombar'));
  var key = location.hash;
  if (scrollTop || key !== lastViewKey) window.scrollTo(0, 0);
  lastViewKey = key;
  afterRender();
}
function rerender() { var y = window.scrollY; render(false); window.scrollTo(0, y); }
function afterRender() {
  fsOnRender();
  var ta = app.querySelector('[data-autofocus]'); if (ta) ta.focus();
  if (S.ui.slide) { var card = app.querySelector('.qcard'); if (card) card.classList.add(S.ui.slide > 0 ? 'slide-next' : 'slide-prev'); S.ui.slide = 0; }
  updateUlFloat();
  placeTip();
  if (UPDATE.ready) setTimeout(reloadIfIdle, 0);
  var spot = S.view.name === 'prefs' && app.querySelector('.spotlight');
  if (spot && !spot.dataset.shown) { spot.dataset.shown = '1'; setTimeout(function () { spot.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 60); }
}
// The first-time tip on the paper screen: line its highlights and pointers up with the real buttons.
function placeTip() {
  var layer = app.querySelector('.tip-layer'); if (!layer) return;
  var bs = app.querySelector('.paperbar [data-act="share-open"]'), bm = app.querySelector('.paperbar [data-v="map"]');
  var card = document.getElementById('tipCard'); if (!bs || !bm || !card) return;
  var rs = bs.getBoundingClientRect(), rm = bm.getBoundingClientRect();
  [['tipG1', rs], ['tipG2', rm]].forEach(function (x) {
    var g = document.getElementById(x[0]); if (!g) return;
    g.style.left = x[1].left + 'px'; g.style.top = x[1].top + 'px'; g.style.width = x[1].width + 'px'; g.style.height = x[1].height + 'px';
  });
  var w = Math.min(340, window.innerWidth - 24);
  var left = clamp(rm.right - w, 12, Math.max(12, window.innerWidth - w - 12));
  card.style.width = w + 'px'; card.style.left = left + 'px'; card.style.top = (rm.bottom + 16) + 'px';
  [['tipC1', rs], ['tipC2', rm]].forEach(function (x) { var c = document.getElementById(x[0]); if (c) c.style.left = (x[1].left + x[1].width / 2 - left) + 'px'; });
  layer.classList.add('ready');
}
function tipLayer() {
  return '<div class="tip-layer" data-act="tip-close" role="dialog" aria-label="Tips for this screen">' +
    '<span class="icon-btn tip-ghost" id="tipG1" aria-hidden="true">' + I.share + '</span><span class="icon-btn tip-ghost" id="tipG2" aria-hidden="true">' + I.grid + '</span>' +
    '<div class="tip-card" id="tipCard" data-act="tip-stay"><i class="tip-caret" id="tipC1"></i><i class="tip-caret" id="tipC2"></i>' +
    '<button class="icon-btn tip-x" data-act="tip-close" aria-label="Close tips">' + I.close + '</button>' +
    '<div class="tip-row"><span class="tip-ico" aria-hidden="true">' + I.share + '</span><p><b>Share this paper</b>Get a code so you, or someone you study with, can sit the same questions in the same order.</p></div>' +
    '<div class="tip-row"><span class="tip-ico" aria-hidden="true">' + I.grid + '</span><p><b>All questions</b>Jump to any question, see what’s answered or flagged, and finish the paper.</p></div>' +
    '<p class="tiny muted">Tap outside this box, or the cross, to close. The clock is stopped while this is showing.</p></div></div>';
}
function topbar(title, back) {
  return '<header class="topbar"><div class="wrap">' +
    (back ? '<button class="icon-btn" data-act="nav" data-to="' + esc(back) + '" aria-label="Back">' + I.back + '</button>' : '') +
    '<button class="brand" data-act="nav" data-to="home" aria-label="Bubblesheet home"><span class="brand-mark" aria-hidden="true"><i></i><i class="f"></i><i></i><i></i></span>' + (title ? '' : 'Bubblesheet') + '</button>' +
    (title ? '<span class="topbar-title">' + esc(title) + '</span>' : '') +
    '<div class="end">' + themeButton() + syncPill() + '</div></div></header>';
}
function fillClass(acc) { return acc == null ? '' : acc >= 0.75 ? 'good' : acc >= 0.5 ? 'warn' : 'bad'; }
function scoreBadge(pctVal) { var c = pctVal >= 75 ? 'good' : pctVal >= 50 ? 'warn' : 'bad'; return '<span class="badge ' + c + '">' + Math.round(pctVal) + '%</span>'; }

var VIEWS = {};

/* ---------- welcome ---------- */
VIEWS.welcome = function () {
  return topbar('') + '<main class="wrap narrow"><div class="stack-lg">' +
    '<div class="page-title"><span class="eyebrow">Welcome</span><h1>Practice papers that remember how you went</h1>' +
    '<p class="muted">Build timed single-best-answer and clinical-decision-problem papers from the question banks, filtered by topic and by how you’ve done before.</p></div>' +
    '<div class="card stack"><h2>Got a setup link?</h2><p class="small muted">If someone set this up for you, they’ll have sent a link. Opening it connects this device and saves your answers to your profile.</p>' +
    (canReadClipboard() ? '<button class="btn btn-primary" data-act="paste-clip">Paste my setup link</button><p class="tiny muted">Copy the link first, then tap the button. If a small Paste button pops up, tap it. Or paste the link into the box below.</p>' : '') +
    '<div class="field"><label for="pasteSetup">Paste the setup link here</label><input class="input" id="pasteSetup" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="https://…#setup=…"></div>' +
    '<button class="btn' + (canReadClipboard() ? '' : ' btn-primary') + '" data-act="paste-setup" data-src="pasteSetup">Connect this device</button><p class="small" id="pasteMsg"></p></div>' +
    '<div class="card stack"><h2>Just practise here</h2><p class="small muted">Answers stay on this device only. You can connect a profile later in Settings.</p>' +
    '<button class="btn" data-act="practise-local">Start practising</button></div></div></main>';
};

/* ---------- setup link opened ---------- */
VIEWS.connected = function () {
  if (S.ui.setupErr) return topbar('') + '<main class="wrap narrow"><div class="card stack"><h2>That link didn’t work</h2><p>' + esc(S.ui.setupErr) + '</p>' +
    '<p class="small muted">Ask for the link again, or copy the whole link and paste it on the welcome screen.</p><button class="btn btn-primary" data-act="setup-continue">Continue</button></div></main>';
  var p = activeProfile(); var c = S.ui.connected || {};
  return topbar('') + '<main class="wrap narrow"><div class="card stack"><span class="eyebrow">' + (c.updated ? 'Connection updated' : 'Connected') + '</span><h1>Hi ' + esc(p.name) + '</h1>' +
    '<p>This device is set up. Your answers, notes and underlines are saved to your profile and appear on any other device you set up the same way.</p>' +
    '<button class="btn btn-primary" data-act="setup-continue">Continue</button></div></main>';
};

/* ---------- add an app icon ---------- */
function installSteps(kind, remote) {
  if (kind === 'ios') return (remote
      ? '<p class="small muted">On an iPhone or iPad, an app icon keeps its own storage, separate from Safari. So the new icon needs your setup link once.</p>'
      : '<p class="small muted">On an iPhone or iPad, an app icon keeps its own storage, separate from Safari. Answers saved only on this device in Safari won’t appear in it.</p>') +
    '<ol class="steps">' +
    (remote ? '<li><b>Copy your setup link.</b><button class="btn btn-sm" data-act="copy-link-install">Copy my setup link</button></li>' : '') +
    '<li><b>Add the icon.</b> In Safari, tap the <b>Share</b> button. On a recent iPhone, tap <b>•••</b> next to the address bar first, then <b>Share</b>. Scroll down, tap <b>Add to Home Screen</b>, leave <b>Open as Web App</b> switched on, then tap <b>Add</b>.</li>' +
    (remote ? '<li><b>Open the new Bubblesheet icon</b> and tap <b>Paste my setup link</b>. If a small Paste button pops up, tap it.</li>' : '<li><b>Open Bubblesheet from the new icon</b> from now on.</li>') +
    '</ol>' + (remote ? '<p class="small muted">From then on, open Bubblesheet from the icon. Everything you’ve already answered is in your profile, so it shows up there too.</p>' : '');
  if (kind === 'android') return '<ol class="steps"><li>In Chrome, tap <b>⋮</b> (top right).</li><li>Tap <b>Add to Home screen</b>, then <b>Add</b> or <b>Install</b>.</li><li>Open Bubblesheet from the new icon from now on. It opens already set up.</li></ol>';
  return '<ol class="steps"><li>Bookmark this page: press <b>Ctrl + D</b> on Windows, or <b>Cmd + D</b> on a Mac.</li><li>Open Bubblesheet from the bookmark from now on.</li></ol>';
}
VIEWS.install = function () {
  var p = activeProfile(); var remote = !p.local; var kind = deviceKind();
  var names = { ios: 'iPhone or iPad', android: 'Android phone or tablet', computer: 'Computer' };
  var body = isStandalone()
    ? '<div class="card stack"><h2>You’re using the app icon</h2><p>Nothing more to do here. Keep opening Bubblesheet from this icon.</p></div>'
    : '<div class="card stack"><h2>' + names[kind] + '</h2>' + installSteps(kind, remote) + '</div>' +
      '<details class="card help"><summary>Steps for other devices</summary><div class="stack">' +
      ['ios', 'android', 'computer'].filter(function (k) { return k !== kind; }).map(function (k) { return '<h3>' + names[k] + '</h3>' + installSteps(k, remote); }).join('') +
      '</div></details>';
  return topbar('Add an app icon', 'home') + '<main class="wrap narrow"><div class="stack-lg">' +
    '<div class="page-title"><span class="eyebrow">Optional</span><h1>Add an app icon</h1><p class="muted">An icon on your Home Screen opens Bubblesheet in one tap, like an app.</p></div>' + body +
    '<div class="row"><button class="btn btn-primary" data-act="nav" data-to="home">Go to my dashboard</button>' +
    (remote ? '<button class="btn" data-act="nav" data-to="device">Set up another device</button>' : '') + '</div></div></main>';
};

/* ---------- set up another device ---------- */
VIEWS.device = function () {
  var p = activeProfile();
  if (p.local) return topbar('Another device', 'prefs') + '<main class="wrap narrow"><div class="card stack"><p>This device isn’t connected to a profile, so there’s no setup link to share. Open a setup link on this device first, or add a profile in Settings.</p><button class="btn" data-act="nav" data-to="prefs">Settings</button></div></main>';
  return topbar('Another device', 'home') + '<main class="wrap narrow"><div class="stack-lg">' +
    '<div class="card stack"><h2>' + esc(p.name) + '’s setup link</h2><p class="small">Open this link on another device to connect it to the same answers, notes and underlines.</p>' +
    '<div class="callout warn small"><b>Treat this link like a password.</b> Anyone who has it can read and change this profile’s answers. Send it only to yourself or to this profile’s owner, in a private message.</div>' +
    '<div class="codebox" id="setupLinkBox">' + esc(setupLink(p)) + '</div>' +
    '<div class="row"><button class="btn btn-primary" data-act="copy-link">Copy link</button>' + (navigator.share ? '<button class="btn" data-act="share-link">Send…</button>' : '') + '</div></div>' +
    '<div class="card stack"><h2>On the other device</h2><ol class="steps">' +
    '<li>Open the link: tap it in Messages or email, or paste it into the browser’s address bar.</li>' +
    '<li>Tap <b>Continue</b>, then follow the steps to add an app icon.</li></ol>' +
    '<p class="small muted">Already have the Bubblesheet icon on that device? Copy the link there, open the icon and tap <b>Paste my setup link</b> on the welcome screen, or use <b>Settings</b>, then <b>Add from link</b>.</p></div></div></main>';
};

/* ---------- home ---------- */
VIEWS.home = function () {
  var out = [];
  if (!S.bankLoaded) return topbar('') + '<main class="wrap"><p class="boot">Loading questions…</p></main>';
  var total = S.qList.length; var counts = { correct: 0, partial: 0, incorrect: 0, unseen: 0 }; var accSum = 0, seen = 0, due = 0;
  S.qList.forEach(function (q) {
    var st = statusOf(q.id); counts[st]++;
    var s = S.stats.get(q.id); if (s) { seen++; accSum += clamp(s.last.frac, 0, 1); if (daysSince(s.last.at) >= 30) due++; }
  });
  var flagged = S.qList.filter(function (q) { return isFlagged(q.id); }).length;
  var notes = Object.keys(S.log.notes).filter(function (k) { return S.log.notes[k] && S.log.notes[k].text; }).length;
  var mistakes = counts.incorrect + counts.partial;

  if (S.meta && S.meta.err && S.meta.err.kind !== 'offline' && S.meta.err.kind !== 'rate' && isRemote()) {
    out.push('<div class="callout bad span2"><b>Answers aren’t reaching GitHub.</b> ' + esc(S.meta.err.msg) + ' They’re kept safely on this device in the meantime. <button class="linkish" data-act="nav" data-to="prefs">Details</button></div>');
  }
  var cur = S.log.current;
  if (cur) {
    var answered = cur.items.filter(function (it) { return it.sel.length; }).length;
    var tl = cur.limit ? (cur.limit - cur.elapsed > 0 ? fmtClock(cur.limit - cur.elapsed) + ' left' : 'time is up') : fmtClock(cur.elapsed) + ' so far';
    out.push('<div class="card resume span2"><div class="spread"><div class="grow"><span class="eyebrow">Paper in progress</span><h2 style="margin-top:4px">' + esc(cur.label || 'Practice paper') + '</h2>' +
      '<p class="small muted">' + answered + ' of ' + cur.items.length + ' answered · ' + tl + ' · ' + (cur.mode === 'exam' ? 'Exam mode' : 'Tutor mode') + '</p></div>' +
      '<div class="row"><button class="btn btn-sm btn-ghost btn-danger" data-act="discard-ask">Discard</button><button class="btn btn-primary" data-act="nav" data-to="paper">Resume</button></div></div>' +
      (S.ui.sheet === 'discard' ? discardSheet() : '') + '</div>');
  }
  var segs = '';
  [['correct', 's-good'], ['partial', 's-warn'], ['incorrect', 's-bad']].forEach(function (x) {
    if (counts[x[0]]) segs += '<span class="' + x[1] + '" style="width:' + (counts[x[0]] / total * 100) + '%"></span>';
  });
  out.push('<div class="card"><div class="card-head"><h2>Progress</h2><span class="eyebrow">' + total + ' questions</span></div>' +
    '<div class="big-num">' + (seen ? pct(accSum / seen) + '%' : '–') + '<small>' + (seen ? 'average on your latest attempts' : 'no answers yet') + '</small></div>' +
    '<div class="seg-bar" role="img" aria-label="' + counts.correct + ' correct, ' + counts.partial + ' partly correct, ' + counts.incorrect + ' incorrect, ' + counts.unseen + ' unseen">' + segs + '</div>' +
    '<div class="legend"><span><i style="background:var(--good-bar)"></i>' + counts.correct + ' correct</span><span><i style="background:var(--warn-bar)"></i>' + counts.partial + ' partly</span><span><i style="background:var(--bad-bar)"></i>' + counts.incorrect + ' incorrect</span><span><i style="background:var(--track)"></i>' + counts.unseen + ' unseen</span></div>' +
    '<div class="pop-anchor"><div class="stat-row" style="margin-top:14px">' +
    '<button class="stat" data-act="quick" data-k="flagged"><b>' + flagged + '</b><span>Flagged</span></button>' +
    '<button class="stat" data-act="nav" data-to="notes"><b>' + notes + '</b><span>Notes</span></button>' +
    '<button class="stat" data-act="quick" data-k="stale"><b>' + due + '</b><span>Not seen 30+ days</span></button></div>' + discardPop('quick-flagged', '17%') + '</div></div>');

  out.push('<div class="card stack"><h2>Start a paper</h2>' +
    '<button class="btn btn-primary btn-block" data-act="nav" data-to="build">Build a paper</button>' +
    '<div class="pop-anchor"><div class="row"><button class="btn grow" data-act="quick" data-k="quick15">Quick 15 minutes</button>' +
    '<button class="btn grow" data-act="quick" data-k="mistakes"' + (mistakes ? '' : ' disabled') + '>Redo mistakes' + (mistakes ? ' (' + mistakes + ')' : '') + '</button></div>' +
    discardPop('quick-quick15', '25%') + discardPop('quick-mistakes', '75%') + '</div>' +
    '<p class="tiny muted">Quick 15 minutes mixes both formats and puts unseen questions first. Redo mistakes opens your incorrect and partly correct questions in tutor mode.</p></div>');

  var ts = topicStats().sort(function (a, b) {
    if (a.acc == null && b.acc == null) return a.topic.localeCompare(b.topic);
    if (a.acc == null) return 1; if (b.acc == null) return -1; return a.acc - b.acc;
  });
  if (isRemote()) out.push('<button class="device-cta span2" data-act="device-help"><span class="device-cta-ico" aria-hidden="true">' + I.devices + '</span>' +
    '<span class="device-cta-txt"><b>Use on another device</b><span>Pick up your papers and results on your phone, tablet or computer</span></span><span class="device-cta-go" aria-hidden="true">' + I.chevron + '</span></button>');
  out.push('<div class="card"><div class="card-head"><h2>By topic</h2><span class="eyebrow">Weakest first</span></div><div class="topic-rows">' +
    ts.map(function (r) {
      return '<button class="topic-row press" style="background:none;border:0;padding:0;text-align:left" data-act="quick" data-k="topic" data-v="' + esc(r.topic) + '" aria-label="' + esc(r.topic) + ': ' + (r.acc == null ? 'not started' : pct(r.acc) + '% on ' + r.seen + ' of ' + r.total) + '. Build a paper on this topic.">' +
        '<span class="t-name">' + esc(r.topic) + '</span><span class="track"><span class="fill ' + fillClass(r.acc) + '" style="width:' + (r.acc == null ? 0 : Math.max(3, pct(r.acc))) + '%"></span></span>' +
        '<span class="t-val">' + (r.acc == null ? 'new' : pct(r.acc) + '%') + ' · ' + r.seen + '/' + r.total + '</span></button>';
    }).join('') + '</div><p class="tiny muted" style="margin-top:12px">Tap a topic to build a paper on it.</p></div>');

  var recent = S.log.papers.slice(-4).reverse();
  out.push('<div class="card"><div class="card-head"><h2>Recent papers</h2>' + (S.log.papers.length > 4 ? '<button class="linkish" data-act="nav" data-to="history">All ' + S.log.papers.length + '</button>' : '') + '</div>' +
    (recent.length ? '<div class="list">' + recent.map(paperRow).join('') + '</div>' : '<p class="empty">Finished papers will appear here.</p>') + '</div>');

  var footer = '<p class="tiny muted span2" style="text-align:center">' + total + ' questions in ' + S.banks.length + ' bank' + (S.banks.length === 1 ? '' : 's') + ': ' + S.banks.map(function (b) { return esc(b.title); }).join('; ') + '</p>';
  if (S.bankErrors.length) footer += '<div class="callout warn span2 small"><b>Some questions couldn’t be loaded.</b> ' + S.bankErrors.slice(0, 3).map(esc).join(' · ') + (S.bankErrors.length > 3 ? ' (and ' + (S.bankErrors.length - 3) + ' more)' : '') + '</div>';
  out.push(footer);
  return topbar('') + '<main class="wrap"><div class="dash">' + out.join('') + '</div></main>';
};
function paperRow(p) {
  return '<button class="list-row press" data-act="nav" data-to="results-' + esc(p.id) + '"><span class="main"><b>' + esc(p.label || 'Practice paper') + '</b><span>' + fmtDate(p.finishedAt) + ' · ' + p.n + (p.n === 1 ? ' question' : ' questions') + ' · ' + (p.mode === 'exam' ? 'Exam' : 'Tutor') + ' · ' + fmtClock(p.elapsed) + '</span></span>' + scoreBadge(p.pct) + '</button>';
}
function discardSheet() {
  return '<div class="callout warn" style="margin-top:12px"><p><b>Discard this paper?</b> Nothing from it will be saved.</p><div class="row" style="margin-top:8px"><button class="btn btn-sm" data-act="sheet-close">Keep it</button><button class="btn btn-sm btn-danger" data-act="discard">Discard</button></div></div>';
}

/* ---------- builder ---------- */
VIEWS.build = function () {
  var b = S.builder; var pace = PACES[b.pace];
  function seg(k, opts) {
    return '<div class="seg" role="group">' + opts.map(function (o) {
      return '<button data-act="set" data-k="' + k + '" data-v="' + o[0] + '" aria-pressed="' + (String(b[k]) === String(o[0])) + '">' + o[1] + '</button>';
    }).join('') + '</div>';
  }
  function stepper(k, step, min, max, unit) {
    return '<div class="stepper"><button data-act="step" data-k="' + k + '" data-d="' + (-step) + '" data-min="' + min + '" data-max="' + max + '" aria-label="Fewer">−</button><output id="out-' + k + '">' + b[k] + (unit || '') + '</output><button data-act="step" data-k="' + k + '" data-d="' + step + '" data-min="' + min + '" data-max="' + max + '" aria-label="More">+</button></div>';
  }
  var base = S.qList.filter(function (q) { return baseFilter(q, b); });
  var statusChips = STATUS_FILTERS.map(function (s) {
    var n = base.filter(function (q) { return matchesStatus(q, s[0], b); }).length;
    return '<button class="chip" data-act="toggle" data-k="status" data-v="' + s[0] + '" aria-pressed="' + (b.status.indexOf(s[0]) !== -1) + '">' + s[1] + '<span class="n">' + n + '</span></button>';
  }).join('');
  function chipList(k, values, labelFn) {
    return values.map(function (v) {
      var val = typeof v === 'string' ? v : v.id;
      return '<button class="chip" data-act="toggle" data-k="' + k + '" data-v="' + esc(val) + '" aria-pressed="' + (b[k].indexOf(val) !== -1) + '">' + esc(labelFn ? labelFn(v) : v) + '</button>';
    }).join('');
  }
  var A = fmtName('sba', b.style), K = fmtName('cdp', b.style);
  var length = b.by === 'time'
    ? '<div class="field"><span class="label">Total time</span>' + stepper('minutes', 5, 5, 240, ' min') + '</div>' +
      '<div class="field"><label for="share">Time on ' + A + ': <span id="shareVal" class="mono">' + b.share + '%</span> (' + K + ' gets the rest)</label><input type="range" id="share" min="0" max="100" step="10" value="' + b.share + '" data-input="share"></div>'
    : '<div class="row" style="gap:18px"><div class="field"><span class="label">' + A + ' questions</span>' + stepper('nSba', 1, 0, 150) + '</div><div class="field"><span class="label">' + K + ' questions</span>' + stepper('nCdp', 1, 0, 70) + '</div></div>';
  var cu = S.ui.code;
  var notice = S.log.current ? '<div class="callout small in-progress"><b>A paper is in progress.</b> Starting another one here will discard it. <button class="linkish" data-act="nav" data-to="paper">Resume it instead</button></div>' : '';
  var codeSec = '<div class="builder-sec"><h2>Use an existing paper</h2>' +
    (isRemote()
      ? '<p class="small muted">Got a share code? Enter it to sit the same questions, in the same order.</p>' +
        '<div class="pop-anchor"><div class="row code-row"><input class="input code-input" id="paperCode" data-input="code" value="' + esc(cu.val) + '" placeholder="K7M-2QX" maxlength="12" autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false" enterkeyhint="go" aria-label="Share code"' + (cu.busy ? ' disabled' : '') + '>' +
        '<button class="btn" data-act="code-go"' + (cu.busy ? ' disabled' : '') + '>' + (cu.busy ? 'Finding paper…' : 'Start this paper') + '</button></div>' + discardPop('code', '75%', true) + '</div>' +
        (cu.msg ? '<p class="small callout bad" role="alert">' + esc(cu.msg) + '</p>' : '')
      : '<p class="small muted">Share codes work once this device is connected to a profile. Right now it’s practising on its own.</p>') +
    '<p class="tiny muted">Starts a fresh paper built from another session, with that paper’s mode and timing. Nobody’s answers are copied. To get a code, tap the Share button at the top of a paper.</p></div>';
  return topbar('Build a paper', 'home') + '<main class="wrap narrow">' + notice + '<div class="card">' + codeSec +
    '<div class="builder-sec"><span class="eyebrow">Or build a new one</span><h2>Paper style</h2>' + seg('style', Object.keys(STYLES).map(function (k) { return [k, STYLES[k].label]; })) +
      '<p class="hint small muted">' + (b.style === 'racgp' ? 'Questions are labelled AKT and KFP, as in the RACGP papers.' : 'Questions are labelled SBA and CDP.') + ' The questions, timing and marking are the same in both.</p></div>' +
    '<div class="builder-sec"><h2>Length</h2>' + (b.useIds ? '<p class="hint small muted">Set by your list of questions.</p>' : seg('by', [['time', 'By time'], ['number', 'By number']]) + length) +
      '<div class="field"><span class="label">Pace</span>' + seg('pace', Object.keys(PACES).map(function (k) { return [k, PACES[k].label]; })) +
      '<span class="hint">' + esc(pace.note) + ': ' + fmtClock(pace.sba) + ' per ' + A + ', ' + fmtClock(pace.cdp) + ' per ' + K + '.</span></div></div>' +
    '<div class="builder-sec"><h2>Mode</h2>' + seg('mode', [['exam', 'Exam'], ['tutor', 'Tutor']]) +
      '<p class="hint small muted">' + (b.mode === 'exam' ? 'Timed. Answers and explanations appear when you finish the paper.' : 'Untimed. Check each answer as you go and see the explanation straight away.') + '</p></div>' +
    '<div class="builder-sec"><h2>Which questions</h2>' +
      '<div class="switch-row"><button class="switch" role="switch" aria-checked="' + !!b.useIds + '" aria-labelledby="idsLbl" data-act="ids-toggle"><span class="switch-knob"></span></button>' +
      '<span id="idsLbl"><b>Specific questions</b><span class="small muted">Build the paper from a list of question IDs</span></span></div>' +
      (b.useIds
        ? '<div class="field"><label for="qids">Question IDs</label><textarea class="input mono ids-input" id="qids" data-input="ids" rows="3" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="rr01-s01, cr02-c03">' + esc(b.ids || '') + '</textarea>' +
          '<span class="hint">Separate them with commas, spaces or new lines. The paper uses them in this order. A question\u2019s ID is shown after answering it.</span></div></div>'
        : '<p class="small muted">Leave a group empty to include everything. Within a group, any ticked choice counts.</p>' +
      '<div class="field"><span class="label">Topics</span><div class="chips">' + chipList('topics', S.topics) + '</div></div>' +
      '<div class="field"><span class="label">Based on your answers</span><div class="chips">' + statusChips + '</div>' +
      (b.status.indexOf('stale') !== -1 ? '<div class="row small" style="margin-top:6px"><span>Not seen for at least</span>' + seg('staleDays', [[14, '14 days'], [30, '30 days'], [60, '60 days'], [90, '90 days']]) + '</div>' : '') + '</div>' +
      (S.exams.length > 1 ? '<div class="field"><span class="label">Exam</span><div class="chips">' + chipList('exams', S.exams) + '</div></div>' : '') +
      (S.banks.length > 1 ? '<div class="field"><span class="label">Question banks</span><div class="chips">' + chipList('banks', S.banks, function (x) { return x.title; }) + '</div></div>' : '') +
      '<div class="field"><span class="label">Choose first</span>' + seg('priority', [['unseen', 'Unseen and wrong'], ['weak', 'Weakest topics'], ['random', 'Random']]) + '</div></div>') +
    '<div class="builder-sec"><div class="summary-box" id="buildSummary">' + builderSummary() + '</div>' +
      '<div class="pop-anchor"><div class="row"><button class="btn btn-ghost btn-sm" data-act="builder-reset">Reset choices</button><button class="btn btn-primary grow" data-act="build-go">Start paper</button></div>' + discardPop('build', '68%') + '</div></div>' +
    '<div class="builder-sec"><p class="tiny muted defs"><b>AKT</b> Applied Knowledge Test: single best answer, one mark each. ' +
      '<b>KFP</b> Key Feature Problem: choose the number of answers stated, with partial credit, double marks for critical answers and a penalty for choosing too many. ' +
      '<b>SBA</b> single best answer, the same format as AKT. <b>CDP</b> clinical decision problem, the same format as KFP.</p></div>' +
    '</div></main>';
};
function builderSummary() {
  var b = S.builder; var A = fmtName('sba', b.style), K = fmtName('cdp', b.style);
  if (b.useIds) {
    var r = parseIdList(b.ids); var s1 = r.found.filter(function (q) { return q.format === 'sba'; }).length, c1 = r.found.length - s1;
    return '<span class="eyebrow">Your paper</span><b>' + (r.found.length ? s1 + ' ' + A + ' + ' + c1 + ' ' + K + ' · ' + (b.mode === 'exam' ? fmtMins(s1 * PACES[b.pace].sba + c1 * PACES[b.pace].cdp) : 'untimed') : 'No questions yet') + '</b>' +
      '<span class="small muted">' + (r.found.length ? 'In the order listed.' : 'Type or paste question IDs above.') + '</span>' +
      (r.unknown.length ? '<span class="small" style="color:var(--bad)">Not found: <span class="mono">' + r.unknown.map(esc).join(', ') + '</span></span>' : '');
  }
  var want = plannedCounts(b); var list = pool(b);
  var haveS = list.filter(function (q) { return q.format === 'sba'; }).length, haveC = list.filter(function (q) { return q.format === 'cdp'; }).length;
  var gotS = Math.min(want.sba, haveS), gotC = Math.min(want.cdp, haveC);
  var secs = gotS * PACES[b.pace].sba + gotC * PACES[b.pace].cdp;
  var short = [];
  if (gotS < want.sba) short.push(haveS ? 'only ' + haveS + ' ' + A + ' match' : 'no ' + A + ' match');
  if (gotC < want.cdp) short.push(haveC ? 'only ' + haveC + ' ' + K + ' match' : 'no ' + K + ' match');
  return '<span class="eyebrow">Your paper</span><b>' + (gotS + gotC ? gotS + ' ' + A + ' + ' + gotC + ' ' + K + ' · ' + (b.mode === 'exam' ? fmtMins(secs) : 'untimed') : 'No questions match') + '</b>' +
    '<span class="small muted">' + list.length + ' questions match your choices (' + haveS + ' ' + A + ', ' + haveC + ' ' + K + ').' + (short.length ? ' Asked for ' + want.sba + ' ' + A + ' + ' + want.cdp + ' ' + K + ', but ' + short.join(' and ') + '.' : '') + '</span>';
}

/* ---------- question card (shared by paper, review and single question) ---------- */
function ulHTML(key, text, set) {
  var parts = String(text).split(/(\s+)/); var out = ''; var wi = 0;
  parts.forEach(function (p) {
    if (!p) return;
    if (/^\s+$/.test(p)) { out += p; return; }
    out += '<span class="w' + (set && set.indexOf(wi) !== -1 ? ' ul' : '') + '" data-w="' + wi + '">' + esc(p) + '</span>'; wi++;
  });
  return '<span class="ulz" data-ul="' + key + '">' + out + '</span>';
}
function qCard(q, c) {
  // c: { num, total, sel, ul, revealed, locked, attempt, editable }
  var ul = c.ul || {}; var sel = c.sel || [];
  var h = '<article class="card qcard" data-ul-scope="1" data-q="' + esc(q.id) + '">' +
    '<div class="q-meta"><span class="fmt-tag">' + (c.num ? 'Q' + c.num + (c.total ? ' of ' + c.total : '') + ' · ' : '') + fmtName(q.format, c.style) + '</span>' +
    '<button class="icon-btn" data-act="flag" aria-pressed="' + isFlagged(q.id) + '" aria-label="' + (isFlagged(q.id) ? 'Unflag question' : 'Flag question') + '" title="Flag to revisit">' + I.flag + '</button></div>';
  if (c.attempt && c.attempt.h && c.attempt.h !== q._hash) h += '<p class="callout warn edited">This question has been edited since you answered it, so your marked choices may not line up.</p>';
  h += '<div class="stem selectable">' + q.stem.map(function (p, i) { return '<p>' + ulHTML('s' + i, p, ul['s' + i]) + '</p>'; }).join('') + '</div>';
  h += imagesHTML(q, c.revealed);
  (q.tables || []).forEach(function (t, ti) {
    h += '<div class="tbl-wrap selectable"><table class="res">' + (t.caption ? '<caption>' + esc(t.caption) + '</caption>' : '') +
      '<thead><tr>' + t.head.map(function (x) { return '<th scope="col">' + esc(x) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      t.rows.map(function (r, ri) { return '<tr>' + r.map(function (cell, ci) { var k = 't' + ti + 'r' + ri + 'c' + ci; return '<td>' + ulHTML(k, cell, ul[k]) + '</td>'; }).join('') + '</tr>'; }).join('') +
      '</tbody></table></div>';
  });
  h += '<p class="lead selectable">' + ulHTML('lead', q.lead, ul.lead) + (q.format === 'cdp' ? '<span class="select-n">Select ' + q.select + '</span>' : '') + '</p>';
  h += '<ul class="opts" role="' + (q.format === 'sba' ? 'radiogroup' : 'group') + '" aria-label="Options">';
  q.options.forEach(function (o, i) {
    var checked = sel.indexOf(i) !== -1;
    var isKey = q.format === 'sba' ? o.correct === true : o.score > 0;
    var cls = 'opt';
    if (c.locked) cls += ' locked';
    if (c.revealed) { if (isKey) cls += ' is-key'; else if (checked) cls += ' is-wrong'; }
    var why = '';
    if (c.revealed) {
      var mk;
      if (q.format === 'sba') mk = isKey ? '<span class="mk k">✓ Correct</span>' : '<span class="mk x">✗</span>';
      else mk = o.score > 0 ? '<span class="mk k">✓ +' + o.score + (o.critical ? ' critical' : '') + '</span>' : '<span class="mk x">✗ 0</span>';
      why = '<span class="why">' + mk + esc(o.why) + '</span>';
    }
    h += '<li class="' + cls + '" role="' + (q.format === 'sba' ? 'radio' : 'checkbox') + '" aria-checked="' + checked + '"' +
      (c.locked ? ' aria-disabled="true"' : ' tabindex="0" data-act="pick" data-i="' + i + '"') + '>' +
      '<span class="bubble" aria-hidden="true">' + LETTERS[i] + '</span><span class="opt-text selectable">' + ulHTML('o' + i, o.text, ul['o' + i]) + why + '</span></li>';
  });
  h += '</ul>';
  if (q.format === 'cdp' && !c.revealed) {
    var n = sel.length;
    h += '<p class="count' + (n > q.select ? ' over' : '') + '" id="cdpCount">' + n + ' of ' + q.select + ' selected' + (n > q.select ? ' · extra choices lose marks' : '') + '</p>';
  }
  var hasUl = Object.keys(ul).some(function (k) { return ul[k] && ul[k].length; });
  h += '<div class="q-tools">' + (c.editable ? '<span>Select words, then tap <b>Underline</b>.</span>' + (hasUl ? '<button class="linkish" data-act="ul-clear">Clear underlines</button>' : '') : '') +
    (c.swipe ? '<span class="touch-only">Swipe left or right to change question.</span>' : '') + '</div>';
  if (c.revealed) h += revealBlock(q, sel, c);
  h += '</article>';
  return h;
}
/* ---------- images: files in bank/img/, credit always shown, caption and source after answering ---------- */
function creditHTML(text) { // plain text, with [link text](https://…) links as the licence asks
  var out = '', re = /\[([^\]]{1,120})\]\((https:\/\/[^\s)]{1,400})\)/g, last = 0, m;
  text = String(text || '');
  while ((m = re.exec(text))) { out += esc(text.slice(last, m.index)) + '<a href="' + esc(m[2]) + '" target="_blank" rel="noopener noreferrer">' + esc(m[1]) + '</a>'; last = re.lastIndex; }
  return out + esc(text.slice(last));
}
function imagesHTML(q, revealed) {
  if (!Array.isArray(q.images) || !q.images.length) return '';
  return '<div class="qimgs">' + q.images.map(function (im, i) {
    if (!im || typeof im.file !== 'string' || !/^[a-z0-9-]+\.(jpe?g|png|webp|svg)$/i.test(im.file)) return '';
    var src = 'bank/img/' + im.file, lic = esc(im.licence || '');
    if (im.licenceUrl && /^https:\/\//.test(im.licenceUrl)) lic = '<a href="' + esc(im.licenceUrl) + '" target="_blank" rel="noopener noreferrer">' + lic + '</a>';
    return '<figure class="qimg"><button type="button" class="qimg-open" data-act="img-zoom" data-src="' + esc(src) + '" data-alt="' + esc(im.alt || '') + '" aria-label="Enlarge image ' + (i + 1) + '">' +
      '<img src="' + esc(src) + '" alt="' + esc(im.alt || '') + '" loading="lazy" decoding="async"></button>' +
      '<figcaption><span class="credit">' + (im.credit ? creditHTML(im.credit) : '') + (lic ? ' · ' + lic : '') + '</span>' +
      (revealed && (im.caption || im.source) ? '<span class="cap">' + (im.caption ? esc(im.caption) : '') + (im.source && /^https:\/\//.test(im.source) ? (im.caption ? ' · ' : '') + '<a href="' + esc(im.source) + '" target="_blank" rel="noopener noreferrer">Image source</a>' : '') + '</span>' : '') +
      '</figcaption></figure>';
  }).join('') + '</div>';
}
// Full-screen view of an image. It sits outside the page, so the question underneath is untouched.
function openZoom(src, alt) {
  closeZoom();
  var layer = document.createElement('div'); layer.className = 'zoom-layer'; layer.setAttribute('role', 'dialog'); layer.setAttribute('aria-label', 'Enlarged image');
  layer.innerHTML = '<button type="button" class="icon-btn zoom-x" aria-label="Close">' + I.close + '</button><div class="zoom-scroll"><img alt="' + esc(alt) + '" src="' + esc(src) + '"></div><p class="zoom-hint">Tap the image to see it at full size. Tap outside it to close.</p>';
  layer.addEventListener('click', function (e) {
    var img = e.target.closest('.zoom-scroll img');
    if (img) { layer.classList.toggle('full'); return; }
    closeZoom();
  });
  document.body.appendChild(layer); S.ui.zoom = true; document.body.classList.add('zoom-open');
  layer.querySelector('.zoom-x').focus();
}
function closeZoom() {
  var l = document.querySelector('.zoom-layer'); if (l) l.remove();
  if (S.ui.zoom) { S.ui.zoom = false; document.body.classList.remove('zoom-open'); var b = app.querySelector('.qimg-open'); if (b) b.focus({ preventScroll: true }); }
}
function revealBlock(q, sel, c) {
  var r = scoreItem(q, sel);
  var line;
  if (!sel.length) line = '<span class="badge bad">Not answered</span>';
  else if (q.format === 'sba') line = r.frac >= 1 ? '<span class="badge good">Correct</span>' : '<span class="badge bad">Incorrect</span>';
  else line = '<span class="badge ' + (r.frac >= 0.999 ? 'good' : r.frac > 0 ? 'warn' : 'bad') + '">' + Math.round(r.frac * 100) + '%</span><span class="small muted mono">' + r.earned + ' of ' + r.max + (r.extra ? ' − ' + r.extra + ' over-selected' : '') + (r.critMissed ? ' · critical answer missed' : '') + '</span>';
  if (c.attempt && c.attempt.secs) line += '<span class="small muted mono">' + fmtClock(c.attempt.secs) + ' on this question</span>';
  var meta = [q.topics.join(', ')]; if (q.subtopic) meta.push(q.subtopic); if (q.source) meta.push(q.source); if (q.exams && q.exams.length) meta.push(q.exams.join(', '));
  var due = q._reviewBy && q._reviewBy < new Date().toISOString().slice(0, 10) ? ' · <b>content review overdue</b>' : '';
  var st = S.stats.get(q.id);
  var hist = st && st.n > 1 ? ' · answered ' + st.n + ' times, ' + st.wrong + ' not fully correct' : '';
  var note = S.log.notes[q.id];
  return '<div class="reveal"><div class="score-line">' + line + '</div>' +
    '<div class="keypoint"><b>Key point</b>' + esc(q.keyPoint) + '</div>' +
    '<p class="meta-line">' + meta.map(esc).join(' · ') + hist + due + ' · <span class="mono">' + esc(q.id) + '</span></p>' + refBlock(q) +
    '<div class="note-box"><label for="note">My note for this question</label><textarea class="input" id="note" data-note="' + esc(q.id) + '" placeholder="A mnemonic, a reminder, what tripped you up…">' + esc(note && note.text ? note.text : '') + '</textarea><span class="note-status" id="noteStatus">' + (note && note.text ? 'Saved ' + fmtDateTime(new Date(note.at).toISOString()) : '') + '</span></div></div>';
}

/* ---------- paper ---------- */
VIEWS.paper = function () {
  var p = S.log.current;
  if (!p) { setTimeout(function () { go('home', true); }, 0); return ''; }
  p.idx = clamp(p.idx, 0, p.items.length - 1);
  var it = p.items[p.idx]; var q = S.qs.get(it.q);
  var answered = p.items.filter(function (x) { return x.sel.length; }).length;
  var tutorShown = p.mode === 'tutor' && it.checked;
  var top = '<header class="topbar paperbar"><div class="wrap">' +
    '<button class="icon-btn" data-act="nav" data-to="home" aria-label="Leave paper (it stays saved)" title="Leave (saved)">' + I.back + '</button>' +
    '<span class="topbar-title">Question ' + (p.idx + 1) + ' of ' + p.items.length + '</span>' +
    '<div class="end"><span class="timer" id="timer" aria-label="Time">' + timerText(p) + '</span>' +
    (p.mode === 'exam' ? '<button class="icon-btn" data-act="pause" aria-label="Pause">' + I.pause + '</button>' : '') +
    '<button class="icon-btn" data-act="share-open" aria-label="Share this paper" title="Share this paper">' + I.share + '</button>' +
    '<button class="icon-btn" data-act="sheet" data-v="map" aria-label="All questions and finish" title="All questions">' + I.grid + '</button></div></div>' +
    '<div class="progress-line" aria-hidden="true"><span style="width:' + (answered / p.items.length * 100) + '%"></span></div></header>';
  var body = q ? qCard(q, { num: p.idx + 1, total: p.items.length, sel: it.sel, ul: it.ul, revealed: tutorShown, locked: tutorShown, editable: true, swipe: true, style: p.style || 'other' })
    : '<div class="card callout warn">This question has been removed from the bank. Skip it; it won’t be scored.</div>';
  var last = p.idx === p.items.length - 1;
  var mid = '';
  if (p.mode === 'tutor' && q && !it.checked) mid = '<button class="btn btn-primary" data-act="check"' + (it.sel.length ? '' : ' disabled') + '>Check answer</button>';
  else if (p.mode === 'exam') mid = '<span class="small muted mono">' + answered + '/' + p.items.length + ' answered</span>';
  var bottom = '<div class="bottombar"><div class="wrap"><button class="btn" data-act="move" data-d="-1"' + (p.idx === 0 ? ' disabled' : '') + ' aria-label="Previous question">' + I.back + '<span>Prev</span></button>' +
    '<div class="mid">' + mid + '</div>' +
    (last ? '<button class="btn btn-primary" data-act="sheet" data-v="finish">Finish</button>' : '<button class="btn" data-act="move" data-d="1" aria-label="Next question"><span>Next</span>' + I.next + '</button>') + '</div></div>';
  var sheet = S.ui.sheet === 'map' ? mapSheet(p) : S.ui.sheet === 'finish' ? finishSheet(p) : '';
  var cover = p.paused ? '<div class="paused-cover"><div class="stack" style="justify-items:center"><span class="eyebrow">Paused</span><h1>' + timerText(p) + '</h1><p class="muted">The question is hidden while the clock is stopped.</p><button class="btn btn-primary" data-act="pause">Resume</button></div></div>' : '';
  if (S.ui.share) cover += '<div class="paused-cover share-cover" role="dialog" aria-label="Share this paper"><div class="share-box"><span class="eyebrow">Share this paper</span>' + shareBody() +
    '<button class="btn btn-primary btn-block" data-act="share-close">Resume</button><p class="tiny muted">The question is hidden and the clock is stopped while this is open.</p></div></div>';
  // First time on this device: point out the Share and All questions buttons.
  S.ui.tip = !p.paused && !S.ui.sheet && !S.ui.share && !LS.get('bs.tip.paper', false);
  return top + '<main class="wrap narrow">' + body + '</main>' + bottom + '<div class="ul-float" id="ulFloat"><button class="btn btn-sm" data-act="ul-apply" id="ulBtn">Underline</button></div>' + sheet + cover + (S.ui.tip ? tipLayer() : '');
};
function timerText(p) {
  if (!p.limit) return fmtClock(p.elapsed);
  var left = p.limit - p.elapsed; return (left < 0 ? '+' : '') + fmtClock(left);
}
function timerClass(p) {
  if (!p.limit) return 'timer';
  var left = p.limit - p.elapsed; return 'timer' + (left < 0 ? ' over' : left <= Math.max(120, p.limit * 0.1) ? ' low' : '');
}
function mapSheet(p) {
  var cells = p.items.map(function (it, i) {
    var cls = 'map-cell';
    if (p.mode === 'tutor' && it.checked) { var q = S.qs.get(it.q); if (q) cls += ' ' + resultClass(scoreItem(q, it.sel).frac); }
    else if (it.sel.length) cls += ' done';
    if (i === p.idx) cls += ' cur';
    if (isFlagged(it.q)) cls += ' flag';
    return '<button class="' + cls + '" data-act="jump" data-i="' + i + '" aria-label="Question ' + (i + 1) + (it.sel.length ? ', answered' : ', not answered') + (isFlagged(it.q) ? ', flagged' : '') + '">' + (i + 1) + '</button>';
  }).join('');
  var un = p.items.filter(function (x) { return !x.sel.length; }).length;
  return '<div class="sheet-back" data-act="sheet-close"><div class="sheet" data-stop role="dialog" aria-label="All questions">' +
    '<div class="spread"><h2>All questions</h2><button class="icon-btn" data-act="sheet-close" aria-label="Close">' + I.close + '</button></div>' +
    '<p class="small muted">' + (p.items.length - un) + ' answered, ' + un + ' to go. Orange dots are flagged.</p><div class="map-grid">' + cells + '</div>' +
    '<div class="row"><button class="btn btn-ghost btn-danger btn-sm" data-act="discard-ask">Discard paper</button><button class="btn btn-primary grow" data-act="sheet" data-v="finish">Finish paper</button></div>' +
    (S.ui.armed === 'discard' ? '<div class="callout warn" style="margin-top:12px"><b>Discard this paper?</b> Nothing from it will be saved.<div class="row" style="margin-top:8px"><button class="btn btn-sm" data-act="disarm">Keep it</button><button class="btn btn-sm btn-danger" data-act="discard">Discard</button></div></div>' : '') +
    '</div></div>';
}
function finishSheet(p) {
  var un = p.items.filter(function (x) { return !x.sel.length; }).length;
  var fl = p.items.filter(function (x) { return isFlagged(x.q); }).length;
  return '<div class="sheet-back" data-act="sheet-close"><div class="sheet" data-stop role="dialog" aria-label="Finish paper"><div class="stack">' +
    '<h2>Finish and mark this paper?</h2>' +
    '<p>' + (un ? '<b>' + un + ' question' + (un > 1 ? 's are' : ' is') + ' unanswered</b> and will score zero. ' : 'Every question has an answer. ') + (fl ? fl + ' flagged.' : '') + '</p>' +
    '<div class="row"><button class="btn grow" data-act="sheet-close">Keep going</button><button class="btn btn-primary grow" data-act="finish">Finish and mark</button></div></div></div></div>';
}

/* ---------- results ---------- */
VIEWS.results = function (v) {
  var p = S.log.papers.find(function (x) { return x.id === v.pid; });
  if (!p) return topbar('Results', 'home') + '<main class="wrap narrow"><div class="card empty">This paper wasn’t found on this profile.</div></main>';
  var atts = paperAttempts(p);
  var ringColour = p.pct >= 75 ? 'var(--good-bar)' : p.pct >= 50 ? 'var(--warn-bar)' : 'var(--bad-bar)';
  var lines = [];
  if (p.sbaN) lines.push('<b class="mono">' + p.sbaOk + '/' + p.sbaN + '</b> ' + fmtName('sba', p.style) + ' correct');
  if (p.cdpN) lines.push('<b class="mono">' + p.cdpScore.toFixed(2) + '/' + p.cdpN + '</b> ' + fmtName('cdp', p.style) + ' items (partial credit)');
  lines.push((p.limit ? 'Time <b class="mono">' + fmtClock(p.elapsed) + '</b> of ' + fmtClock(p.limit) : 'Took <b class="mono">' + fmtClock(p.elapsed) + '</b>') + ' · ' + (p.mode === 'exam' ? 'Exam mode' : 'Tutor mode'));
  var wrong = atts.filter(function (a) { return a.frac < 0.999 && S.qs.has(a.q); });
  var cells = atts.map(function (a, i) {
    return '<button class="map-cell ' + resultClass(a.frac) + (isFlagged(a.q) ? ' flag' : '') + '" data-act="nav" data-to="review-' + esc(p.id) + '-' + (i + 1) + '" aria-label="Question ' + (i + 1) + ', ' + (a.frac >= 0.999 ? 'correct' : a.frac > 0 ? 'partly correct' : 'incorrect') + '">' + (i + 1) + '</button>';
  }).join('');
  return topbar('Results', 'home') + '<main class="wrap narrow"><div class="stack-lg">' +
    '<div class="card score-hero"><div class="ring" style="--p:' + clamp(p.pct, 0, 100) + ';--ring:' + ringColour + '"><b>' + Math.round(p.pct) + '%</b></div>' +
    '<div class="stack"><span class="eyebrow">' + fmtDateTime(p.finishedAt) + '</span><h1>' + esc(p.label || 'Practice paper') + '</h1><p class="small">' + lines.join('<br>') + '</p></div></div>' +
    '<div class="card"><div class="card-head"><h2>Questions</h2><span class="eyebrow">Tap one to review</span></div><div class="map-grid">' + cells + '</div>' +
    '<div class="legend"><span><i style="background:var(--good-bar)"></i>Correct</span><span><i style="background:var(--warn-bar)"></i>Partly correct</span><span><i style="background:var(--bad-bar)"></i>Incorrect</span></div></div>' +
    '<div class="pop-anchor"><div class="row"><button class="btn btn-primary grow" data-act="nav" data-to="review-' + esc(p.id) + '-1">Review answers</button>' +
    '<button class="btn grow" data-act="retry-wrong" data-v="' + esc(p.id) + '"' + (wrong.length ? '' : ' disabled') + '>Redo the ' + wrong.length + ' I missed</button></div>' + discardPop('retry', '75%') + '</div>' +
    (S.ui.share ? '<div class="card share-box"><div class="spread"><span class="eyebrow">Share this paper</span><button class="icon-btn" data-act="share-close" aria-label="Close">' + I.close + '</button></div>' + shareBody() + '</div>'
      : (p.qids && p.qids.length ? '<button class="btn" data-act="share-open">' + I.share + '<span>Share this paper</span></button>' : '')) +
    '<button class="btn btn-ghost" data-act="nav" data-to="home">Back to home</button></div></main>';
};
function paperAttempts(p) {
  var byQ = {};
  S.log.attempts.forEach(function (a) { if (a.paper === p.id) byQ[a.q] = a; });
  return (p.qids || []).map(function (qid) { return byQ[qid]; }).filter(Boolean);
}

/* ---------- review ---------- */
VIEWS.review = function (v) {
  var p = S.log.papers.find(function (x) { return x.id === v.pid; });
  if (!p) return topbar('Review', 'home') + '<main class="wrap narrow"><div class="card empty">This paper wasn’t found.</div></main>';
  var atts = paperAttempts(p); var n = clamp(v.n, 0, atts.length - 1); var a = atts[n]; var q = a && S.qs.get(a.q);
  var body = q ? qCard(q, { num: n + 1, total: atts.length, sel: a.sel, ul: a.ul, revealed: true, locked: true, attempt: a, editable: true, swipe: true, style: p.style || 'other' })
    : '<div class="card callout warn">This question is no longer in the bank.</div>';
  var bottom = '<div class="bottombar"><div class="wrap">' +
    '<button class="btn" data-act="nav" data-slide="-1" data-to="review-' + esc(p.id) + '-' + n + '"' + (n === 0 ? ' disabled' : '') + ' aria-label="Previous question">' + I.back + '<span>Prev</span></button>' +
    '<div class="mid"><button class="btn btn-ghost btn-sm" data-act="nav" data-to="results-' + esc(p.id) + '">Results</button></div>' +
    (n < atts.length - 1 ? '<button class="btn" data-act="nav" data-slide="1" data-to="review-' + esc(p.id) + '-' + (n + 2) + '" aria-label="Next question"><span>Next</span>' + I.next + '</button>' : '<button class="btn btn-primary" data-act="nav" data-to="results-' + esc(p.id) + '">Done</button>') + '</div></div>';
  return topbar('Review · ' + (n + 1) + ' of ' + atts.length, 'results-' + p.id) + '<main class="wrap narrow">' + body + '</main>' + bottom +
    '<div class="ul-float" id="ulFloat"><button class="btn btn-sm" data-act="ul-apply" id="ulBtn">Underline</button></div>';
};

/* ---------- single question (from notes or flags) ---------- */
VIEWS.question = function (v) {
  var q = S.qs.get(v.qid);
  if (!q) return topbar('Question', 'notes') + '<main class="wrap narrow"><div class="card empty">This question is no longer in the bank.</div></main>';
  var s = S.stats.get(q.id); var a = s && s.last;
  var body = qCard(q, { sel: a ? a.sel : [], ul: a ? a.ul : {}, revealed: true, locked: true, attempt: a, editable: !!a, style: S.builder.style });
  var lastLine = a ? '<p class="small muted" style="margin-bottom:10px">Showing your latest attempt (' + fmtDate(a.at) + ').</p>' : '<p class="small muted" style="margin-bottom:10px">You haven’t finished a paper with this question yet.</p>';
  return topbar('Question', 'notes') + '<main class="wrap narrow">' + lastLine + body + '</main>' +
    '<div class="ul-float" id="ulFloat"><button class="btn btn-sm" data-act="ul-apply" id="ulBtn">Underline</button></div>';
};

/* ---------- history ---------- */
VIEWS.history = function () {
  var ps = S.log.papers.slice().reverse();
  return topbar('All papers', 'home') + '<main class="wrap narrow"><div class="card">' +
    (ps.length ? '<div class="list">' + ps.map(paperRow).join('') + '</div>' : '<p class="empty">No finished papers yet.</p>') + '</div></main>';
};

/* ---------- notes and flags ---------- */
VIEWS.notes = function () {
  var notes = Object.keys(S.log.notes).filter(function (k) { return S.log.notes[k] && S.log.notes[k].text && S.qs.has(k); })
    .sort(function (a, b) { return S.log.notes[b].at - S.log.notes[a].at; });
  var flags = S.qList.filter(function (q) { return isFlagged(q.id); });
  function row(q, sub) {
    return '<button class="list-row press" data-act="nav" data-to="question-' + esc(q.id) + '"><span class="main"><b>' + esc(q.subtopic || q.topics[0]) + '</b><span>' + esc(sub) + '</span></span>' + I.next.replace('<svg', '<svg width="18" height="18"') + '</button>';
  }
  return topbar('Notes and flags', 'home') + '<main class="wrap narrow"><div class="stack-lg">' +
    '<div class="card"><div class="card-head"><h2>My notes</h2><span class="eyebrow">' + notes.length + '</span></div>' +
    (notes.length ? '<div class="list">' + notes.map(function (k) { var t = S.log.notes[k].text; return row(S.qs.get(k), t.length > 110 ? t.slice(0, 110) + '…' : t); }).join('') + '</div>' : '<p class="empty">Notes you add after seeing an answer appear here.</p>') + '</div>' +
    '<div class="card"><div class="card-head"><h2>Flagged</h2><span class="eyebrow">' + flags.length + '</span></div>' +
    (flags.length ? '<div class="list">' + flags.map(function (q) { return row(q, q.lead.length > 110 ? q.lead.slice(0, 110) + '…' : q.lead); }).join('') + '</div>' +
      '<button class="btn btn-block" style="margin-top:12px" data-act="quick" data-k="flagged">Make a paper of flagged questions</button>' : '<p class="empty">Flag a question with the flag button to come back to it.</p>') + '</div></div></main>';
};

/* ---------- settings ---------- */
VIEWS.prefs = function () {
  var p = activeProfile(); var c = themeChoice(); var others = Object.keys(S.profiles.list);
  var profileCard = '<div class="card stack"><div class="card-head" style="margin:0"><h2>' + esc(p.name) + '</h2><span class="eyebrow">Active profile</span></div>' +
    (p.local
      ? '<p class="small">Answers are saved on this device only. To keep them in sync across devices, add a profile below.</p>'
      : '<p class="small">Saving to <span class="mono">' + esc(p.owner + '/' + p.repo) + '</span>, file <span class="mono">logs/' + esc(p.user) + '.json</span>.</p>' +
        '<p class="small" id="syncLine">' + esc(syncLabel()) + '</p>' +
        '<div class="row"><button class="btn btn-sm" data-act="sync-now">Sync now</button><button class="btn btn-sm' + (S.ui.focusLink && !S.ui.setupLink ? ' spotlight' : '') + '" data-act="show-link" id="setupLinkBtn">' + (S.ui.setupLink ? 'Hide setup link' : 'Setup link for another device') + (S.ui.focusLink && !S.ui.setupLink ? '<span class="tap-tip" aria-hidden="true">Tap here</span>' : '') + '</button></div>' +
        (S.ui.setupLink ? '<p class="small">To continue your papers and see your results on another device, set up your profile there too. Copy the setup link below, then open it on the other device, or paste it into Bubblesheet there.</p><div class="callout warn small"><b>Treat this link like a password.</b> Anyone who has it can read and change this profile’s answers. Send it only to this profile’s owner, or open it on your own device to troubleshoot.</div><div class="codebox" id="setupLinkBox">' + esc(setupLink(p)) + '</div><button class="btn btn-sm" data-act="copy-link">Copy link</button>' : '')) + '</div>';
  var themeCard = '<div class="card stack"><h2>Appearance</h2><div class="seg" role="group">' +
    [['system', 'Follow device'], ['day', 'Day'], ['night', 'Night']].map(function (o) { return '<button data-act="theme-set" data-v="' + o[0] + '" aria-pressed="' + (c === o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div>' +
    '<div class="field"><span class="label">Question text size</span><div class="seg" role="group" aria-label="Question text size">' +
    [['small', 'Smaller'], ['default', 'Default'], ['large', 'Larger'], ['xlarge', 'Largest']].map(function (o) { return '<button data-act="text-set" data-v="' + o[0] + '" aria-pressed="' + (textChoice() === o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div>' +
    '<p class="tiny muted">Applies to question stems, options, tables and explanations on this device.</p></div>' +
    (fsAvailable() ? '<div class="field"><span class="label">Full screen outside the dashboard and Settings</span><div class="seg" role="group" aria-label="Full screen">' +
      [['on', 'On'], ['off', 'Off']].map(function (o) { var on = LS.get('bs.fullscreen', true); return '<button data-act="fs-set" data-v="' + o[0] + '" aria-pressed="' + ((o[0] === 'on') === !!on) + '">' + o[1] + '</button>'; }).join('') + '</div>' +
      '<p class="tiny muted">Hides the browser’s bars while you build, sit and review papers. Swipe in from the top or bottom edge to see them.</p></div>'
      : (!isStandalone() && deviceKind() === 'ios' ? '<p class="tiny muted">Safari on iPhone can’t hide its bars for a web page. Add the app icon to use Bubblesheet full screen.</p>' : '')) +
    (isStandalone() ? '' : '<button class="btn btn-sm" data-act="show-install">How to add an app icon</button>') + '</div>';
  var rows = [{ pid: 'local', name: 'This device', local: true }].concat(others.map(function (k) { return S.profiles.list[k]; }));
  var profilesCard = '<div class="card stack"><h2>Profiles on this device</h2><div class="list">' + rows.map(function (r) {
    var active = r.pid === p.pid;
    return '<div class="list-row"><span class="main"><b>' + esc(r.name) + '</b><span>' + (r.local ? 'Not synced' : esc(r.owner + '/' + r.repo + ' · ' + r.user)) + '</span></span>' +
      (active ? '<span class="badge neutral">In use</span>' : '<button class="btn btn-sm" data-act="switch" data-v="' + esc(r.pid) + '">Use</button>') +
      (!r.local && !active ? (S.ui.armed === 'rm:' + r.pid ? '<button class="btn btn-sm btn-danger" data-act="remove" data-v="' + esc(r.pid) + '">Confirm remove</button>' : '<button class="btn btn-sm btn-ghost btn-danger" data-act="arm" data-v="rm:' + esc(r.pid) + '">Remove</button>') : '') + '</div>';
  }).join('') + '</div><p class="tiny muted">Removing a profile only forgets it on this device. Its answers stay on GitHub.</p></div>';
  var addCard = '<div class="card stack"><h2>Add a profile</h2>' +
    '<div class="field"><label for="pasteSetup2">Paste a setup link</label><input class="input" id="pasteSetup2" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="https://…#setup=…"></div>' +
    '<div class="row">' + (canReadClipboard() ? '<button class="btn" data-act="paste-clip" data-src="pasteSetup2">Paste my setup link</button>' : '') + '<button class="btn" data-act="paste-setup" data-src="pasteSetup2">Add from link</button></div><p class="small" id="pasteMsg"></p>' +
    '<details class="help"' + (S.ui.setupMsg ? ' open' : '') + '><summary>Create a new profile (for whoever manages the GitHub side)</summary><div class="stack">' +
    '<p class="small muted">Needs a private GitHub repository and a fine-grained access token with Contents: Read and write on that repository only. See SETUP.md.</p>' +
    field('nOwner', 'GitHub account that owns the answers repository', 'text') + field('nRepo', 'Answers repository name', 'text') +
    field('nUser', 'Profile ID (lowercase, no names, e.g. p1)', 'text') + field('nName', 'Display name (shown only on devices)', 'text') + field('nToken', 'Fine-grained access token', 'password') +
    '<button class="btn btn-primary" data-act="create-profile">Test and save</button>' +
    (S.ui.setupMsg ? '<div class="callout ' + (S.ui.setupMsg.ok ? 'good' : 'bad') + ' small">' + esc(S.ui.setupMsg.text) + '</div>' : '') + '</div></details></div>';
  var dataCard = '<div class="card stack"><h2>Data</h2>' +
    '<p class="small">' + S.log.attempts.length + ' answers, ' + S.log.papers.length + ' papers, ' + Object.keys(S.log.notes).filter(function (k) { return S.log.notes[k] && S.log.notes[k].text; }).length + ' notes on this profile.</p>' +
    (isRemote() ? '<p class="small muted">Private references: ' + (S.refsInfo.n ? S.refsInfo.n + (S.refsInfo.n === 1 ? ' question' : ' questions') + ' from ' + S.refsInfo.files + (S.refsInfo.files === 1 ? ' file' : ' files') : 'none yet') + ' in the <span class="mono">refs</span> folder of the answers repository. <button class="linkish" data-act="refs-refresh">Check now</button></p>' : '') +
    '<button class="btn btn-sm" data-act="download">Download my answers (JSON)</button>' +
    '<p class="small muted">Question banks: ' + S.banks.map(function (b) { return esc(b.title) + ' (' + b.count + ')'; }).join('; ') + '.</p>' +
    (S.bankErrors.length ? '<div class="callout warn small">' + S.bankErrors.map(esc).join('<br>') + '</div>' : '') +
    '<p class="tiny muted">Bubblesheet ' + APP_VERSION + '</p></div>';
  return topbar('Settings', 'home') + '<main class="wrap narrow"><div class="stack-lg">' + profileCard + themeCard + profilesCard + addCard + dataCard + '</div></main>';
};
function field(id, label, type) {
  return '<div class="field"><label for="' + id + '">' + label + '</label><input class="input" id="' + id + '" type="' + type + '" autocomplete="off" autocapitalize="off" spellcheck="false"></div>';
}

/* =========================================================== UNDERLINING */
function ulTarget() {
  var v = S.view;
  if (v.name === 'paper' && S.log.current) return { kind: 'item', obj: S.log.current.items[S.log.current.idx] };
  if (v.name === 'review') {
    var p = S.log.papers.find(function (x) { return x.id === v.pid; }); if (!p) return null;
    var atts = paperAttempts(p); var a = atts[clamp(v.n, 0, atts.length - 1)]; return a ? { kind: 'attempt', obj: a } : null;
  }
  if (v.name === 'question') { var s = S.stats.get(v.qid); return s && s.last ? { kind: 'attempt', obj: s.last } : null; }
  return null;
}
function selectionWords() {
  var sel = window.getSelection(); var card = app.querySelector('[data-ul-scope]');
  if (!card || !sel || sel.isCollapsed || !sel.rangeCount) return null;
  var range = sel.getRangeAt(0);
  if (!card.contains(range.commonAncestorContainer)) return null;
  var words = [];
  card.querySelectorAll('.w').forEach(function (w) {
    if (!range.intersectsNode(w)) return;
    if (w.contains(range.endContainer) && range.endOffset === 0 && range.endContainer !== range.startContainer) return;
    if (w.contains(range.startContainer) && range.startContainer.nodeType === 3 && range.startOffset >= range.startContainer.length) return;
    var z = w.closest('.ulz'); if (z) words.push([z.getAttribute('data-ul'), +w.getAttribute('data-w')]);
  });
  return words.length ? words : null;
}
var onSelection = debounce(function () {
  if (!ulTarget()) return;
  var words = selectionWords();
  if (words) S.ui.ulPending = { at: Date.now(), words: words };
  updateUlFloat();
}, 120);
function pendingWords() {
  var p = S.ui.ulPending; if (!p) return null;
  var live = window.getSelection && !window.getSelection().isCollapsed;
  if (!live && Date.now() - p.at > 5000) { S.ui.ulPending = null; return null; }
  return p.words;
}
function updateUlFloat() {
  var f = document.getElementById('ulFloat'); if (!f) return;
  var words = pendingWords(); var t = ulTarget();
  if (!words || !t) { f.classList.remove('show'); return; }
  var ul = t.obj.ul || {};
  var all = words.every(function (w) { return ul[w[0]] && ul[w[0]].indexOf(w[1]) !== -1; });
  document.getElementById('ulBtn').textContent = all ? 'Remove underline' : 'Underline';
  f.classList.add('show');
  clearTimeout(updateUlFloat.t); updateUlFloat.t = setTimeout(updateUlFloat, 5200);
}
function saveUl(t) {
  if (t.kind === 'item') touch('paper', 8000);
  else { t.obj.ulAt = Date.now(); touch('ul', 3000); }
}
function applyUnderline() {
  var words = pendingWords(); var t = ulTarget(); if (!words || !t) return;
  var ul = t.obj.ul || (t.obj.ul = {});
  var all = words.every(function (w) { return ul[w[0]] && ul[w[0]].indexOf(w[1]) !== -1; });
  words.forEach(function (w) {
    var arr = ul[w[0]] || (ul[w[0]] = []); var i = arr.indexOf(w[1]);
    if (all) { if (i !== -1) arr.splice(i, 1); } else if (i === -1) arr.push(w[1]);
  });
  Object.keys(ul).forEach(function (k) { if (!ul[k].length) delete ul[k]; else ul[k].sort(function (a, b) { return a - b; }); });
  S.ui.ulPending = null; try { window.getSelection().removeAllRanges(); } catch (e) {}
  saveUl(t); rerender();
}
function clearUnderlines() {
  var t = ulTarget(); if (!t) return; t.obj.ul = {}; saveUl(t); rerender(); toast('Underlines cleared');
}

/* =========================================================== ACTIONS */
function selectionInside(el) {
  var s = window.getSelection(); return !!(s && !s.isCollapsed && s.anchorNode && el.contains(s.anchorNode));
}
function pick(i, el) {
  var p = S.log.current; if (!p || S.view.name !== 'paper') return;
  var it = p.items[p.idx]; var q = S.qs.get(it.q); if (!q || (p.mode === 'tutor' && it.checked)) return;
  if (q.format === 'sba') it.sel = [i];
  else { var k = it.sel.indexOf(i); if (k === -1) it.sel.push(i); else it.sel.splice(k, 1); it.sel.sort(function (a, b) { return a - b; }); }
  app.querySelectorAll('.opt').forEach(function (li) { var j = +li.getAttribute('data-i'); li.setAttribute('aria-checked', String(it.sel.indexOf(j) !== -1)); });
  var c = document.getElementById('cdpCount');
  if (c) { var n = it.sel.length; c.className = 'count' + (n > q.select ? ' over' : ''); c.textContent = n + ' of ' + q.select + ' selected' + (n > q.select ? ' · extra choices lose marks' : ''); }
  var chk = app.querySelector('[data-act="check"]'); if (chk) chk.disabled = !it.sel.length;
  var answered = p.items.filter(function (x) { return x.sel.length; }).length;
  var bar = app.querySelector('.progress-line span'); if (bar) bar.style.width = (answered / p.items.length * 100) + '%';
  var mid = app.querySelector('.bottombar .mid .mono'); if (mid) mid.textContent = answered + '/' + p.items.length + ' answered';
  touch('paper', 8000);
}
function quick(kind, val) {
  var b = Object.assign({}, DEFAULT_BUILDER, { status: [], topics: [], exams: [], banks: [], style: S.builder.style });
  if (kind === 'quick15') { b.minutes = 15; buildFromBuilder(b); return; }
  if (kind === 'mistakes') { b.status = ['incorrect', 'partial']; b.by = 'number'; b.mode = 'tutor'; b.nSba = 150; b.nCdp = 70; }
  if (kind === 'flagged') { b.status = ['flagged']; b.by = 'number'; b.mode = 'tutor'; b.nSba = 150; b.nCdp = 70; }
  if (kind === 'stale') { S.builder = Object.assign({}, S.builder, { status: ['stale'], staleDays: 30 }); saveBuilder(); go('build'); return; }
  if (kind === 'topic') { S.builder = Object.assign({}, S.builder, { topics: [val], status: [] }); saveBuilder(); go('build'); return; }
  var list = pool(b);
  if (!list.length) { toast('Nothing to include yet'); return; }
  var qs = shuffle(list.filter(function (q) { return q.format === 'sba'; })).concat(shuffle(list.filter(function (q) { return q.format === 'cdp'; })));
  createPaper(qs.slice(0, 40), b.mode, 'working', kind === 'mistakes' ? 'Redo mistakes' : 'Flagged questions', b.style);
}
function retryWrong(pid) {
  var p = S.log.papers.find(function (x) { return x.id === pid; }); if (!p) return;
  var qs = paperAttempts(p).filter(function (a) { return a.frac < 0.999; }).map(function (a) { return S.qs.get(a.q); }).filter(Boolean);
  if (qs.length) createPaper(qs, 'tutor', p.pace || 'working', 'Redo: ' + (p.label || 'paper'), p.style || S.builder.style);
}
function downloadData() {
  var blob = new Blob([JSON.stringify(S.log, null, 1)], { type: 'application/json' });
  var a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'bubblesheet-' + (activeProfile().user || 'local') + '-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
function switchProfile(pid) {
  S.profiles.active = pid; saveProfiles(); loadLog(); S.ui.setupLink = null; rerender(); syncNow(); syncRefs();
  toast('Using ' + activeProfile().name);
}
async function createProfileFromForm() {
  function val(id) { var el = document.getElementById(id); return el ? el.value : ''; }
  var p;
  try { p = makeProfile(val('nOwner'), val('nRepo'), val('nUser'), val('nName'), val('nToken')); }
  catch (e) { S.ui.setupMsg = { ok: false, text: e.message }; rerender(); return; }
  S.ui.setupMsg = { ok: true, text: 'Checking with GitHub…' }; rerender();
  try {
    var res = await gh(p, 'GET', '');
    if (!res.ok) throw await classify(res);
    var repo = await res.json();
    if (repo && repo.private === false) throw SyncError('public', 'That repository is public. Answer logs must go in a private repository.');
    if (repo && repo.permissions && repo.permissions.push === false) throw SyncError('auth', 'The token can read this repository but can’t write to it. Give it Contents: Read and write.');
    addProfile(p);
    await syncNow(); // creates logs/<id>.json, which proves the token can write
    if (S.meta.err) throw SyncError(S.meta.err.kind, S.meta.err.msg + ' The profile was added; fix the token and tap Sync now.');
    S.ui.setupMsg = { ok: true, text: 'Connected and saved a test file. ' + p.name + ' is now the active profile. Use “Setup link for another device” above to connect other devices.' };
    S.ui.setupLink = true;
    rerender();
  } catch (e) { S.ui.setupMsg = { ok: false, text: e.message }; rerender(); }
}
function pasteSetup(srcId) {
  var el = document.getElementById(srcId); var msg = document.getElementById('pasteMsg');
  try {
    var p = parseSetup(el ? el.value : '');
    addProfile(p); markLinkSeen(p); syncNow(); toast('Connected as ' + p.name);
    go('home', true);
  } catch (e) { if (msg) { msg.textContent = e.message; msg.className = 'small callout bad'; } }
}

function stepQuestion(d) {
  var v = S.view;
  if (v.name === 'paper') {
    var p = S.log.current; if (!p || p.paused || S.ui.sheet || S.ui.share || S.ui.tip || S.ui.zoom) return;
    var to = p.idx + d;
    if (to < 0) return;
    if (to >= p.items.length) { toast('Last question. Tap Finish when you’re ready.'); return; }
    p.idx = to; S.log.currentAt = Date.now(); saveLocal(); S.ui.slide = d; render(true);
  } else if (v.name === 'review') {
    var pp = S.log.papers.find(function (x) { return x.id === v.pid; }); if (!pp) return;
    var to2 = v.n + d; if (to2 < 0 || to2 >= paperAttempts(pp).length) return;
    S.ui.slide = d; go('review-' + pp.id + '-' + (to2 + 1));
  }
}
// Swipe left or right on a question to move between questions (phones and tablets).
// Ignored near the screen edges (kept for the browser's own back gesture), on tables wide enough
// to scroll sideways, in text boxes, while text is being selected, and for slow or mostly vertical drags.
var swipe = null;
app.addEventListener('touchstart', function (e) {
  swipe = null;
  if (e.touches.length !== 1 || (S.view.name !== 'paper' && S.view.name !== 'review') || S.ui.sheet) return;
  var t = e.touches[0];
  if (t.clientX < 24 || t.clientX > window.innerWidth - 24) return;
  if (e.target.closest('textarea, input, .bottombar, .topbar, .sheet-back, .paused-cover, .ul-float, .tip-layer')) return;
  var tw = e.target.closest('.tbl-wrap'); if (tw && tw.scrollWidth > tw.clientWidth + 2) return; // a wide table scrolls instead
  swipe = { x: t.clientX, y: t.clientY, t: Date.now() };
}, { passive: true });
app.addEventListener('touchcancel', function () { swipe = null; }, { passive: true });
app.addEventListener('touchend', function (e) {
  var s = swipe; swipe = null;
  if (!s || e.touches.length) return;
  var t = e.changedTouches[0]; var dx = t.clientX - s.x, dy = t.clientY - s.y;
  if (Date.now() - s.t > 700 || Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.8) return;
  var sel = window.getSelection(); if (sel && !sel.isCollapsed) return;
  stepQuestion(dx < 0 ? 1 : -1);
}, { passive: true });

var ACT = {
  nav: function (el) { var sl = el.getAttribute('data-slide'); if (sl) S.ui.slide = +sl; go(el.getAttribute('data-to')); },
  theme: cycleTheme,
  'theme-set': function (el) { LS.set('bs.theme', el.getAttribute('data-v')); applyTheme(); rerender(); },
  set: function (el) {
    var k = el.getAttribute('data-k'), v = el.getAttribute('data-v');
    S.builder[k] = /^\d+$/.test(v) ? +v : v; saveBuilder(); rerender();
  },
  step: function (el) {
    var k = el.getAttribute('data-k'); var d = +el.getAttribute('data-d');
    S.builder[k] = clamp((+S.builder[k] || 0) + d, +el.getAttribute('data-min'), +el.getAttribute('data-max'));
    saveBuilder(); var o = document.getElementById('out-' + k); if (o) o.textContent = S.builder[k] + (k === 'minutes' ? ' min' : '');
    var s = document.getElementById('buildSummary'); if (s) s.innerHTML = builderSummary();
  },
  toggle: function (el) {
    var k = el.getAttribute('data-k'), v = el.getAttribute('data-v'); var arr = S.builder[k]; var i = arr.indexOf(v);
    if (i === -1) arr.push(v); else arr.splice(i, 1); saveBuilder(); rerender();
  },
  'img-zoom': function (el) { openZoom(el.getAttribute('data-src'), el.getAttribute('data-alt') || ''); },
  'ids-toggle': function () { S.builder.useIds = !S.builder.useIds; saveBuilder(); rerender(); if (S.builder.useIds) { var t = document.getElementById('qids'); if (t && !t.value) t.focus(); } },
  'builder-reset': function () { S.builder = JSON.parse(JSON.stringify(DEFAULT_BUILDER)); saveBuilder(); rerender(); },
  'build-go': function () { guardNewPaper('build', function () { buildFromBuilder(); }); },
  quick: function (el) {
    var k = el.getAttribute('data-k'), v = el.getAttribute('data-v');
    if (k === 'stale' || k === 'topic') { quick(k, v); return; } // these open the builder; nothing is discarded yet
    guardNewPaper('quick-' + k, function () { quick(k, v); });
  },
  'confirm-yes': function () { var c = S.ui.confirm; S.ui.confirm = null; rerender(); if (c) c.run(); },
  'confirm-no': function () { S.ui.confirm = null; rerender(); },
  'code-go': function () {
    var cu = S.ui.code; if (cu.busy) return;
    if (!validCode(normCode(cu.val))) { cu.msg = 'A share code is 6 letters and numbers, like K7M-2QX. Check it and try again.'; rerender(); return; }
    if (!S.bankLoaded) { cu.msg = 'The questions are still loading. Try again in a moment.'; rerender(); return; }
    cu.msg = null; guardNewPaper('code', useCode);
  },
  'share-open': function () { openShare(); },
  'refs-refresh': function () { toast('Checking for private references…'); syncRefs(true).then(function () { toast(S.refsInfo.n ? 'Private references: ' + S.refsInfo.n + ' questions' : 'No private references found'); rerender(); }); },
  'share-close': function () { S.ui.share = null; rerender(); },
  'share-copy': function () { if (S.ui.share && S.ui.share.code) copyText(fmtCode(S.ui.share.code), document.getElementById('shareCode')); },
  'share-send': function () {
    if (!S.ui.share || !S.ui.share.code) return;
    navigator.share({ text: 'Bubblesheet paper code: ' + fmtCode(S.ui.share.code) + '. In Bubblesheet, tap Build a paper, then enter it under Use an existing paper.' }).catch(function () {});
  },
  'tip-stay': function () { /* a tap on the tip box itself keeps it open */ },
  'tip-close': function () { LS.set('bs.tip.paper', true); S.ui.tip = false; rerender(); },
  pick: function (el, e) { if (selectionInside(el)) return; pick(+el.getAttribute('data-i'), el); },
  move: function (el) { stepQuestion(+el.getAttribute('data-d')); },
  jump: function (el) { var p = S.log.current; p.idx = +el.getAttribute('data-i'); S.ui.sheet = null; S.ui.armed = null; S.log.currentAt = Date.now(); saveLocal(); render(true); },
  check: function () {
    var p = S.log.current; var it = p.items[p.idx]; if (!it.sel.length) return;
    it.checked = true; touch('paper', 4000); rerender();
    var r = app.querySelector('.reveal'); if (r) r.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },
  sheet: function (el) { S.ui.sheet = el.getAttribute('data-v'); S.ui.armed = null; rerender(); },
  'sheet-close': function (el, e) { if (e && e.target.closest('[data-stop]') && !e.target.closest('button')) return; S.ui.sheet = null; S.ui.armed = null; rerender(); },
  finish: finishPaper,
  pause: function () { var p = S.log.current; if (!p) return; p.paused = !p.paused; touch('paper', 8000); rerender(); },
  'discard-ask': function () { if (S.view.name === 'paper') { S.ui.armed = 'discard'; } else S.ui.sheet = 'discard'; rerender(); },
  disarm: function () { S.ui.armed = null; rerender(); },
  discard: function () { S.log.current = null; S.ui.sheet = null; S.ui.armed = null; touch('paper', 1500); toast('Paper discarded'); go('home', true); },
  flag: function (el) {
    var qid = el.closest('[data-q]').getAttribute('data-q'); var on = !isFlagged(qid);
    S.log.flags[qid] = { on: on, at: Date.now() }; touch('flag', 3000);
    el.setAttribute('aria-pressed', String(on)); el.setAttribute('aria-label', on ? 'Unflag question' : 'Flag question');
    toast(on ? 'Flagged' : 'Flag removed');
  },
  'ul-apply': applyUnderline,
  'ul-clear': clearUnderlines,
  'retry-wrong': function (el) { var pid = el.getAttribute('data-v'); guardNewPaper('retry', function () { retryWrong(pid); }); },
  'practise-local': function () { saveProfiles(); go('home', true); },
  'paste-setup': function (el) { pasteSetup(el.getAttribute('data-src')); },
  'setup-continue': function () {
    if (S.ui.setupErr || isStandalone() || !isRemote()) { S.ui.setupErr = null; go('home', true); return; }
    S.ui.hold = 'install'; route(); render(true);
  },
  'paste-clip': function (btn) {
    var src = btn.getAttribute('data-src') || 'pasteSetup'; var msg = document.getElementById('pasteMsg');
    function fail(text) { if (msg) { msg.textContent = text; msg.className = 'small callout bad'; } }
    navigator.clipboard.readText().then(function (t) {
      if (!/setup=/.test(t || '')) { fail('Your clipboard doesn’t hold a setup link. Copy the whole link first, then tap the button again.'); return; }
      var el = document.getElementById(src); if (el) el.value = t.trim();
      pasteSetup(src);
    }, function () { fail('This device didn’t allow pasting. Press and hold the box below, tap Paste, then tap Connect this device.'); });
  },
  'copy-link-install': function () {
    var link = setupLink(activeProfile());
    function failed() { toast('Couldn’t copy. Opening the link page instead.'); go('device'); }
    try { navigator.clipboard.writeText(link).then(function () { toast('Copied. Now do step 2.'); }, failed); } catch (e) { failed(); }
  },
  'share-link': function () {
    var p = activeProfile();
    navigator.share({ title: 'Bubblesheet setup link', url: setupLink(p) }).catch(function () {});
  },
  'show-install': function () { S.ui.hold = 'install'; cleanUrl(); route(); render(true); },
  'text-set': function (el) { LS.set('bs.text', el.getAttribute('data-v')); applyText(); rerender(); },
  'fs-set': function (el) { var on = el.getAttribute('data-v') === 'on'; LS.set('bs.fullscreen', on); if (!on && S.ui.fsByApp && fsActive()) fsExit(); rerender(); },
  'sync-now': function () { syncNow(); toast('Syncing'); },
  'show-link': function () { S.ui.setupLink = !S.ui.setupLink; S.ui.focusLink = false; rerender(); },
  'device-help': function () { S.ui.setupLink = false; go('prefs'); S.ui.focusLink = true; },
  'copy-link': function () { copyText(setupLink(activeProfile()), document.getElementById('setupLinkBox')); },
  switch: function (el) { switchProfile(el.getAttribute('data-v')); },
  arm: function (el) { S.ui.armed = el.getAttribute('data-v'); rerender(); },
  remove: function (el) {
    var pid = el.getAttribute('data-v'); delete S.profiles.list[pid]; saveProfiles();
    LS.del(logKey(pid)); LS.del(metaKey(pid)); LS.del('bs.builder.' + pid); S.ui.armed = null; rerender(); toast('Profile removed from this device');
  },
  'create-profile': createProfileFromForm,
  download: downloadData
};

app.addEventListener('click', function (e) {
  var had = S.ui.confirm; var inPop = !!e.target.closest('.popover');
  var el = e.target.closest('[data-act]');
  var fn = el && app.contains(el) && !el.disabled ? ACT[el.getAttribute('data-act')] : null;
  if (fn) { var from = S.view.name; S.ui.navTo = null; fn(el, e); fsAfterTap(from); }
  // A tap anywhere outside an open "discard?" pop-up closes it.
  if (had && S.ui.confirm === had && !inPop) { S.ui.confirm = null; rerender(); }
});
app.addEventListener('keydown', function (e) {
  var el = e.target.closest && e.target.closest('.opt[data-act="pick"]');
  if (el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); pick(+el.getAttribute('data-i'), el); }
  if (e.target.id === 'paperCode' && e.key === 'Enter') { e.preventDefault(); ACT['code-go'](); }
});
app.addEventListener('pointerdown', function (e) { if (e.target.closest('[data-act="ul-apply"]')) e.preventDefault(); });
app.addEventListener('input', function (e) {
  var t = e.target;
  if (t.getAttribute('data-input') === 'share') {
    S.builder.share = +t.value; saveBuilder();
    var v = document.getElementById('shareVal'); if (v) v.textContent = t.value + '%';
    var s = document.getElementById('buildSummary'); if (s) s.innerHTML = builderSummary();
  }
  if (t.getAttribute('data-input') === 'code') S.ui.code.val = t.value;
  if (t.getAttribute('data-input') === 'ids') { S.builder.ids = t.value.slice(0, 4000); saveBuilder(); var bs = document.getElementById('buildSummary'); if (bs) bs.innerHTML = builderSummary(); }
  if (t.hasAttribute('data-note')) saveNote(t);
});
var saveNote = debounce(function (t) {
  var qid = t.getAttribute('data-note');
  S.log.notes[qid] = { text: t.value.slice(0, 4000), at: Date.now() };
  touch('note', 2500);
  var st = document.getElementById('noteStatus'); if (st) st.textContent = 'Saved';
}, 700);
document.addEventListener('selectionchange', onSelection);
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') {
    if (S.ui.zoom) { closeZoom(); return; }
    if (S.ui.tip) { ACT['tip-close'](); return; }
    if (S.ui.confirm) { S.ui.confirm = null; rerender(); return; }
    if (S.ui.share) { S.ui.share = null; rerender(); return; }
  }
  var tag = (e.target.tagName || '').toLowerCase(); if (tag === 'input' || tag === 'textarea' || e.metaKey || e.ctrlKey || e.altKey) return;
  if (S.ui.share || S.ui.tip || S.ui.zoom) return;
  if (S.view.name === 'review' && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) { stepQuestion(e.key === 'ArrowRight' ? 1 : -1); return; }
  if (S.view.name !== 'paper' || !S.log.current || S.log.current.paused) return;
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { if (!S.ui.sheet) stepQuestion(e.key === 'ArrowRight' ? 1 : -1); }
  else if (/^[a-t]$/i.test(e.key) && !S.ui.sheet) {
    var li = app.querySelector('.opt[data-i="' + LETTERS.indexOf(e.key.toUpperCase()) + '"][data-act="pick"]'); if (li) pick(+li.getAttribute('data-i'), li);
  }
});

/* =========================================================== TIMER */
var tickCount = 0;
setInterval(function () {
  var p = S.log && S.log.current;
  if (!p || S.view.name !== 'paper' || p.paused || S.ui.share || S.ui.tip || document.visibilityState !== 'visible') return;
  var it = p.items[p.idx]; if (p.mode === 'tutor' && it && it.checked) return;
  p.elapsed++; if (it) it.secs++;
  var t = document.getElementById('timer'); if (t) { t.textContent = timerText(p); t.className = timerClass(p); }
  if (p.limit && p.elapsed === p.limit) toast('Time is up. Finish when you’re ready.');
  tickCount++;
  if (tickCount % 10 === 0) { S.log.currentAt = Date.now(); saveLocal(); }
  if (tickCount % 120 === 0) touch('paper', 10000);
}, 1000);

/* =========================================================== BOOT */
window.addEventListener('hashchange', function () { S.ui.hold = null; route(); render(true); });
window.addEventListener('online', function () { if (isRemote()) syncNow(); });
window.addEventListener('resize', placeTip);
window.addEventListener('pageshow', function (e) { if (e.persisted) onReturn(); });
document.addEventListener('fullscreenchange', function () { setTimeout(placeTip, 60); });
document.addEventListener('visibilitychange', function () {
  if (document.visibilityState === 'hidden') HIDDEN_AT = Date.now(); else onReturn();
  if (!isRemote()) return;
  if (document.visibilityState === 'hidden' && S.meta.dirty) syncNow();
  if (document.visibilityState === 'visible' && Date.now() - (S.meta.lastSync || 0) > 30000) syncNow();
});
setInterval(function () { if (isRemote() && (S.meta.dirty || Date.now() - (S.meta.lastSync || 0) > 300000)) syncNow(); }, 60000);
if (window.matchMedia) { try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme); } catch (e) {} }

(async function boot() {
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) document.documentElement.classList.add('touch');
  applyTheme(); applyText(); loadProfiles(); loadLog(); route();
  render(true);
  await loadBank();
  computeStats(); route(); render(true);
  if (isRemote()) { syncNow(); syncRefs(); }
})();
})();
