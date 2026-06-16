const { proxyRequest, sendProxyResponse } = require('../lib/serviceClient');
const { PRODUCT_URL } = require('../clients/serviceUrls');

async function proxyProduct(req, res, next) {
  try {
    const path = req.originalUrl.replace(/^\/api\/products/, '/api/products');
    const result = await proxyRequest(PRODUCT_URL, path, req);
    sendProxyResponse(res, result);
  } catch (err) {
    next(err);
  }
}

module.exports = { proxyProduct };
