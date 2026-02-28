import { useState, useRef, useEffect } from 'react';
import { useTheme } from './ThemeProvider';

export default function ThemePicker() {
    const { theme, setTheme, themes, communityTheme, setCommunityTheme } = useTheme();
    const [open, setOpen] = useState(false);
    const [installedThemes, setInstalledThemes] = useState([]);
    const [urlInput, setUrlInput] = useState('');
    const [installing, setInstalling] = useState(false);
    const [installResult, setInstallResult] = useState(null);
    const ref = useRef(null);

    // Close on outside click
    useEffect(() => {
        if (!open) return;
        function handle(e) {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        }
        document.addEventListener('mousedown', handle);
        return () => document.removeEventListener('mousedown', handle);
    }, [open]);

    // Fetch installed themes when dropdown opens
    useEffect(() => {
        if (open) fetchThemes();
    }, [open]);

    async function fetchThemes() {
        try {
            const res = await fetch('/api/themes');
            const data = await res.json();
            setInstalledThemes(data.filter(t => t.installed && t.cssPath));
        } catch (e) {
            console.error('Failed to fetch themes:', e);
        }
    }

    async function handleInstall() {
        const urls = urlInput.trim();
        if (!urls) return;
        setInstalling(true);
        setInstallResult(null);
        try {
            const res = await fetch('/api/themes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: urls }),
            });
            const data = await res.json();
            const succeeded = data.results?.filter(r => !r.error) ?? [];
            const failed = data.results?.filter(r => r.error) ?? [];
            setInstallResult({ succeeded: succeeded.length, failed });
            if (succeeded.length) {
                setUrlInput('');
                await fetchThemes();
            }
        } catch (e) {
            setInstallResult({ succeeded: 0, failed: [{ url: '?', error: e.message }] });
        } finally {
            setInstalling(false);
        }
    }

    async function handleRemove(name) {
        await fetch(`/api/themes/${encodeURIComponent(name)}`, { method: 'DELETE' });
        if (communityTheme?.name === name) setCommunityTheme(null);
        await fetchThemes();
    }

    const currentLabel = theme === 'community'
        ? (communityTheme?.name || 'Community Theme')
        : (themes.find(t => t.id === theme)?.name || 'Dark');

    const currentColor = theme === 'community'
        ? '#e05c5c'
        : (themes.find(t => t.id === theme)?.colors[1] || '#4f8ef7');

    return (
        <div className="theme-picker" ref={ref}>
            <button className="theme-picker-btn" onClick={() => setOpen(!open)} title="Change theme">
                <span className="theme-swatch" style={{ background: currentColor }} />
                <span className="theme-picker-label">{currentLabel}</span>
                <span className="theme-picker-chevron">{open ? '▲' : '▼'}</span>
            </button>

            {open && (
                <div className="theme-dropdown" style={{ maxHeight: '80vh', overflowY: 'auto', width: '290px' }}>
                    {/* Built-in themes */}
                    <div style={{ padding: '8px 12px 4px', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Built-in Themes
                    </div>
                    {themes.map(t => (
                        <button
                            key={t.id}
                            className={`theme-option ${t.id === theme ? 'active' : ''}`}
                            onClick={() => { setTheme(t.id); setOpen(false); }}
                        >
                            <span className="theme-option-swatches">
                                <span className="theme-swatch" style={{ background: t.colors[0] }} />
                                <span className="theme-swatch" style={{ background: t.colors[1] }} />
                            </span>
                            <span>{t.name}</span>
                            {t.id === theme && <span className="theme-check">✓</span>}
                        </button>
                    ))}

                    {/* Community themes (only shown when at least one is installed) */}
                    {installedThemes.length > 0 && (
                        <>
                            <div style={{ height: 1, background: 'var(--border)', margin: '8px 0' }} />
                            <div style={{ padding: '0 12px 4px', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                Community Themes
                            </div>
                            {installedThemes.map(t => {
                                const isActive = theme === 'community' && communityTheme?.name === t.name;
                                return (
                                    <div key={t.name} style={{ display: 'flex', alignItems: 'center' }}>
                                        <button
                                            className={`theme-option ${isActive ? 'active' : ''}`}
                                            style={{ flex: 1 }}
                                            onClick={() => { setCommunityTheme(t); setOpen(false); }}
                                        >
                                            {t.previews?.[0] ? (
                                                <img
                                                    src={t.previews[0]}
                                                    alt=""
                                                    style={{ width: 32, height: 22, objectFit: 'cover', borderRadius: 3, marginRight: 6, flexShrink: 0 }}
                                                />
                                            ) : (
                                                <span className="theme-option-swatches">
                                                    <span className="theme-swatch" style={{ background: '#1a1a2e' }} />
                                                    <span className="theme-swatch" style={{ background: '#e05c5c' }} />
                                                </span>
                                            )}
                                            <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                                            {isActive && <span className="theme-check">✓</span>}
                                        </button>
                                        <button
                                            className="btn btn-sm"
                                            style={{ fontSize: '11px', padding: '2px 8px', marginRight: '6px', color: 'var(--text-muted)', flexShrink: 0 }}
                                            onClick={e => { e.stopPropagation(); handleRemove(t.name); }}
                                            title="Remove theme"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                );
                            })}
                        </>
                    )}

                    {/* Add themes section */}
                    <div style={{ height: 1, background: 'var(--border)', margin: '8px 0' }} />
                    <div style={{ padding: '0 12px 4px', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Add Community Theme
                    </div>
                    <div style={{ padding: '4px 12px 12px' }}>
                        <textarea
                            className="form-input"
                            placeholder={'Paste GitHub repo URLs, one per line:\nhttps://github.com/user/repo-name'}
                            value={urlInput}
                            onChange={e => { setUrlInput(e.target.value); setInstallResult(null); }}
                            rows={3}
                            style={{ width: '100%', resize: 'vertical', fontSize: '12px', fontFamily: 'monospace', boxSizing: 'border-box' }}
                        />
                        <button
                            className="btn btn-primary btn-sm"
                            style={{ width: '100%', marginTop: '6px' }}
                            onClick={handleInstall}
                            disabled={!urlInput.trim() || installing}
                        >
                            {installing ? 'Cloning repos...' : 'Download & Install'}
                        </button>
                        {installResult && (
                            <div style={{ marginTop: '8px', fontSize: '12px', lineHeight: 1.5 }}>
                                {installResult.succeeded > 0 && (
                                    <div style={{ color: 'var(--success)' }}>✓ {installResult.succeeded} theme(s) installed</div>
                                )}
                                {installResult.failed.map((f, i) => (
                                    <div key={i} style={{ color: 'var(--danger)' }}>
                                        ✕ {f.url?.split('/').pop()}: {f.error}
                                    </div>
                                ))}
                            </div>
                        )}
                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px', marginBottom: 0 }}>
                            Repos are git-cloned to the server. Must be Mainsail-compatible themes with a custom.css file.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
