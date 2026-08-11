// test-harness.mjs — NOT part of the deployed backend.
// Simulates Vercel's (req, res) call signature well enough to exercise
// the actual handler logic locally, without needing `vercel dev` or a
// real Paystack account. Run with: node test-harness.mjs

import initializeHandler from './api/paystack-initialize.js';
import verifyHandler from './api/paystack-verify.js';
import webhookHandler from './api/paystack-webhook.js';
import crypto from 'crypto';
import { EventEmitter } from 'events';

function mockRes() {
  const res = {
    _status: null,
    _json: null,
    _headers: {},
    _ended: false,
    status(code) { this._status = code; return this; },
    json(obj) { this._json = obj; this._ended = true; return this; },
    setHeader(k, v) { this._headers[k] = v; },
    end() { this._ended = true; return this; },
  };
  return res;
}

function mockReq({ method = 'POST', body = {}, headers = {}, rawBody = null }) {
  const req = new EventEmitter();
  req.method = method;
  req.body = body;
  req.headers = headers;
  // for the webhook handler, which reads raw bytes via req.on('data'/'end')
  process.nextTick(() => {
    if (rawBody !== null) {
      req.emit('data', rawBody);
    }
    req.emit('end');
  });
  return req;
}

async function run() {
  let passed = 0, failed = 0;
  function check(name, cond) {
    if (cond) { console.log(`  PASS  ${name}`); passed++; }
    else { console.log(`  FAIL  ${name}`); failed++; }
  }

  console.log('\n=== paystack-initialize.js ===');
  delete process.env.PAYSTACK_SECRET_KEY;
  {
    const req = mockReq({ method: 'POST', body: { email: 'test@example.com' } });
    const res = mockRes();
    await initializeHandler(req, res);
    check('rejects when PAYSTACK_SECRET_KEY is missing', res._status === 500);
  }
  process.env.PAYSTACK_SECRET_KEY = 'sk_test_fake_for_local_testing';
  {
    const req = mockReq({ method: 'GET', body: {} });
    const res = mockRes();
    await initializeHandler(req, res);
    check('rejects non-POST method', res._status === 405);
  }
  {
    const req = mockReq({ method: 'POST', body: { email: 'not-an-email' } });
    const res = mockRes();
    await initializeHandler(req, res);
    check('rejects invalid email', res._status === 400);
  }
  {
    const req = mockReq({ method: 'POST', body: {} });
    const res = mockRes();
    await initializeHandler(req, res);
    check('rejects missing email', res._status === 400);
  }
  // Valid email + fake key will attempt a real fetch to Paystack and fail
  // (no real key) — confirms it fails gracefully rather than crashing.
  {
    const req = mockReq({ method: 'POST', body: { email: 'test@example.com' } });
    const res = mockRes();
    try {
      await initializeHandler(req, res);
      check('valid request handled without throwing (fake key -> graceful failure)', res._status === 502 || res._status === 500);
    } catch (err) {
      check('valid request handled without throwing', false);
      console.log('    threw:', err.message);
    }
  }

  console.log('\n=== paystack-verify.js ===');
  {
    const req = mockReq({ method: 'POST', body: {} });
    const res = mockRes();
    await verifyHandler(req, res);
    check('rejects missing reference', res._status === 400);
  }
  {
    const req = mockReq({ method: 'GET', body: {} });
    const res = mockRes();
    await verifyHandler(req, res);
    check('rejects non-POST method', res._status === 405);
  }

  console.log('\n=== paystack-webhook.js ===');
  {
    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    const payload = JSON.stringify({
      event: 'charge.success',
      data: { reference: 'fts_test_123', amount: 159900, currency: 'ZAR', customer: { email: 'test@example.com' }, paid_at: '2026-08-11T00:00:00Z' },
    });
    const validSig = crypto.createHmac('sha512', secretKey).update(payload).digest('hex');

    const req = mockReq({ method: 'POST', rawBody: payload, headers: { 'x-paystack-signature': validSig } });
    const res = mockRes();
    await webhookHandler(req, res);
    check('accepts a correctly signed webhook', res._status === 200);
  }
  {
    const payload = JSON.stringify({ event: 'charge.success', data: {} });
    const req = mockReq({ method: 'POST', rawBody: payload, headers: { 'x-paystack-signature': 'wrong_signature_here' } });
    const res = mockRes();
    await webhookHandler(req, res);
    check('rejects a webhook with a bad signature', res._status === 401);
  }
  {
    const payload = JSON.stringify({ event: 'charge.success', data: {} });
    const req = mockReq({ method: 'POST', rawBody: payload, headers: {} });
    const res = mockRes();
    await webhookHandler(req, res);
    check('rejects a webhook with no signature header at all', res._status === 401);
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
