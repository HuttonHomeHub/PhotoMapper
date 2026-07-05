import { Router } from 'express';
import { getProjectByShareToken, queryPhotos } from '../db.js';

const router = Router();

// FEAT: public, unauthenticated read-only access to a single shared project via
// an unguessable capability token. This is the ONE deliberately public surface in
// an otherwise edge-authed app (ADR-0007), so it is intentionally narrow:
//   - only projects whose owner has minted a share token are reachable;
//   - only that project's photos and its name/colour are returned — never client
//     data, other projects, the token itself, or any write surface.
// Deployments that want the link reachable without their proxy auth must allowlist
// GET /api/public/share/* (and the /share/:token SPA route) at the reverse proxy.
router.get('/share/:token', (req, res) => {
  const project = getProjectByShareToken(req.params.token);
  if (!project) return res.status(404).json({ error: 'Share not found' });

  const photos = queryPhotos({ projectId: project.id }).map((p) => ({
    id: p.id,
    originalName: p.originalName,
    filename: p.filename,
    thumbnailFilename: p.thumbnailFilename,
    hasGps: p.hasGps,
    lat: p.lat,
    lng: p.lng,
    altitude: p.altitude,
    imgDirection: p.imgDirection,
    dateTaken: p.dateTaken,
    locationName: p.locationName,
    description: p.description,
    tags: p.tags,
  }));

  res.json({ project: { name: project.name, color: project.color }, photos });
});

export default router;
