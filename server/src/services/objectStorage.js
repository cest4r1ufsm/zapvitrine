const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
let client;
function configured() { return process.env.MEDIA_STORAGE === 's3'; }
function s3() {
  if (!client) {
    const { S3Client } = require('@aws-sdk/client-s3');
    // S3_ENDPOINT permite serviços compatíveis com S3 (ex.: Cloudflare R2, região "auto").
    client = new S3Client(process.env.S3_ENDPOINT
      ? { region: process.env.AWS_REGION || 'auto', endpoint: process.env.S3_ENDPOINT }
      : { region: process.env.AWS_REGION });
  }
  return client;
}
async function persistImage(buffer, filename, contentType) {
  if (!configured()) {
    if (process.env.NODE_ENV === 'production') throw new Error('Armazenamento compartilhado obrigatório em produção');
    const directory = path.join(__dirname, '../../uploads');
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, path.basename(filename)), buffer);
    return `/uploads/${filename}`;
  }
  const base = new URL(process.env.MEDIA_PUBLIC_URL);
  if (base.protocol !== 'https:' || !process.env.MEDIA_BUCKET) throw new Error('Configuração de mídia inválida');
  const { PutObjectCommand } = require('@aws-sdk/client-s3');
  const key = `public/${crypto.randomUUID()}.${contentType === 'image/gif' ? 'gif' : 'webp'}`;
  await s3().send(new PutObjectCommand({ Bucket: process.env.MEDIA_BUCKET, Key: key, Body: buffer,
    ContentType: contentType, CacheControl: 'public, max-age=60',
    // R2 já criptografa tudo e não aceita este cabeçalho.
    ...(process.env.S3_ENDPOINT ? {} : { ServerSideEncryption: 'AES256' }) }),
    { abortSignal: AbortSignal.timeout(15000) });
  return `${base.href.replace(/\/$/, '')}/${key}`;
}
async function removeImage(url) {
  if (!url) return;
  if (url.startsWith('/uploads/')) {
    await fs.unlink(path.join(__dirname, '../../uploads', path.basename(url))).catch(e => { if (e.code !== 'ENOENT') throw e; });
    return;
  }
  if (!configured()) return;
  const base = process.env.MEDIA_PUBLIC_URL?.replace(/\/$/, '') + '/';
  if (!url.startsWith(base)) return;
  const key = url.slice(base.length);
  if (!/^public\/[a-f0-9-]+\.(webp|gif)$/.test(key)) return;
  const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
  await s3().send(new DeleteObjectCommand({ Bucket: process.env.MEDIA_BUCKET, Key: key }), { abortSignal: AbortSignal.timeout(15000) });
}
module.exports = { persistImage, removeImage, configured };
