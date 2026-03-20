import { describe, it, expect } from 'vitest';
import { normalizeFilamentType, isAbrasiveFilament } from '../../utils/materialUtils';

describe('normalizeFilamentType', () => {
    it('returns plain base types unchanged', () => {
        expect(normalizeFilamentType('PLA')).toBe('PLA');
        expect(normalizeFilamentType('PETG')).toBe('PETG');
        expect(normalizeFilamentType('ABS')).toBe('ABS');
        expect(normalizeFilamentType('ASA')).toBe('ASA');
        expect(normalizeFilamentType('TPU')).toBe('TPU');
        expect(normalizeFilamentType('PA')).toBe('PA');
    });

    it('strips variant suffixes', () => {
        expect(normalizeFilamentType('PETG HF')).toBe('PETG');
        expect(normalizeFilamentType('PLA Silk')).toBe('PLA');
        expect(normalizeFilamentType('PLA Matte')).toBe('PLA');
        expect(normalizeFilamentType('PLA+')).toBe('PLA');
        expect(normalizeFilamentType('ABS+')).toBe('ABS');
        expect(normalizeFilamentType('PETG-HS')).toBe('PETG');
        expect(normalizeFilamentType('PLA Pro')).toBe('PLA');
    });

    it('strips abrasive suffixes and returns base type', () => {
        expect(normalizeFilamentType('ASA CF')).toBe('ASA');
        expect(normalizeFilamentType('PA-CF')).toBe('PA');
        expect(normalizeFilamentType('PA12-CF')).toBe('PA');
        expect(normalizeFilamentType('PETG-GF')).toBe('PETG');
        expect(normalizeFilamentType('ABS-CF')).toBe('ABS');
    });

    it('handles PA with number variants', () => {
        expect(normalizeFilamentType('PA12')).toBe('PA');
        expect(normalizeFilamentType('PA6')).toBe('PA');
    });

    it('handles empty/null gracefully', () => {
        expect(normalizeFilamentType('')).toBe('');
        expect(normalizeFilamentType(null)).toBe('');
        expect(normalizeFilamentType(undefined)).toBe('');
    });
});

describe('isAbrasiveFilament', () => {
    it('detects CF materials', () => {
        expect(isAbrasiveFilament('ASA CF')).toBe(true);
        expect(isAbrasiveFilament('PA-CF')).toBe(true);
        expect(isAbrasiveFilament('PA12-CF')).toBe(true);
        expect(isAbrasiveFilament('ABS-CF')).toBe(true);
    });

    it('detects GF materials', () => {
        expect(isAbrasiveFilament('PETG-GF')).toBe(true);
        expect(isAbrasiveFilament('PA GF')).toBe(true);
    });

    it('returns false for non-abrasive', () => {
        expect(isAbrasiveFilament('PLA')).toBe(false);
        expect(isAbrasiveFilament('PETG HF')).toBe(false);
        expect(isAbrasiveFilament('PLA Silk')).toBe(false);
        expect(isAbrasiveFilament('ASA')).toBe(false);
        expect(isAbrasiveFilament('')).toBe(false);
        expect(isAbrasiveFilament(null)).toBe(false);
    });
});
