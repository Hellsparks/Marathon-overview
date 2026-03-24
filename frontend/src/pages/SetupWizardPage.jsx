import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PrinterForm from '../components/printers/PrinterForm';

const STEPS = ['Welcome', 'Spoolman', 'Add Printers', 'Done'];

export default function SetupWizardPage() {
    const navigate = useNavigate();
    const [step, setStep] = useState(0);
    const [loading, setLoading] = useState(false);

    // Welcome step state
    const [importMode, setImportMode] = useState(null); // null | 'fresh' | 'import-marathon' | 'import-spoolman'

    // Spoolman step state
    const [spoolmanEnabled, setSpoolmanEnabled] = useState(false);
    const [spoolmanUrl, setSpoolmanUrl] = useState('');
    const [spoolmanStatus, setSpoolmanStatus] = useState(null); // null | 'testing' | 'ok' | 'error'
    const [spoolmanError, setSpoolmanError] = useState('');
    const [spoolmanVersion, setSpoolmanVersion] = useState('');
    const [features, setFeatures] = useState({
        orcaProfiles: false,
        swatches: false,
        hueforge: false
    });
    const [deps, setDeps] = useState(null);

    // Printers step state
    const [addedPrinters, setAddedPrinters] = useState([]);
    const [showPrinterForm, setShowPrinterForm] = useState(false);

    // Check dependencies on mount
    useEffect(() => {
        fetch('/api/setup/check-deps')
            .then(r => r.json())
            .then(setDeps)
            .catch(() => {});
    }, []);

    // ── Step 0: Welcome ────────────────────────────────────────────────
    const handleImportMarathonDb = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setLoading(true);
        try {
            const formData = new FormData();
            formData.append('database', file);
            const res = await fetch('/api/database/import', { method: 'POST', body: formData });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Import failed');
            }
            // DB replaced — jump to Done
            setStep(3);
        } catch (err) {
            alert(`Import failed: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    const renderWelcome = () => (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '24px', padding: '20px' }}>
            <div style={{ fontSize: '48px' }}>🏭</div>
            <h2 style={{ margin: 0, fontSize: '28px', fontWeight: 800 }}>Welcome to Marathon</h2>
            <p style={{ color: 'var(--text-muted)', textAlign: 'center', maxWidth: '500px', margin: 0, lineHeight: 1.6 }}>
                Marathon is a fleet manager for your 3D printers. This wizard will help you set up
                Spoolman integration, configure your printers, and get printing.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%', maxWidth: '440px', marginTop: '12px' }}>
                <button
                    className="btn btn-primary"
                    style={{ height: '56px', fontSize: '16px', fontWeight: 700 }}
                    onClick={() => setStep(1)}
                >
                    Fresh Install
                </button>

                <div style={{ position: 'relative' }}>
                    <button
                        className="btn btn-outline"
                        style={{ height: '56px', fontSize: '16px', fontWeight: 600, width: '100%' }}
                        onClick={() => document.getElementById('marathon-db-import').click()}
                        disabled={loading}
                    >
                        {loading ? 'Importing...' : 'Import Marathon Database'}
                    </button>
                    <input
                        id="marathon-db-import"
                        type="file"
                        accept=".zip,.db"
                        style={{ display: 'none' }}
                        onChange={handleImportMarathonDb}
                    />
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', margin: '4px 0 0' }}>
                        Restore from a previous Marathon backup (.zip or .db)
                    </p>
                </div>
            </div>
        </div>
    );

    // ── Step 1: Spoolman ───────────────────────────────────────────────
    const testSpoolman = async () => {
        if (!spoolmanUrl) return;
        setSpoolmanStatus('testing');
        setSpoolmanError('');
        try {
            const res = await fetch('/api/setup/spoolman', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: spoolmanUrl.replace(/\/$/, '') })
            });
            const data = await res.json();
            if (res.ok) {
                setSpoolmanStatus('ok');
                setSpoolmanVersion(data.version || '');
            } else {
                setSpoolmanStatus('error');
                setSpoolmanError(data.error || 'Connection failed');
            }
        } catch {
            setSpoolmanStatus('error');
            setSpoolmanError('Network error');
        }
    };

    const renderSpoolman = () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '560px', margin: '0 auto' }}>
            <h2 style={{ margin: 0, fontSize: '22px' }}>Spoolman Integration</h2>
            <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '14px' }}>
                Marathon integrates with Spoolman for filament tracking, spool management, and inventory.
            </p>

            {/* Enable toggle */}
            <label className="checkbox-label" style={{ fontSize: '15px', fontWeight: 600, gap: '10px' }}>
                <input type="checkbox" checked={spoolmanEnabled} onChange={e => setSpoolmanEnabled(e.target.checked)} />
                Enable Spoolman
            </label>

            {spoolmanEnabled && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px' }}>
                    {/* URL input */}
                    <div>
                        <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Spoolman URL</label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <input
                                className="form-input"
                                type="text"
                                value={spoolmanUrl}
                                onChange={e => { setSpoolmanUrl(e.target.value); setSpoolmanStatus(null); }}
                                placeholder="http://localhost:7912"
                                style={{ flex: 1 }}
                            />
                            <button className="btn btn-primary" onClick={testSpoolman} disabled={!spoolmanUrl || spoolmanStatus === 'testing'}>
                                {spoolmanStatus === 'testing' ? 'Testing...' : 'Test'}
                            </button>
                        </div>
                        {spoolmanStatus === 'ok' && (
                            <p style={{ fontSize: '12px', color: 'var(--success)', margin: '4px 0 0', fontWeight: 600 }}>
                                Connected! Spoolman {spoolmanVersion}
                            </p>
                        )}
                        {spoolmanStatus === 'error' && (
                            <p style={{ fontSize: '12px', color: 'var(--danger)', margin: '4px 0 0' }}>
                                {spoolmanError}
                            </p>
                        )}
                    </div>

                    {/* Sub-features */}
                    {spoolmanStatus === 'ok' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
                            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                Optional Features
                            </span>

                            <label className="checkbox-label" style={{ fontSize: '14px', gap: '10px' }}>
                                <input type="checkbox" checked={features.orcaProfiles}
                                    onChange={e => setFeatures(f => ({ ...f, orcaProfiles: e.target.checked }))} />
                                <div>
                                    <div style={{ fontWeight: 600 }}>OrcaSlicer Profiles</div>
                                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Sync filament defaults with OrcaSlicer presets</div>
                                </div>
                            </label>

                            <label className="checkbox-label" style={{ fontSize: '14px', gap: '10px' }}>
                                <input type="checkbox" checked={features.swatches}
                                    onChange={e => setFeatures(f => ({ ...f, swatches: e.target.checked }))} />
                                <div>
                                    <div style={{ fontWeight: 600 }}>
                                        3D Swatch Generation
                                        {deps && (
                                            <span style={{ fontSize: '11px', marginLeft: '8px', fontWeight: 400, color: (deps.uv?.available || deps.docker?.available) ? 'var(--success)' : 'var(--text-muted)' }}>
                                                {deps.uv?.available ? '(uv ready)' : deps.docker?.available ? '(Docker ready)' : '(set up in Settings after install)'}
                                            </span>
                                        )}
                                    </div>
                                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Generate printable color swatch STL files — runs via uv or Docker</div>
                                </div>
                            </label>

                            <label className="checkbox-label" style={{ fontSize: '14px', gap: '10px' }}>
                                <input type="checkbox" checked={features.hueforge}
                                    onChange={e => setFeatures(f => ({ ...f, hueforge: e.target.checked }))} />
                                <div>
                                    <div style={{ fontWeight: 600 }}>HueForge Catalogue</div>
                                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Export filament data in HueForge-compatible format</div>
                                </div>
                            </label>

                            {/* Spoolman DB import */}
                            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px', marginTop: '4px' }}>
                                <label style={{ fontSize: '14px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                                    Import Spoolman Database
                                </label>
                                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 8px' }}>
                                    If migrating from another Spoolman instance, you can import its database directly.
                                </p>
                                <button className="btn btn-outline btn-sm" onClick={() => {
                                    // Navigate to the import section in settings after setup
                                    setFeatures(f => ({ ...f, importSpoolman: true }));
                                    alert('Spoolman database import will be available in Settings after setup completes.');
                                }}>
                                    Import After Setup
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );

    // ── Step 2: Add Printers ───────────────────────────────────────────
    const refreshPrinters = async () => {
        try {
            const res = await fetch('/api/printers');
            if (res.ok) setAddedPrinters(await res.json());
        } catch {}
    };

    useEffect(() => {
        if (step === 2) refreshPrinters();
    }, [step]);

    const renderPrinters = () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '700px', margin: '0 auto' }}>
            <h2 style={{ margin: 0, fontSize: '22px' }}>Add Your Printers</h2>
            <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '14px', lineHeight: 1.6 }}>
                Add each printer you want Marathon to manage. You can always add more later in Settings.
            </p>

            {/* Firmware type explainer */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Supported Firmware Types
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    {[
                        { name: 'Klipper (Moonraker)', desc: 'Most common. Voron, RatRig, Ender with Klipper. Full feature support — queue, macros, Spoolman, webcam.' },
                        { name: 'Bambu Lab', desc: 'LAN Developer Mode required. Enable in printer Network settings. Supports AMS, pause/resume/cancel.' },
                        { name: 'OctoPrint', desc: 'For OctoPrint setups. Basic control only — no queue, macros, or Spoolman.' },
                        { name: 'Duet / RepRapFirmware', desc: 'For Duet boards. Basic control only — no queue, macros, or Spoolman.' },
                    ].map(fw => (
                        <div key={fw.name} style={{ padding: '10px', background: 'var(--surface2)', borderRadius: '8px' }}>
                            <div style={{ fontSize: '13px', fontWeight: 700 }}>{fw.name}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.4 }}>{fw.desc}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Added printers list */}
            {addedPrinters.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-muted)' }}>
                        Added Printers ({addedPrinters.length})
                    </span>
                    {addedPrinters.map(p => (
                        <div key={p.id} style={{
                            display: 'flex', alignItems: 'center', gap: '12px',
                            padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px'
                        }}>
                            <span style={{ fontSize: '14px', fontWeight: 600, flex: 1 }}>{p.name}</span>
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                {p.firmware_type === 'moonraker' ? 'Klipper' : p.firmware_type === 'bambu' ? 'Bambu Lab' : p.firmware_type}
                            </span>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--success)' }} />
                        </div>
                    ))}
                </div>
            )}

            {/* Add printer button / form */}
            {showPrinterForm ? (
                <PrinterForm
                    onSaved={() => { setShowPrinterForm(false); refreshPrinters(); }}
                    onCancel={() => setShowPrinterForm(false)}
                />
            ) : (
                <button
                    className="btn btn-outline"
                    style={{ height: '48px', fontSize: '14px', fontWeight: 600, border: '2px dashed var(--border)' }}
                    onClick={() => setShowPrinterForm(true)}
                >
                    + Add a Printer
                </button>
            )}
        </div>
    );

    // ── Step 3: Done ───────────────────────────────────────────────────
    const handleFinish = async () => {
        setLoading(true);
        try {
            // Save feature toggles
            const featureSettings = [
                ['feature_orca_profiles', features.orcaProfiles ? 'true' : 'false'],
                ['feature_swatches', features.swatches ? 'true' : 'false'],
                ['feature_hueforge', features.hueforge ? 'true' : 'false'],
            ];
            for (const [key, value] of featureSettings) {
                await fetch('/api/settings', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ key, value })
                });
            }

            // Mark setup complete
            await fetch('/api/setup/complete', { method: 'POST' });

            // Full reload so App re-checks setup status
            window.location.href = '/';
        } catch (err) {
            alert(`Error: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    const renderDone = () => (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '24px', padding: '20px' }}>
            <div style={{ fontSize: '48px' }}>🎉</div>
            <h2 style={{ margin: 0, fontSize: '28px', fontWeight: 800 }}>You're All Set!</h2>

            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', width: '100%', maxWidth: '440px' }}>
                <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '12px' }}>Setup Summary</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Spoolman</span>
                        <span style={{ fontWeight: 600 }}>{spoolmanEnabled && spoolmanStatus === 'ok' ? spoolmanUrl : 'Not configured'}</span>
                    </div>
                    {spoolmanEnabled && spoolmanStatus === 'ok' && (
                        <>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: 'var(--text-muted)' }}>OrcaSlicer Profiles</span>
                                <span style={{ fontWeight: 600, color: features.orcaProfiles ? 'var(--success)' : 'var(--text-muted)' }}>
                                    {features.orcaProfiles ? 'Enabled' : 'Off'}
                                </span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Swatches</span>
                                <span style={{ fontWeight: 600, color: features.swatches ? 'var(--success)' : 'var(--text-muted)' }}>
                                    {features.swatches ? 'Enabled' : 'Off'}
                                </span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: 'var(--text-muted)' }}>HueForge</span>
                                <span style={{ fontWeight: 600, color: features.hueforge ? 'var(--success)' : 'var(--text-muted)' }}>
                                    {features.hueforge ? 'Enabled' : 'Off'}
                                </span>
                            </div>
                        </>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Printers</span>
                        <span style={{ fontWeight: 600 }}>{addedPrinters.length} configured</span>
                    </div>
                </div>
            </div>

            <p style={{ color: 'var(--text-muted)', textAlign: 'center', maxWidth: '400px', margin: 0, fontSize: '13px' }}>
                You can change any of these settings later from the Settings page.
            </p>

            <button
                className="btn btn-primary"
                style={{ height: '52px', fontSize: '16px', fontWeight: 700, width: '100%', maxWidth: '300px' }}
                onClick={handleFinish}
                disabled={loading}
            >
                {loading ? 'Finishing...' : 'Go to Dashboard'}
            </button>
        </div>
    );

    // ── Layout ─────────────────────────────────────────────────────────
    const stepContent = [renderWelcome, renderSpoolman, renderPrinters, renderDone];

    return (
        <div style={{
            minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', background: 'var(--bg)', padding: '40px 20px'
        }}>
            <div style={{
                background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '24px',
                width: '100%', maxWidth: '780px', boxShadow: '0 20px 60px rgba(0,0,0,0.4)', overflow: 'hidden'
            }}>
                {/* Skip setup link */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 16px 0' }}>
                    <button
                        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '12px', padding: '4px 8px' }}
                        onClick={async () => {
                            await fetch('/api/setup/complete', { method: 'POST' });
                            window.location.href = '/';
                        }}
                    >
                        Skip Setup
                    </button>
                </div>

                {/* Progress bar */}
                <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
                    {STEPS.map((s, i) => (
                        <div key={s} style={{
                            flex: 1, padding: '14px 8px', textAlign: 'center', fontSize: '12px', fontWeight: 700,
                            color: i <= step ? 'var(--primary)' : 'var(--text-muted)',
                            background: i === step ? 'color-mix(in srgb, var(--primary) 10%, transparent)' : 'transparent',
                            borderBottom: i === step ? '2px solid var(--primary)' : '2px solid transparent',
                            transition: 'all 0.2s'
                        }}>
                            {s}
                        </div>
                    ))}
                </div>

                {/* Content */}
                <div style={{ padding: '32px 24px', minHeight: '400px' }}>
                    {stepContent[step]()}
                </div>

                {/* Footer navigation */}
                {step > 0 && step < 3 && (
                    <div style={{
                        padding: '16px 24px', borderTop: '1px solid var(--border)',
                        display: 'flex', justifyContent: 'space-between', background: 'var(--surface2)'
                    }}>
                        <button className="btn btn-outline" onClick={() => setStep(s => s - 1)}>
                            Back
                        </button>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                                className="btn"
                                style={{ opacity: 0.7 }}
                                onClick={() => setStep(s => s + 1)}
                            >
                                Skip
                            </button>
                            <button className="btn btn-primary" onClick={() => setStep(s => s + 1)}>
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
