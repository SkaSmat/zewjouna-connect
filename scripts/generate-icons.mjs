// Generates ZEWJOUNA PWA icons (brand: white heart on green) as PNGs, with no
// native image deps — raw PNG encoding via node:zlib. Run: bun scripts/generate-icons.mjs
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

const GREEN = [46, 125, 91]; // #2E7D5B
const WHITE = [255, 255, 255];

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePng(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw);
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// Implicit heart curve test: inside when f(x,y) <= 0.
function inHeart(x, y) {
  const a = x * x + y * y - 1;
  return a * a * a - x * x * y * y * y <= 0;
}

function makeIcon(size, heartScale) {
  const rgba = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size * 0.46;
  const s = size * heartScale;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const x = (px - cx) / s;
      const y = (cy - py) / s;
      const color = inHeart(x, y) ? WHITE : GREEN;
      const i = (py * size + px) * 4;
      rgba[i] = color[0];
      rgba[i + 1] = color[1];
      rgba[i + 2] = color[2];
      rgba[i + 3] = 255;
    }
  }
  return encodePng(size, rgba);
}

mkdirSync("public", { recursive: true });
// "any" icons: heart fills ~64% of the tile.
writeFileSync("public/icon-192.png", makeIcon(192, 0.3));
writeFileSync("public/icon-512.png", makeIcon(512, 0.3));
// maskable: smaller heart so it stays inside the safe zone with padding.
writeFileSync("public/icon-maskable-512.png", makeIcon(512, 0.24));
writeFileSync("public/apple-touch-icon.png", makeIcon(180, 0.3));
console.log("Icons written to public/");
