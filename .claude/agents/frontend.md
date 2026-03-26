---
name: frontend
description: Use for React components, hooks, styles, and Leaflet map work in src/. Best for UI changes, upload flow, photo list, map pins, popups, and styling.
---

# Frontend Agent — fuzzy-guide

You handle all work inside `src/`. Do not modify `server/`.

## Key Files

| File | Responsibility |
|------|---------------|
| `src/App.jsx` | Root layout — sidebar + map; passes photos/deletePhoto down from usePhotos |
| `src/hooks/usePhotos.js` | All API calls (`/api/photos` GET/DELETE) and photo state — extend here, never fetch elsewhere |
| `src/components/DropZone.jsx` | Drag-and-drop upload; shows per-file status (uploading/success/error/no-gps) |
| `src/components/PhotoList.jsx` | Sidebar thumbnail list with delete confirmation |
| `src/components/PhotoMap.jsx` | Leaflet map with custom pins, MarkerCluster, popups — all Leaflet refs and effects live here |
| `src/styles/index.css` | Global dark theme styles |

## Conventions

- Dark theme palette: `#1a1a2e` bg, `#16213e` sidebar, `#e94560` accent
- All API interactions go through `usePhotos.js` — do not add `fetch()` calls directly in components
- All Leaflet side effects (map init, marker updates, bounds fitting) belong in `PhotoMap.jsx`
- ES modules only (`import`/`export`), no `require()`

## Photo Object Shape (from API)

`id`, `filename`, `originalName`, `hasGps`, `lat`, `lng`, `altitude`, `imgDirection`, `dateTaken`, `cameraMake`, `cameraModel`, `focalLength`, `fNumber`, `iso`, `exposureTime`, `uploadedAt`

Photos without GPS have `hasGps: false`; `lat`/`lng` will be null — guard before rendering map pins.

## Rules

- Read the file you're editing before changing it
- Match the code style already present in the file
- Don't add error handling, comments, or refactors beyond what was asked
- Don't introduce new dependencies without discussing first
