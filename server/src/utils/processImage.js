const sharp = require('sharp');
// Desativa o cache de arquivos do libvips: no Windows o fd retido causava EBUSY
// ao tentar apagar/reescrever o arquivo de entrada logo após o processamento.
sharp.cache(false);
const fs = require('fs');
const path = require('path');

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
  let outPath;
  let buf;

  try {
    const meta = await sharp(inputPath).metadata();

    if (meta.format === 'gif' && (meta.pages || 1) > 1) {
      // GIF animado: reencodar preservando frames
      outFilename = file.filename;
      outPath = inputPath;
      buf = await sharp(inputPath, { animated: true })
        .resize({ width: MAX_WIDTH, withoutEnlargement: true })
        .gif()
        .toBuffer();
    } else {
      outFilename = file.filename.replace(/\.[^.]+$/, '.webp');
      outPath = path.join(path.dirname(inputPath), outFilename);
      buf = await sharp(inputPath)
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

  fs.writeFileSync(outPath, buf);

  // Falha de LIMPEZA não invalida o upload (o arquivo final já foi gravado)
  if (outPath !== inputPath) {
    try {
      fs.unlinkSync(inputPath);
    } catch (err) {
      console.warn(`Aviso: não foi possível remover o arquivo temporário ${inputPath}: ${err.message}`);
    }
  }

  return { filename: outFilename };
}

module.exports = { processImage };
