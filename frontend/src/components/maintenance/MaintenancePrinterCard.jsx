import { useState, useEffect } from 'react';
import { scrapedCssCache } from '../../services/scrapedCssCache';

/**
 * Scope every CSS rule to `scope` — copied verbatim from PrinterCard.jsx.
 */
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

function fmtHours(h) {
  if (h < 1) return '<1h';
  if (h < 24) return `${Math.round(h)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

function calcBar(interval_hours, runtimeS, histEntry) {
  if (!interval_hours) return { pct: 0, color: 'var(--text-muted)', label: null, hasInterval: false };
  const runtimeH = (runtimeS || 0) / 3600;
  const lastRuntimeH = histEntry ? histEntry.runtime_s_at_performance / 3600 : 0;
  const usedH = runtimeH - lastRuntimeH;
  const pct = Math.min((usedH / interval_hours) * 100, 100);
  const remainingH = interval_hours - usedH;
  let color = 'var(--success)';
  let label = `${fmtHours(remainingH)} left`;
  if (remainingH <= 0) { color = 'var(--danger)'; label = `OVERDUE ${fmtHours(-remainingH)}`; }
  else if (pct >= 80) { color = 'var(--warning)'; label = `DUE ${fmtHours(remainingH)}`; }
  return { pct, color, label, hasInterval: true };
}

export default function MaintenancePrinterCard({ printer, tasks, intervals, history, onMarkDone, busy }) {
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

  const rawCss = printer.theme_mode === 'custom' ? printer.custom_css
    : printer.theme_mode === 'scrape' ? scrapedCss
    : null;

  const cardSel = `[data-printer-id="${printer.id}"]`;
  const scopedCss = rawCss ? scopeCSS(rawCss, cardSel) : null;

  const cardDefaults = rawCss ? `
${cardSel} {
    --bg: #0f1117; --surface: #1a1d27; --surface2: #252836; --border: #2e3349;
    --text: #e2e8f0; --text-muted: #8892a4; --primary: #4f8ef7; --primary-d: #3a72d8;
    --danger: #e05c5c; --warning: #f0a838; --success: #4caf87; --offline: #555d6e;
    --radius: 8px; --shadow: 0 2px 8px rgba(0,0,0,.4);
}` : null;

  const hasV2 = rawCss && /--v-primary-base\s*:/i.test(rawCss);
  const hasV3 = rawCss && /--v-theme-primary\s*:/i.test(rawCss);
  const vPrimary = hasV2 ? 'var(--v-primary-base)' : hasV3 ? 'rgb(var(--v-theme-primary))' : 'var(--primary)';
  const vWarning = hasV2 ? 'var(--v-warning-base)' : hasV3 ? 'rgb(var(--v-theme-warning))' : 'var(--warning)';
  const vDanger  = hasV2 ? 'var(--v-error-base)'   : hasV3 ? 'rgb(var(--v-theme-error))'   : 'var(--danger)';
  const vSuccess = hasV2 ? 'var(--v-success-base)' : hasV3 ? 'rgb(var(--v-theme-success))' : 'var(--success)';
  const vSurface = hasV2 ? 'var(--v-sheet-bg-color)' : hasV3 ? 'rgb(var(--v-theme-surface))' : 'var(--surface)';
  const vText    = hasV2 ? 'var(--v-theme-on-surface)' : hasV3 ? 'rgb(var(--v-theme-on-surface))' : 'var(--text)';

  const cardPolyfill = rawCss ? `
${cardSel} {
    --card-primary: ${vPrimary}; --card-warning: ${vWarning}; --card-danger: ${vDanger};
    --card-success: ${vSuccess}; --card-surface: ${vSurface}; --card-text: ${vText};
}
${cardSel} .printer-card {
    --primary:    var(--card-primary);
    --primary-d:  color-mix(in srgb, var(--card-primary) 80%, black);
    --warning:    var(--card-warning); --danger:  var(--card-danger);
    --success:    var(--card-success); --surface: var(--card-surface);
    --surface2:   color-mix(in srgb, var(--card-primary) 12%, var(--card-surface));
    --border:     color-mix(in srgb, var(--card-primary) 28%, var(--card-surface));
    --text:       var(--card-text);
    --text-muted: color-mix(in srgb, var(--card-text) 60%, transparent);
    --bg: var(--card-surface); --offline: #555d6e; --radius: 8px;
    --shadow: 0 2px 8px rgba(0,0,0,.4);
    --card-glow: none; --card-glow-active: none; --btn-text-shadow: none;
    --btn-primary-bg: var(--card-primary); --btn-primary-bg-hover: var(--primary-d);
    background: var(--card-surface) !important;
    border-color: var(--border) !important;
    color: var(--card-text) !important;
    box-shadow: var(--shadow) !important;
}` : null;

  const isIsolated = !!rawCss;

  return (
    <div data-printer-id={printer.id} style={{ display: 'contents' }}>
      {isIsolated && (
        <style>{cardDefaults}{scopedCss ?? ''}{cardPolyfill}</style>
      )}
      <div className={`printer-card v-card theme--dark${isIsolated ? ' isolated-theme' : ''}`}>
        {/* Header — identical structure to dashboard card */}
        <div className="printer-card-header v-card__title">
          <h3 className="printer-name v-toolbar__title">{printer.name}</h3>
          <span className="maint-card-runtime">
            {fmtHours((printer.runtime_s || 0) / 3600)} runtime
          </span>
        </div>

        {/* Maintenance task rows — only show tasks that have an interval set for this printer */}
        {tasks.length === 0 ? (
          <p className="maint-card-empty">No tasks yet — add one below.</p>
        ) : (
          <div className="maint-task-list">
            {tasks.filter(task => (intervals[`${task.id}_${printer.id}`] || 0) > 0).length === 0 ? (
              <p className="maint-card-empty">No intervals set — configure below.</p>
            ) : null}
            {tasks.map(task => {
              const key = `${task.id}_${printer.id}`;
              const interval_hours = intervals[key] || 0;
              if (!interval_hours) return null;
              const histEntry = history[key] || null;
              const { pct, color, label, hasInterval } = calcBar(interval_hours, printer.runtime_s, histEntry);
              const doneKey = `${key}_done`;

              return (
                <div key={task.id} className="maint-task-row">
                  <div className="maint-task-meta">
                    <span className="maint-task-name">{task.name}</span>
                    {hasInterval && (
                      <span className="maint-task-status" style={{ color }}>{label}</span>
                    )}
                  </div>
                  <div className="maint-task-bar-row">
                    {hasInterval ? (
                      <div className="maint-bar-track">
                        <div
                          className="maint-bar-fill"
                          style={{ width: `${pct}%`, background: color }}
                        />
                      </div>
                    ) : (
                      <div className="maint-bar-unset">set interval below</div>
                    )}
                    <button
                      className="maint-done-btn"
                      onClick={() => onMarkDone(task.id, printer.id)}
                      disabled={busy[doneKey]}
                      title="Mark as done now"
                    >
                      {busy[doneKey] ? '…' : 'Done'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
