/**
 * The source a generated PNG was drawn from, kept in the PNG as a tEXt chunk with the keyword "Source", so a test can
 * compare a committed image with what would draw it now.
 */
import { crc32 } from "node:zlib";

const KEYWORD = "Source";

/** The PNG with a Source chunk holding `source` (Latin-1, as tEXt requires) just before its closing IEND chunk. */
export function withPngSource(png: Buffer, source: string): Buffer {
  const data = Buffer.from(`${KEYWORD}\0${source}`, "latin1");
  const type = Buffer.from("tEXt", "latin1");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([type, data])));
  const iend = png.length - 12;
  return Buffer.concat([png.subarray(0, iend), length, type, data, crc, png.subarray(iend)]);
}

/** The text of the PNG's Source chunk, if it has one. */
export function pngSource(png: Buffer): string | undefined {
  for (let at = 8; at < png.length; ) {
    const length = png.readUInt32BE(at);
    const type = png.toString("latin1", at + 4, at + 8);
    const data = png.toString("latin1", at + 8, at + 8 + length);
    if (type === "tEXt" && data.startsWith(`${KEYWORD}\0`)) return data.slice(KEYWORD.length + 1);
    at += 12 + length;
  }
  return undefined;
}
