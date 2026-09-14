import type { IncomingMessage, ServerResponse } from 'http';
import { createApp } from './main';

type RequestListener = (req: IncomingMessage, res: ServerResponse) => void;

let listener: RequestListener | null = null;

/**
 * Vercel serverless entry point. Vercel invokes the default export with Node's
 * (req, res); the Nest express app is itself an http.RequestListener, so on a
 * cold start we build and lazily bootstrap the app once and reuse its express
 * instance for every subsequent invocation.
 */
export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!listener) {
    const app = await createApp();
    await app.init();
    listener = app.getHttpAdapter().getInstance() as RequestListener;
  }
  listener(req, res);
}