const { proxyRequest, sendProxyResponse } = require('../lib/serviceClient');
const { AUTH_URL } = require('../clients/serviceUrls');

async function register(req, res, next) {
  try {
    const result = await proxyRequest(AUTH_URL, '/api/auth/register', req);
    sendProxyResponse(res, result);
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const result = await proxyRequest(AUTH_URL, '/api/auth/login', req);
    sendProxyResponse(res, result);
  } catch (err) {
    next(err);
  }
}

async function refresh(req, res, next) {
  try {
    const result = await proxyRequest(AUTH_URL, '/api/auth/refresh', req);
    sendProxyResponse(res, result);
  } catch (err) {
    next(err);
  }
}

async function logout(req, res, next) {
  try {
    const result = await proxyRequest(AUTH_URL, '/api/auth/logout', req);
    sendProxyResponse(res, result);
  } catch (err) {
    next(err);
  }
}

async function verify(req, res, next) {
  try {
    const result = await proxyRequest(AUTH_URL, '/api/auth/verify', req);
    sendProxyResponse(res, result);
  } catch (err) {
    next(err);
  }
}

module.exports = { register, login, refresh, logout, verify };
