const sharp = require('sharp');
// Desativa o cache de arquivos do libvips: no Windows o fd retido causava EBUSY
// ao tentar apagar/reescrever o arquivo de entrada logo após o processamento.
sharp.cache(false);
const fs = require('fs');

const MAX_WIDTH = 1200;
const WEBP_QUALITY = 82;

/**
 * Reencoda a imagem enviada: qualquer payload que não seja imagem real falha na
 * decodificação (o arquivo é apagado e um erro 400 é lançado). Redimensiona para
 * no máximo 1200px de largura, remove EXIF e converte para WebP — exceto GIF
 * animado, que é reencodado como GIF para preservar a animação.
 *
 * O pipeline sempre processa para buffer e só depois grava em disco: isso permite
 * que input e output sejam o mesmo arquivo (ex.: upload já em .webp) sem o erro
 * "Cannot use same file for input and output" do sharp.
 *
 * @param {object} file - req.file do multer (diskStorage)
 * @returns {Promise<{filename: string}>} nome final do arquivo dentro de uploads/
 */
async function processImage(file) {
  const inputPath = file.path;

  let outFilename;
  let buf;

  try {
    const meta = await sharp(inputPath, { limitInputPixels: 20000000 }).metadata();
    if ((meta.pages || 1) > 60 || meta.width * meta.height * (meta.pages || 1) > 40000000) throw new Error('Imagem muito grande');

    if (meta.format === 'gif' && (meta.pages || 1) > 1) {
      // GIF animado: reencodar preservando frames
      outFilename = file.filename;
      buf = await sharp(inputPath, { animated: true, limitInputPixels: 40000000 })
        .resize({ width: MAX_WIDTH, withoutEnlargement: true })
        .gif()
        .toBuffer();
    } else {
      outFilename = file.filename.replace(/\.[^.]+$/, '.webp');
      buf = await sharp(inputPath, { limitInputPixels: 20000000 })
        .rotate() // aplica orientação EXIF antes de descartar os metadados
        .resize({ width: MAX_WIDTH, withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer();
    }
  } catch (err) {
    // Falha de DECODIFICAÇÃO: o sharp não reconheceu o arquivo como imagem
    try { fs.unlinkSync(inputPath); } catch {}
    const invalid = new Error('Arquivo não é uma imagem válida');
    invalid.status = 400;
    throw invalid;
  }

  let url;
  try {
    url = await require('../services/objectStorage').persistImage(buf, outFilename, outFilename.endsWith('.gif') ? 'image/gif' : 'image/webp');
  } finally {
    // Originals live in quarantine; local and S3 outputs are always separate.
    try { fs.unlinkSync(inputPath); } catch {}
  }

  return { filename: outFilename, url };
}

module.exports = { processImage };
