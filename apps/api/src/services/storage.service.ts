import { GetObjectCommand, HeadBucketCommand, CreateBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createHash } from 'node:crypto';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

/**
 * Belge deposu (S3 uyumlu; dev: MinIO). Belgeler private ACL; indirme presigned URL ile
 * ya da API üzerinden stream edilir — doğrudan public erişim YOK.
 */
let client: S3Client | null = null;
function s3(): S3Client {
  if (!client) {
    client = new S3Client({
      region: 'us-east-1',
      endpoint: env.S3_ENDPOINT,
      forcePathStyle: true,
      credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
    });
  }
  return client;
}

export const DOC_BUCKET = `${env.S3_BUCKET}-documents`;

export async function ensureDocBucket(): Promise<void> {
  try {
    await s3().send(new HeadBucketCommand({ Bucket: DOC_BUCKET }));
  } catch {
    try {
      await s3().send(new CreateBucketCommand({ Bucket: DOC_BUCKET }));
      logger.info({ bucket: DOC_BUCKET }, 'belge kovası oluşturuldu');
    } catch (err) {
      logger.error({ err, bucket: DOC_BUCKET }, 'belge kovası oluşturulamadı');
    }
  }
}

export async function putDocument(key: string, body: Buffer, contentType: string): Promise<{ key: string; sha256: string; bytes: number }> {
  await s3().send(new PutObjectCommand({ Bucket: DOC_BUCKET, Key: key, Body: body, ContentType: contentType }));
  return { key, sha256: createHash('sha256').update(body).digest('hex'), bytes: body.length };
}

export async function getDocument(key: string): Promise<Buffer> {
  const res = await s3().send(new GetObjectCommand({ Bucket: DOC_BUCKET, Key: key }));
  const chunks: Buffer[] = [];
  for await (const c of res.Body as AsyncIterable<Uint8Array>) chunks.push(Buffer.from(c));
  return Buffer.concat(chunks);
}

export async function documentUrl(key: string, seconds = 300): Promise<string> {
  return getSignedUrl(s3(), new GetObjectCommand({ Bucket: DOC_BUCKET, Key: key }), { expiresIn: seconds });
}
