const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const storeRoutes = require('./routes/store');
const categoryRoutes = require('./routes/categories');
const productRoutes = require('./routes/products');
const publicRoutes = require('./routes/public');
const adminRoutes = require('./routes/admin');
const webhookRoutes = require('./routes/webhook');
const ordersRoutes = require('./routes/orders');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

app.use('/api/auth', authRoutes);
app.use('/api/store', storeRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/webhook', webhookRoutes);
app.use('/api/orders', ordersRoutes);

// Serve React client build in production
const clientPath = path.join(__dirname, '..', '..', 'client', 'dist');
app.use(express.static(clientPath));

// SPA fallback — all non-API routes serve index.html
app.get('*', (req, res) => {
  const indexPath = path.join(clientPath, 'index.html');
  const fs = require('fs');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).json({ error: 'Build do client não encontrado. Execute: cd client && npm run build' });
  }
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

app.listen(PORT, () => {
  console.log(`🚀 ZapVitrine API rodando em http://localhost:${PORT}`);
});
