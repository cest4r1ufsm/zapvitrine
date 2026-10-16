const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const { processImage } = require('../src/utils/processImage');
const { removeImage } = require('../src/services/objectStorage');
process.env.NODE_ENV = 'test';
delete process.env.MEDIA_STORAGE;
(async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'agt-media-test-'));
  try {
    const filename = crypto.randomUUID() + '.png';
    const source = path.join(directory, filename);
    await sharp({ create: { width: 1800, height: 600, channels: 3, background: '#abcdef' } }).png().toFile(source);
    const image = await processImage({ path: source, filename });
    assert.equal(image.url, `/uploads/${filename.replace('.png', '.webp')}`);
    const destination = path.join(__dirname, '../uploads', image.filename);
    const metadata = await sharp(destination).metadata();
    assert.equal(metadata.width, 1200);
    assert.equal(metadata.format, 'webp');
    assert.equal(metadata.exif, undefined);
    await assert.rejects(fs.stat(source), { code: 'ENOENT' });
    await removeImage(image.url);
    await assert.rejects(fs.stat(destination), { code: 'ENOENT' });
    await fs.writeFile(source, '<svg onload="alert(1)">not a photograph</svg>');
    await assert.rejects(processImage({ path: source, filename }), { status: 400 });
    await assert.rejects(fs.stat(source), { code: 'ENOENT' });
    console.log('PASS media: actual decoding, resizing, metadata stripping, rejected payload removal and deletion');
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
