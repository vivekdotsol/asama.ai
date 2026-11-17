const cfg = require('../config');

const DIM = 512;

const STOP = new Set(('a an and are as at be but by for from has have in into is it its of on or our that the their this to we with will you your '
  + 'all any can more most other some such than then these they those up very per also about over under during above below within').split(' '));

// Light stemmer: consistent, not linguistically perfect.
function stem(w) {
  if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith('ed')) return w.slice(0, -2);
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

// Concept lexicon: lets the local embedder bridge related vocabulary
// ("Diwali" ~ "festive", "cashback" ~ "discount"). In production, a real
// embedding model (text-embedding-3-small) does this job.
const CONCEPT_WORDS = {
  festive: 'diwali deepavali festival festive holi eid christmas navratri dussehra season seasonal celebration holiday sale onam pongal',
  discount: 'discount offer deal promo promotion promotional cashback coupon reward flat off savings save voucher bonus incentive',
  food: 'food restaurant meal dining cuisine delivery swiggy zomato grocery snack cafe kitchen',
  ecommerce: 'ecommerce shopping retail retailer marketplace merchant checkout cart flipkart amazon order seller brand',
  payments: 'payment pay upi wallet card credit debit fintech phonepe paytm gpay transaction bank banking netbanking',
  lending: 'loan emi mortgage finance financing lending interest',
  insurance: 'insurance policy premium cover',
  automotive: 'bike car vehicle motorcycle scooter auto automotive ev dealership drive showroom bajaj mileage fuel',
  travel: 'travel flight hotel booking trip tourism airline holiday',
  electronics: 'phone smartphone laptop mobile gadget electronics appliance',
};

const TERM_TO_CONCEPTS = new Map();
for (const [concept, words] of Object.entries(CONCEPT_WORDS)) {
  for (const w of words.split(' ')) {
    const s = stem(w);
    if (!TERM_TO_CONCEPTS.has(s)) TERM_TO_CONCEPTS.set(s, new Set());
    TERM_TO_CONCEPTS.get(s).add(concept);
  }
}

function tokenize(text) {
  return String(text)
    .toLowerCase()
    .replace(/e-commerce/g, 'ecommerce')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/-/g, ' ')
    .split(/\s+/)
    .filter((t) => t && t.length > 1 && !STOP.has(t))
    .map(stem);
}

function conceptsOf(text) {
  const out = new Set();
  for (const t of tokenize(text)) {
    const cs = TERM_TO_CONCEPTS.get(t);
    if (cs) cs.forEach((c) => out.add(c));
  }
  return out;
}

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function normalize(v) {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return v.map((x) => x / n);
}

function embedLocal(text) {
  const v = new Array(DIM).fill(0);
  const tokens = tokenize(text);
  for (const t of tokens) v[hash(t) % DIM] += 1;
  for (const c of conceptsOf(text)) v[hash('concept:' + c) % DIM] += 2;
  return normalize(v);
}

async function embed(text) {
  if (cfg.openaiKey) {
    const r = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.openaiKey}` },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: text }),
    });
    if (!r.ok) throw new Error(`Embedding API error ${r.status}`);
    const j = await r.json();
    return normalize(j.data[0].embedding);
  }
  return embedLocal(text);
}

function dot(a, b) {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

module.exports = { embed, embedLocal, conceptsOf, tokenize, dot, normalize, DIM };
