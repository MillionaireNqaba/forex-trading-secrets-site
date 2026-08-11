// api/paystack-webhook.js
//
// This is the endpoint that actually matters most. Everything in
// paystack-verify.js runs because the browser asked — and a browser can
// fail to ask (closed tab, dead connection, someone's ad blocker eating
// the request) even after a real payment went through. A webhook is
// Paystack telling YOUR SERVER directly, the moment a payment succeeds,
// with no dependency on the customer's browser still being open.
// Treat this file, not the browser flow, as your actual record of who
// has paid.
//
// SET THIS UP IN YOUR PAYSTACK DASHBOARD:
//   Settings → API Keys & Webhooks → Webhook URL
//   Paste in: https://YOUR_DOMAIN/api/paystack-webhook
//   Do this for BOTH test mode and live mode — they're configured
//   separately, and it's easy to set only one and wonder why the other
//   "isn't working."
//
// Vercel note: this function needs the RAW request body to check the
// signature correctly (JSON.stringify(parsedBody) is not guaranteed to
// byte-for-byte match what Paystack originally sent). The config below
// disables Vercel's automatic body parsing so we can read the raw bytes
// ourselves.

import crypto from 'crypto';

export const config = {
  api: {
    bodyParser: false,
  },
};

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }

  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) {
    console.error('PAYSTACK_SECRET_KEY is not set in environment variables');
    return res.status(500).end();
  }

  const rawBody = await readRawBody(req);

  // Verify this request genuinely came from Paystack before trusting
  // anything in it. HMAC-SHA512 of the raw body, keyed with your
  // secret key — Paystack specifically uses SHA-512, not the SHA-256
  // most other providers default to, so don't copy a generic webhook
  // snippet from elsewhere without checking this.
  const expectedSignature = crypto
    .createHmac('sha512', secretKey)
    .update(rawBody)
    .digest('hex');

  const receivedSignature = req.headers['x-paystack-signature'];

  if (!receivedSignature || receivedSignature !== expectedSignature) {
    console.warn('Webhook signature mismatch — rejecting request');
    return res.status(401).end();
  }

  // Signature is valid — safe to parse and trust the payload now.
  let event;
  try {
    event = JSON.parse(rawBody);
  } catch (err) {
    console.error('Webhook body was not valid JSON:', err);
    return res.status(400).end();
  }

  // Respond 200 immediately — Paystack expects a fast response and will
  // retry (every 3 minutes for the first 4 attempts, then hourly for up
  // to 72 hours) if it doesn't hear back quickly. Do the real work
  // after responding, or keep it fast enough not to matter.
  res.status(200).end();

  if (event.event === 'charge.success') {
    const tx = event.data;
    console.log('Verified successful payment:', {
      reference: tx.reference,
      email: tx.customer?.email,
      amount: tx.amount,
      currency: tx.currency,
      paidAt: tx.paid_at,
    });

    // ------------------------------------------------------------
    // TODO — this is where the actual product delivery belongs.
    // Right now this only logs to Vercel's function logs (Vercel
    // dashboard → your project → Logs). Two things are still missing
    // before this is a complete, hands-off system:
    //
    // 1. Somewhere to record that this reference was paid, so you
    //    have a permanent record independent of Paystack's own
    //    dashboard. A simple option: Vercel KV or Upstash Redis
    //    (both have free tiers and a couple of lines of setup).
    //
    // 2. Actually sending the book. The simplest version: email the
    //    EPUB download link to tx.customer.email using a transactional
    //    email provider — Resend and Postmark are both simple to wire
    //    up and have generous free tiers. Until this is built, the
    //    thank-you page's manual download link is your delivery
    //    mechanism, and it isn't gated on this webhook at all.
    // ------------------------------------------------------------
  }
}
