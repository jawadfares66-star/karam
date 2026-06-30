import { requireAdmin } from '../../lib/auth.js';
import { sendTelegram, telegramConfigured } from '../../lib/telegram.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const auth = requireAdmin(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  if (!telegramConfigured()) {
    return res.status(400).json({ ok: false, error: 'TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing in env' });
  }
  const r = await sendTelegram('✅ Test from Karam admin panel. If you can read this, orders will be delivered here.');
  return res.status(r.ok ? 200 : 502).json(r);
}
