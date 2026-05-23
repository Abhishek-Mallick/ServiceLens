const AUTH_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:4001';
const USER_URL = process.env.USER_SERVICE_URL || 'http://localhost:4002';
const PRODUCT_URL = process.env.PRODUCT_SERVICE_URL || 'http://localhost:4003';
const CART_URL = process.env.CART_SERVICE_URL || 'http://localhost:4004';
const ORDER_URL = process.env.ORDER_SERVICE_URL || 'http://localhost:4005';

module.exports = {
  AUTH_URL,
  USER_URL,
  PRODUCT_URL,
  CART_URL,
  ORDER_URL,
};
