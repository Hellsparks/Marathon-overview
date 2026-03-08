import { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { fetchSwatchStl, makeSwatchFilename, getSwatchLines, downloadBuffer } from '../../api/extras';

const stlLoader = new STLLoader();

// ── Component ─────────────────────────────────────────────────────────────────
export default function SwatchGenerator({ filaments }) {
    const containerRef = useRef(null);
    const rendererRef = useRef(null);
    const sceneRef = useRef(null);
    const meshRef = useRef(null);
    const animRef = useRef(null);

    const [search, setSearch] = useState('');
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [previewId, setPreviewId] = useState(null);
    const [exporting, setExporting] = useState(false);
    const [computing, setComputing] = useState(false);
    const [previewError, setPreviewError] = useState(null);

    const [materialFilter, setMaterialFilter] = useState([]);
    const [vendorFilter, setVendorFilter] = useState([]);
    const [showFilterPopover, setShowFilterPopover] = useState(false);

    const effectiveId = previewId ?? filaments[0]?.id ?? null;
    const previewFilament = filaments.find(f => f.id === effectiveId) ?? null;

    const uniqueMaterials = Array.from(new Set(filaments.map(f => f.material).filter(Boolean))).sort();
    const uniqueVendors = Array.from(new Set(filaments.map(f => f.vendor?.name).filter(Boolean))).sort();

    // ── Init Three.js ─────────────────────────────────────────────────────────
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const w = container.clientWidth || 700;
        const h = container.clientHeight || 600;

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(w, h);
        renderer.shadowMap.enabled = true;
        container.appendChild(renderer.domElement);
        rendererRef.current = renderer;

        const scene = new THREE.Scene();
        sceneRef.current = scene;

        const camera = new THREE.PerspectiveCamera(35, w / h, 0.1, 500);
        camera.position.set(0, -35, 70);

        scene.add(new THREE.AmbientLight(0xffffff, 0.7));
        const key = new THREE.DirectionalLight(0xffffff, 1.2);
        key.position.set(30, 40, 50); key.castShadow = true; scene.add(key);
        const fill = new THREE.DirectionalLight(0xffffff, 0.4);
        fill.position.set(-30, -10, 20); scene.add(fill);
        const rim = new THREE.DirectionalLight(0xffffff, 0.3);
        rim.position.set(0, -40, -20); scene.add(rim);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.minDistance = 20;
        controls.maxDistance = 180;
        controls.update();

        // Placeholder mesh until first STL arrives
        const mat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.35, metalness: 0.05, side: THREE.DoubleSide });
        const geo = new THREE.BoxGeometry(75, 40, 3);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = true;
        scene.add(mesh);
        meshRef.current = mesh;

        function animate() {
            animRef.current = requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
        }
        animate();

        const ro = new ResizeObserver(() => {
            renderer.setSize(container.clientWidth, container.clientHeight);
            camera.aspect = container.clientWidth / container.clientHeight;
            camera.updateProjectionMatrix();
        });
        ro.observe(container);

        return () => {
            cancelAnimationFrame(animRef.current);
            ro.disconnect(); controls.dispose();
            renderer.dispose();
            if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
        };
    }, []);

    // ── Preview: fetch STL from backend, load into scene ─────────────────────
    useEffect(() => {
        const mesh = meshRef.current;
        if (!mesh) return;

        // Update colour immediately from filament hex
        mesh.material.color.set(`#${previewFilament?.color_hex || '888888'}`);

        if (!previewFilament) return;

        const { line1, line2 } = getSwatchLines(previewFilament);
        const controller = new AbortController();
        setComputing(true);
        setPreviewError(null);

        fetchSwatchStl(line1, line2, controller.signal)
            .then(buf => {
                const geom = stlLoader.parse(buf);
                geom.computeBoundingBox();
                const c = new THREE.Vector3();
                geom.boundingBox.getCenter(c);
                geom.translate(-c.x, -c.y, -c.z);
                geom.computeVertexNormals();

                const old = mesh.geometry;
                mesh.geometry = geom;
                if (old.type !== 'BoxGeometry') old.dispose();
            })
            .catch(err => {
                if (err.name !== 'AbortError') {
                    console.error('[SwatchGenerator] preview failed:', err);
                    setPreviewError(err.message);
                }
            })
            .finally(() => setComputing(false));

        return () => controller.abort();
    }, [previewFilament]);

    // ── Export: fetch STL per filament, download ──────────────────────────────
    async function exportSelected() {
        setExporting(true);
        try {
            const toExport = filaments.filter(f => selectedIds.has(f.id));
            for (let i = 0; i < toExport.length; i++) {
                const f = toExport[i];
                if (i > 0) await new Promise(r => setTimeout(r, 100));
                const { line1, line2 } = getSwatchLines(f);
                const buf = await fetchSwatchStl(line1, line2, null);
                downloadBuffer(buf, makeSwatchFilename(f));
            }
        } catch (err) {
            console.error('[SwatchGenerator] export failed:', err);
        } finally {
            setExporting(false);
        }
    }

    function toggleSelect(id) {
        setSelectedIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    }
    function selectAll() { setSelectedIds(new Set(filtered.map(f => f.id))); }
    function clearAll() { setSelectedIds(new Set()); }

    const filtered = filaments.filter(f => {
        if (materialFilter.length > 0 && !materialFilter.includes(f.material)) return false;
        if (vendorFilter.length > 0 && !vendorFilter.includes(f.vendor?.name)) return false;

        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
            (f.name || '').toLowerCase().includes(q) ||
            (f.vendor?.name || '').toLowerCase().includes(q) ||
            (f.material || '').toLowerCase().includes(q)
        );
    });

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <section style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            padding: '20px 24px',
            marginBottom: '24px',
        }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>Filament Swatch Generator</h2>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                Select filaments to preview and export printable swatch STL files.
            </p>

            <div style={{ display: 'flex', gap: '16px' }}>

                {/* ── Filament list ── */}
                <div style={{ width: '300px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '6px', position: 'relative' }}>
                    <div className="spoolman-search-wrap" style={{ position: 'relative' }}>
                        <span className="spoolman-search-icon">🔍</span>
                        <input
                            type="text"
                            className="input spoolman-search-input"
                            placeholder="Search filaments…"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            style={{ marginBottom: 0, fontSize: '13px', padding: '7px 12px 7px 32px' }}
                        />
                        <button
                            className="btn btn-sm"
                            onClick={() => setShowFilterPopover(!showFilterPopover)}
                            style={{ position: 'absolute', right: '4px', top: '50%', transform: 'translateY(-50%)', padding: '6px 10px', fontSize: '13px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)' }}
                            title="Filter filaments"
                        >
                            ⚙
                        </button>
                    </div>

                    {showFilterPopover && (
                        <div
                            style={{
                                position: 'absolute',
                                top: '40px',
                                right: 0,
                                background: 'var(--surface)',
                                border: '1px solid var(--border)',
                                borderRadius: '8px',
                                padding: '12px',
                                zIndex: 1000,
                                minWidth: '240px',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                            }}
                        >
                            <div style={{ marginBottom: '12px' }}>
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: 'var(--text-muted)' }}>Material</label>
                                <div style={{ maxHeight: '140px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '4px', padding: '6px' }}>
                                    {uniqueMaterials.map(m => (
                                        <label key={m} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 0', cursor: 'pointer', fontSize: '13px' }}>
                                            <input
                                                type="checkbox"
                                                checked={materialFilter.includes(m)}
                                                onChange={e => {
                                                    if (e.target.checked) setMaterialFilter([...materialFilter, m]);
                                                    else setMaterialFilter(materialFilter.filter(x => x !== m));
                                                }}
                                                style={{
                                                    appearance: 'none', WebkitAppearance: 'none', width: '16px', height: '16px',
                                                    border: '2px solid var(--border)', borderRadius: '4px', cursor: 'pointer',
                                                    backgroundColor: 'var(--surface)', display: 'flex', alignItems: 'center',
                                                    justifyContent: 'center', flexShrink: 0, accentColor: 'var(--primary, #0ea5e9)'
                                                }}
                                            />
                                            {m}
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <div style={{ marginBottom: '12px' }}>
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: 'var(--text-muted)' }}>Vendor</label>
                                <div style={{ maxHeight: '140px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '4px', padding: '6px' }}>
                                    {uniqueVendors.map(v => (
                                        <label key={v} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 0', cursor: 'pointer', fontSize: '13px' }}>
                                            <input
                                                type="checkbox"
                                                checked={vendorFilter.includes(v)}
                                                onChange={e => {
                                                    if (e.target.checked) setVendorFilter([...vendorFilter, v]);
                                                    else setVendorFilter(vendorFilter.filter(x => x !== v));
                                                }}
                                                style={{
                                                    appearance: 'none', WebkitAppearance: 'none', width: '16px', height: '16px',
                                                    border: '2px solid var(--border)', borderRadius: '4px', cursor: 'pointer',
                                                    backgroundColor: 'var(--surface)', display: 'flex', alignItems: 'center',
                                                    justifyContent: 'center', flexShrink: 0, accentColor: 'var(--primary, #0ea5e9)'
                                                }}
                                            />
                                            {v}
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <button
                                className="btn btn-sm"
                                onClick={() => { setMaterialFilter([]); setVendorFilter([]); setShowFilterPopover(false); }}
                                style={{ width: '100%', fontSize: '12px' }}
                            >
                                Clear Filters
                            </button>
                        </div>
                    )}

                    {showFilterPopover && (
                        <div
                            style={{ position: 'fixed', inset: 0, zIndex: 999 }}
                            onClick={() => setShowFilterPopover(false)}
                        />
                    )}
                    <div style={{ display: 'flex', gap: '6px' }}>
                        <button className="btn btn-sm" style={{ flex: 1, fontSize: '11px' }} onClick={selectAll}>All</button>
                        <button className="btn btn-sm" style={{ flex: 1, fontSize: '11px' }} onClick={clearAll}>None</button>
                    </div>
                    <div style={{
                        overflowY: 'auto',
                        border: '1px solid var(--border)',
                        borderRadius: '6px',
                        maxHeight: '600px',
                        background: 'var(--surface2)',
                    }}>
                        {filtered.map((f, idx) => {
                            const color = `#${f.color_hex || '888888'}`;
                            const isSelected = selectedIds.has(f.id);
                            const isPreviewing = f.id === effectiveId;
                            return (
                                <div
                                    key={f.id}
                                    onClick={() => setPreviewId(f.id)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '8px',
                                        padding: '6px 10px', cursor: 'pointer',
                                        background: isPreviewing ? 'var(--primary-subtle, rgba(14,165,233,0.12))' : 'transparent',
                                        borderBottom: idx < filtered.length - 1 ? '1px solid var(--border)' : 'none',
                                        userSelect: 'none',
                                    }}
                                >
                                    <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => toggleSelect(f.id)}
                                        onClick={e => e.stopPropagation()}
                                        style={{
                                            appearance: 'none', WebkitAppearance: 'none',
                                            width: '14px', height: '14px', borderRadius: '3px',
                                            border: '1.5px solid var(--border)', background: 'var(--surface)',
                                            cursor: 'pointer', flexShrink: 0,
                                        }}
                                    />
                                    <div style={{
                                        width: '14px', height: '14px', borderRadius: '3px',
                                        background: color, flexShrink: 0,
                                        border: '1px solid rgba(128,128,128,0.25)',
                                    }} />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: '12px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {f.name || `#${f.id}`}
                                        </div>
                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {[f.vendor?.name, f.material].filter(Boolean).join(' · ')}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                        {filtered.length === 0 && (
                            <div style={{ padding: '20px', textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)' }}>
                                No filaments found
                            </div>
                        )}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {selectedIds.size} selected · click row to preview
                    </div>
                </div>

                {/* ── Viewport + controls ── */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0 }}>
                    <div
                        ref={containerRef}
                        style={{
                            flex: 1, minHeight: '600px',
                            borderRadius: '8px', overflow: 'hidden',
                            border: '1px solid var(--border)',
                            background: 'var(--surface2)', position: 'relative',
                        }}
                    >
                        {previewFilament && (
                            <div style={{
                                position: 'absolute', bottom: '8px', left: '50%',
                                transform: 'translateX(-50%)',
                                background: 'rgba(0,0,0,0.55)', color: '#fff',
                                fontSize: '12px', padding: '3px 12px',
                                borderRadius: '9999px', pointerEvents: 'none',
                                whiteSpace: 'nowrap', zIndex: 1,
                            }}>
                                {previewFilament.name}
                                {previewFilament.color_hex && ` · #${previewFilament.color_hex.toUpperCase()}`}
                            </div>
                        )}
                        {computing && (
                            <div style={{
                                position: 'absolute', top: '50%', left: '50%',
                                transform: 'translate(-50%, -50%)',
                                background: 'rgba(0,0,0,0.55)', color: '#fff',
                                fontSize: '12px', padding: '6px 16px',
                                borderRadius: '9999px', pointerEvents: 'none', zIndex: 2,
                            }}>
                                Generating preview…
                            </div>
                        )}
                        {previewError && (
                            <div style={{
                                position: 'absolute', top: '8px', left: '50%',
                                transform: 'translateX(-50%)',
                                background: 'rgba(180,0,0,0.75)', color: '#fff',
                                fontSize: '11px', padding: '4px 12px',
                                borderRadius: '9999px', pointerEvents: 'none', zIndex: 2,
                                whiteSpace: 'nowrap',
                            }}>
                                {previewError}
                            </div>
                        )}
                        <div style={{
                            position: 'absolute', top: '8px', right: '10px',
                            fontSize: '11px', color: 'rgba(128,128,128,0.6)',
                            pointerEvents: 'none', zIndex: 1,
                        }}>
                            drag to rotate · scroll to zoom
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'flex-end' }}>
                        <button
                            className="btn btn-primary"
                            onClick={exportSelected}
                            disabled={selectedIds.size === 0 || exporting}
                            style={{ height: '34px', minWidth: '130px' }}
                        >
                            {exporting
                                ? 'Exporting…'
                                : selectedIds.size > 0
                                    ? `Export ${selectedIds.size} STL${selectedIds.size > 1 ? 's' : ''}`
                                    : 'Export STLs'}
                        </button>
                    </div>
                </div>
            </div>
        </section>
    );
}
