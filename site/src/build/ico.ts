/**
 * The ICO container, for the one browser that draws no SVG icon: Safari takes /favicon.ico, the others the SVG listed
 * after it. Every browser that reads ICO at all reads a PNG inside it, so the file is a 22-byte header around one PNG.
 */

/** An ICO holding `png`, a square image `size` pixels on a side (1–256). */
export function pngToIco(png: Buffer, size: number): Buffer {
  if (!(Number.isInteger(size) && size >= 1 && size <= 256)) throw new Error(`an ICO image is 1–256 px, got ${size}`);
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // one image
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size === 256 ? 0 : size, 0); // width; 0 means 256
  entry.writeUInt8(size === 256 ? 0 : size, 1); // height
  entry.writeUInt8(0, 2); // colours in palette: none
  entry.writeUInt8(0, 3); // reserved
  entry.writeUInt16LE(1, 4); // colour planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(22, 12); // the image follows the directory
  return Buffer.concat([header, entry, png]);
}

/** The first image in an ICO, as its bytes (a PNG, for one made by pngToIco). */
export function icoImage(ico: Buffer): Buffer {
  const length = ico.readUInt32LE(14);
  const offset = ico.readUInt32LE(18);
  return ico.subarray(offset, offset + length);
}
