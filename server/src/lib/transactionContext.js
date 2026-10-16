const { AsyncLocalStorage } = require('node:async_hooks');
// All legacy services transparently share the booking transaction. Never hold a
// connection-local tenant/lock outside this asynchronous scope.
module.exports = new AsyncLocalStorage();
