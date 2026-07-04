/**
 * Offline acoustic-fingerprint matching (spec §11). Decodes Chromaprint's
 * compressed fingerprint to raw 32-bit sub-fingerprints, then clusters files
 * that are the same recording via bit-error-rate over aligned prefixes,
 * gated by duration. Deterministic, no network — that's the whole point: the
 * online AcoustID lookup (naming) is a separate, later phase (Enrich).
 *
 * NOTE: the compressed-format decoder follows Chromaprint's algorithm but should
 * be validated against real `fpcalc` output; the matching/clustering below is
 * pure and unit-tested with raw sub-fingerprint arrays.
 */

class BitReader {
  private pos = 0;
  constructor(private readonly bytes: Uint8Array) {}
  /** Read `n` bits, LSB-first across bytes (Chromaprint's bit order). */
  read(n: number): number {
    let result = 0;
    for (let i = 0; i < n; i++) {
      const bytePos = this.pos >> 3;
      const bitPos = this.pos & 7;
      const bit = bytePos < this.bytes.length ? (this.bytes[bytePos]! >> bitPos) & 1 : 0;
      result |= bit << i;
      this.pos++;
    }
    return result >>> 0;
  }
  available(): number {
    return this.bytes.length * 8 - this.pos;
  }
}

const B64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const B64_LOOKUP = (() => {
  const t = new Int16Array(256).fill(-1);
  for (let i = 0; i < B64_ALPHABET.length; i++) t[B64_ALPHABET.charCodeAt(i)] = i;
  return t;
})();

/** Decode base64 or base64url (no Node Buffer — core stays environment-agnostic). */
export function base64ToBytes(input: string): Uint8Array {
  const clean = input.replace(/-/g, "+").replace(/_/g, "/");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let acc = 0;
  let bits = 0;
  let oi = 0;
  for (let i = 0; i < clean.length; i++) {
    const v = B64_LOOKUP[clean.charCodeAt(i)]!;
    if (v < 0) continue;
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[oi++] = (acc >> bits) & 0xff;
    }
  }
  return out.subarray(0, oi);
}

/** Decode a base64(url) Chromaprint fingerprint into raw uint32 sub-fingerprints. */
export function decodeChromaprint(fingerprint: string): Uint32Array {
  const bytes = base64ToBytes(fingerprint);
  if (bytes.length < 4) throw new Error("fingerprint too short");
  const size = (bytes[1]! << 16) | (bytes[2]! << 8) | bytes[3]!;
  if (size <= 0 || size > 1_000_000) throw new Error("implausible fingerprint size");

  const reader = new BitReader(bytes.subarray(4));

  // Normal bits: 3-bit groups; a zero terminates one value.
  const bits: number[] = [];
  let zeros = 0;
  while (zeros < size && reader.available() >= 3) {
    const b = reader.read(3);
    bits.push(b);
    if (b === 0) zeros++;
  }
  // Exception bits: any 3-bit group equal to 7 carries an extra 5 bits.
  for (let i = 0; i < bits.length; i++) {
    if (bits[i] === 7 && reader.available() >= 5) {
      bits[i]! += reader.read(5);
    }
  }

  // Unpack: bit positions (delta-coded) rebuild each value, XOR with previous.
  const result = new Uint32Array(size);
  let idx = 0;
  let lastBit = 0;
  let value = 0;
  for (const b of bits) {
    if (b === 0) {
      result[idx] = idx > 0 ? (value ^ result[idx - 1]!) >>> 0 : value >>> 0;
      value = 0;
      lastBit = 0;
      idx++;
      if (idx >= size) break;
      continue;
    }
    const bit = lastBit + b;
    lastBit = bit;
    value = (value | (1 << (bit - 1))) >>> 0;
  }
  return result;
}

function popcount32(x: number): number {
  let v = x >>> 0;
  v = v - ((v >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  v = (v + (v >>> 4)) & 0x0f0f0f0f;
  return (v * 0x01010101) >>> 24;
}

/** Bit-error rate over the aligned prefix of two sub-fingerprint arrays (0..1). */
export function bitErrorRate(a: Uint32Array, b: Uint32Array): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 1;
  let diff = 0;
  for (let i = 0; i < n; i++) diff += popcount32((a[i]! ^ b[i]!) >>> 0);
  return diff / (n * 32);
}

export interface FpItem {
  id: string;
  fingerprint: Uint32Array;
  durationSec: number;
}

export interface ClusterOptions {
  /** Max bit-error rate to consider two files the same recording. */
  maxBer?: number;
  /** Max duration difference (seconds) for two files to be compared. */
  durationToleranceSec?: number;
}

class UnionFind {
  private parent = new Map<string, string>();
  find(x: string): string {
    let root = this.parent.get(x) ?? x;
    if (root === x) {
      if (!this.parent.has(x)) this.parent.set(x, x);
      return x;
    }
    root = this.find(root);
    this.parent.set(x, root);
    return root;
  }
  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

/** Cluster files that are the same recording. Returns groups of ≥2 ids. */
export function clusterByFingerprint(items: FpItem[], options: ClusterOptions = {}): string[][] {
  const maxBer = options.maxBer ?? 0.15;
  const tol = options.durationToleranceSec ?? 7;
  const sorted = [...items].sort((a, b) => a.durationSec - b.durationSec);
  const uf = new UnionFind();
  for (const it of sorted) uf.find(it.id);

  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i]!;
      const b = sorted[j]!;
      if (b.durationSec - a.durationSec > tol) break; // sorted: no closer matches ahead
      if (bitErrorRate(a.fingerprint, b.fingerprint) <= maxBer) uf.union(a.id, b.id);
    }
  }

  const groups = new Map<string, string[]>();
  for (const it of sorted) {
    const root = uf.find(it.id);
    (groups.get(root) ?? groups.set(root, []).get(root)!).push(it.id);
  }
  return [...groups.values()].filter((g) => g.length >= 2);
}
