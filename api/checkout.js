import Stripe from 'stripe';
import { getValue } from '../lib/kv.js';
import { quoteForCustomer } from '../lib/delivery.js';
import { sendTelegram, formatOrderMessage } from '../lib/telegram.js';

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
const stripe = STRIPE_SECRET ? new Stripe(STRIPE_SECRET) : null;

function orderNum() {
  return 'K-' + Math.random().toString(36).slice(2, 7).toUpperCase();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { items, customer } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Cart is empty' });
    if (!customer?.name || !customer?.phone || !customer?.postcode || !customer?.address) {
      return res.status(400).json({ error: 'Missing customer details' });
    }

    // Load menu + config from KV so we can validate prices server-side
    const [config, menu] = await Promise.all([getValue('config'), getValue('menu')]);

    // Resolve each item against the actual menu (never trust client prices)
    const lineItems = [];
    let sub = 0;
    for (const c of items) {
      const m = menu.find(x => x.id === c.id);
      if (!m) return res.status(400).json({ error: `Unknown item: ${c.id}` });
      const qty = Math.max(1, Math.min(50, parseInt(c.qty) || 1));
      lineItems.push({ id: m.id, name: m.name, nameAr: m.nameAr, price: m.price, qty, image: m.image });
      sub += m.price * qty;
    }

    if (sub < (config.minOrder || 0)) {
      return res.status(400).json({ error: `Minimum order ${config.currency}${config.minOrder.toFixed(2)}` });
    }

    // Verify delivery quote
    const quote = await quoteForCustomer(customer.postcode, config, sub);
    if (!quote.ok) return res.status(400).json({ error: quote.error });

    const total = sub + quote.fee;
    const orderId = orderNum();

    // ---- PATH A: Stripe enabled ----
    if (stripe) {
      const siteUrl = (process.env.PUBLIC_SITE_URL || `https://${req.headers.host}`).replace(/\/$/, '');
      // build Stripe line items (in minor units, e.g. pence)
      const stripeLines = lineItems.map(li => ({
        price_data: {
          currency: 'gbp',
          unit_amount: Math.round(li.price * 100),
          product_data: {
            name: li.name + (li.nameAr ? ' / ' + li.nameAr : ''),
            ...(li.image ? { images: [li.image] } : {}),
          },
        },
        quantity: li.qty,
      }));
      // Delivery as its own line item (so receipts itemise it)
      if (quote.fee > 0) {
        stripeLines.push({
          price_data: {
            currency: 'gbp',
            unit_amount: Math.round(quote.fee * 100),
            product_data: { name: `Delivery (${quote.tier} mi)` },
          },
          quantity: 1,
        });
      }

      // Stripe metadata has 500-char limits per value — we serialize compactly
      // and store the full payload in KV under a short key for the webhook.
      const orderPayload = {
        orderId,
        customer,
        items: lineItems,
        quote,
        sub, total,
        currency: config.currency,
      };
      // KV for webhook to pick up
      const { kv } = await import('@vercel/kv');
      await kv.set('karam:pending:' + orderId, orderPayload, { ex: 3600 }); // 1h TTL

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: stripeLines,
        customer_email: customer.email || undefined,
        success_url: `${siteUrl}/success?order=${orderId}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${siteUrl}/?cancelled=1`,
        metadata: { orderId },
        phone_number_collection: { enabled: false },
      });

      return res.status(200).json({ mode: 'stripe', url: session.url, orderId });
    }

    // ---- PATH B: Cash on delivery (Stripe not configured) ----
    const customerWithExtras = {
      ...customer,
      miles: quote.miles,
      eta: quote.time,
    };
    const message = formatOrderMessage({
      orderNum: orderId,
      customer: customerWithExtras,
      items: lineItems,
      sub,
      deliveryFee: quote.fee,
      total,
      currency: config.currency,
      paidStatus: 'Cash on delivery',
    });
    const r = await sendTelegram(message);
    if (!r.ok) return res.status(502).json({ error: 'Could not deliver order: ' + r.error });
    return res.status(200).json({ mode: 'cod', orderId });
  } catch (e) {
    console.error('checkout error', e);
    return res.status(500).json({ error: e.message });
  }
}
