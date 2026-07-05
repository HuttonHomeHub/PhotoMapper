import { Router } from 'express';
import { randomBytes } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { validate, schemas } from '../validation.js';
import {
  createProject,
  getAllProjects,
  getProjectById,
  updateProject,
  deleteProject,
  assignPhotosToProject,
  setProjectShareToken,
  clearProjectShareToken,
} from '../db.js';

const router = Router();

router.get('/', (_req, res) => res.json(getAllProjects()));

router.post('/', validate(schemas.createProject), (req, res) => {
  const { name, clientId, status, color } = req.body; // name validated + trimmed
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
  // BE-03: forward only keys the caller sent (schema strips absent ones), so an
  // explicit `clientId: null` unassigns the client. name is validated by schema.
  const changes = {};
  for (const k of ['name', 'clientId', 'status', 'color']) {
    if (k in req.body) changes[k] = req.body[k];
  }
  if (Object.keys(changes).length === 0) {
    return res.status(400).json({ error: 'no updatable fields provided' });
  }
  const changed = updateProject(req.params.id, changes);
  if (!changed) return res.status(404).json({ error: 'Project not found' });
  res.json(getProjectById(req.params.id));
});

router.delete('/:id', (req, res) => {
  const changes = deleteProject(req.params.id);
  if (!changes) return res.status(404).json({ error: 'not found' });
  res.json({ id: req.params.id });
});

router.patch('/:id/photos', validate(schemas.assignPhotos), (req, res) => {
  assignPhotosToProject(req.params.id, req.body.photoIds);
  res.json({ assigned: req.body.photoIds.length });
});

// FEAT: enable a public read-only share link for the project. Idempotent —
// returns the existing token if one is already set (so the link is stable), and
// mints a 32-char unguessable capability token otherwise.
router.post('/:id/share', (req, res) => {
  const project = getProjectById(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  let token = project.shareToken;
  if (!token) {
    token = randomBytes(24).toString('base64url');
    setProjectShareToken(req.params.id, token);
  }
  res.json({ id: req.params.id, shareToken: token });
});

// FEAT: revoke the share link. The old URL 404s immediately afterwards.
router.delete('/:id/share', (req, res) => {
  const project = getProjectById(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  clearProjectShareToken(req.params.id);
  res.json({ id: req.params.id, shareToken: null });
});

export default router;
