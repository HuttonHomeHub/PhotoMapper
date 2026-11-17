// Types for the browser libraries that ship none.

declare module 'leaflet-heatmap' {
  import type { Layer } from 'leaflet';

  export interface HeatmapPoint {
    lat: number;
    lng: number;
    value: number;
  }

  /** leaflet-heatmap's overlay: a Leaflet layer drawn by heatmap.js. */
  // eslint-disable-next-line no-restricted-exports -- the library's own default export
  export default class HeatmapOverlay extends Layer {
    constructor(config: Record<string, unknown>);
    setData(data: { max: number; data: HeatmapPoint[] }): void;
  }
}
