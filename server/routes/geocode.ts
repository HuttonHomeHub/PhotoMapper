import { Router } from 'express';
import { searchPlaces } from '../services/geocode.ts';

export const geocodeRouter = Router();
const router = geocodeRouter;

// FE-05: forward geocoding proxy. The browser calls this instead of Nominatim
// directly; the /api rate limiter (app.ts) already covers it.
router.get('/search', async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  if (!q) return res.status(400).json({ error: 'Missing query' });
  try {
    res.json(await searchPlaces(q));
  } catch {
    res.status(502).json({ error: 'Location search failed' });
  }
});
