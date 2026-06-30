import Stripe from 'stripe';
import { kv } from '@vercel/kv';
import { sendTelegram, formatOrderMessage } from '../lib/telegram.js';

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const stripe = STRIPE_SECRET ? new Stripe(STRIPE_SECRET) : null;

// Stripe needs the raw body to verify signatures — disable body parsing
export const config = {
  api: { bodyParser: false },
};

async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end('Method not allowed');
  }
  if (!stripe || !WEBHOOK_SECRET) {
    return res.status(500).end('Stripe not configured');
  }

  let event;
  try {
    const raw = await getRawBody(req);
    const sig = req.headers['stripe-signature'];
    event = stripe.webhooks.constructEvent(raw, sig, WEBHOOK_SECRET);
  } catch (e) {
    console.error('webhook signature verification failed', e.message);
    return res.status(400).end(`Webhook Error: ${e.message}`);
  }

  // We only care about successful checkouts
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const orderId = session.metadata?.orderId;
    if (!orderId) {
      console.warn('checkout.session.completed without orderId metadata', session.id);
      return res.status(200).json({ received: true });
    }
    const payload = await kv.get('karam:pending:' + orderId);
    if (!payload) {
      console.warn('No pending order found for', orderId);
      return res.status(200).json({ received: true, note: 'no pending order' });
    }
    // mark as paid
    await kv.del('karam:pending:' + orderId);

    const text = formatOrderMessage({
      orderNum: orderId,
      customer: { ...payload.customer, miles: payload.quote.miles, eta: payload.quote.time },
      items: payload.items,
      sub: payload.sub,
      deliveryFee: payload.quote.fee,
      total: payload.total,
      currency: payload.currency,
      paidStatus: `PAID via Stripe (£${(session.amount_total / 100).toFixed(2)})`,
    });

    const r = await sendTelegram(text);
    if (!r.ok) console.error('Telegram send failed after Stripe payment', r.error);
    // store completed order for later reference
    await kv.set('karam:order:' + orderId, { ...payload, stripeSessionId: session.id, paid: true, paidAt: Date.now() });
  }

  return res.status(200).json({ received: true });
}
