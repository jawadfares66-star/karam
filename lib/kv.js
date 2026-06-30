import { kv } from '@vercel/kv';
import { DEFAULTS, KEYS } from './defaults.js';

const PREFIX = 'karam:';

function k(key) { return PREFIX + key; }

export async function getValue(key) {
  if (!KEYS.includes(key)) throw new Error('Invalid key: ' + key);
  const stored = await kv.get(k(key));
  if (stored == null) return DEFAULTS[key];
  // config gets merged with defaults so new fields are always populated
  if (key === 'config' && typeof stored === 'object') {
    return { ...DEFAULTS.config, ...stored };
  }
  return stored;
}

export async function setValue(key, value) {
  if (!KEYS.includes(key)) throw new Error('Invalid key: ' + key);
  await kv.set(k(key), value);
  return value;
}

export async function getAll() {
  const out = {};
  for (const key of KEYS) out[key] = await getValue(key);
  return out;
}

export async function resetAll() {
  for (const key of KEYS) await kv.set(k(key), DEFAULTS[key]);
}
