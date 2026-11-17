// Makes the end-to-end test photos (committed beside this file). Re-run after changing:
//   docker run --rm --user 1000:1000 -v "$PWD":/app -w /app node:22-bookworm \
//     node e2e/fixtures/make-fixtures.ts
// gps.jpg carries real EXIF GPS (written by hand below: a TIFF block with a GPS IFD),
// so uploads exercise the same EXIF path as a phone photo. no-gps.jpg has none.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));

function scene(sky: string, ground: string, label: string): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420">
    <rect width="640" height="420" fill="${sky}"/>
    <path d="M0 260 Q 200 190 400 250 T 640 230 V 420 H 0 Z" fill="${ground}"/>
    <text x="24" y="396" font-family="sans-serif" font-size="28" fill="#fff">${label}</text></svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 80 }).toBuffer();
}

/** degrees → three EXIF rationals (d, m, s×100/100). */
function dms(value: number): Array<[number, number]> {
  const abs = Math.abs(value);
  const d = Math.floor(abs);
  const m = Math.floor((abs - d) * 60);
  const s = Math.round(((abs - d) * 60 - m) * 60 * 100);
  return [
    [d, 1],
    [m, 1],
    [s, 100],
  ];
}

/** An APP1 "Exif" segment holding only a GPS IFD (lat, lng, direction). */
function gpsExif(lat: number, lng: number, direction: number): Buffer {
  type Entry = { tag: number; type: number; count: number; value: Buffer };
  const ascii = (s: string) => Buffer.from(`${s}\0`, 'ascii');
  const rationals = (pairs: Array<[number, number]>) => {
    const b = Buffer.alloc(pairs.length * 8);
    pairs.forEach(([n, dn], i) => {
      b.writeUInt32LE(n, i * 8);
      b.writeUInt32LE(dn, i * 8 + 4);
    });
    return b;
  };
  const gps: Entry[] = [
    { tag: 0x0001, type: 2, count: 2, value: ascii(lat >= 0 ? 'N' : 'S') },
    { tag: 0x0002, type: 5, count: 3, value: rationals(dms(lat)) },
    { tag: 0x0003, type: 2, count: 2, value: ascii(lng >= 0 ? 'E' : 'W') },
    { tag: 0x0004, type: 5, count: 3, value: rationals(dms(lng)) },
    { tag: 0x0010, type: 2, count: 2, value: ascii('T') },
    { tag: 0x0011, type: 5, count: 1, value: rationals([[Math.round(direction * 100), 100]]) },
  ];

  // Layout: header (8) | IFD0 (2 + 12 + 4) | GPS IFD (2 + 12n + 4) | GPS values
  const ifd0At = 8;
  const gpsAt = ifd0At + 2 + 12 + 4;
  let dataAt = gpsAt + 2 + 12 * gps.length + 4;
  const tiff = Buffer.alloc(
    dataAt + gps.reduce((n, e) => n + (e.value.length > 4 ? e.value.length : 0), 0)
  );
  tiff.write('II', 0, 'ascii');
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(ifd0At, 4);
  tiff.writeUInt16LE(1, ifd0At);
  tiff.writeUInt16LE(0x8825, ifd0At + 2); // GPSInfo pointer
  tiff.writeUInt16LE(4, ifd0At + 4); // LONG
  tiff.writeUInt32LE(1, ifd0At + 6);
  tiff.writeUInt32LE(gpsAt, ifd0At + 10);
  tiff.writeUInt32LE(0, ifd0At + 14);
  tiff.writeUInt16LE(gps.length, gpsAt);
  gps.forEach((e, i) => {
    const at = gpsAt + 2 + i * 12;
    tiff.writeUInt16LE(e.tag, at);
    tiff.writeUInt16LE(e.type, at + 2);
    tiff.writeUInt32LE(e.count, at + 4);
    if (e.value.length <= 4) e.value.copy(tiff, at + 8);
    else {
      tiff.writeUInt32LE(dataAt, at + 8);
      e.value.copy(tiff, dataAt);
      dataAt += e.value.length;
    }
  });
  tiff.writeUInt32LE(0, gpsAt + 2 + 12 * gps.length);

  const body = Buffer.concat([Buffer.from('Exif\0\0', 'ascii'), tiff]);
  const header = Buffer.alloc(4);
  header.writeUInt16BE(0xffe1, 0);
  header.writeUInt16BE(body.length + 2, 2);
  return Buffer.concat([header, body]);
}

/** Puts the APP1 segment straight after the JPEG's start-of-image marker. */
function withExif(jpeg: Buffer, app1: Buffer): Buffer {
  return Buffer.concat([jpeg.subarray(0, 2), app1, jpeg.subarray(2)]);
}

// Near Edale, in the Peak District: open land, clear satellite tiles.
const gps = withExif(await scene('#8fb8e0', '#557f4a', 'Edale'), gpsExif(53.3651, -1.8166, 135));
writeFileSync(join(here, 'gps.jpg'), gps);
writeFileSync(join(here, 'no-gps.jpg'), await scene('#e8c4a0', '#6d5a48', 'Somewhere'));
console.warn('wrote gps.jpg and no-gps.jpg');
