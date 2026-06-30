import { requireAdmin } from '../../lib/auth.js';
import { setValue } from '../../lib/kv.js';
import { KEYS } from '../../lib/defaults.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const auth = requireAdmin(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  const { key, value } = req.body || {};
  if (!KEYS.includes(key)) return res.status(400).json({ error: 'Invalid key' });
  // size guard — avoid pushing crazy-large blobs into KV
  const json = JSON.stringify(value || null);
  if (json.length > 1_000_000) return res.status(413).json({ error: 'Payload too large' });

  try {
    await setValue(key, value);
    return res.status(200).json({ ok: true, key });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
