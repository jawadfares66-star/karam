import { getAll } from '../lib/kv.js';
import { telegramConfigured } from '../lib/telegram.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const all = await getAll();
    // expose Stripe publishable key (safe to send to client) + service status
    return res.status(200).json({
      ...all,
      _status: {
        telegram: telegramConfigured(),
        stripe: Boolean(process.env.STRIPE_SECRET_KEY),
        stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || null,
      },
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
