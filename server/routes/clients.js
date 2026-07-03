import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { validate, schemas } from '../validation.js';
import { createClient, getAllClients, getClientById, updateClient, deleteClient } from '../db.js';

const router = Router();

router.get('/', (_req, res) => res.json(getAllClients()));

router.post('/', validate(schemas.createClient), (req, res) => {
  const { name } = req.body; // validated + trimmed
  const client = {
    id: uuidv4(),
    name,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  try {
    createClient(client);
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'A client with that name already exists' });
    }
    throw err;
  }
  res.status(201).json({ ...client, projectCount: 0 });
});

router.patch('/:id', validate(schemas.updateClient), (req, res) => {
  // BE-04: 404 on missing client, 409 on duplicate name (name validated by schema).
  const { name } = req.body;
  let changed;
  try {
    changed = updateClient(req.params.id, { name, updatedAt: new Date().toISOString() });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'A client with that name already exists' });
    }
    throw err;
  }
  if (!changed) return res.status(404).json({ error: 'Client not found' });
  res.json(getClientById(req.params.id));
});

router.delete('/:id', (req, res) => {
  const changes = deleteClient(req.params.id);
  if (!changes) return res.status(404).json({ error: 'not found' });
  res.json({ id: req.params.id });
});

export default router;
