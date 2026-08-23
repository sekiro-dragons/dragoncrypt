/**
 * Minimal QR code generator (no external dependency).
 * Generates a QR code as an SVG string from a text input.
 * Based on the QR Code specification (ISO/IEC 18004).
 *
 * This is a compact implementation supporting byte-mode encoding
 * with error correction level L, suitable for short URLs.
 */

// Reed-Solomon and QR matrix generation
// Simplified implementation for URL-length strings

type QRMatrix = number[][];

const EC_CODEWORDS_L: Record<number, number> = {
    1: 7, 2: 10, 3: 15, 4: 20, 5: 26, 6: 36, 7: 40, 8: 48, 9: 44, 10: 40,
};

const DATA_CODEWORDS: Record<number, number> = {
    1: 19, 2: 34, 3: 55, 4: 80, 5: 108, 6: 154, 7: 192, 8: 230, 9: 271, 10: 316,
};

// GF(256) tables for Reed-Solomon
const GF_EXP: number[] = new Array(512);
const GF_LOG: number[] = new Array(256);

function initGF(): void {
    let x = 1;
    for (let i = 0; i < 255; i++) {
        GF_EXP[i] = x;
        GF_LOG[x] = i;
        x <<= 1;
        if (x & 0x100) x ^= 0x11d;
    }
    for (let i = 255; i < 512; i++) {
        GF_EXP[i] = GF_EXP[i - 255];
    }
}
initGF();

function gfMul(a: number, b: number): number {
    if (a === 0 || b === 0) return 0;
    return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function rsEncode(data: number[], ecLen: number): number[] {
    // Generator polynomial
    const gen: number[] = new Array(ecLen + 1).fill(0);
    gen[0] = 1;
    for (let i = 0; i < ecLen; i++) {
        gen[i + 1] = 1;
        for (let j = i; j > 0; j--) {
            gen[j] = gen[j - 1] ^ gfMul(gen[j], GF_EXP[i]);
        }
        gen[0] = gfMul(gen[0], GF_EXP[i]);
    }
    // Reverse
    gen.reverse();

    const result: number[] = new Array(ecLen).fill(0);
    const buf = [...data];
    for (let i = 0; i < data.length; i++) {
        const factor = buf[i];
        for (let j = 0; j < ecLen; j++) {
            result[j] ^= gfMul(factor, gen[j + 1]);
        }
    }
    return result;
}

function getQRVersion(text: string): number {
    const len = new TextEncoder().encode(text).length;
    for (let v = 1; v <= 10; v++) {
        const capacity = Math.floor((DATA_CODEWORDS[v] * 8 - 4) / 8);
        if (len <= capacity) return v;
    }
    return 10;
}

function buildMatrix(version: number, dataBits: number[]): QRMatrix {
    const size = 17 + 4 * version;
    const matrix: QRMatrix = Array.from({ length: size }, () =>
        new Array(size).fill(0),
    );
    const reserved: boolean[][] = Array.from({ length: size }, () =>
        new Array(size).fill(false),
    );

    // Finder patterns
    function placeFinder(r: number, c: number): void {
        for (let i = -1; i <= 7; i++) {
            for (let j = -1; j <= 7; j++) {
                const ri = r + i;
                const ci = c + j;
                if (ri < 0 || ci < 0 || ri >= size || ci >= size) continue;
                const border =
                    i === 0 || i === 6 || j === 0 || j === 6;
                const inner = i >= 2 && i <= 4 && j >= 2 && j <= 4;
                matrix[ri][ci] = (border || inner) ? 1 : 0;
                reserved[ri][ci] = true;
            }
        }
    }
    placeFinder(0, 0);
    placeFinder(0, size - 7);
    placeFinder(size - 7, 0);

    // Timing patterns
    for (let i = 8; i < size - 8; i++) {
        matrix[6][i] = i % 2 === 0 ? 1 : 0;
        matrix[i][6] = i % 2 === 0 ? 1 : 0;
        reserved[6][i] = true;
        reserved[i][6] = true;
    }

    // Dark module
    matrix[size - 8][8] = 1;
    reserved[size - 8][8] = true;

    // Format info (simplified — all 0 for EC level L, mask 0)
    // We'll apply mask 0 and compute format bits
    const formatBits = 0b111011111101100; // EC level L, mask 0
    for (let i = 0; i < 15; i++) {
        const bit = (formatBits >> i) & 1;
        // Around top-left
        if (i < 6) {
            matrix[8][i] = bit;
            reserved[8][i] = true;
        } else if (i < 8) {
            matrix[8][i + 1] = bit;
            reserved[8][i + 1] = true;
        } else if (i < 9) {
            matrix[7][8] = bit;
            reserved[7][8] = true;
        } else {
            matrix[14 - i][8] = bit;
            reserved[14 - i][8] = true;
        }
        // Around top-right and bottom-left
        if (i < 8) {
            matrix[size - 1 - i][8] = bit;
            reserved[size - 1 - i][8] = true;
        } else {
            matrix[8][size - 15 + i] = bit;
            reserved[8][size - 15 + i] = true;
        }
    }

    // Place data bits
    let bitIdx = 0;
    let upward = true;
    for (let col = size - 1; col > 0; col -= 2) {
        if (col === 6) col--; // Skip timing column
        for (let i = 0; i < size; i++) {
            const row = upward ? size - 1 - i : i;
            for (let j = 0; j < 2; j++) {
                const c = col - j;
                if (!reserved[row][c]) {
                    let bit = bitIdx < dataBits.length ? dataBits[bitIdx] : 0;
                    // Apply mask 0: (row + col) % 2 === 0
                    if ((row + c) % 2 === 0) bit ^= 1;
                    matrix[row][c] = bit;
                    bitIdx++;
                }
            }
        }
        upward = !upward;
    }

    return matrix;
}

function textToBits(text: string, version: number): number[] {
    const bytes = Array.from(new TextEncoder().encode(text));
    const dataCodewords = DATA_CODEWORDS[version];
    const ecCodewords = EC_CODEWORDS_L[version];
    const totalBits = (dataCodewords + ecCodewords) * 8;

    const bits: number[] = [];

    // Mode indicator (byte mode = 0100)
    bits.push(0, 1, 0, 0);

    // Character count (8 bits for version 1-9, 16 for 10+)
    const countBits = version < 10 ? 8 : 16;
    const len = bytes.length;
    for (let i = countBits - 1; i >= 0; i--) {
        bits.push((len >> i) & 1);
    }

    // Data
    for (const byte of bytes) {
        for (let i = 7; i >= 0; i--) {
            bits.push((byte >> i) & 1);
        }
    }

    // Terminator
    const remaining = totalBits - bits.length;
    for (let i = 0; i < Math.min(4, remaining); i++) {
        bits.push(0);
    }

    // Pad to byte boundary
    while (bits.length % 8 !== 0) {
        bits.push(0);
    }

    // Pad bytes
    const padBytes = [0xec, 0x11];
    let padIdx = 0;
    while (bits.length < dataCodewords * 8) {
        const byte = padBytes[padIdx % 2];
        for (let i = 7; i >= 0; i--) {
            bits.push((byte >> i) & 1);
        }
        padIdx++;
    }

    // Convert to codewords
    const dataCodewordsArr: number[] = [];
    for (let i = 0; i < bits.length; i += 8) {
        let byte = 0;
        for (let j = 0; j < 8; j++) {
            byte = (byte << 1) | bits[i + j];
        }
        dataCodewordsArr.push(byte);
    }

    // Generate EC codewords
    const ecCodewordsArr = rsEncode(dataCodewordsArr, ecCodewords);

    // Interleave
    const allBits: number[] = [];
    for (const cw of dataCodewordsArr) {
        for (let i = 7; i >= 0; i--) allBits.push((cw >> i) & 1);
    }
    for (const cw of ecCodewordsArr) {
        for (let i = 7; i >= 0; i--) allBits.push((cw >> i) & 1);
    }

    return allBits;
}

/** Generate a QR code as an SVG string. */
export function generateQR(text: string): string {
    const version = getQRVersion(text);
    const bits = textToBits(text, version);
    const matrix = buildMatrix(version, bits);
    const size = matrix.length;

    const cellSize = 4;
    const margin = 16;
    const totalSize = size * cellSize + margin * 2;

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalSize}" height="${totalSize}" viewBox="0 0 ${totalSize} ${totalSize}">`;
    svg += `<rect width="${totalSize}" height="${totalSize}" fill="white"/>`;

    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            if (matrix[r][c] === 1) {
                const x = margin + c * cellSize;
                const y = margin + r * cellSize;
                svg += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="black"/>`;
            }
        }
    }

    svg += '</svg>';
    return svg;
}
