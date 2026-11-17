// Helpers shared by the server tests.
import type { Express } from 'express';
import request, { type Test } from 'supertest';

export const CSRF_TOKEN = 'test-csrf-token';

export type WriteMethod = 'post' | 'put' | 'patch' | 'delete';

/**
 * Write requests carrying the CSRF cookie and the same token in the header, as
 * apiFetch sends them. Takes a getter because the app is imported in beforeAll.
 */
export function csrfWriter(getApp: () => Express) {
  return (method: WriteMethod, url: string) => {
    const agent = request(getApp());
    return agent[method](url)
      .set('Cookie', `hhh_csrf=${CSRF_TOKEN}`)
      .set('X-CSRF-Token', CSRF_TOKEN);
  };
}

/** A supertest parser that collects a binary body (e.g. a zip) into a Buffer. */
export const binary: Parameters<Test['parse']>[0] = (res, done) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => done(null, Buffer.concat(chunks)));
};
