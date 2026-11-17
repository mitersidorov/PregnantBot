// Dev-server-only proxy: API_KEY remains in the Node process and never enters browser bundles.
const apiKey = process.env.API_KEY;
const localTestUserId = process.env.LOCAL_TEST_USER_ID?.trim();

module.exports = {
  '/api': {
    target: process.env.BACKEND_URL || 'http://localhost:3000',
    changeOrigin: true,
    secure: false,
    pathRewrite: { '^/api': '' },
    ...(apiKey ? { headers: { 'X-API-KEY': apiKey } } : {}),
    ...(localTestUserId
      ? {
          onProxyReq(proxyReq, req) {
            if (!req.headers['x-telegram-init-data']) {
              proxyReq.setHeader('X-Local-Test-User-ID', localTestUserId);
            }
          },
        }
      : {}),
  },
};
