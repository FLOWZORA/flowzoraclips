import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import fs from 'fs';

const envText = fs.readFileSync('.env.local', 'utf8');
const env = {};
envText.split('\n').forEach(line => {
  const idx = line.indexOf('=');
  if (idx !== -1) env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
});

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true, // <-- CRITICAL FOR CLOUDFLARE R2!
});

const command = new PutObjectCommand({
  Bucket: env.R2_BUCKET_NAME,
  Key: 'test-upload-' + Date.now() + '.mp4',
  ContentType: 'video/mp4',
});

// Avoid dummy checksum calculations
const uploadUrl = await getSignedUrl(client, command, {
  expiresIn: 900,
  signableHeaders: new Set(['host', 'content-type']),
  unhoistableHeaders: new Set(['content-type']),
});
console.log('Generated Upload URL with forcePathStyle:');
console.log(uploadUrl);

const testBuffer = Buffer.from('Hello world video buffer test with forcePathStyle');
const res = await fetch(uploadUrl, {
  method: 'PUT',
  headers: {
    'Content-Type': 'video/mp4',
  },
  body: testBuffer,
});

console.log('Upload response status:', res.status, res.statusText);
const body = await res.text();
console.log('Upload response body:', body);
console.log('Response headers:');
res.headers.forEach((v, k) => console.log(`  ${k}: ${v}`));
