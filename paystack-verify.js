// api/paystack-verify.js
//
// Called by the browser right after Paystack's popup reports success —
// but a browser-side "success" callback firing is not proof a payment
// actually happened; a browser can be tampered with in ways a server
// call to Paystack's own API cannot. This endpoint asks Paystack
// directly, server-to-server, whether a given reference really was
// paid, for the right amount, in the right currency, before your
// frontend is allowed to show the download page.
//
// This still isn't the full picture on its own — see paystack-webhook.js
// for the authoritative, browser-independent confirmation. Use both:
// this endpoint for a fast "yes, show the thank-you page now," and the
// webhook as the source of truth for actually releasing the product.

const PRICE_ZAR_CENTS = 159900; // must match api/paystack-initialize.js
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

  const { reference } = req.body || {};
  if (!reference || typeof reference !== 'string') {
    return res.status(400).json({ error: 'Missing transaction reference' });
  }

  try {
    const paystackRes = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        headers: { Authorization: `Bearer ${secretKey}` },
      }
    );

    const data = await paystackRes.json();

    if (!paystackRes.ok || !data.status) {
      console.error('Paystack verify failed:', data);
      return res.status(502).json({ verified: false, error: 'Could not verify transaction' });
    }

    const tx = data.data;
    const verified =
      tx.status === 'success' &&
      tx.amount === PRICE_ZAR_CENTS &&
      tx.currency === CURRENCY;

    if (!verified) {
      console.warn('Transaction did not pass verification checks:', {
        reference,
        status: tx.status,
        amount: tx.amount,
        currency: tx.currency,
      });
    }

    return res.status(200).json({ verified, reference: tx.reference });
  } catch (err) {
    console.error('Paystack verify error:', err);
    return res.status(500).json({ verified: false, error: 'Something went wrong' });
  }
}
