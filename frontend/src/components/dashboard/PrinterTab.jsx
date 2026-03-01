/**
 * PrinterTab — clone of PrinterCard stripped down to just the printer name.
 * Keeps the full per-printer CSS theming system (scrape / custom) so the tab
 * gets the same accent colours as its corresponding card.
 */
import { useState, useEffect } from 'react';
import { scrapedCssCache } from '../../services/scrapedCssCache';
import StatusBadge from '../common/StatusBadge';

function scopeCSS(css, scope) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  css = css.replace(/@import\s+url\(\s*['"][^'"]*['"]\s*\)\s*;/gi, '');
  css = css.replace(/@import\s+url\(\s*[^)]*\)\s*;/gi, '');
  css = css.replace(/@import\s+['"][^'"]*['"]\s*;/gi, '');
  css = css.replace(/@import\s[^;]+;/gi, '');
  const out = [];
  let pos = 0;
  while (pos < css.length) {
    const ws = css.slice(pos).match(/^\s+/);
    if (ws) { pos += ws[0].length; continue; }
    const brace = css.indexOf('{', pos);
    if (brace === -1) break;
    const sel = css.slice(pos, brace).trim();
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
        if (ROOT_RE.test(s)) return s.replace(REPLACE_RE, scope);
        return `${scope} ${s}`;
      }).filter(Boolean).join(',');
      out.push(`${scoped}{${body}}`);
    }
  }
  return out.join('');
}

export default function PrinterTab({ printer, status, active, sidebar }) {
  const [scrapedCss, setScrapedCss] = useState(
    () => scrapedCssCache.get(`${printer.host}:${printer.port}`) || null
  );

  useEffect(() => {
    if (printer.theme_mode !== 'scrape') return;
    const cacheKey = `${printer.host}:${printer.port}`;
    if (scrapedCssCache.has(cacheKey)) {
      setScrapedCss(scrapedCssCache.get(cacheKey));
      return;
    }
    fetch('/api/printers/scrape-theme', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host: printer.host, port: printer.port }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.css) {
          scrapedCssCache.set(cacheKey, d.css);
          setScrapedCss(d.css);
        }
      })
      .catch(() => {});
  }, [printer.id, printer.host, printer.port, printer.theme_mode]);

  const online = status?._online;
  const state = online ? (status?.print_stats?.state ?? 'standby') : 'offline';

  const rawCss = printer.theme_mode === 'custom' ? printer.custom_css
    : printer.theme_mode === 'scrape' ? scrapedCss
      : null;

  const cardSel = `[data-printer-id="${printer.id}"]`;
  const scopedCss = rawCss ? scopeCSS(rawCss, cardSel) : null;

  const cardDefaults = rawCss ? `
${cardSel} {
    --bg: #0f1117;
    --surface: #1a1d27;
    --surface2: #252836;
    --border: #2e3349;
    --text: #e2e8f0;
    --text-muted: #8892a4;
    --primary: #4f8ef7;
    --primary-d: #3a72d8;
    --danger: #e05c5c;
    --warning: #f0a838;
    --success: #4caf87;
    --offline: #555d6e;
    --radius: 8px;
    --shadow: 0 2px 8px rgba(0, 0, 0, .4);
}` : null;

  const hasV2 = rawCss && /--v-primary-base\s*:/i.test(rawCss);
  const hasV3 = rawCss && /--v-theme-primary\s*:/i.test(rawCss);

  const vPrimary = hasV2 ? 'var(--v-primary-base)' : hasV3 ? 'rgb(var(--v-theme-primary))' : 'var(--primary)';
  const vWarning = hasV2 ? 'var(--v-warning-base)' : hasV3 ? 'rgb(var(--v-theme-warning))' : 'var(--warning)';
  const vDanger  = hasV2 ? 'var(--v-error-base)'   : hasV3 ? 'rgb(var(--v-theme-error))'   : 'var(--danger)';
  const vSuccess = hasV2 ? 'var(--v-success-base)' : hasV3 ? 'rgb(var(--v-theme-success))' : 'var(--success)';
  const vSurface = hasV2 ? 'var(--v-sheet-bg-color)' : hasV3 ? 'rgb(var(--v-theme-surface))' : 'var(--surface)';
  const vText    = hasV2 ? 'var(--v-theme-on-surface)' : hasV3 ? 'rgb(var(--v-theme-on-surface))' : 'var(--text)';

  // Mirror of PrinterCard's cardPolyfill, targeting .printer-card (same class as the dashboard card)
  const cardVars = rawCss ? `
${cardSel} {
    --card-primary:  ${vPrimary};
    --card-warning:  ${vWarning};
    --card-danger:   ${vDanger};
    --card-success:  ${vSuccess};
    --card-surface:  ${vSurface};
    --card-text:     ${vText};
}` : null;

  const tabPolyfill = rawCss ? `
${cardSel} .printer-tab {
    --primary:    var(--card-primary);
    --primary-d:  color-mix(in srgb, var(--card-primary) 80%, black);
    --warning:    var(--card-warning);
    --danger:     var(--card-danger);
    --success:    var(--card-success);
    --surface:    var(--card-surface);
    --surface2:   color-mix(in srgb, var(--card-primary) 12%, var(--card-surface));
    --border:     color-mix(in srgb, var(--card-primary) 28%, var(--card-surface));
    --text:       var(--card-text);
    --text-muted: color-mix(in srgb, var(--card-text) 60%, transparent);
    --bg:         var(--card-surface);
    background:   var(--card-surface) !important;
    border-color: var(--border) !important;
    color:        var(--card-text) !important;
}` : null;

  // For sidebar mode: just wire --primary so the border/hover colour matches the printer theme
  const sidebarPolyfill = rawCss ? `
${cardSel} .sidebar-printer-link {
    --primary: var(--card-primary);
    --text:    var(--card-text);
}` : null;

  const isIsolated = !!rawCss;

  if (sidebar) {
    return (
      <div data-printer-id={printer.id} style={{ display: 'block', width: '100%' }}>
        {isIsolated && (
          <style>{cardDefaults}{scopedCss ?? ''}{cardVars}{sidebarPolyfill}</style>
        )}
        <div
          className={`sidebar-printer-link state-${state}${active ? ' active' : ''}`}
          title={printer.name}
        >
          {printer.name}
        </div>
      </div>
    );
  }

  return (
    <div data-printer-id={printer.id} style={{ display: 'block', width: '100%' }}>
      {isIsolated && (
        <style>{cardDefaults}{scopedCss ?? ''}{cardVars}{tabPolyfill}</style>
      )}
      <div
        className={`printer-tab state-${state}${isIsolated ? ' isolated-theme' : ''}${active ? ' active' : ''}`}
        title={printer.name}
      >
        <div className="printer-card-header">
          <h3 className="printer-name">{printer.name}</h3>
          <StatusBadge state={state} />
        </div>
      </div>
    </div>
  );
}
