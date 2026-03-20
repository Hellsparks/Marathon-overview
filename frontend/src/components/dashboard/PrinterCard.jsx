import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import StatusBadge from '../common/StatusBadge';
import TempControl from '../common/TempControl';
import ProgressBar from '../common/ProgressBar';
import ConfirmDialog from '../common/ConfirmDialog';
import WebcamStream from './WebcamStream';
import MovementRose from './MovementRose';
import { pausePrint, resumePrint, cancelPrint, sendGcode, getMacros, controlLight } from '../../api/control';
import { getCachedCss, getScrapeError, scrapeTheme } from '../../services/themeScraper';

/**
 * Scope every CSS rule to `scope` so per-printer styles can't bleed to other cards.
 *
 * Strategy:
 *   :root / body / html / .v-application  → replaced with `scope` (var declarations live here)
 *   every other selector                   → prefixed with `scope ` (restricts matching to subtree)
 *   @media                                 → recursively scoped
 *   @keyframes / @font-face / @import      → kept as-is (not scopeable)
 */
function scopeCSS(css, scope) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, ''); // strip block comments
  // Strip @import — Google Fonts URLs contain semicolons inside quotes, e.g.
  // @import url('...wght@400;500;600;700&family=...');
  // First strip url('...') and url("...") variants, then simple @import 'str';
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
        // Replace root-level and theme-level selectors
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

export default function PrinterCard({ printer, status }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [webcamOpen, setWebcamOpen] = useState(false);
  const [movementOpen, setMovementOpen] = useState(false);
  const [macrosOpen, setMacrosOpen] = useState(false);
  const [lightOn, setLightOn] = useState(false);
  const [macros, setMacros] = useState([]);
  const [scrapedCss, setScrapedCss] = useState(() => getCachedCss(printer));
  const [scrapeError, setScrapeError] = useState(() => getScrapeError(printer));
  const navigate = useNavigate();

  // Fetch the printer's own Mainsail CSS when theme_mode === 'scrape'.
  // Rate-limiting and max-attempt logic lives in themeScraper.js.
  useEffect(() => {
    if (printer.theme_mode !== 'scrape') return;
    scrapeTheme(printer).then(({ css, error }) => {
      if (css) setScrapedCss(css);
      setScrapeError(error);
    });
  }, [printer.id, printer.host, printer.port, printer.theme_mode, printer.scrape_css_path]);

  useEffect(() => {
    if (macrosOpen && status?._online && macros.length === 0) {
      getMacros(printer.id)
        .then(m => setMacros(m))
        .catch(err => console.error('Failed to fetch macros:', err));
    }
  }, [macrosOpen, status?._online, printer.id, macros.length]);

  const online = status?._online;
  const state = online ? (status?.print_stats?.state ?? 'standby') : 'offline';
  const progress = status?.display_status?.progress ?? 0;
  const filename = status?.print_stats?.filename ?? '';
  const extruder = status?.extruder;
  const bed = status?.heater_bed;
  const isPrinting = state === 'printing';
  const isPaused = state === 'paused';

  // Multi-toolhead: build extruder list from toolhead_count
  // Klipper names: extruder (T0), extruder1 (T1), extruder2 (T2)…
  // Bambu printers use AMS (multi-filament, single hotend) — never multi-toolhead
  const toolheadCount = printer.toolhead_count || 1;
  const toolExtruders = printer.firmware_type !== 'bambu' && toolheadCount > 1
    ? Array.from({ length: toolheadCount }, (_, i) => {
        const key = i === 0 ? 'extruder' : `extruder${i}`;
        return { label: `T${i}`, key };
      })
    : null;

  // Active tool: Klipper reports toolhead.extruder as "extruder" | "extruder1" | …
  const activeExtruderKey = status?.toolhead?.extruder ?? null;
  const activeTool = toolExtruders?.findIndex(t => t.key === activeExtruderKey) ?? -1;

  // Per-printer CSS: scrape mode fetches from Moonraker, custom uses stored CSS
  const rawCss = printer.theme_mode === 'custom' ? printer.custom_css
    : printer.theme_mode === 'scrape' ? scrapedCss
      : null;

  const cardSel = `[data-printer-id="${printer.id}"]`;

  const scopedCss = rawCss ? scopeCSS(rawCss, cardSel) : null;

  // ── Isolation layer ──────────────────────────────────────────────────
  // When a card has its own CSS (scrape or custom), we completely isolate it
  // from the global theme by:
  //   1. cardDefaults — resets ALL Marathon vars on the wrapper to the dark-theme
  //      baseline.  This blocks inheritance from whichever global theme is active.
  //   2. scopedCss — the Mainsail CSS (scoped), overrides whichever vars it defines
  //      on the same wrapper element (same specificity, later source order → wins).
  //   3. cardPolyfill — reads the final vars into --card-* intermediaries and
  //      stamps them on .printer-card with !important so every interior element
  //      picks up the per-printer colours.
  //
  // Style injection order in the <style> tag:  cardDefaults → scopedCss → cardPolyfill

  const cardDefaults = rawCss ? `
/* Reset ALL Marathon vars to dark-theme defaults on the wrapper.
   This blocks any global-theme vars from leaking into the card.
   The scoped Mainsail CSS (injected AFTER this) overrides whichever vars it defines. */
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

  // Detect which Vuetify version the scraped CSS uses (if any)
  // V2: sets --v-primary-base, --v-error-base, etc.
  // V3: sets --v-theme-primary, --v-theme-error, etc. (space-sep RGB values)
  const hasV2 = rawCss && /--v-primary-base\s*:/i.test(rawCss);
  const hasV3 = rawCss && /--v-theme-primary\s*:/i.test(rawCss);

  // Build var references for each color based on detected Vuetify version
  const vPrimary = hasV2 ? 'var(--v-primary-base)' : hasV3 ? 'rgb(var(--v-theme-primary))' : 'var(--primary)';
  const vWarning = hasV2 ? 'var(--v-warning-base)' : hasV3 ? 'rgb(var(--v-theme-warning))' : 'var(--warning)';
  const vDanger = hasV2 ? 'var(--v-error-base)' : hasV3 ? 'rgb(var(--v-theme-error))' : 'var(--danger)';
  const vSuccess = hasV2 ? 'var(--v-success-base)' : hasV3 ? 'rgb(var(--v-theme-success))' : 'var(--success)';
  const vSurface = hasV2 ? 'var(--v-sheet-bg-color)' : hasV3 ? 'rgb(var(--v-theme-surface))' : 'var(--surface)';
  const vText = hasV2 ? 'var(--v-theme-on-surface)' : hasV3 ? 'rgb(var(--v-theme-on-surface))' : 'var(--text)';

  const cardPolyfill = rawCss ? `
/* Map scraped theme colours to card intermediaries.
   Vuetify ${hasV2 ? '2' : hasV3 ? '3' : 'none'} detected. */
${cardSel} {
    --card-primary:  ${vPrimary};
    --card-warning:  ${vWarning};
    --card-danger:   ${vDanger};
    --card-success:  ${vSuccess};
    --card-surface:  ${vSurface};
    --card-text:     ${vText};
}
/* Override EVERY Marathon var on .printer-card for full isolation. */
${cardSel} .printer-card {
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
    --offline:    #555d6e;
    --radius:     8px;
    --shadow:     0 2px 8px rgba(0, 0, 0, .4);
    /* Reset theme-specific decorative vars */
    --card-glow: none;
    --card-glow-active: none;
    --btn-text-shadow: none;
    --btn-primary-bg: var(--card-primary);
    --btn-primary-bg-hover: var(--primary-d);
    /* Stamp direct properties !important */
    background:   var(--card-surface) !important;
    border-color: var(--border) !important;
    color:        var(--card-text) !important;
    box-shadow:   var(--shadow) !important;
}` : null;

  const isIsolated = !!rawCss;

  async function run(fn) {
    setBusy(true);
    try { await fn(); } catch (e) { alert(e.message); }
    finally { setBusy(false); }
  }

  async function handleSetTemp(heater, temp) {
    let script;
    if (printer.firmware_type === 'bambu') {
      // Bambu uses standard G-code; extruder=M104, bed=M140
      script = heater === 'extruder' ? `M104 S${temp}` : `M140 S${temp}`;
    } else {
      script = `SET_HEATER_TEMPERATURE HEATER=${heater} TARGET=${temp}`;
    }
    try {
      await sendGcode(printer.id, script);
    } catch (e) {
      alert(e.message);
    }
  }

  async function handleToggleLight() {
    const next = !lightOn;
    setLightOn(next);
    try {
      if (printer.firmware_type === 'bambu') {
        // Use Bambu MQTT ledctrl command (chamber_light)
        await controlLight(printer.id, next, 'chamber_light');
      } else {
        // Klipper: SET_LED or M960 depending on setup
        await sendGcode(printer.id, `SET_LED LED="chamber" RED=${next ? 1 : 0} GREEN=${next ? 1 : 0} BLUE=${next ? 1 : 0}`);
      }
    } catch (e) {
      setLightOn(lightOn); // revert on error
      alert(e.message);
    }
  }

  async function handleCancel() {
    setBusy(true);
    try { await cancelPrint(printer.id); } catch (e) { alert(e.message); }
    finally { setBusy(false); setConfirming(false); }
  }

  return (
    <div data-printer-id={printer.id} style={{ display: 'contents' }}>
      {isIsolated && (
        <style>{cardDefaults}{scopedCss ?? ''}{cardPolyfill}</style>
      )}
      <div className={`printer-card state-${state} v-card theme--dark${isIsolated ? ' isolated-theme' : ''}`}>
        {/* Header */}
        <div className={`printer-card-header v-card__title${printer.firmware_type === 'bambu' ? ' bambu-header' : ''}`}>
          <h3 className="printer-name v-toolbar__title">{printer.name}</h3>
          {scrapeError && (
            <span title={`CSS scrape failed: ${scrapeError}`} style={{ fontSize: '14px', cursor: 'help', opacity: 0.7, marginLeft: '4px' }}>⚠️</span>
          )}
          <StatusBadge state={state} />
        </div>

        {online ? (
          <>
            {/* Temperature controls */}
            <div className="printer-temps">
              {toolExtruders && toolExtruders.length >= 5 ? (
                <>
                  <div className="printer-temps-tools">
                    {toolExtruders.map(({ label, key }) => (
                      <TempControl
                        key={key}
                        label={label}
                        actual={status?.[key]?.temperature}
                        target={status?.[key]?.target}
                        onSet={temp => handleSetTemp(key, temp)}
                      />
                    ))}
                  </div>
                  <div className="printer-temps-bed">
                    <TempControl
                      label="Bed"
                      actual={bed?.temperature}
                      target={bed?.target}
                      onSet={temp => handleSetTemp('heater_bed', temp)}
                    />
                  </div>
                </>
              ) : toolExtruders ? (
                <>
                  {toolExtruders.map(({ label, key }) => (
                    <TempControl
                      key={key}
                      label={label}
                      actual={status?.[key]?.temperature}
                      target={status?.[key]?.target}
                      onSet={temp => handleSetTemp(key, temp)}
                    />
                  ))}
                  <TempControl
                    label="Bed"
                    actual={bed?.temperature}
                    target={bed?.target}
                    onSet={temp => handleSetTemp('heater_bed', temp)}
                  />
                </>
              ) : (
                <>
                  <TempControl
                    label="Hotend"
                    actual={extruder?.temperature}
                    target={extruder?.target}
                    onSet={temp => handleSetTemp('extruder', temp)}
                  />
                  <TempControl
                    label="Bed"
                    actual={bed?.temperature}
                    target={bed?.target}
                    onSet={temp => handleSetTemp('heater_bed', temp)}
                  />
                </>
              )}
            </div>

            {/* Tool selector — multi-toolhead Klipper only */}
            {toolExtruders && (
              <div className="tool-selector">
                {toolExtruders.map(({ label }, i) => (
                  <button
                    key={i}
                    className={`btn btn-sm v-btn tool-selector-btn${activeTool === i ? ' btn-primary active' : ''}`}
                    onClick={() => run(() => sendGcode(printer.id, `T${i}`))}
                    disabled={busy || isPrinting}
                    title={`Select ${label}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            {/* Printer actions */}
            <div className="printer-actions">
              <button
                className="btn btn-sm v-btn"
                onClick={() => run(() => sendGcode(printer.id, 'G28'))}
                disabled={busy || isPrinting}
                title="Home all axes"
              >
                Home
              </button>
              {printer.firmware_type === 'bambu' ? (
                <button
                  className={`btn btn-sm v-btn${lightOn ? ' btn-primary' : ''}`}
                  onClick={handleToggleLight}
                  disabled={busy}
                  title="Toggle chamber light"
                >
                  {lightOn ? '💡 Light On' : '💡 Light Off'}
                </button>
              ) : (
                <button
                  className="btn btn-sm v-btn"
                  onClick={() => run(() => sendGcode(printer.id, 'QUAD_GANTRY_LEVEL'))}
                  disabled={busy || isPrinting}
                  title="Quad Gantry Level"
                >
                  QGL
                </button>
              )}
              {isPrinting && (
                <button className="btn btn-sm v-btn" onClick={() => run(() => pausePrint(printer.id))} disabled={busy}>
                  Pause
                </button>
              )}
              {isPaused && (
                <button className="btn btn-sm btn-primary v-btn" onClick={() => run(() => resumePrint(printer.id))} disabled={busy}>
                  Resume
                </button>
              )}
              {(isPrinting || isPaused) && (
                <button className="btn btn-sm btn-danger v-btn" onClick={() => setConfirming(true)} disabled={busy}>
                  Cancel
                </button>
              )}
            </div>

            {/* Progress (only when printing or paused) */}
            {(isPrinting || isPaused) && (
              <ProgressBar value={progress} filename={filename} />
            )}

            {/* Active spool info */}
            {status?._active_spool && (
              <div className="spool-info">
                <span
                  className="spool-color-dot"
                  style={{ '--spool-color': `#${status._active_spool.color_hex || '888'}` }}
                />
                <span className="spool-details">
                  <span className="spool-material">{status._active_spool.material}</span>
                  {' '}
                  {status._active_spool.filament_name}
                  {status._active_spool.vendor && (
                    <span className="spool-vendor"> — {status._active_spool.vendor}</span>
                  )}
                </span>
                <span className="spool-weight">
                  {status._active_spool.remaining_weight}g / {status._active_spool.initial_weight}g
                </span>
                <div className="spool-weight-bar">
                  <div
                    className="spool-weight-fill"
                    style={{
                      width: `${Math.min(100, (status._active_spool.remaining_weight / status._active_spool.initial_weight) * 100)}%`,
                      backgroundColor: `#${status._active_spool.color_hex || '888'}`,
                    }}
                  />
                </div>
              </div>
            )}
            {/* AMS Filament Trays (Bambu only) */}
            {printer.firmware_type === 'bambu' && status?._bambu?.ams?.ams?.length > 0 && (() => {
              const amsUnit = status._bambu.ams.ams[0];
              const trays = amsUnit?.tray || [];
              const activeIdx = parseInt(status._bambu.ams.tray_now ?? '255', 10);
              return (
                <div className="ams-strip">
                  <div className="ams-label">AMS</div>
                  <div className="ams-trays">
                    {[0, 1, 2, 3].map(i => {
                      const tray = trays.find(t => parseInt(t.id, 10) === i);
                      const hasFilament = tray && tray.tray_color;
                      const color = hasFilament ? `#${tray.tray_color.slice(0, 6)}` : null;
                      const material = tray?.tray_type || '';
                      const remain = tray?.remain ?? -1;
                      const isActive = i === activeIdx;
                      return (
                        <div
                          key={i}
                          className={`ams-tray${isActive ? ' ams-tray--active' : ''}${!hasFilament ? ' ams-tray--empty' : ''}`}
                          title={hasFilament ? `${material}${remain >= 0 ? ` — ${remain}%` : ''}` : `Slot ${i + 1}: Empty`}
                        >
                          <div
                            className="ams-tray-swatch"
                            style={{
                              backgroundColor: color || 'transparent',
                              borderColor: color
                                ? `color-mix(in srgb, ${color} 60%, black)`
                                : 'var(--border)',
                            }}
                          />
                          <span className="ams-tray-material">{material || '—'}</span>
                          {hasFilament && remain >= 0 && (
                            <div className="ams-tray-remain-track">
                              <div
                                className="ams-tray-remain-fill"
                                style={{ width: `${remain}%`, backgroundColor: color }}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            <div className="card-collapsibles">
              {/* Webcam */}
              <div className="collapsible-section">
                <div
                  className="printer-card-header collapsible-toggle"
                  onClick={() => setWebcamOpen(!webcamOpen)}
                  style={{ cursor: 'pointer', minHeight: '36px', padding: '0 12px' }}
                >
                  <h3 className="printer-name v-toolbar__title" style={{ fontSize: '13px' }}>
                    {webcamOpen ? '▼ Webcam' : '▶ Webcam'}
                  </h3>
                </div>
                {webcamOpen && (
                  <div className="collapsible-content">
                    <WebcamStream printerId={printer.id} />
                  </div>
                )}
              </div>

              {/* Movement */}
              <div className="collapsible-section">
                <div
                  className="printer-card-header collapsible-toggle"
                  onClick={() => setMovementOpen(!movementOpen)}
                  style={{ cursor: 'pointer', minHeight: '36px', padding: '0 12px' }}
                >
                  <h3 className="printer-name v-toolbar__title" style={{ fontSize: '13px' }}>
                    {movementOpen ? '▼ Movement' : '▶ Movement'}
                  </h3>
                </div>
                {movementOpen && (
                  <div className="collapsible-content">
                    <MovementRose printerId={printer.id} printerType={printer.firmware_type} />
                  </div>
                )}
              </div>

              {/* Macros — hidden for Bambu printers (no macro support) */}
              {printer.firmware_type !== 'bambu' && (
                <div className="collapsible-section">
                  <div
                    className="printer-card-header collapsible-toggle"
                    onClick={() => setMacrosOpen(!macrosOpen)}
                    style={{ cursor: 'pointer', minHeight: '36px', padding: '0 12px' }}
                  >
                    <h3 className="printer-name v-toolbar__title" style={{ fontSize: '13px' }}>
                      {macrosOpen ? '▼ Macros' : '▶ Macros'}
                    </h3>
                  </div>
                  {macrosOpen && (
                    <div className="collapsible-content macro-grid">
                      {macros.length > 0 ? (
                        macros.map(m => (
                          <button
                            key={m}
                            className="btn btn-sm v-btn"
                            onClick={() => run(() => sendGcode(printer.id, m))}
                            disabled={busy}
                          >
                            {m}
                          </button>
                        ))
                      ) : (
                        <em className="text-muted">Loading macros...</em>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="printer-card-footer v-card__actions">
              <button className="btn-link" onClick={() => navigate(`/queue/${printer.id}`)}>
                View Queue →
              </button>
              <button className="btn-link" onClick={() => navigate(`/printer/${printer.id}`)}>
                Open Mainsail →
              </button>
            </div>
          </>
        ) : (
          <div className="printer-offline-msg">
            {status?._error ? `Error: ${status._error}` : 'Printer unreachable'}
          </div>
        )}

        {confirming && (
          <ConfirmDialog
            message={`Cancel print on ${printer.name}?`}
            onConfirm={handleCancel}
            onCancel={() => setConfirming(false)}
          />
        )}
      </div>
    </div>
  );
}
