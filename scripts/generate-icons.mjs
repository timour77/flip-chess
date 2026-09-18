#!/usr/bin/env node
/**
 * Generate PNG icons for flip-chess without external dependencies.
 * Builds RGBA pixel buffers, deflates them with Node's zlib, and wraps in PNG chunks.
 *
 * Generates:
 *   - icon-192.png: 192x192, 4x4 checkerboard (62% of canvas)
 *   - icon-512.png: 512x512, 4x4 checkerboard (62% of canvas)
 *   - maskable-512.png: 512x512, 4x4 checkerboard (45% of canvas)
 */

import fs from 'fs';
import zlib from 'zlib';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'icons');

// Colors
const BG_COLOR = { r: 0x16, g: 0x15, b: 0x12, a: 0xff };     // #161512
const LIGHT_SQUARE = { r: 0xf0, g: 0xd9, b: 0xb5, a: 0xff }; // #f0d9b5
const DARK_SQUARE = { r: 0xb5, g: 0x88, b: 0x63, a: 0xff };  // #b58863

// CRC32 table for PNG checksums
const CRC32_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let crc = i;
  for (let k = 0; k < 8; k++) {
    crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  CRC32_TABLE[i] = crc;
}

/**
 * Compute CRC32 for a byte sequence
 */
function crc32(data) {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC32_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Write a PNG chunk with proper CRC
 */
function writePngChunk(type, data) {
  const chunkType = Buffer.from(type, 'ascii');
  const chunkData = Buffer.isBuffer(data) ? data : Buffer.from(data);

  const length = Buffer.alloc(4);
  length.writeUInt32BE(chunkData.length);

  const crcData = Buffer.concat([chunkType, chunkData]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcData));

  return Buffer.concat([length, chunkType, chunkData, crc]);
}

/**
 * Generate a PNG file
 * @param {number} width - Canvas width
 * @param {number} height - Canvas height
 * @param {number} checkerPercentage - Checkerboard size as % of canvas (0-100)
 * @returns {Buffer} Complete PNG file
 */
function generatePng(width, height, checkerPercentage) {
  // Create RGBA pixel buffer (4 bytes per pixel)
  const pixels = Buffer.alloc(width * height * 4);

  // Fill with background color
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = BG_COLOR.r;
    pixels[i + 1] = BG_COLOR.g;
    pixels[i + 2] = BG_COLOR.b;
    pixels[i + 3] = BG_COLOR.a;
  }

  // Draw checkerboard in center
  const checkerSize = Math.floor(width * checkerPercentage / 100);
  const checkerStartX = Math.floor((width - checkerSize) / 2);
  const checkerStartY = Math.floor((height - checkerSize) / 2);
  const squareSize = Math.floor(checkerSize / 4); // 4x4 grid

  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const isLight = (x + y) % 2 === 0;
      const color = isLight ? LIGHT_SQUARE : DARK_SQUARE;

      const startX = checkerStartX + x * squareSize;
      const startY = checkerStartY + y * squareSize;

      for (let py = startY; py < startY + squareSize && py < height; py++) {
        for (let px = startX; px < startX + squareSize && px < width; px++) {
          const idx = (py * width + px) * 4;
          pixels[idx] = color.r;
          pixels[idx + 1] = color.g;
          pixels[idx + 2] = color.b;
          pixels[idx + 3] = color.a;
        }
      }
    }
  }

  // Build scanlines with filter bytes (filter type 0 = None)
  const scanlines = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    scanlines[y * (width * 4 + 1)] = 0; // Filter type: None
    const rowStart = y * width * 4;
    pixels.copy(scanlines, y * (width * 4 + 1) + 1, rowStart, rowStart + width * 4);
  }

  // Deflate the image data
  const compressedData = zlib.deflateSync(scanlines);

  // Build PNG file
  const png = Buffer.alloc(8); // PNG signature
  png[0] = 0x89;
  png[1] = 0x50;
  png[2] = 0x4e;
  png[3] = 0x47;
  png[4] = 0x0d;
  png[5] = 0x0a;
  png[6] = 0x1a;
  png[7] = 0x0a;

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // Bit depth
  ihdr[9] = 6; // Color type: RGBA
  ihdr[10] = 0; // Compression method
  ihdr[11] = 0; // Filter method
  ihdr[12] = 0; // Interlace method

  return Buffer.concat([
    png,
    writePngChunk('IHDR', ihdr),
    writePngChunk('IDAT', compressedData),
    writePngChunk('IEND', Buffer.alloc(0))
  ]);
}

/**
 * Main execution
 */
async function main() {
  try {
    // Ensure output directory exists
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    // Generate icons
    const icons = [
      { name: 'icon-192.png', size: 192, percentage: 62 },
      { name: 'icon-512.png', size: 512, percentage: 62 },
      { name: 'maskable-512.png', size: 512, percentage: 45 }
    ];

    for (const icon of icons) {
      const pngData = generatePng(icon.size, icon.size, icon.percentage);
      const filepath = path.join(OUTPUT_DIR, icon.name);
      fs.writeFileSync(filepath, pngData);
      console.log(`✓ Generated ${icon.name} (${icon.size}x${icon.size})`);
    }

    console.log('\nAll icons generated successfully!');
  } catch (error) {
    console.error('Error generating icons:', error);
    process.exit(1);
  }
}

main();
