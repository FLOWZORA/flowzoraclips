import { S3Client, PutBucketCorsCommand, GetBucketCorsCommand } from '@aws-sdk/client-s3';
import fs from 'fs';

const envText = fs.readFileSync('.env.local', 'utf8');
const env = {};
envText.split('\n').forEach(line => {
  const idx = line.indexOf('=');
  if (idx !== -1) {
    const k = line.slice(0, idx).trim();
    const v = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
    env[k] = v;
  }
});

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
});

console.log('Testing GetBucketCorsCommand on bucket:', env.R2_BUCKET_NAME);
try {
  const res = await client.send(new GetBucketCorsCommand({ Bucket: env.R2_BUCKET_NAME }));
  console.log('Current CORS:', JSON.stringify(res.CORSRules));
} catch (err) {
  console.log('Get CORS notice:', err.name, err.message);
}

console.log('Applying CORS to R2 bucket:', env.R2_BUCKET_NAME);
try {
  const corsRes = await client.send(
    new PutBucketCorsCommand({
      Bucket: env.R2_BUCKET_NAME,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedHeaders: ['*'],
            AllowedMethods: ['GET', 'PUT', 'HEAD', 'POST', 'DELETE'],
            AllowedOrigins: ['*'],
            ExposeHeaders: ['ETag'],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    })
  );
  console.log('SUCCESS! CORS policy applied to R2 bucket:', corsRes);
} catch (err) {
  console.error('FAILED to set CORS via API:', err);
}
