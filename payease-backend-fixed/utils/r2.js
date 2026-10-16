const { S3Client, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const crypto = require('crypto');
const Settings = require('../models/Settings');

let cachedConfig = null;
let lastConfigFetch = 0;
let s3ClientInstance = null;
let lastClientSignature = '';

/**
 * Fetch R2 configuration from process.env with fallback to MongoDB Settings
 */
async function getR2Config(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedConfig && now - lastConfigFetch < 60000) {
    return cachedConfig;
  }

  let accountId = process.env.R2_ACCOUNT_ID || '';
  let accessKeyId = process.env.R2_ACCESS_KEY_ID || '';
  let secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || '';
  let bucketName = process.env.R2_BUCKET_NAME || '';
  let publicUrl = process.env.R2_PUBLIC_URL || '';

  // If missing in env, check DB Settings
  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
    try {
      const dbSetting = await Settings.findOne({ key: 'cloudflare_r2' }).lean();
      if (dbSetting && dbSetting.value && typeof dbSetting.value === 'object') {
        const v = dbSetting.value;
        if (!accountId && v.accountId) accountId = v.accountId;
        if (!accessKeyId && v.accessKeyId) accessKeyId = v.accessKeyId;
        if (!secretAccessKey && v.secretAccessKey) secretAccessKey = v.secretAccessKey;
        if (!bucketName && v.bucketName) bucketName = v.bucketName;
        if (!publicUrl && v.publicUrl) publicUrl = v.publicUrl;
      }
    } catch (e) {
      // Ignore DB read failure
    }
  }

  const isConfigured = Boolean(accountId && accessKeyId && secretAccessKey && bucketName);

  cachedConfig = {
    accountId: accountId.trim(),
    accessKeyId: accessKeyId.trim(),
    secretAccessKey: secretAccessKey.trim(),
    bucketName: bucketName.trim(),
    publicUrl: (publicUrl || '').trim().replace(/\/$/, ''),
    isConfigured
  };
  lastConfigFetch = now;
  return cachedConfig;
}

/**
 * Get cached or initialized S3Client instance for Cloudflare R2
 */
async function getR2Client() {
  const config = await getR2Config();
  if (!config.isConfigured) return null;

  const signature = `${config.accountId}:${config.accessKeyId}:${config.bucketName}`;
  if (s3ClientInstance && lastClientSignature === signature) {
    return s3ClientInstance;
  }

  s3ClientInstance = new S3Client({
    region: 'auto',
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    // Cloudflare R2 standard configuration
    forcePathStyle: true,
  });

  lastClientSignature = signature;
  return s3ClientInstance;
}

/**
 * Parse base64 Data URI into binary Buffer and metadata
 */
function parseBase64Data(dataUri) {
  if (!dataUri || typeof dataUri !== 'string') return null;

  const match = dataUri.match(/^data:([a-zA-Z0-9\/\-+.]+);base64,(.+)$/);
  if (!match) return null;

  const mimeType = match[1].toLowerCase();
  const base64Data = match[2];
  const buffer = Buffer.from(base64Data, 'base64');

  const extensionMap = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'application/pdf': 'pdf'
  };

  const ext = extensionMap[mimeType] || 'bin';
  return { buffer, mimeType, ext, size: buffer.length };
}

/**
 * Upload Base64 Data URI or Buffer to Cloudflare R2
 * Returns direct CDN URL. If R2 is not configured, returns original dataUri gracefully.
 *
 * @param {string|Buffer} input - Base64 Data URI or raw Buffer
 * @param {string} folder - Destination folder (e.g. 'deposits', 'kyc', 'proofs', 'qr')
 * @param {string} filenamePrefix - Prefix for clean naming
 * @param {string} explicitMime - Optional explicit mime type if input is Buffer
 * @returns {Promise<string>} Public CDN URL of the uploaded asset (or input on fallback)
 */
async function uploadToR2(input, folder = 'uploads', filenamePrefix = 'asset', explicitMime = '') {
  if (!input) return '';

  // R2 upload disabled / skipped as requested (direct pass-through)
  if (process.env.ENABLE_R2 !== 'true') {
    return input;
  }

  // If already an HTTP/HTTPS URL, don't re-upload
  if (typeof input === 'string' && /^https?:\/\//i.test(input)) {
    return input;
  }

  const client = await getR2Client();
  const config = await getR2Config();

  // Graceful fallback if R2 is not configured
  if (!client || !config.isConfigured) {
    return input;
  }

  let buffer;
  let mimeType;
  let ext;

  if (Buffer.isBuffer(input)) {
    buffer = input;
    mimeType = explicitMime || 'application/octet-stream';
    ext = mimeType.split('/')[1] || 'bin';
  } else if (typeof input === 'string') {
    const parsed = parseBase64Data(input);
    if (!parsed) {
      // Not a valid base64 data URI, return input as fallback
      return input;
    }
    buffer = parsed.buffer;
    mimeType = parsed.mimeType;
    ext = parsed.ext;
  } else {
    return input;
  }

  const cleanFolder = folder.replace(/^\/+|\/+$/g, '');
  const cleanPrefix = filenamePrefix.replace(/[^a-zA-Z0-9_-]/g, '_');
  const uniqueToken = crypto.randomBytes(6).toString('hex');
  const key = `${cleanFolder}/${cleanPrefix}_${Date.now()}_${uniqueToken}.${ext}`;

  try {
    const command = new PutObjectCommand({
      Bucket: config.bucketName,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
      CacheControl: 'public, max-age=31536000, immutable', // High-performance edge cache
    });

    await client.send(command);

    // Build public URL
    let publicUrl = '';
    if (config.publicUrl) {
      publicUrl = `${config.publicUrl}/${key}`;
    } else {
      // Default R2 dev domain / direct endpoint
      publicUrl = `https://${config.bucketName}.${config.accountId}.r2.cloudflarestorage.com/${key}`;
    }

    return publicUrl;
  } catch (err) {
    console.error('Cloudflare R2 Upload Error:', err.message);
    // Return original input so application flow is never disrupted
    return input;
  }
}

/**
 * Test R2 connection by performing a tiny write and delete
 */
async function testR2Connection(customConfig = null) {
  try {
    let client;
    let bucketName;

    if (customConfig && customConfig.accountId && customConfig.accessKeyId) {
      client = new S3Client({
        region: 'auto',
        endpoint: `https://${customConfig.accountId}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: customConfig.accessKeyId,
          secretAccessKey: customConfig.secretAccessKey,
        },
        forcePathStyle: true,
      });
      bucketName = customConfig.bucketName;
    } else {
      client = await getR2Client();
      const cfg = await getR2Config();
      bucketName = cfg.bucketName;
    }

    if (!client || !bucketName) {
      return { success: false, message: 'Cloudflare R2 credentials are not configured.' };
    }

    const testKey = `ping/health_test_${Date.now()}.txt`;
    const pingBuffer = Buffer.from(`R2 Health Check at ${new Date().toISOString()}`, 'utf-8');

    // Put ping object
    await client.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: testKey,
      Body: pingBuffer,
      ContentType: 'text/plain',
    }));

    // Clean up ping object
    try {
      await client.send(new DeleteObjectCommand({
        Bucket: bucketName,
        Key: testKey,
      }));
    } catch (_) {}

    return {
      success: true,
      message: 'Cloudflare R2 connection verified successfully! Fast CDN upload is active.'
    };
  } catch (err) {
    return {
      success: false,
      message: `R2 Connection failed: ${err.message}`
    };
  }
}

module.exports = {
  getR2Config,
  getR2Client,
  uploadToR2,
  testR2Connection
};
