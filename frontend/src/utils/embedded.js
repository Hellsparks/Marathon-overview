/**
 * Detect whether Marathon is running inside a slicer's embedded WebView
 * (OrcaSlicer, BambuStudio, PrusaSlicer, etc.).
 *
 * Detection strategy:
 *  1. URL param — add ?embedded to the device URL in your slicer's settings.
 *     Stored in sessionStorage so it survives client-side navigation away from /.
 *  2. User-agent — matches common slicer WebView identifiers as a fallback.
 */
function detectEmbedded() {
  try {
    if (new URLSearchParams(window.location.search).has('embedded')) {
      sessionStorage.setItem('marathon_embedded', '1');
    }
    return (
      sessionStorage.getItem('marathon_embedded') === '1' ||
      /OrcaSlicer|BambuStudio|PrusaSlicer|SuperSlicer/i.test(navigator.userAgent)
    );
  } catch {
    return false;
  }
}

export const isEmbedded = detectEmbedded();
