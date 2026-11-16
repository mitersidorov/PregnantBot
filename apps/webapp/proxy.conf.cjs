// Dev-server-only proxy: API_KEY remains in the Node process and never enters browser bundles.
const apiKey = process.env.API_KEY;

module.exports = {
  '/api': {
    target: process.env.BACKEND_URL || 'http://localhost:3000',
    changeOrigin: true,
    secure: false,
    pathRewrite: { '^/api': '' },
    ...(apiKey ? { headers: { 'X-API-KEY': apiKey } } : {}),
  },
};
