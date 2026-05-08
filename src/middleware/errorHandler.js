'use strict';

// eslint-disable-next-line no-unused-vars
module.exports = function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal server error';
  if (status >= 500) {
    console.error('[error]', req.method, req.path, err);
  }
  res.status(status).json({ error: message });
};
