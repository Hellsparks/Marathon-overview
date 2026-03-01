/**
 * Scope every CSS rule to `scope` so per-printer styles can't bleed to other elements.
 *
 * Strategy:
 *   :root / body / html / .v-application  → replaced with `scope` (var declarations live here)
 *   every other selector                   → prefixed with `scope ` (restricts matching to subtree)
 *   @media                                 → recursively scoped
 *   @keyframes / @font-face / @import      → kept as-is (not scopeable)
 */
export function scopeCSS(css, scope) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, ''); // strip block comments
  // Strip @import — Google Fonts URLs contain semicolons inside quotes
  css = css.replace(/@import\s+url\(\s*['"][^'"]*['"]\s*\)\s*;/gi, '');
  css = css.replace(/@import\s+url\(\s*[^)]*\)\s*;/gi, '');
  css = css.replace(/@import\s+['"][^'"]*['"]\s*;/gi, '');
  css = css.replace(/@import\s[^;]+;/gi, ''); // catch any remaining simple @import
  const out = [];
  let pos = 0;
  while (pos < css.length) {
    // skip whitespace
    const ws = css.slice(pos).match(/^\s+/);
    if (ws) { pos += ws[0].length; continue; }
    // find next opening brace
    const brace = css.indexOf('{', pos);
    if (brace === -1) break;
    const sel = css.slice(pos, brace).trim();
    // find matching closing brace
    let depth = 1, j = brace + 1;
    while (j < css.length && depth > 0) {
      if (css[j] === '{') depth++;
      else if (css[j] === '}') depth--;
      j++;
    }
    const body = css.slice(brace + 1, j - 1);
    pos = j;

    if (/^@(keyframes|font-face|charset)/i.test(sel)) {
      out.push(`${sel}{${body}}`);
    } else if (/^@(media|supports|layer)/i.test(sel)) {
      out.push(`${sel}{${scopeCSS(body, scope)}}`);
    } else {
      const ROOT_RE = /^(:root|body|html|\.v-application|\.v-theme--dark|\.v-theme--light|\.v-locale--is-ltr)/;
      const REPLACE_RE = /(:root\b|body\b|html\b|\.v-application\b|\.v-theme--dark\b|\.v-theme--light\b|\.v-locale--is-ltr\b)/g;
      const scoped = sel.split(',').map(s => {
        s = s.trim();
        if (!s) return '';
        if (ROOT_RE.test(s)) {
          return s.replace(REPLACE_RE, scope);
        }
        return `${scope} ${s}`;
      }).filter(Boolean).join(',');
      out.push(`${scoped}{${body}}`);
    }
  }
  return out.join('');
}
