/**
 * Strict file upload validator for Base64 Data URIs
 * Validates MIME type, maximum size, and binary magic byte signatures.
 * Blocks executable payloads, SVG scripts, and corrupted uploads.
 */

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

const MAGIC_SIGNATURES = {
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  'application/pdf': [0x25, 0x50, 0x44, 0x46], // %PDF
  'image/webp': [0x52, 0x49, 0x46, 0x46] // RIFF
};

function validateBase64Upload(dataUri, maxBytes = MAX_FILE_SIZE_BYTES) {
  if (!dataUri || typeof dataUri !== 'string') {
    return { valid: false, error: 'File data is empty or invalid' };
  }

  // If it's already a hosted URL (http/https), verify safe protocol
  if (/^https?:\/\//i.test(dataUri)) {
    try {
      const u = new URL(dataUri);
      if (!['http:', 'https:'].includes(u.protocol)) {
        return { valid: false, error: 'Invalid URL protocol' };
      }
      return { valid: true };
    } catch {
      return { valid: false, error: 'Malformed URL' };
    }
  }

  // Match data URI header
  const match = dataUri.match(/^data:([a-zA-Z0-9\/\-+.]+);base64,(.+)$/);
  if (!match) {
    return { valid: false, error: 'Invalid file format. Must be base64 data URI.' };
  }

  const mimeType = match[1].toLowerCase();
  const base64Data = match[2];

  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    return { valid: false, error: `Disallowed file type: ${mimeType}. Only JPG, PNG, WEBP, and PDF are allowed.` };
  }

  // Calculate approximate byte size
  const padding = (base64Data.slice(-2).match(/=/g) || []).length;
  const byteLength = (base64Data.length * 3) / 4 - padding;

  if (byteLength > maxBytes) {
    return { valid: false, error: `File size exceeds ${(maxBytes / (1024 * 1024)).toFixed(0)}MB limit.` };
  }

  // Verify binary magic numbers
  try {
    const headBuffer = Buffer.from(base64Data.slice(0, 32), 'base64');
    const expectedSig = MAGIC_SIGNATURES[mimeType];
    if (expectedSig) {
      for (let i = 0; i < expectedSig.length; i++) {
        if (headBuffer[i] !== expectedSig[i]) {
          return { valid: false, error: `Corrupted or spoofed ${mimeType} file content.` };
        }
      }
    }
  } catch (err) {
    return { valid: false, error: 'Failed to inspect file binary header' };
  }

  return { valid: true, mimeType, byteLength };
}

module.exports = {
  validateBase64Upload,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE_BYTES
};
