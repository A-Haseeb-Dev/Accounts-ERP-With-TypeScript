// Vercel serverless entry: the compiled Nest handler. Vercel invokes the
// exported default handler (Node req/res) for every routed request. index.js
// stays at the project root so Vercel's zero-config lambda detection (which
// previously picked the broken main.js bootstrap) targets this instead.
const { handler } = require('./dist/src/server.js');

module.exports = handler;