import { describe, it, expect } from 'vitest';
import { buildColorStyle, isMultiColor } from '../../utils/colorUtils';

describe('buildColorStyle', () => {
    it('returns --spool-color var for single-color filament', () => {
        const style = buildColorStyle({ color_hex: 'FF0000' });
        expect(style).toEqual({ '--spool-color': '#FF0000' });
    });

    it('returns --spool-color var when no color_hex', () => {
        const style = buildColorStyle({});
        expect(style).toEqual({ '--spool-color': '#888888' });
    });

    it('returns --spool-color for 8-char hex (with alpha)', () => {
        const style = buildColorStyle({ color_hex: 'FF000080' });
        expect(style).toEqual({ '--spool-color': '#FF000080' });
    });

    it('returns --spool-color for single entry in multi_color_hexes', () => {
        const style = buildColorStyle({ color_hex: 'FF0000', multi_color_hexes: 'FF0000' });
        expect(style).toEqual({ '--spool-color': '#FF0000' });
    });

    it('returns longitudinal gradient for 2 colors', () => {
        const style = buildColorStyle({
            color_hex: '00FF00',
            multi_color_hexes: '00FF00,9B59B6',
            multi_color_direction: 'longitudinal',
        });
        expect(style.background).toContain('linear-gradient');
        expect(style.background).toContain('to bottom');
        expect(style.background).toContain('#00FF00');
        expect(style.background).toContain('#9B59B6');
    });

    it('returns coaxial pie chart for 2 colors', () => {
        const style = buildColorStyle({
            color_hex: '00FF00',
            multi_color_hexes: '00FF00,9B59B6',
            multi_color_direction: 'coaxial',
        });
        expect(style.background).toContain('conic-gradient');
        expect(style.background).toContain('#00FF00');
        expect(style.background).toContain('#9B59B6');
        expect(style.borderRadius).toBe('50%');
    });

    it('handles 3 colors longitudinal', () => {
        const style = buildColorStyle({
            multi_color_hexes: 'FF0000,00FF00,0000FF',
            multi_color_direction: 'longitudinal',
        });
        expect(style.background).toContain('#FF0000');
        expect(style.background).toContain('#00FF00');
        expect(style.background).toContain('#0000FF');
    });

    it('defaults to longitudinal when direction is null', () => {
        const style = buildColorStyle({
            multi_color_hexes: 'FF0000,00FF00',
            multi_color_direction: null,
        });
        expect(style.background).toContain('linear-gradient');
        expect(style.background).toContain('to bottom');
    });
});

describe('isMultiColor', () => {
    it('returns false for single-color filament', () => {
        expect(isMultiColor({ color_hex: 'FF0000' })).toBe(false);
    });

    it('returns false when multi_color_hexes is null', () => {
        expect(isMultiColor({ multi_color_hexes: null })).toBe(false);
    });

    it('returns false for single entry', () => {
        expect(isMultiColor({ multi_color_hexes: 'FF0000' })).toBe(false);
    });

    it('returns true for two colors', () => {
        expect(isMultiColor({ multi_color_hexes: 'FF0000,00FF00' })).toBe(true);
    });

    it('returns true for three colors', () => {
        expect(isMultiColor({ multi_color_hexes: 'FF0000,00FF00,0000FF' })).toBe(true);
    });

    it('returns false for null/undefined filament', () => {
        expect(isMultiColor(null)).toBe(false);
        expect(isMultiColor(undefined)).toBe(false);
    });
});
