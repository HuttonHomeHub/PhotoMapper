# Geo-math notes

Non-obvious geometry and photographic math used by the app, mainly for the
field-of-view (FOV) cones drawn on the map (`src/components/PhotoMap.jsx`,
`createFovConePolygon`).

## Field-of-view (FOV) cones

Each geotagged photo with a known camera bearing can be drawn as a wedge showing
roughly where the camera was pointed and how wide its view was.

### Inputs (from EXIF)

| Field | Meaning |
|---|---|
| `lat`, `lng` | Camera position (the wedge apex). |
| `imgDirection` | Camera bearing in degrees clockwise from north (EXIF `GPSImgDirection`). **Required** — with no bearing there's nothing to point the cone at, so no cone is drawn. |
| `focalLength` | Lens focal length in mm (as recorded). |
| `focalLengthIn35mm` | 35mm-**equivalent** focal length. Preferred, because the FOV formula below assumes a full-frame sensor. |
| `panoHFov` | Horizontal FOV in degrees for panoramas (EXIF/XMP `GPano:CroppedAreaImageWidthPixels`-derived). Overrides the focal-length estimate when present. |

### Horizontal FOV angle

Two ways to obtain the horizontal FOV (HFOV):

1. **Panorama metadata** — if `panoHFov` is present, use it directly (converted to
   radians). If it is ≥ **358°** (an effectively full 360° panorama) the wedge is
   meaningless, so a **full circle** is drawn instead.

2. **From focal length** — otherwise estimate from the lens using the standard
   angle-of-view formula:

   ```
   HFOV = 2 · atan( (sensorWidth / 2) / focalLength )
   ```

   The code uses `2 · atan(18 / efl)`, where:
   - `18` is **half of a 36 mm** full-frame sensor's width (`36 / 2`), and
   - `efl` is `focalLengthIn35mm ?? focalLength`.

   Using the **35mm-equivalent** focal length is what makes the fixed 36 mm sensor
   width correct regardless of the actual sensor size. If neither focal length is
   known, it falls back to **65°** (a typical "normal" lens HFOV).

### Wedge geometry

- The wedge is drawn to a fixed **`groundRadius` of 40 m**. This is a *visual*
  length for legibility — it is **not** derived from the photo and does not imply
  the subject was 40 m away.
- The arc is sampled at **20 points** from `bearing − HFOV/2` to `bearing + HFOV/2`.
- Each arc vertex is found with the spherical **destination-point** formula: given
  the start point, a bearing `θ`, and angular distance `δ = groundRadius / R`
  (Earth radius `R = 6 371 000 m`):

  ```
  lat2 = asin( sin(lat1)·cos(δ) + cos(lat1)·sin(δ)·cos(θ) )
  lng2 = lng1 + atan2( sin(θ)·sin(δ)·cos(lat1),
                       cos(δ) − sin(lat1)·sin(lat2) )
  ```

- The final polygon is `[apex, …arc vertices, apex]`, producing a filled pie-slice.

## Distance (elevation profile)

`src/components/ElevationProfile.jsx` accumulates along-track distance between
consecutive photos with the **haversine** formula (great-circle distance on a
sphere, `R = 6371 km`), summing segment lengths in the order the photos were taken.
