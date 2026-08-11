// api/paystack-initialize.js
//
// Called by the browser the moment someone clicks "Buy Now." Starts a
// transaction on Paystack's side using your SECRET key (which only ever
// lives here, on the server — never in the browser) and hands back an
// access_code the frontend uses to open the secure payment popup.
//
// The price is fixed here, not trusted from the browser. If the amount
// lived in the frontend JavaScript, anyone could open dev tools and
// change what they're charged before the request is sent. Keeping the
// real price only on the server is what actually prevents that.

const PRICE_ZAR_CENTS = 159900; // R1,599.00 — keep in sync with index.html's displayed price
const CURRENCY = 'ZAR';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) {
    console.error('PAYSTACK_SECRET_KEY is not set in environment variables');
    return res.status(500).json({ error: 'Server is not configured yet' });
  }

  const { email } = req.body || {};
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailPattern.test(email)) {
    return res.status(400).json({ error: 'A valid email address is required' });
  }

  const reference = `fts_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  try {
    const paystackRes = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        amount: PRICE_ZAR_CENTS,
        currency: CURRENCY,
        reference,
        metadata: {
          product: 'Forex Trading Secrets — EPUB',
        },
      }),
    });

    const data = await paystackRes.json();

    if (!paystackRes.ok || !data.status) {
      console.error('Paystack initialize failed:', data);
      return res.status(502).json({ error: 'Could not start checkout — please try again' });
    }

    // access_code is what the frontend needs to open the popup.
    // authorization_url is a fallback if you ever want a full-page
    // redirect instead of the inline popup.
    return res.status(200).json({
      access_code: data.data.access_code,
      reference: data.data.reference,
    });
  } catch (err) {
    console.error('Paystack initialize error:', err);
    return res.status(500).json({ error: 'Something went wrong — please try again' });
  }
}
