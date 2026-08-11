# Forex Trading Secrets — Payment Backend

Three small serverless functions that make the Paystack checkout on your site actually secure — the secret key never touches the browser, the price can't be tampered with from dev tools, and a payment is only trusted once Paystack itself confirms it happened.

## What's here

| File | Job |
|---|---|
| `api/paystack-initialize.js` | Called when someone clicks "Buy Now." Starts the transaction on Paystack's side using your secret key, returns an `access_code` the browser uses to open the payment popup. The price lives here, not in the browser. |
| `api/paystack-verify.js` | Called right after the popup reports success, to double-check with Paystack directly (server-to-server) that the payment really happened, for the right amount, in the right currency. |
| `api/paystack-webhook.js` | The real source of truth. Paystack calls this directly the moment a payment succeeds, independent of whether the customer's browser is even still open. This is what you should eventually build product delivery around, not the browser flow. |
| `test-harness.mjs` | A local test script — not deployed — that exercises all three functions' request handling without needing a real Paystack account. Run it any time you change the code: `node test-harness.mjs`. |

## Deploying this (Vercel, free tier)

This is built as **Vercel serverless functions** specifically because your site is already static HTML — Vercel can host both the static site and these API routes together, with no separate server to manage or pay for.

1. **Put this `backend` folder's contents at the root of a GitHub repo**, alongside your `index.html`, `thank-you.html`, and `cancelled.html`. The final structure should look like:
   ```
   your-repo/
     api/
       paystack-initialize.js
       paystack-verify.js
       paystack-webhook.js
     index.html
     thank-you.html
     cancelled.html
     package.json
   ```
2. Go to **vercel.com** → sign in → **Add New Project** → import that GitHub repo. Vercel auto-detects the `/api` folder and deploys each file as its own endpoint — you don't configure routes manually.
3. Before your first deploy finishes, go to **Project → Settings → Environment Variables** and add:
   - `PAYSTACK_SECRET_KEY` = your secret key from `dashboard.paystack.com` → Settings → API Keys & Webhooks. Use `sk_test_...` first.
4. Deploy. Your endpoints will be live at `https://your-project.vercel.app/api/paystack-initialize`, etc.
5. **Set up the webhook** — this step is easy to skip and is the one that actually matters most. In your Paystack dashboard: Settings → API Keys & Webhooks → Webhook URL → paste `https://your-project.vercel.app/api/paystack-webhook`. Do this for **both** test mode and live mode; they're separate settings.
6. Once you're confident it works end-to-end with test keys and Paystack's published test cards, switch `PAYSTACK_SECRET_KEY` to your `sk_live_...` key in Vercel's dashboard and redeploy.

## What this does NOT do yet

Being direct about the gap rather than hiding it:

- **No database.** The webhook currently only logs a successful payment to Vercel's function logs (visible in your Vercel dashboard). There's no permanent record of who paid, independent of Paystack's own dashboard. A free option worth adding: Vercel KV or Upstash Redis — a few lines of code to store `{reference: paid}`.
- **No automated delivery.** Right now, the thank-you page is still what actually hands over the download link, and a real customer support process (checking Paystack's dashboard for a reference if someone says they paid but got stuck) is your fallback. The next real step is emailing the EPUB link automatically from the webhook when `charge.success` fires — Resend or Postmark are both simple, well-documented options with free tiers for this volume.

Both are marked with `TODO` comments directly in `api/paystack-webhook.js` so they're easy to find when you're ready to build them.
