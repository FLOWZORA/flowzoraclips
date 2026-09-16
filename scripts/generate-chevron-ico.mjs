import zlib from 'zlib';
import fs from 'fs';

function createPng(w, h) {
  const stride = w * 4 + 1;
  const raw = Buffer.alloc(stride * h);

  // Helper for point to segment distance
  function distToSegment(px, py, x1, y1, x2, y2) {
    const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
    if (l2 === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
  }

  function distToTriangle(px, py, x1, y1, x2, y2, x3, y3) {
    const d1 = distToSegment(px, py, x1, y1, x2, y2);
    const d2 = distToSegment(px, py, x2, y2, x3, y3);
    const d3 = distToSegment(px, py, x3, y3, x1, y1);
    return Math.min(d1, d2, d3);
  }

  for (let y = 0; y < h; y++) {
    raw[y * stride] = 0; // Filter None
    for (let x = 0; x < w; x++) {
      const idx = y * stride + 1 + x * 4;

      // Squircle corner distance
      const qx = Math.max(0, Math.abs(x - 15.5) - 9.0);
      const qy = Math.max(0, Math.abs(y - 15.5) - 9.0);
      const cornerDist = Math.hypot(qx, qy);

      let r = 0, g = 0, b = 0, a = 0;

      if (cornerDist <= 6.5) {
        // Inside black squircle
        r = 0; g = 0; b = 0; a = 255;
        if (cornerDist > 5.5) {
          a = Math.round(255 * (6.5 - cornerDist));
        }

        // Triangle 1: (7, 9) -> (15, 15.5) -> (7, 22)
        const dTri1 = distToTriangle(x, y, 7, 9, 15, 15.5, 7, 22);
        // Triangle 2: (17, 9) -> (25, 15.5) -> (17, 22)
        const dTri2 = distToTriangle(x, y, 17, 9, 25, 15.5, 17, 22);

        const minStrokeDist = Math.min(dTri1, dTri2);

        if (minStrokeDist <= 1.3) {
          // Crisp white stroke
          const strokeAlpha = minStrokeDist <= 0.8 ? 1 : (1.3 - minStrokeDist) / 0.5;
          r = Math.round(255 * strokeAlpha);
          g = Math.round(255 * strokeAlpha);
          b = Math.round(255 * strokeAlpha);
        }
      }

      raw[idx] = r;
      raw[idx + 1] = g;
      raw[idx + 2] = b;
      raw[idx + 3] = a;
    }
  }

  const compressed = zlib.deflateSync(raw);

  function crc32(buf) {
    let crc = 0 ^ (-1);
    for (let i = 0; i < buf.length; i++) {
      crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xFF];
    }
    return (crc ^ (-1)) >>> 0;
  }
  const table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) c = 0xedb88320 ^ (c >>> 1);
      else c = c >>> 1;
    }
    table[n] = c;
  }

  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    const full = Buffer.concat([typeBuf, data]);
    crcBuf.writeUInt32BE(crc32(full), 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const png = Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);

  const icoHeader = Buffer.alloc(6);
  icoHeader.writeUInt16LE(0, 0);
  icoHeader.writeUInt16LE(1, 2);
  icoHeader.writeUInt16LE(1, 4);

  const icoDir = Buffer.alloc(16);
  icoDir[0] = w;
  icoDir[1] = h;
  icoDir[2] = 0;
  icoDir[3] = 0;
  icoDir.writeUInt16LE(1, 4);
  icoDir.writeUInt16LE(32, 6);
  icoDir.writeUInt32LE(png.length, 8);
  icoDir.writeUInt32LE(22, 12);

  return Buffer.concat([icoHeader, icoDir, png]);
}

const ico = createPng(32, 32);
fs.writeFileSync('public/favicon.ico', ico);
fs.writeFileSync('src/app/favicon.ico', ico);
console.log('Successfully generated new favicon.ico (double white chevron), size:', ico.length);
