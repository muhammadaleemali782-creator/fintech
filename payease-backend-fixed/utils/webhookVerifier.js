/**
 * Webhook signature verification helper
 * Uses constant-time HMAC SHA-256 comparison to prevent timing attacks.
 */
const crypto = require('crypto');

function verifyWebhookSignature(payload, signatureHeader, secret = process.env.WEBHOOK_SECRET) {
  if (!signatureHeader || !secret) return false;

  try {
    const rawData = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(rawData)
      .digest('hex');

    const cleanSig = signatureHeader.replace(/^sha256=/i, '').trim();
    const sigBuffer = Buffer.from(cleanSig, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');

    if (sigBuffer.length !== expectedBuffer.length) return false;
    return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

module.exports = { verifyWebhookSignature };
