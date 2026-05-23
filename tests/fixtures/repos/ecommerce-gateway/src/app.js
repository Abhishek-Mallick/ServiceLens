require('dotenv').config();
const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const productRoutes = require('./routes/productRoutes');
const cartRoutes = require('./routes/cartRoutes');
const orderRoutes = require('./routes/orderRoutes');
const { requireAuth } = require('./middleware/auth');
const { limiter } = require('./middleware/rateLimit');
const { errorHandler, notFoundHandler } = require('./lib/errors');

const app = express();

app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  exposedHeaders: ['X-Guest-Token'],
}));
app.use(express.json());
app.use(limiter);

app.get('/', (_req, res) => {
  res.json({ success: true, service: 'ecommerce-gateway' });
});

app.get('/health', (_req, res) => {
  res.json({ success: true, service: 'ecommerce-gateway', status: 'ok' });
});

app.post('/api/auth/register', authRoutes.register);
app.post('/api/auth/login', authRoutes.login);
app.post('/api/auth/refresh', authRoutes.refresh);
app.post('/api/auth/logout', authRoutes.logout);
app.get('/api/auth/verify', authRoutes.verify);

app.use('/api/users', requireAuth, userRoutes.proxyUser);

app.get('/api/products/categories/list', productRoutes.proxyProduct);
app.get('/api/products/:id', productRoutes.proxyProduct);
app.get('/api/products', productRoutes.proxyProduct);

app.use('/api/cart', cartRoutes.proxyCart);

app.use('/api/orders', requireAuth, orderRoutes.proxyOrder);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
