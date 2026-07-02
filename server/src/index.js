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
const whatsappRoutes = require('./routes/whatsapp');
const billingRoutes = require('./routes/billing');
const stripeWebhookRoutes = require('./routes/stripe-webhook');
const professionalsRoutes = require('./routes/professionals');
const blockedSlotsRoutes = require('./routes/blocked-slots');
const clientsRoutes = require('./routes/clients');
const availabilityRoutes = require('./routes/availability');
const { restoreSessions } = require('./services/whatsapp');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());

// Webhook da Stripe TEM que vir ANTES do express.json() para não converter o Buffer para Object
app.use('/api/webhook/stripe', stripeWebhookRoutes);

app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

app.use('/api/auth', authRoutes);
app.use('/api/store', storeRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/webhook', webhookRoutes); // Webhook da Kiwify
app.use('/api/orders', ordersRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/professionals', professionalsRoutes);
app.use('/api/blocked-slots', blockedSlotsRoutes);
app.use('/api/clients', clientsRoutes);
app.use('/api/availability', availabilityRoutes);

// Serve React client build in production
const clientPath = path.join(__dirname, '..', '..', 'client', 'dist');
app.use(express.static(clientPath));

// SPA fallback — all non-API routes serve index.html
app.use((req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) {
    return next();
  }
  const indexPath = path.join(clientPath, 'index.html');
  const fs = require('fs');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    next();
  }
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

app.listen(PORT, () => {
  console.log(`🚀 AGTgestor API rodando em http://localhost:${PORT}`);
  // Restore WhatsApp sessions
  restoreSessions().catch(err => console.error('Error restoring sessions:', err));
});
