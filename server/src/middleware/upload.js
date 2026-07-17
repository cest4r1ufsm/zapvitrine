const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// A extensão do arquivo salvo vem SEMPRE deste mapa (nunca do nome enviado pelo cliente) —
// impede salvar .html/.svg/etc disfarçado de imagem e servi-lo como página (stored XSS)
const MIME_EXT = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

const ALLOWED_ORIGINAL_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + MIME_EXT[file.mimetype]);
  },
});

const fileFilter = (req, file, cb) => {
  const mimeOk = Object.prototype.hasOwnProperty.call(MIME_EXT, file.mimetype);
  const extOk = ALLOWED_ORIGINAL_EXTS.includes(path.extname(file.originalname || '').toLowerCase());
  if (mimeOk && extOk) {
    cb(null, true);
  } else {
    cb(new Error('Tipo de arquivo não suportado. Use JPG, PNG, WebP ou GIF.'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

module.exports = upload;
