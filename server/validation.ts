import type { RequestHandler } from 'express';
import { z } from 'zod';

// BE-02: centralized request-body validation. Each route declares a schema;
// invalid bodies get a 400 with field-level detail before the handler runs, and
// the handler receives the parsed (and coerced/trimmed) body.

export function validate(schema: z.ZodType): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: 'Invalid request',
        details: result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      });
    }
    req.body = result.data;
    next();
  };
}

const name = z.string().trim().min(1, 'must be a non-empty string');
const status = z.enum(['active', 'archived']);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD');

export const schemas = {
  createClient: z.object({ name }),
  updateClient: z.object({ name }),

  createProject: z.object({
    name,
    clientId: z.string().nullish(),
    status: status.optional(),
    color: z.string().optional(),
  }),
  // Partial update: absent keys are left untouched; an explicit `clientId: null`
  // unassigns the client (BE-03). Presence is preserved because zod omits keys
  // that were not supplied.
  updateProject: z.object({
    name: name.optional(),
    clientId: z.string().nullable().optional(),
    status: status.optional(),
    color: z.string().optional(),
  }),

  updatePhoto: z.object({
    description: z.string().nullable().optional(),
    tags: z.array(z.string()).optional(),
    projectId: z.string().nullable().optional(),
    surveyDate: isoDate.nullable().optional(),
  }),

  // FEAT: manual GPS placement. Both coordinates are required and range-checked.
  setPhotoLocation: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }),

  batchUpdatePhotos: z.object({
    ids: z.array(z.string()).min(1, 'ids array required'),
    tags: z.array(z.string()).optional(),
    description: z.string().nullable().optional(),
    mergeTags: z.boolean().optional(),
  }),

  assignPhotos: z.object({
    photoIds: z.array(z.string()).min(1, 'photoIds array required'),
  }),
};

/** The parsed body a route receives after `validate(schemas.<name>)`. */
export type Body<K extends keyof typeof schemas> = z.infer<(typeof schemas)[K]>;
