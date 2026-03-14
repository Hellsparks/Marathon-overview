/**
 * Utilities for normalising Spoolman filament material strings.
 *
 * Spoolman stores raw user-entered strings like "PETG HF", "PLA Silk",
 * "ASA-CF", "PA12-CF" etc. These helpers extract the base polymer type
 * for badge colouring and filter grouping, and detect abrasive filaments.
 */

// Canonical base types — order matters (longer matches first)
const BASE_TYPES = ['PETG', 'PLA', 'ABS', 'ASA', 'HIPS', 'PVA', 'TPU', 'TPE', 'PC', 'PA', 'FLEX', 'NYLON'];

// Variant suffixes that don't change the base polymer
const VARIANT_RE = /[\s\-+]*(HF|HS|LW|Silk|Matte|Tough|Pro|Max|Ultra|Basic|Speed|Rapid|Galaxy|Sparkle|Glow|Clear|Transparent|Translucent|Eco|Bio|ST|Plus|\+)(?=[\s\-]|$)/gi;

// Abrasive filler suffixes (Carbon Fibre, Glass Fibre, Aramid Fibre)
const ABRASIVE_RE = /\b(CF|GF|AF)\d*\b/i;

/**
 * Returns the normalised base polymer type for a material string.
 * "PETG HF" → "PETG", "PLA Silk" → "PLA", "PA12-CF" → "PA", "ASA+" → "ASA"
 */
export function normalizeFilamentType(material) {
    if (!material) return '';
    // Strip abrasive suffix first, then variant suffixes
    let s = material.replace(/[\s\-](CF|GF|AF)\d*$/i, '').replace(VARIANT_RE, '').trim();
    // Match known base type at start (case-insensitive)
    const upper = s.toUpperCase();
    for (const base of BASE_TYPES) {
        if (upper === base || upper.startsWith(base + '-') || upper.startsWith(base + ' ')) {
            return base;
        }
        // exact match after stripping trailing digits (PA12 → PA)
        if (upper.replace(/\d+$/, '') === base) return base;
    }
    // Fallback: return uppercased stripped string
    return upper || material.toUpperCase();
}

/**
 * Returns true if the material contains an abrasive filler (CF/GF/AF).
 * These require a hardened nozzle.
 */
export function isAbrasiveFilament(material) {
    if (!material) return false;
    return ABRASIVE_RE.test(material);
}
