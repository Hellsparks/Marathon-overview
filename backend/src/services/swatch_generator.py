#!/usr/bin/env python3
"""
Swatch STL generator — called by the Node.js extras route.

Usage:
    python3 swatch_generator.py '<json>' <out_path>

JSON fields:
    line1   — upper text band (brand + material)
    line2   — lower text band (colour name)

Swatch coordinate space (STEP / STL origin at corner):
    X  0 – 75 mm   (width)
    Y  0 – 40 mm   (height)
    Z  0 –  3 mm   (thickness, top surface at Z = 3)

Text zones (centred on the band):
    Upper band  Y 30 – 38  (separator groove at Y ≈ 29)
    Lower band  Y 21 – 29
    Left inset  X = 8.5 mm
    Max width   62 mm  (X 8.5 – 70.5)
"""

import sys
import json
import os

import cadquery as cq

# ── Geometry constants ────────────────────────────────────────────────────────
STEP_PATH      = os.path.join(os.path.dirname(__file__), 'swatch.step')
SURFACE_Z      = 3.0        # top face of the swatch
CUT_DEPTH      = 0.6        # deboss depth (Z = 3 → 2.4)

UPPER_Y_CENTER = 34.0       # centre of upper text band (Y 30-38)
LOWER_Y_CENTER = 25.0       # centre of lower text band (Y 21-29)
BAND_HEIGHT    = 8.0        # both bands are 8 mm tall

TEXT_X_LEFT    = 8.5        # left margin
TEXT_MAX_WIDTH = 62.0       # max width before the right edge

# Font size = 80 % of band height so capitals fill the band nicely
FONT_SIZE = BAND_HEIGHT * 0.8   # 6.4 mm

# Bundled font — always present regardless of OS / Docker
_FONT_PATH = os.path.join(os.path.dirname(__file__), "Arial.ttf")


def cut_text(solid, text, y_center):
    """Boolean-subtract debossed text from *solid* and return the result."""
    if not text:
        return solid
    try:
        cutter = (
            cq.Workplane("XY", origin=(TEXT_X_LEFT, y_center, SURFACE_Z))
            .text(text, FONT_SIZE, -CUT_DEPTH,
                  fontPath=_FONT_PATH, halign="left", valign="center", combine=False)
        )
        return solid.cut(cutter)
    except Exception as exc:
        raise RuntimeError(
            f"text cut failed for {text!r} (fontPath={_FONT_PATH!r}): {exc}"
        ) from exc


def generate(line1, line2, out):
    if not os.path.isfile(STEP_PATH):
        raise FileNotFoundError(f"STEP file not found: {STEP_PATH}")

    swatch = cq.importers.importStep(STEP_PATH)
    swatch = cut_text(swatch, line1.strip(), UPPER_Y_CENTER)
    swatch = cut_text(swatch, line2.strip(), LOWER_Y_CENTER)

    cq.exporters.export(
        swatch,
        out,
        exportType="STL",
        tolerance=0.05,
        angularTolerance=0.3,
    )


def main():
    if len(sys.argv) < 3:
        sys.stderr.write("Usage: swatch_generator.py '<json>' <out_path>\n")
        sys.exit(1)

    data  = json.loads(sys.argv[1])
    out   = sys.argv[2]

    try:
        generate(data.get("line1", ""), data.get("line2", ""), out)
    except Exception as e:
        sys.stderr.write(f"[swatch_generator] {e}\n")
        sys.exit(1)


if __name__ == "__main__":
    main()
