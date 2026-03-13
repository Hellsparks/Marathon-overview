/**
 * Tests for the colorimeter service — focused on parseReading() which is
 * the pure parsing logic. Web Serial API connection functions require a real
 * browser and are not tested here.
 *
 * Real TD1 output captured during testing:
 *   clearScreen
 *   display, TD-1: V2.0.1, 18, 16
 *   display, Insert Filament, 18, 16
 *   display, TD:, 50, 5
 *   display, Hex Code:, 14, 20
 *   display, Scanning, 74, 20
 *   display, Scanning, 74, 5
 *   display, 6.6, 74, 5        ← TD value
 *   display, 2B446F, 74, 20    ← hex color
 *   3205354246,,,,6.6,2B446F   ← definitive CSV result line
 */
import { describe, it, expect } from 'vitest';
import { parseReading } from '../../services/colorimeter';

// ── TD1 CSV format ──────────────────────────────────────────────────────────
describe('parseReading — TD1 CSV result line', () => {
  it('parses the canonical TD1 result line', () => {
    expect(parseReading('3205354246,,,,6.6,2B446F')).toEqual({ hex: '2B446F', td: 6.6 });
  });

  it('uppercases hex from lowercase', () => {
    expect(parseReading('3205354246,,,,6.6,2b446f')?.hex).toBe('2B446F');
  });

  it('parses td = 0', () => {
    expect(parseReading('1234,,,,0,FFFFFF')).toEqual({ hex: 'FFFFFF', td: 0 });
  });

  it('parses decimal td values', () => {
    expect(parseReading('9999,,,,25.3,FF0000')?.td).toBe(25.3);
  });

  it('returns null for a 5-field CSV (wrong format)', () => {
    expect(parseReading('1234,,,6.6,2B446F')).toBeNull();
  });

  it('returns null when the last field is not 6-char hex', () => {
    expect(parseReading('1234,,,,6.6,ZZZZZZ')).toBeNull();
    expect(parseReading('1234,,,,6.6,2B44')).toBeNull();
  });
});

// ── TD1 display lines ───────────────────────────────────────────────────────
describe('parseReading — TD1 display lines', () => {
  it('parses a display line containing a 6-char hex', () => {
    expect(parseReading('display, 2B446F, 74, 20')).toEqual({ hex: '2B446F', td: null });
  });

  it('returns null for display TD value line (not a hex)', () => {
    expect(parseReading('display, 6.6, 74, 5')).toBeNull();
  });

  it('returns null for clearScreen', () => {
    expect(parseReading('clearScreen')).toBeNull();
  });

  it('returns null for display text labels', () => {
    expect(parseReading('display, Insert Filament, 18, 16')).toBeNull();
    expect(parseReading('display, Scanning, 74, 20')).toBeNull();
    expect(parseReading('display, TD:, 50, 5')).toBeNull();
    expect(parseReading('display, Hex Code:, 14, 20')).toBeNull();
    expect(parseReading('display, TD-1: V2.0.1, 18, 16')).toBeNull();
  });
});

// ── JSON format ─────────────────────────────────────────────────────────────
describe('parseReading — JSON format', () => {
  it('parses {hex, td}', () => {
    expect(parseReading('{"hex":"FF0000","td":25.3}')).toEqual({ hex: 'FF0000', td: 25.3 });
  });

  it('parses {color, TD} (case variants)', () => {
    const result = parseReading('{"color":"#FF0000","TD":25.3}');
    expect(result?.hex).toBe('FF0000');
    expect(result?.td).toBe(25.3);
  });

  it('handles missing td field', () => {
    expect(parseReading('{"hex":"FF0000"}')?.td).toBeNull();
  });

  it('strips leading # from hex', () => {
    expect(parseReading('{"hex":"#AABBCC"}')?.hex).toBe('AABBCC');
  });
});

// ── Labeled key:value format ────────────────────────────────────────────────
describe('parseReading — labeled format', () => {
  it('parses HEX:color TD:value', () => {
    expect(parseReading('HEX:FF0000 TD:25.3')).toEqual({ hex: 'FF0000', td: 25.3 });
  });

  it('is case-insensitive', () => {
    expect(parseReading('hex:ff0000 td:25.3')?.hex).toBe('FF0000');
  });

  it('handles # prefix in labeled hex', () => {
    expect(parseReading('HEX:#FF0000 TD:10')?.hex).toBe('FF0000');
  });
});

// ── RGB component format ────────────────────────────────────────────────────
describe('parseReading — RGB components', () => {
  it('parses R:G:B components', () => {
    const result = parseReading('R:255 G:0 B:0');
    expect(result?.hex).toBe('FF0000');
    expect(result?.td).toBeNull();
  });

  it('parses R:G:B + TD', () => {
    const result = parseReading('R:43 G:68 B:111 TD:6.6');
    expect(result?.hex).toBe('2B446F');
    expect(result?.td).toBe(6.6);
  });
});

// ── Bare hex format ─────────────────────────────────────────────────────────
describe('parseReading — bare hex', () => {
  it('parses a bare 6-char hex', () => {
    expect(parseReading('FF0000')).toEqual({ hex: 'FF0000', td: null });
  });

  it('parses a bare hex with td', () => {
    expect(parseReading('FF0000 25.3')).toEqual({ hex: 'FF0000', td: 25.3 });
  });

  it('parses a bare hex with # prefix', () => {
    expect(parseReading('#FF0000')?.hex).toBe('FF0000');
  });
});

// ── Invalid / unrecognised lines ────────────────────────────────────────────
describe('parseReading — invalid input', () => {
  it('returns null for empty string', () => {
    expect(parseReading('')).toBeNull();
  });

  it('returns null for null', () => {
    expect(parseReading(null)).toBeNull();
  });

  it('returns null for arbitrary text', () => {
    expect(parseReading('hello world')).toBeNull();
    expect(parseReading('12345')).toBeNull();
    expect(parseReading('not a color')).toBeNull();
  });

  it('returns null for a 5-char hex (too short)', () => {
    expect(parseReading('FF000')).toBeNull();
  });
});
