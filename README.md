# Karam · كرم

Arab food ordering site for international students.
Single-page storefront + admin panel, deployable to Vercel, with Stripe payments and Telegram order delivery.

```
karam/
├── public/
│   ├── index.html           # storefront + admin (one file)
│   └── success.html         # post-payment thank-you
├── api/
│   ├── data.js              # GET   — public menu/config (no auth)
│   ├── contact.js           # POST  — contact form → Telegram
│   ├── checkout.js          # POST  — create Stripe session OR send COD to Telegram
│   ├── stripe-webhook.js    # POST  — paid orders → Telegram
│   └── admin/
│       ├── login.js         # POST  — password → JWT
│       ├── save.js          # POST  — write data (JWT required)
│       ├── reset.js         # POST  — reset to defaults
│       └── test-telegram.js # POST  — send a test message
├── lib/
│   ├── defaults.js          # seed data
│   ├── kv.js                # Vercel KV wrapper
│   ├── auth.js              # JWT issue/verify
│   ├── telegram.js          # Telegram bot sender
│   └── delivery.js          # postcode → distance → quote
├── package.json
├── vercel.json
├── .env.example
├── .gitignore
└── README.md
```

---

## Deployment — the whole 15-minute walkthrough

You'll do this once. After that, edits to the menu happen in the admin panel and need no redeploys.

### 1. Push to GitHub

```bash
cd karam-deploy
git init
git add .
git commit -m "Initial commit"
gh repo create karam --private --source=. --push
```

If you don't have `gh` (GitHub CLI), create the repo manually at github.com/new and:

```bash
git remote add origin https://github.com/<your-username>/karam.git
git push -u origin main
```

### 2. Import into Vercel

1. Go to **[vercel.com/new](https://vercel.com/new)** → Import the GitHub repo.
2. **Framework preset:** Other.
3. **Build command:** leave empty.
4. **Output directory:** `public`.
5. Click **Deploy**. Wait ~30 seconds.

Don't worry that the site looks broken on first load — the API needs env vars and a database, which we'll add next.

### 3. Add Vercel KV (the database for your menu)

1. In your Vercel project: **Storage** tab → **Create Database** → **KV** → name it `karam-kv` → **Create**.
2. **Connect Project** → pick your project → **Connect**.

Vercel auto-injects `KV_REST_API_URL` and `KV_REST_API_TOKEN` env vars. No manual setup.

### 4. Set environment variables

In your Vercel project: **Settings → Environment Variables**. Add each of these:

| Variable | Value |
|---|---|
| `ADMIN_PASSWORD` | A strong password you'll type at `/admin` |
| `JWT_SECRET` | Long random string. Generate with `openssl rand -hex 32` |
| `TELEGRAM_BOT_TOKEN` | From `@BotFather` (see below) |
| `TELEGRAM_CHAT_ID` | Your numeric chat ID (see below) |
| `STRIPE_SECRET_KEY` | From [Stripe dashboard](https://dashboard.stripe.com/apikeys) — **start with TEST keys** (`sk_test_…`) |
| `STRIPE_PUBLISHABLE_KEY` | Also from Stripe (`pk_test_…`) |
| `STRIPE_WEBHOOK_SECRET` | Filled in step 6 |
| `PUBLIC_SITE_URL` | Your Vercel URL, e.g. `https://karam.vercel.app` |

> **Skip Stripe vars for now** if you just want to test order flow with cash-on-delivery. The site will work without them.

After adding env vars, click **Deployments** → on the latest deploy, **⋯ → Redeploy**.

### 5. Hook up Telegram

1. Open Telegram, search **`@BotFather`**, start a chat.
2. Send `/newbot`. Pick a name and a username (must end in `bot`).
3. BotFather gives you a **bot token** like `123456:ABC-DEF…`. Paste into `TELEGRAM_BOT_TOKEN`.
4. Open your new bot's chat, press **Start**, send any message.
5. In a browser, open:
   ```
   https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates
   ```
6. In the JSON, find `"chat":{"id":123456789` — that number is your `TELEGRAM_CHAT_ID`.
7. **Redeploy** (env-var changes need a fresh build).
8. Go to `/admin` on your site → **Services** tab → **Send test message**. Telegram should ping.

### 6. Hook up Stripe (optional but recommended)

1. From the [Stripe dashboard](https://dashboard.stripe.com), grab your **test** keys → paste into `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY`.
2. Go to [Developers → Webhooks](https://dashboard.stripe.com/test/webhooks) → **Add endpoint**.
   - **Endpoint URL:** `https://<your-domain>/api/stripe-webhook`
   - **Events to send:** `checkout.session.completed`
3. After creating, Stripe shows a **signing secret** starting with `whsec_…`. Paste into `STRIPE_WEBHOOK_SECRET`.
4. **Redeploy** so the new vars are picked up.
5. Test a checkout on your live site with [Stripe's test card](https://docs.stripe.com/testing): `4242 4242 4242 4242`, any future date, any CVC. The order should arrive in Telegram with `PAID via Stripe`.

When you're ready for real payments, swap test keys for **live** keys (`sk_live_…`, `pk_live_…`) and create a separate webhook in live mode.

### 7. Connect your domain (optional)

In Vercel: **Settings → Domains** → add your domain. Update DNS as Vercel instructs. Once live, set `PUBLIC_SITE_URL` to that domain and redeploy.

---

## Day-to-day use

- **Customers:** visit `https://your-domain.com`. Order. Done.
- **You:** visit `https://your-domain.com/admin`, sign in with `ADMIN_PASSWORD`, edit menu / prices / hours / gallery / reviews / delivery rules. Changes are live instantly — no redeploys.
- **Orders:** arrive in your Telegram chat (paid via Stripe or marked Cash on Delivery).

### What the admin panel can change without redeploying

Restaurant name, tagline, all menu items, categories, prices, photos, the seven reviews, opening hours, all delivery rules (base postcode, fees, time per mile, radius), gallery photos, contact channels, hours note.

### What requires editing env vars (and redeploying)

Admin password, Stripe keys, Telegram bot token, JWT secret. These are credentials — they live in Vercel's env-var settings, not in the database.

---

## Local development

```bash
npm install
# Create .env.local from .env.example and fill in values
cp .env.example .env.local
# Run with vercel dev (need Vercel CLI)
npx vercel dev
```

For local dev with Stripe webhooks, use the [Stripe CLI](https://docs.stripe.com/stripe-cli):

```bash
stripe listen --forward-to localhost:3000/api/stripe-webhook
```

The CLI prints a `whsec_…` you should set as `STRIPE_WEBHOOK_SECRET` in `.env.local` for testing.

---

## Architecture notes

- **No build step.** `public/index.html` is the storefront *and* the admin panel — the route is decided by `#admin` or `/admin`.
- **Vercel KV** stores all editable content (menu, categories, hours, reviews, gallery, config). Default values from `lib/defaults.js` seed any unset key.
- **Server validates orders.** Even though the client knows the prices, `api/checkout.js` re-reads the menu and re-computes delivery from the customer's postcode before charging — you can't be tricked by a hacked browser session.
- **Stripe webhook is the source of truth for "paid."** The order is only delivered to Telegram after Stripe says payment succeeded. If you ever see an order in Telegram without `PAID via Stripe`, it's either cash-on-delivery mode or a webhook issue.
- **Admin auth** is a 7-day JWT issued after password check. Token sits in the browser's localStorage. Forgot the password? Change the `ADMIN_PASSWORD` env var and redeploy.

---

## Troubleshooting

| Symptom | Probable cause |
|---|---|
| `Couldn't load the menu` on first visit | KV not connected, or first cold start — refresh once |
| Test message in admin says "Telegram not configured" | `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` missing or wrong; redeploy after setting them |
| Checkout button does nothing | Open browser devtools → Network tab → look at `/api/checkout` response |
| Stripe payment succeeds, but no Telegram message | Webhook signing secret mismatch — re-copy `whsec_…` from Stripe dashboard, redeploy |
| Admin login fails with correct password | Whitespace in `ADMIN_PASSWORD` env var, or `JWT_SECRET` missing |
| "Out of range" for postcodes that should work | Adjust `Max delivery radius` in admin → Delivery |
