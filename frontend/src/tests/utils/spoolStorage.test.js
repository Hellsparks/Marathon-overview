import { describe, it, expect } from 'vitest';
import { groupSpoolsByFilament, isSpoolLow } from '../../utils/spoolStorage';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const filamentA = { id: 1, name: 'Black PLA', color_hex: '000000', vendor: { name: 'eSUN' }, material: 'PLA' };
const filamentB = { id: 2, name: 'White PETG', color_hex: 'FFFFFF', vendor: { name: 'Bambu' }, material: 'PETG' };

function makeSpool(overrides) {
    return {
        id: 1,
        archived: false,
        location: null,
        remaining_weight: 800,
        initial_weight: 1000,
        registered: '2024-01-01T00:00:00Z',
        filament: filamentA,
        ...overrides,
    };
}

// ── groupSpoolsByFilament ─────────────────────────────────────────────────────

describe('groupSpoolsByFilament', () => {
    it('returns empty array for no spools', () => {
        expect(groupSpoolsByFilament([], 'Storage')).toEqual([]);
    });

    it('excludes archived spools', () => {
        const spools = [makeSpool({ archived: true })];
        expect(groupSpoolsByFilament(spools, 'Storage')).toEqual([]);
    });

    it('excludes spools without a filament', () => {
        const spools = [makeSpool({ filament: null })];
        expect(groupSpoolsByFilament(spools, 'Storage')).toEqual([]);
    });

    it('puts location-matching spools in storageSpools', () => {
        const spools = [makeSpool({ id: 1, location: 'Storage' })];
        const [group] = groupSpoolsByFilament(spools, 'Storage');
        expect(group.storageSpools).toHaveLength(1);
        expect(group.activeSpools).toHaveLength(0);
    });

    it('puts non-matching spools in activeSpools', () => {
        const spools = [makeSpool({ id: 1, location: null })];
        const [group] = groupSpoolsByFilament(spools, 'Storage');
        expect(group.storageSpools).toHaveLength(0);
        expect(group.activeSpools).toHaveLength(1);
    });

    it('location matching is case-insensitive', () => {
        const spools = [
            makeSpool({ id: 1, location: 'storage' }),
            makeSpool({ id: 2, location: 'STORAGE' }),
            makeSpool({ id: 3, location: 'Storage' }),
        ];
        const [group] = groupSpoolsByFilament(spools, 'Storage');
        expect(group.storageSpools).toHaveLength(3);
    });

    it('groups spools from different filaments separately', () => {
        const spools = [
            makeSpool({ id: 1, filament: filamentA }),
            makeSpool({ id: 2, filament: filamentB }),
        ];
        const groups = groupSpoolsByFilament(spools, 'Storage');
        expect(groups).toHaveLength(2);
    });

    it('sorts groups alphabetically by filament name', () => {
        const spools = [
            makeSpool({ id: 1, filament: filamentB }), // "White PETG"
            makeSpool({ id: 2, filament: filamentA }), // "Black PLA"
        ];
        const groups = groupSpoolsByFilament(spools, 'Storage');
        expect(groups[0].filament.name).toBe('Black PLA');
        expect(groups[1].filament.name).toBe('White PETG');
    });

    it('sorts storageSpools oldest-first (FIFO)', () => {
        const spools = [
            makeSpool({ id: 10, location: 'Storage', registered: '2024-06-01T00:00:00Z' }),
            makeSpool({ id: 5,  location: 'Storage', registered: '2024-01-01T00:00:00Z' }),
            makeSpool({ id: 20, location: 'Storage', registered: '2024-12-01T00:00:00Z' }),
        ];
        const [group] = groupSpoolsByFilament(spools, 'Storage');
        expect(group.storageSpools.map(s => s.id)).toEqual([5, 10, 20]);
    });

    it('includes filament with only active spools (storageSpools empty)', () => {
        const spools = [makeSpool({ id: 1, location: null })];
        const [group] = groupSpoolsByFilament(spools, 'Storage');
        expect(group.storageSpools).toHaveLength(0);
        expect(group.activeSpools).toHaveLength(1);
    });

    it('includes filament with only storage spools (activeSpools empty)', () => {
        const spools = [makeSpool({ id: 1, location: 'Storage' })];
        const [group] = groupSpoolsByFilament(spools, 'Storage');
        expect(group.storageSpools).toHaveLength(1);
        expect(group.activeSpools).toHaveLength(0);
    });
});

// ── isSpoolLow ────────────────────────────────────────────────────────────────

describe('isSpoolLow', () => {
    it('returns false when remaining_weight is null', () => {
        expect(isSpoolLow(makeSpool({ remaining_weight: null }))).toBe(false);
    });

    it('returns false when remaining_weight is undefined', () => {
        expect(isSpoolLow(makeSpool({ remaining_weight: undefined }))).toBe(false);
    });

    it('returns true when remaining_weight < 100', () => {
        expect(isSpoolLow(makeSpool({ remaining_weight: 99 }))).toBe(true);
    });

    it('returns false at exactly 100g when percentage is also fine', () => {
        // 100 / 500 = 20%, not < 15%; 100 is not < 100 → not low
        expect(isSpoolLow(makeSpool({ remaining_weight: 100, initial_weight: 500 }))).toBe(false);
    });

    it('returns true when remaining is < 15% of initial_weight', () => {
        // 140 / 1000 = 14% < 15%
        expect(isSpoolLow(makeSpool({ remaining_weight: 140, initial_weight: 1000 }))).toBe(true);
    });

    it('returns false when remaining is exactly 15% of initial_weight', () => {
        // 150 / 1000 = 15%, not strictly less than
        expect(isSpoolLow(makeSpool({ remaining_weight: 150, initial_weight: 1000 }))).toBe(false);
    });

    it('falls back to filament.weight when initial_weight is absent', () => {
        const spool = makeSpool({
            remaining_weight: 140,
            initial_weight: undefined,
            filament: { ...filamentA, weight: 1000 },
        });
        expect(isSpoolLow(spool)).toBe(true);
    });

    it('returns false for large remaining with no initial weight info', () => {
        const spool = makeSpool({ remaining_weight: 200, initial_weight: null, filament: { ...filamentA, weight: null } });
        expect(isSpoolLow(spool)).toBe(false);
    });
});
