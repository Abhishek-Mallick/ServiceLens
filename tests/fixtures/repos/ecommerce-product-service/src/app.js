require('dotenv').config();
const express = require('express');
const cors = require('cors');
const productRoutes = require('./routes/productRoutes');
const { errorHandler, notFoundHandler } = require('./lib/errors');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (_req, res) => {
  res.json({ success: true, service: 'product-service' });
});

app.use('/api/products', productRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
