import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'flowzora-clips';
const R2_PUBLIC_DOMAIN = process.env.R2_PUBLIC_DOMAIN || 'https://r2.flowzoraclips.com';

// Local in-memory simulation storage
export const inMemoryR2 = new Map<string, { buffer: Buffer; contentType: string; uploadedAt: string }>();

function getR2Client(): S3Client | null {
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    return null;
  }

  return new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
    forcePathStyle: true,
  });
}

/**
 * Generates an isolated R2 storage key for raw podcast uploads or rendered exports.
 */
export function generateStorageKey(userId: string, filename: string, type: 'raw' | 'export' = 'raw'): string {
  const cleanFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const timestamp = Date.now();
  if (type === 'export') {
    return `exports/${userId}/${timestamp}_${cleanFilename}`;
  }
  return `raw/${userId}/${timestamp}_${cleanFilename}`;
}

/**
 * Generates a presigned PUT URL allowing the creator's browser to stream video/audio directly to R2.
 * Bypasses Next.js / Vercel serverless request body limits (4.5MB).
 */
export async function getPresignedUploadUrl({
  userId,
  filename,
  contentType,
  expiresInSec = 900, // 15 minutes
}: {
  userId: string;
  filename: string;
  contentType: string;
  expiresInSec?: number;
}): Promise<{ uploadUrl: string; fileKey: string; publicUrl: string; isSimulated: boolean }> {
  const fileKey = generateStorageKey(userId, filename, 'raw');
  const client = getR2Client();

  if (client) {
    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: fileKey,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(client, command, { expiresIn: expiresInSec });
    const publicUrl = `${R2_PUBLIC_DOMAIN}/${fileKey}`;

    return {
      uploadUrl,
      fileKey,
      publicUrl,
      isSimulated: false,
    };
  }

  // Simulated presigned upload URL for local dev and preview
  const simulatedUploadUrl = `/api/upload/simulate-upload?key=${encodeURIComponent(fileKey)}`;
  const publicUrl = `/api/upload/simulate-view?key=${encodeURIComponent(fileKey)}`;

  return {
    uploadUrl: simulatedUploadUrl,
    fileKey,
    publicUrl,
    isSimulated: true,
  };
}

/**
 * Generates a presigned GET URL to securely retrieve raw video or rendered vertical clips.
 */
export async function getPresignedDownloadUrl(fileKey: string, expiresInSec: number = 3600): Promise<string> {
  const client = getR2Client();

  if (client) {
    const command = new GetObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: fileKey,
    });
    return getSignedUrl(client, command, { expiresIn: expiresInSec });
  }

  return `${R2_PUBLIC_DOMAIN}/${fileKey}`;
}

/**
 * Uploads a Buffer directly to R2 from server environment (e.g. from YouTube audio extraction).
 */
export async function uploadBufferToR2(
  fileKey: string,
  buffer: Buffer,
  contentType: string
): Promise<{ fileKey: string; publicUrl: string }> {
  const client = getR2Client();

  if (client) {
    await client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: fileKey,
        Body: buffer,
        ContentType: contentType,
      })
    );
    return {
      fileKey,
      publicUrl: `${R2_PUBLIC_DOMAIN}/${fileKey}`,
    };
  }

  // Fallback to in-memory store
  inMemoryR2.set(fileKey, {
    buffer,
    contentType,
    uploadedAt: new Date().toISOString(),
  });

  return {
    fileKey,
    publicUrl: `http://localhost:3000/api/upload/simulate-view?key=${encodeURIComponent(fileKey)}`,
  };
}

/**
 * Retrieves a file Buffer from Cloudflare R2 or in-memory fallback.
 */
export async function getBufferFromR2(fileKey: string): Promise<Buffer | null> {
  const client = getR2Client();

  if (client) {
    try {
      const res = await client.send(
        new GetObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key: fileKey,
        })
      );

      if (res.Body) {
        const byteArray = await res.Body.transformToByteArray();
        return Buffer.from(byteArray);
      }
    } catch (err: any) {
      console.error(`[R2] getBufferFromR2 failed for key "${fileKey}":`, err.message);
    }
  }

  // Fallback to in-memory store
  const stored = inMemoryR2.get(fileKey);
  if (stored) {
    return stored.buffer;
  }

  return null;
}
