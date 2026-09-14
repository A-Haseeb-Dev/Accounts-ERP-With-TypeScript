import handler from './main';

// Keep a dedicated entry so a root index.js lambda can also bootstrap the same
// lazy handler; main.ts is the real serverless bridge.
export default handler;