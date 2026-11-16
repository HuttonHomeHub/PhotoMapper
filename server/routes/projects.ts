import { Router } from 'express';
import { randomBytes } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { validate, schemas, type Body } from '../validation.ts';
import {
  createProject,
  getAllProjects,
  getProjectById,
  updateProject,
  deleteProject,
  assignPhotosToProject,
  setProjectShareToken,
  clearProjectShareToken,
  type ProjectChanges,
} from '../db.ts';

export const projectsRouter = Router();
const router = projectsRouter;

router.get('/', (_req, res) => res.json(getAllProjects()));

router.post('/', validate(schemas.createProject), (req, res) => {
  const { name, clientId, status, color } = req.body as Body<'createProject'>; // name validated + trimmed
  const project = {
    id: uuidv4(),
    name,
    clientId: clientId || null,
    status: status || 'active',
    color: color || '#e97b25',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  createProject(project);
  res.status(201).json({ ...project, shareToken: null, photoCount: 0, clientName: null });
});

router.patch('/:id', validate(schemas.updateProject), (req, res) => {
  const { id } = req.params as { id: string };
  // BE-03: forward only keys the caller sent (schema strips absent ones), so an
  // explicit `clientId: null` unassigns the client. name is validated by schema.
  const body = req.body as Body<'updateProject'>;
  const changes: ProjectChanges = {};
  if ('name' in body) changes.name = body.name;
  if ('clientId' in body) changes.clientId = body.clientId;
  if ('status' in body) changes.status = body.status;
  if ('color' in body) changes.color = body.color;
  if (Object.keys(changes).length === 0) {
    return res.status(400).json({ error: 'no updatable fields provided' });
  }
  const changed = updateProject(id, changes);
  if (!changed) return res.status(404).json({ error: 'Project not found' });
  res.json(getProjectById(id));
});

router.delete('/:id', (req, res) => {
  const { id } = req.params as { id: string };
  const changes = deleteProject(id);
  if (!changes) return res.status(404).json({ error: 'not found' });
  res.json({ id: id });
});

router.patch('/:id/photos', validate(schemas.assignPhotos), (req, res) => {
  const { id } = req.params as { id: string };
  const { photoIds } = req.body as Body<'assignPhotos'>;
  assignPhotosToProject(id, photoIds);
  res.json({ assigned: photoIds.length });
});

// FEAT: enable a public read-only share link for the project. Idempotent —
// returns the existing token if one is already set (so the link is stable), and
// mints a 32-char unguessable capability token otherwise.
router.post('/:id/share', (req, res) => {
  const { id } = req.params as { id: string };
  const project = getProjectById(id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  let token = project.shareToken;
  if (!token) {
    token = randomBytes(24).toString('base64url');
    setProjectShareToken(id, token);
  }
  res.json({ id: id, shareToken: token });
});

// FEAT: revoke the share link. The old URL 404s immediately afterwards.
router.delete('/:id/share', (req, res) => {
  const { id } = req.params as { id: string };
  const project = getProjectById(id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  clearProjectShareToken(id);
  res.json({ id: id, shareToken: null });
});
