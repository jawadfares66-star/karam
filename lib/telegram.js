// Server-side Telegram helper. Reads creds from env vars.
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

export function telegramConfigured() {
  return Boolean(TOKEN && CHAT_ID);
}

export async function sendTelegram(text) {
  if (!telegramConfigured()) {
    return { ok: false, error: 'Telegram not configured (set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID)' };
  }
  try {
    const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text }),
    });
    const data = await r.json();
    if (!data.ok) return { ok: false, error: data.description || 'Telegram API error' };
    return { ok: true, messageId: data.result.message_id };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// Format an order into a nice Telegram message
export function formatOrderMessage({ orderNum, customer, items, sub, deliveryFee, total, currency, paidStatus }) {
  const lines = items.map(c => `• ${c.qty}× ${c.name}${c.nameAr ? ' ('+c.nameAr+')' : ''} — ${currency}${(c.price * c.qty).toFixed(2)}`).join('\n');
  return (
`🆕 NEW ORDER  ${orderNum}
🕐 ${new Date().toLocaleString('en-GB')}
${paidStatus ? '💳 '+paidStatus+'\n' : ''}
👤 ${customer.name}
📞 ${customer.phone}
📮 ${customer.postcode}${customer.miles != null ? `  (${customer.miles.toFixed(1)} mi)` : ''}
📍 ${customer.address}
${customer.eta ? '⏱ ETA ~'+customer.eta+' min\n' : ''}${customer.notes ? '📝 '+customer.notes+'\n' : ''}
🍽 ITEMS
${lines}

Subtotal: ${currency}${sub.toFixed(2)}
Delivery: ${deliveryFee === 0 ? 'FREE' : currency + deliveryFee.toFixed(2)}
TOTAL:    ${currency}${total.toFixed(2)}`
  );
}
