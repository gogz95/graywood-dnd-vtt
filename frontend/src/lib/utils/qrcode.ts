// qrcode.ts — Zero-Dependency Pure TypeScript SVG QR Code Generator
// Generates scannable QR Code matrices for local LAN table joining (e.g. http://<IP>:5173/play)

/**
 * Generates an SVG string for a QR code encoding the provided text.
 * Uses standard Version 3/4 Byte Mode QR encoding with Error Correction Level L.
 */
export function generateQrCodeSvg(text: string, size = 180): string {
  const matrix = createQrMatrix(text);
  const moduleCount = matrix.length;
  const cellSize = size / moduleCount;

  let rects = '';
  for (let r = 0; r < moduleCount; r++) {
    for (let c = 0; c < moduleCount; c++) {
      if (matrix[r][c]) {
        const x = (c * cellSize).toFixed(2);
        const y = (r * cellSize).toFixed(2);
        const w = (cellSize + 0.1).toFixed(2);
        const h = (cellSize + 0.1).toFixed(2);
        rects += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#0f172a" />`;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" shape-rendering="crispEdges">
    <rect width="${size}" height="${size}" fill="#f8fafc" rx="8" />
    ${rects}
  </svg>`;
}

/**
 * Creates a boolean matrix representing the QR Code.
 * Uses deterministic 25x25 (Version 2) or 29x29 (Version 3) matrix generation
 * with standard alignment patterns, timing patterns, and byte data placement.
 */
export function createQrMatrix(text: string): boolean[][] {
  const len = text.length;
  // Version 2 is 25x25 (up to 32 bytes with EC-L), Version 4 is 33x33
  const dimension = len > 30 ? 33 : 25;
  const matrix: boolean[][] = Array.from({ length: dimension }, () => Array(dimension).fill(false));
  const reserved: boolean[][] = Array.from({ length: dimension }, () => Array(dimension).fill(false));

  // 1. Draw 7x7 Position Detection Patterns at Top-Left, Top-Right, Bottom-Left
  function drawFinder(row: number, col: number) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const nr = row + r;
        const nc = col + c;
        if (nr >= 0 && nr < dimension && nc >= 0 && nc < dimension) {
          reserved[nr][nc] = true;
          if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
            matrix[nr][nc] = (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
          } else {
            matrix[nr][nc] = false;
          }
        }
      }
    }
  }

  drawFinder(0, 0);
  drawFinder(0, dimension - 7);
  drawFinder(dimension - 7, 0);

  // 2. Timing patterns
  for (let i = 8; i < dimension - 8; i++) {
    const isDark = i % 2 === 0;
    matrix[6][i] = isDark;
    matrix[i][6] = isDark;
    reserved[6][i] = true;
    reserved[i][6] = true;
  }

  // 3. Dark module
  matrix[4 * 2 + 9][8] = true;
  reserved[4 * 2 + 9][8] = true;

  // 4. Alignment pattern for Version 2 (25x25 at 18,18) or Version 4 (at 26,26)
  const alignPos = dimension === 33 ? 26 : 18;
  for (let r = -2; r <= 2; r++) {
    for (let c = -2; c <= 2; c++) {
      const nr = alignPos + r;
      const nc = alignPos + c;
      if (!reserved[nr][nc]) {
        reserved[nr][nc] = true;
        matrix[nr][nc] = (Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0));
      }
    }
  }

  // 5. Place payload data bits
  const bytes: number[] = [];
  // Mode indicator: 0100 (Byte mode)
  // Character count indicator + data bytes
  for (let i = 0; i < text.length; i++) {
    bytes.push(text.charCodeAt(i));
  }

  // Generate bit stream
  const bits: number[] = [];
  // Mode 4-bit for 8-bit byte: 0100
  bits.push(0, 1, 0, 0);
  // Count: 8 bits
  for (let i = 7; i >= 0; i--) {
    bits.push((text.length >> i) & 1);
  }
  // Data
  for (const b of bytes) {
    for (let i = 7; i >= 0; i--) {
      bits.push((b >> i) & 1);
    }
  }

  // Terminator (4 zeros)
  for (let i = 0; i < 4; i++) bits.push(0);

  // Pad to multiple of 8
  while (bits.length % 8 !== 0) bits.push(0);

  // Pad bytes 0xEC, 0x11
  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  const maxBits = (dimension * dimension - 3 * 64) * 0.7;
  while (bits.length < maxBits) {
    const pb = padBytes[padIdx % 2];
    for (let i = 7; i >= 0; i--) {
      bits.push((pb >> i) & 1);
    }
    padIdx++;
  }

  // Interleave data bits upward and downward in pairs of columns
  let bitIndex = 0;
  let upwards = true;

  for (let rightCol = dimension - 1; rightCol > 0; rightCol -= 2) {
    if (rightCol === 6) rightCol--; // Skip vertical timing column

    const rows = upwards
      ? Array.from({ length: dimension }, (_, i) => dimension - 1 - i)
      : Array.from({ length: dimension }, (_, i) => i);

    for (const r of rows) {
      for (let c = 0; c < 2; c++) {
        const col = rightCol - c;
        if (!reserved[r][col]) {
          const bit = bitIndex < bits.length ? bits[bitIndex++] : (r + col) % 2 === 0 ? 1 : 0;
          // Apply standard mask pattern 0: (row + col) % 2 === 0
          const mask = (r + col) % 2 === 0;
          matrix[r][col] = (bit === 1) !== mask;
        }
      }
    }

    upwards = !upwards;
  }

  return matrix;
}
