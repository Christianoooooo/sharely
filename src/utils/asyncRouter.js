const express = require('express');

const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'all', 'use'];

/**
 * Wraps a handler so a rejected promise is passed to next() instead of being lost.
 * @param {*} fn - Handler or any other route argument; non-handlers are returned unchanged.
 * @returns {*} The wrapped handler.
 */
function wrapAsync(fn) {
  // Error handlers (arity 4) and non-functions (paths, options) stay as they are.
  if (typeof fn !== 'function' || fn.length === 4) return fn;
  return function wrapped(req, res, next) {
    const result = fn.call(this, req, res, next);
    if (result && typeof result.catch === 'function') result.catch(next);
    return result;
  };
}

/**
 * Creates an Express 4 router whose async handlers forward rejections to the
 * error handler. Express 4 ignores them otherwise, leaving the request hanging.
 * @param {object} [options] - Options passed to express.Router().
 * @returns {import('express').Router} The router.
 */
function asyncRouter(options) {
  const router = express.Router(options);
  for (const method of METHODS) {
    const original = router[method].bind(router);
    router[method] = (...args) => original(...args.map((a) => (Array.isArray(a) ? a.map(wrapAsync) : wrapAsync(a))));
  }
  return router;
}

module.exports = { asyncRouter, wrapAsync };
