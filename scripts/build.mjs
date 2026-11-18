#!/usr/bin/env node
// Validates every question bank in bank/ and assembles the publishable site in _site/.
// Usage:
//   node scripts/build.mjs           validate, then build _site/ (fails on any error)
//   node scripts/build.mjs --check   validate only
// No dependencies: runs on any Node 18+.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BANK_DIR = path.join(ROOT, 'bank');
const IMG_DIR = path.join(BANK_DIR, 'img');
const OUT = path.join(ROOT, '_site');
const CHECK_ONLY = process.argv.includes('--check');

const FORMATS = new Set(['sba', 'cdp']);
const ID_RE = /^[a-z0-9][a-z0-9-]{1,60}$/;
const errors = [];
const warnings = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);
const warn = (where, msg) => warnings.push(`${where}: ${msg}`);
const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isHttps = (v) => typeof v === 'string' && /^https:\/\/[^\s]+$/.test(v);

// ---- images (see "Images" in docs/QUESTION-SCHEMA.md)
const IMG_EXT = /\.(jpe?g|png|webp|svg)$/i;
const IMG_MAX = 1024 * 1024, IMG_WARN = 400 * 1024;
const LICENCE_RE = /^(Original|Public domain|CC0 1\.0|CC BY(-NC)?(-SA|-ND)? (2\.0|2\.5|3\.0|4\.0)( [A-Z]{2,3})?( \(modified\))?)$/;
const NO_URL_LICENCES = new Set(['Original', 'Public domain']);
const STOP = new Set('about above after again against along among another around because before being below between both cannot could during every first from further have having into itself might more most never other over same should since some such than that their them then there these they this those through under until upon very were what when where which while with within without would your years'.split(' '));
const usedImages = new Set();
const held = new Map(); // question id -> missing image files (held back from the live site)
const words = (t) => (String(t || '').toLowerCase().match(/[a-z][a-z-]{4,}/g) || []).filter((w) => !STOP.has(w));
const visibleCredit = (t) => String(t || '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');

function checkImages(q, where) {
  if (q.images === undefined) return;
  if (!Array.isArray(q.images) || !q.images.length || q.images.length > 4) return err(where, 'images must be an array of 1-4 images');
  // words of the answer that the stem and lead don't already give away
  const keyText = q.options.filter((o) => o && (q.format === 'sba' ? o.correct === true : o.score > 0)).map((o) => o.text).join(' ');
  const given = new Set(words([...(q.stem || []), q.lead].join(' ')));
  const answer = new Set(words(keyText).filter((w) => !given.has(w)));
  q.images.forEach((im, i) => {
    const w = `${where} image ${i + 1}`;
    if (!im || typeof im !== 'object') return err(w, 'must be an object');
    const nameRe = new RegExp(`^${q.id}-[1-4]\\.(jpg|jpeg|png|webp|svg)$`);
    if (!isStr(im.file) || !nameRe.test(im.file)) err(w, `file must be named "${q.id}-${i + 1}" plus .jpg, .png, .webp or .svg (lowercase), and stored in bank/img/`);
    if (!isStr(im.alt) || im.alt.trim().length < 10 || im.alt.length > 300) err(w, 'alt is required: 10-300 characters describing what the image shows, without naming the diagnosis');
    if (!isStr(im.credit)) err(w, 'credit is required, worded as the image\'s licence or source asks');
    else {
      for (const m of im.credit.matchAll(/\[([^\]]*)\]\(([^)]*)\)/g)) if (!isHttps(m[2])) err(w, `credit link "${m[1]}" must use an https:// address`);
    }
    if (!isStr(im.licence) || !LICENCE_RE.test(im.licence)) err(w, 'licence must be one of: Original, Public domain, CC0 1.0, or a CC licence written like "CC BY 4.0", "CC BY-NC-SA 3.0 (modified)" or "CC BY-NC-ND 4.0"');
    else {
      if (!NO_URL_LICENCES.has(im.licence) && !isHttps(im.licenceUrl)) err(w, 'licenceUrl (https://) is required for this licence');
      if (im.licence !== 'Original' && !isHttps(im.source)) err(w, 'source (https://) is required: the page the image came from');
    }
    if (im.licenceUrl !== undefined && !isHttps(im.licenceUrl)) err(w, 'licenceUrl must be an https:// address');
    if (im.source !== undefined && !isHttps(im.source)) err(w, 'source must be an https:// address');
    if (im.caption !== undefined && !isStr(im.caption)) err(w, 'caption must be a non-empty string (shown after answering)');
    const shown = [...words(im.alt), ...words(visibleCredit(im.credit))].filter((x) => answer.has(x));
    if (shown.length) warn(w, `alt or credit text shares "${[...new Set(shown)].join('", "')}" with the answer, which may give it away`);
    // a computer shows a link's address on hover, so credit links shouldn't name the answer either
    const answerParts = new Set([...answer].flatMap((x) => x.split('-')).filter((x) => x.length >= 5));
    const inLinks = [...String(im.credit || '').matchAll(/\]\(([^)]*)\)/g)].flatMap((m) => m[1].toLowerCase().split(/[^a-z]+/)).filter((x) => answerParts.has(x));
    if (inLinks.length) warn(w, `a credit link's address contains "${[...new Set(inLinks)].join('", "')}", which shows on hover; link credit to a neutral page and put the image's page in source (shown after answering)`);
    if (isStr(im.file) && IMG_EXT.test(im.file)) {
      usedImages.add(im.file);
      const f = path.join(IMG_DIR, im.file);
      if (!fs.existsSync(f)) { held.set(q.id, [...(held.get(q.id) || []), im.file]); }
      else {
        const size = fs.statSync(f).size;
        if (size > IMG_MAX) err(w, `${im.file} is ${Math.round(size / 1024)} KB; keep images under 1024 KB (about 400 KB is plenty)`);
        else if (size > IMG_WARN) warn(w, `${im.file} is ${Math.round(size / 1024)} KB; under 400 KB loads faster on phones`);
      }
    }
  });
}

function checkTable(t, where) {
  if (!t || typeof t !== 'object') return err(where, 'table must be an object');
  if (t.caption !== undefined && !isStr(t.caption)) err(where, 'caption must be a non-empty string');
  if (!Array.isArray(t.head) || !t.head.length || !t.head.every((c) => typeof c === 'string')) err(where, 'head must be a non-empty array of strings');
  if (!Array.isArray(t.rows) || !t.rows.length) return err(where, 'rows must be a non-empty array');
  t.rows.forEach((r, i) => {
    if (!Array.isArray(r) || !r.every((c) => typeof c === 'string')) err(`${where} row ${i + 1}`, 'each row must be an array of strings');
    else if (Array.isArray(t.head) && r.length !== t.head.length) err(`${where} row ${i + 1}`, `has ${r.length} cells but head has ${t.head.length}`);
  });
}

function checkQuestion(q, where, seenIds) {
  if (!q || typeof q !== 'object') return err(where, 'question must be an object');
  if (!isStr(q.id) || !ID_RE.test(q.id)) err(where, 'id must be lowercase letters, digits and hyphens (2-61 chars)');
  else if (seenIds.has(q.id)) err(where, `duplicate id "${q.id}" (also in ${seenIds.get(q.id)})`);
  else seenIds.set(q.id, where.split(' ')[0]);
  where = `${where} [${q.id}]`;
  if (!FORMATS.has(q.format)) return err(where, 'format must be "sba" or "cdp"');
  if (!Array.isArray(q.topics) || !q.topics.length || !q.topics.every(isStr)) err(where, 'topics must be a non-empty array of strings');
  if (q.exams !== undefined && (!Array.isArray(q.exams) || !q.exams.every(isStr))) err(where, 'exams must be an array of strings');
  if (q.subtopic !== undefined && !isStr(q.subtopic)) err(where, 'subtopic must be a non-empty string');
  if (q.source !== undefined && !isStr(q.source)) err(where, 'source must be a non-empty string');
  if (!Array.isArray(q.stem) || !q.stem.length || !q.stem.every(isStr)) err(where, 'stem must be a non-empty array of paragraph strings');
  if (q.tables !== undefined) {
    if (!Array.isArray(q.tables)) err(where, 'tables must be an array');
    else q.tables.forEach((t, i) => checkTable(t, `${where} table ${i + 1}`));
  }
  if (!isStr(q.lead)) err(where, 'lead must be a non-empty string');
  if (!isStr(q.keyPoint)) err(where, 'keyPoint must be a non-empty string');
  if (q.reviewBy !== undefined && !isDate(q.reviewBy)) err(where, 'reviewBy must be YYYY-MM-DD');
  if (!Array.isArray(q.options)) return err(where, 'options must be an array');
  checkImages(q, where);
  const texts = new Set();
  q.options.forEach((o, i) => {
    const w = `${where} option ${i + 1}`;
    if (!o || typeof o !== 'object') return err(w, 'must be an object');
    if (!isStr(o.text)) err(w, 'text is required');
    else if (texts.has(o.text.trim().toLowerCase())) err(w, 'duplicate option text');
    else texts.add(o.text.trim().toLowerCase());
    if (!isStr(o.why)) err(w, 'why (explanation) is required');
  });
  const sorted = q.options.map((o) => (o && o.text) || '').slice().sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base', numeric: true }));
  if (q.options.some((o, i) => o && o.text !== sorted[i])) warn(where, 'options are not in alphabetical order');

  if (q.format === 'sba') {
    if (q.options.length < 4 || q.options.length > 12) err(where, `SBA needs 4-12 options (has ${q.options.length})`);
    const keys = q.options.filter((o) => o && o.correct === true).length;
    if (keys !== 1) err(where, `SBA needs exactly one option with "correct": true (has ${keys})`);
    q.options.forEach((o, i) => {
      if (o && (o.score !== undefined || o.critical !== undefined)) err(`${where} option ${i + 1}`, 'SBA options use "correct", not "score"/"critical"');
    });
  } else {
    if (!Number.isInteger(q.select) || q.select < 1 || q.select > 8) err(where, 'CDP needs "select": an integer 1-8');
    if (q.options.length < 6 || q.options.length > 20) err(where, `CDP needs 6-20 options (has ${q.options.length})`);
    let scoring = 0;
    let crit = 0;
    q.options.forEach((o, i) => {
      if (!o) return;
      const w = `${where} option ${i + 1}`;
      if (!Number.isInteger(o.score) || o.score < 0 || o.score > 3) err(w, 'score must be an integer 0-3');
      if (o.correct !== undefined) err(w, 'CDP options use "score", not "correct"');
      if (o.score > 0) scoring++;
      if (o.critical === true) {
        crit++;
        if (!(o.score >= 2)) err(w, 'a critical option must have score 2 or 3');
      } else if (o.critical !== undefined) err(w, 'critical must be true or omitted');
    });
    if (Number.isInteger(q.select) && scoring !== q.select) err(where, `"select" is ${q.select} but ${scoring} options score above 0`);
    if (crit > 2) warn(where, `${crit} critical options (usually 0-2)`);
    if (q.penalty !== undefined && !(typeof q.penalty === 'number' && q.penalty >= 0 && q.penalty <= 1)) err(where, 'penalty must be a number 0-1');
  }
}

function loadBanks() {
  if (!fs.existsSync(BANK_DIR)) { err('bank/', 'folder is missing'); return []; }
  const files = fs.readdirSync(BANK_DIR).filter((f) => f.endsWith('.json') && f !== 'manifest.json').sort();
  if (!files.length) err('bank/', 'no .json bank files found');
  const seenIds = new Map();
  const bankIds = new Set();
  const banks = [];
  for (const file of files) {
    const where = `bank/${file}`;
    let data;
    try { data = JSON.parse(fs.readFileSync(path.join(BANK_DIR, file), 'utf8')); }
    catch (e) { err(where, `not valid JSON (${e.message})`); continue; }
    if (data.schema !== 1) err(where, '"schema" must be 1');
    const b = data.bank || {};
    if (!isStr(b.id) || !ID_RE.test(b.id)) err(where, 'bank.id must be lowercase letters, digits and hyphens');
    else if (bankIds.has(b.id)) err(where, `duplicate bank.id "${b.id}"`);
    else bankIds.add(b.id);
    if (!isStr(b.title)) err(where, 'bank.title is required');
    if (b.created !== undefined && !isDate(b.created)) err(where, 'bank.created must be YYYY-MM-DD');
    if (b.reviewBy !== undefined && !isDate(b.reviewBy)) err(where, 'bank.reviewBy must be YYYY-MM-DD');
    if (!Array.isArray(data.questions) || !data.questions.length) { err(where, 'questions must be a non-empty array'); continue; }
    data.questions.forEach((q, i) => checkQuestion(q, `${where} question ${i + 1}`, seenIds));
    const topics = [...new Set(data.questions.flatMap((q) => (Array.isArray(q.topics) ? q.topics : [])))].sort();
    banks.push({
      file,
      id: b.id,
      title: b.title,
      count: data.questions.length,
      sba: data.questions.filter((q) => q.format === 'sba').length,
      cdp: data.questions.filter((q) => q.format === 'cdp').length,
      topics,
    });
  }
  return banks;
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

const banks = loadBanks();
if (fs.existsSync(IMG_DIR)) {
  for (const f of fs.readdirSync(IMG_DIR)) {
    if (f === 'README.md' || f.startsWith('.')) continue;
    if (!IMG_EXT.test(f)) warn(`bank/img/${f}`, 'not an image this app can show (.jpg, .png, .webp or .svg)');
    else if (!usedImages.has(f)) warn(`bank/img/${f}`, 'no question uses this image');
  }
}
for (const [id, files] of held) warn(`question ${id}`, `held back from the live site until ${files.map((f) => 'bank/img/' + f).join(' and ')} ${files.length > 1 ? 'are' : 'is'} uploaded`);
for (const w of warnings) console.log(`warning  ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`ERROR    ${e}`);
  console.error(`\n${errors.length} error(s). Nothing was built, so the live site is unchanged.`);
  process.exit(1);
}
const total = banks.reduce((n, b) => n + b.count, 0);
console.log(`OK: ${banks.length} bank(s), ${total} question(s)${held.size ? `, ${held.size} held back waiting for an image` : ''}, ${warnings.length} warning(s).`);
if (CHECK_ONLY) process.exit(0);

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
copyDir(path.join(ROOT, 'assets'), path.join(OUT, 'assets'));
// Cache-busting: phones keep old copies of app.js and styles.css, so stamp each with a content hash.
const stamp = (rel) => {
  const buf = fs.readFileSync(path.join(ROOT, rel));
  let h = 5381;
  for (const b of buf) h = ((h << 5) + h + b) >>> 0;
  return `${rel}?v=${h.toString(36)}`;
};
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
  .replace('"assets/app.js"', `"${stamp('assets/app.js')}"`)
  .replace('"assets/early.js"', `"${stamp('assets/early.js')}"`)
  .replace('"assets/styles.css"', `"${stamp('assets/styles.css')}"`);
fs.writeFileSync(path.join(OUT, 'index.html'), html);
fs.mkdirSync(path.join(OUT, 'bank'), { recursive: true });
const published = [];
for (const b of banks) {
  const src = path.join(BANK_DIR, b.file);
  const data = JSON.parse(fs.readFileSync(src, 'utf8'));
  const keep = data.questions.filter((q) => !held.has(q.id));
  if (keep.length === data.questions.length) fs.copyFileSync(src, path.join(OUT, 'bank', b.file));
  else if (keep.length) fs.writeFileSync(path.join(OUT, 'bank', b.file), JSON.stringify({ ...data, questions: keep }, null, 2) + '\n');
  if (!keep.length) continue; // every question is waiting for an image
  published.push({ ...b, count: keep.length, sba: keep.filter((q) => q.format === 'sba').length, cdp: keep.filter((q) => q.format === 'cdp').length });
}
if (usedImages.size) {
  fs.mkdirSync(path.join(OUT, 'bank', 'img'), { recursive: true });
  for (const f of usedImages) if (fs.existsSync(path.join(IMG_DIR, f))) fs.copyFileSync(path.join(IMG_DIR, f), path.join(OUT, 'bank', 'img', f));
}
const manifest = { generated: new Date().toISOString(), banks: published };
fs.writeFileSync(path.join(OUT, 'bank', 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Built ${path.relative(ROOT, OUT)}/`);
