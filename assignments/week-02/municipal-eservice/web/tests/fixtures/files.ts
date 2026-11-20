import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

/** Generated on demand: no large binary fixtures are stored in the repository. */
export const TEST_FILE_NAMES = [
  'ok-id.pdf', 'id-card.pdf', 'map.pdf', 'plan.pdf', 'deed.pdf',
  'real.jpg', 'real.png', 'plan-as-jpg.jpg',
  'size-5242879.pdf', 'size-5242880.pdf', 'size-5242881.pdf',
  'fake-text.pdf', 'fake-text.jpg', 'exe-as.png', 'notes.txt',
  'multi-1.pdf', 'multi-2.pdf', 'multi-3.pdf', 'multi-4.pdf', 'multi-5.pdf', 'multi-6.pdf',
] as const;
export type TestFileName = (typeof TEST_FILE_NAMES)[number];
export interface TestFile { name: TestFileName; mimeType: string; buffer: Buffer }

/** One real PDF page, with correct object offsets and xref; padding precedes %%EOF. */
export function createPdf(size: number): Buffer {
  if (!Number.isSafeInteger(size) || size < 0) throw new RangeError('Invalid PDF size');
  const content = 'BT /F1 12 Tf 24 48 Td (Municipal test fixture) Tj ET\n';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 240 120] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}endstream`,
  ];
  let document = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(document));
    document += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(document);
  document += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  document += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  document += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n`;
  const prefix = Buffer.from(document);
  const suffix = Buffer.from('\n%%EOF\n');
  const padding = size - prefix.length - suffix.length;
  if (padding < 0) throw new RangeError(`PDF size must be at least ${prefix.length + suffix.length} bytes`);
  return Buffer.concat([prefix, Buffer.alloc(padding, 0x20), suffix]);
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type), data]);
  const length = Buffer.alloc(4);
  const checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, checksum]);
}

export function createPng(size = 1024): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const chunks = [pngChunk('IHDR', ihdr), pngChunk('IDAT', deflateSync(Buffer.from([0, 255, 0, 0])))];
  const end = pngChunk('IEND', Buffer.alloc(0));
  const padding = size - signature.length - chunks.reduce((sum, chunk) => sum + chunk.length, 0) - end.length - 12;
  if (!Number.isSafeInteger(size) || padding < 2) throw new RangeError('PNG size is too small or invalid');
  const text = Buffer.concat([Buffer.from('k\0'), Buffer.alloc(padding - 2, 0x78)]);
  return Buffer.concat([signature, ...chunks, pngChunk('tEXt', text), end]);
}

// A complete 1×1 red baseline JPEG, generated with Pillow's JPEG encoder (quality 80).
// Its DQT/SOF/DHT/SOS image data is retained; a COM segment provides exact-size padding.
const RED_JPEG = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABgj/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABykX//Z', 'base64');

export function createJpeg(size = 1024): Buffer {
  const padding = size - RED_JPEG.length - 4;
  if (!Number.isSafeInteger(size) || padding < 0 || padding + 2 > 65535) throw new RangeError('JPEG size is out of range');
  const comment = Buffer.alloc(padding + 4, 0x78);
  comment[0] = 0xff;
  comment[1] = 0xfe;
  comment.writeUInt16BE(padding + 2, 2);
  return Buffer.concat([RED_JPEG.subarray(0, 2), comment, RED_JPEG.subarray(2)]);
}

/** Playwright file payload, including deliberately misleading declared MIME types. */
export function fixtureFile(name: TestFileName): TestFile {
  if (!(TEST_FILE_NAMES as readonly string[]).includes(name)) throw new Error(`Unknown test file: ${name}`);
  const mimeType = name.endsWith('.pdf') ? 'application/pdf'
    : name.endsWith('.png') ? 'image/png' : name.endsWith('.jpg') ? 'image/jpeg' : 'text/plain';
  let buffer: Buffer;
  if (name.startsWith('fake-') || name === 'notes.txt') buffer = Buffer.from('hello');
  else if (name === 'exe-as.png') buffer = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(1022)]);
  else if (name.endsWith('.pdf')) buffer = createPdf(name.startsWith('size-') ? Number(name.slice(5, -4)) : 1024);
  else if (name.endsWith('.png')) buffer = createPng();
  else buffer = createJpeg();
  return { name, mimeType, buffer };
}

export async function writeTestFiles(directory: string, names: readonly TestFileName[] = TEST_FILE_NAMES): Promise<Record<string, string>> {
  await mkdir(directory, { recursive: true });
  const paths: Record<string, string> = {};
  for (const name of names) {
    const path = join(directory, name);
    await writeFile(path, fixtureFile(name).buffer);
    paths[name] = path;
  }
  return paths;
}
