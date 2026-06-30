import { sendTelegram } from '../lib/telegram.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { name, contact, message } = req.body || {};
  if (!name || !contact || !message) return res.status(400).json({ error: 'Missing fields' });

  // Basic sanitation — keep things short to discourage abuse
  const trim = (s, n) => String(s).slice(0, n);
  const text =
`📬 CONTACT FORM

👤 ${trim(name, 80)}
📞 ${trim(contact, 80)}

${trim(message, 2000)}`;

  const r = await sendTelegram(text);
  if (!r.ok) return res.status(502).json({ error: r.error });
  return res.status(200).json({ ok: true });
}
