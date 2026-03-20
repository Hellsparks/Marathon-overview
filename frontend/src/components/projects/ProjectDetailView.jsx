import React, { useState, useEffect } from 'react';
import { getPrinters } from '../../api/printers';
import { setActiveSpool, getSpools } from '../../api/spoolman';
import { getSettings } from '../../api/settings';
import { useRightPanel } from '../../contexts/RightPanelContext';
import { usePrinterStatus } from '../../contexts/PrinterStatusContext';
import { useFilamentGuard } from '../../hooks/useFilamentGuard';
import { useToast } from '../../contexts/ToastContext';
import StatusBadge from '../common/StatusBadge';

function PrinterSelector({ printers, status, plate, selectedId, onSelect, disabled }) {
    const [isOpen, setIsOpen] = useState(false);
    const selectedPrinter = printers.find(p => p.id === parseInt(selectedId));

    // Filtering logic
    const filteredPrinters = printers.map(p => {
        const s = status[p.id];
        const online = s?._online;
        const state = online ? (s?.print_stats?.state ?? 'standby') : 'offline';

        // Size check
        const widthNeeded = (plate.max_x || 0) - (plate.min_x || 0);
        const depthNeeded = (plate.max_y || 0) - (plate.min_y || 0);
        const heightNeeded = (plate.max_z || 0) - (plate.min_z || 0);

        const fits = (!plate.max_x || (p.bed_width >= widthNeeded && p.bed_depth >= depthNeeded && p.bed_height >= heightNeeded));

        // Filament check
        let compatible = true;
        if (plate.filament_type) {
            const allowed = Array.isArray(p.filament_types) ? p.filament_types : [];
            compatible = allowed.includes(plate.filament_type);
        }

        return { ...p, state, fits, compatible, online };
    }).filter(p => p.fits && p.compatible);

    // Sort: Compatible & Fits first, then Online, then Name
    filteredPrinters.sort((a, b) => {
        const aGood = a.compatible && a.fits;
        const bGood = b.compatible && b.fits;
        if (aGood !== bGood) return bGood ? 1 : -1;
        if (a.online !== b.online) return b.online ? 1 : -1;
        return a.name.localeCompare(b.name);
    });

    return (
        <div className="printer-selector-container" style={{ position: 'relative', width: '160px', zIndex: isOpen ? 100 : 1 }}>
            <button
                className={`btn btn-sm btn-outline printer-selector-btn ${isOpen ? 'active' : ''}`}
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
                style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '32px', padding: '0 12px', borderRadius: '8px' }}
            >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '12px' }}>
                    {selectedPrinter ? selectedPrinter.name : 'Select Printer'}
                </span>
                <span style={{ fontSize: '8px', opacity: 0.5 }}>{isOpen ? '▲' : '▼'}</span>
            </button>

            {isOpen && (
                <>
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }} onClick={() => setIsOpen(false)} />
                    <div className="printer-selector-dropdown custom-dropdown-list" style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '4px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', boxShadow: 'var(--shadow)', zIndex: 1000, maxHeight: '300px', overflowY: 'auto', padding: '4px' }}>
                        {filteredPrinters.length === 0 ? (
                            <div style={{ padding: '12px', textAlign: 'center', fontSize: '11px', color: 'var(--text-muted)' }}>
                                No compatible printers found.<br />
                                <span style={{ fontSize: '9px' }}>Check size & filament settings.</span>
                            </div>
                        ) : filteredPrinters.map(p => (
                            <div
                                key={p.id}
                                className={`printer-selector-item ${selectedId === p.id ? 'selected' : ''}`}
                                onClick={() => {
                                    onSelect(p.id);
                                    setIsOpen(false);
                                }}
                                style={{ padding: '8px 12px', cursor: 'pointer', borderRadius: '8px', marginBottom: '2px', display: 'flex', flexDirection: 'column', gap: '2px' }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontWeight: 600, fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                                    <StatusBadge state={p.state} />
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

export default function ProjectDetailView({ projectId, onBack, filaments = [] }) {
    const { setSelected } = useRightPanel() || {};
    const status = usePrinterStatus() || {};
    const toast = useToast();
    const [project, setProject] = useState(null);
    const [spools, setSpools] = useState([]);
    const [showSpoolPicker, setShowSpoolPicker] = useState(null); // { slotKey, currentSpoolId }
    const [spoolSearch, setSpoolSearch] = useState('');
    const [printers, setPrinters] = useState([]);
    const [selectedPrinters, setSelectedPrinters] = useState({}); // { plateId: printerId }
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [settings, setSettings] = useState({});
    const [showEditModal, setShowEditModal] = useState(false);
    const [editName, setEditName] = useState('');
    const [editDueDate, setEditDueDate] = useState('');
    const [templateData, setTemplateData] = useState(null);
    const [templateMap, setTemplateMap] = useState({}); // { templateId: templateData }
    const [swapConfirm, setSwapConfirm] = useState(null); // { category_id, new_option_id, done_plates, instance_id }

    const fetchData = async () => {
        try {
            const [projRes, printRes, spoolsRes, settingsRes] = await Promise.all([
                fetch(`/api/projects/${projectId}`).then(r => r.ok ? r.json() : Promise.reject(new Error('Project not found'))),
                getPrinters(),
                getSpools(),
                getSettings()
            ]);
            setProject(projRes);
            setPrinters(printRes);
            setSpools(spoolsRes);
            setSettings(settingsRes);
            setEditName(projRes.name);
            setEditDueDate(projRes.due_date || '');

            // Fetch template data for category info
            // Multi-instance: fetch for each unique template used
            const templateIds = new Set();
            if (projRes.template_id) templateIds.add(projRes.template_id);
            (projRes.instances || []).forEach(inst => templateIds.add(inst.template_id));

            if (templateIds.size > 0) {
                // Fetch all unique templates, merge into a map
                const tplPromises = [...templateIds].map(tid =>
                    fetch(`/api/templates/${tid}`).then(r => r.ok ? r.json() : null).catch(() => null)
                );
                Promise.all(tplPromises).then(results => {
                    const tplMap = {};
                    results.forEach(t => { if (t) tplMap[t.id] = t; });
                    // For backwards compat, set templateData to the first/only template
                    const first = results.find(Boolean);
                    if (first) setTemplateData(first);
                    // Store all template data keyed by id
                    setTemplateMap(tplMap);
                });
            }

            // Sync with Right Panel
            if (setSelected) {
                setSelected({ type: 'project', data: projRes });
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [projectId]);

    // Auto-refresh while any plate is actively printing
    useEffect(() => {
        if (!project) return;
        const hasActivePlate = project.plates?.some(p => p.status === 'printing');
        if (!hasActivePlate) return;
        const interval = setInterval(() => {
            fetch(`/api/projects/${projectId}`)
                .then(r => r.ok ? r.json() : null)
                .then(data => { if (data) setProject(data); })
                .catch(() => { });
        }, 5000);
        return () => clearInterval(interval);
    }, [project?.plates?.map(p => p.status).join(',')]);

    const handlePrint = async (plate) => {
        const printerId = selectedPrinters[plate.id];
        if (!printerId) return alert('Please select a printer first.');

        const printer = printers.find(p => p.id === parseInt(printerId));
        if (!printer) return;

        try {
            setLoading(true);

            // Set active spool if assigned to this project
            if (project.color_assignments?.length > 0) {
                const assignedSpoolId = project.color_assignments[0].spool_id;
                if (assignedSpoolId) {
                    await setActiveSpool(printer.id, assignedSpoolId);
                }
            }

            // Upload file to printer and start print (backend handles upload + active job tracking)
            const res = await fetch(`/api/projects/${project.id}/plates/${plate.id}/print`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ printer_id: printer.id })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Failed to start print');
            }

            await fetchData();
            toast?.(`Print started on ${printer.name}`, 'success');
        } catch (err) {
            toast?.(err.message, 'error') || alert(err.message);
        } finally {
            setLoading(false);
        }
    };

    const updatePlateStatus = async (plateId, newStatus) => {
        try {
            const res = await fetch(`/api/projects/${projectId}/plates/${plateId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus })
            });
            if (!res.ok) throw new Error('Failed to update plate');
            fetchData();
        } catch (err) {
            alert(err.message);
        }
    };

    const handleArchive = async () => {
        if (!confirm('Archive this project? It will be moved to the Archive tab.')) return;
        try {
            const res = await fetch(`/api/projects/${projectId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'archived' })
            });
            if (!res.ok) throw new Error('Failed to archive project');
            onBack();
        } catch (err) {
            alert(err.message);
        }
    };

    const handleUnarchive = async () => {
        try {
            setLoading(true);
            const res = await fetch(`/api/projects/${projectId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'active' })
            });
            if (!res.ok) throw new Error('Failed to unarchive project');
            // If we successfully unarchive, fetch new data to update UI to active state 
            // OR if we were viewing it from the Archive page, we should go back.
            // Going back is generally safer so it removes it from the Archive list.
            onBack();
            toast?.('Project unarchived successfully', 'success');
        } catch (err) {
            toast?.(err.message, 'error') || alert(err.message);
            setLoading(false);
        }
    };

    // To use the guard effectively here, we need to know WHICH printer this spool is intended for.
    // In ProjectDetailView, the spool is applied to a "slot", not directly to a printer yet.
    // However, the guard expects a printer to check compatibility against.
    // Since we don't know the exact printer until print time, we'll run a slightly modified check,
    // OR we can pass a null printer and the guard will just check "is this spool in use?".
    // Let's modify the onDrop handler to trigger a guard check just for "spool in use" and "bambu used" warnings.

    // Wait, the user specifically mentioned "this filament guard logic shgould also apply ANYWHERE on the website"
    // In ProjectDetailView, you assign a spool *to the project*, not to a printer directly.
    // So let's wrap `handleChangeSpool` inside the guard hook, passing `null` for printerId to skip material checks but trigger the "in use" warnings.

    const { startGuard, renderGuardDialog } = useFilamentGuard({
        onConfirm: async (spool, _printer, slotKey) => {
            try {
                setLoading(true);
                const res = await fetch(`/api/projects/${projectId}/filament`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ slot_key: slotKey, spool_id: spool.id })
                });
                if (!res.ok) throw new Error('Failed to update spool');
                setShowSpoolPicker(null);
                await fetchData();
            } catch (err) {
                alert(err.message);
            } finally {
                setLoading(false);
            }
        }
    });

    const handleChangeSpool = async (slotKey, spoolId) => {
        if (spoolId === null) {
            // Clearing spool bypasses guard
            startGuard({ id: null }, null, slotKey);
            return;
        }

        const spool = spools.find(s => s.id === spoolId);
        if (spool) {
            // Pass null for printerId since we're assigning to a project slot, not a specific printer yet
            startGuard(spool, null, slotKey);
        }
    };

    const handleUpdateProject = async () => {
        try {
            setLoading(true);
            const res = await fetch(`/api/projects/${projectId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: editName, due_date: editDueDate || null })
            });
            if (!res.ok) throw new Error('Failed to update project');
            setShowEditModal(false);
            await fetchData();
        } catch (err) {
            alert(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSwapOption = async (categoryId, newOptionId, instanceIdOrForce) => {
        // instanceIdOrForce can be an instance_id (number) from the UI, or true/false for force
        const force = instanceIdOrForce === true;
        const instanceId = (typeof instanceIdOrForce === 'number') ? instanceIdOrForce : swapConfirm?.instance_id || null;
        try {
            setLoading(true);
            const res = await fetch(`/api/projects/${projectId}/swap-option`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ category_id: categoryId, new_option_id: newOptionId, force, instance_id: instanceId })
            });
            const data = await res.json();
            if (data.warning && !force) {
                setSwapConfirm({ category_id: categoryId, new_option_id: newOptionId, instance_id: instanceId, done_plates: data.done_plates, done_count: data.done_count });
                setLoading(false);
                return;
            }
            if (!res.ok && !data.success) throw new Error(data.error || 'Swap failed');
            setSwapConfirm(null);
            await fetchData();
            toast?.('Alternative swapped', 'success');
        } catch (err) {
            toast?.(err.message, 'error') || alert(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Group plates by category for display
    const groupPlates = () => {
        if (!project?.plates) return [];
        const instances = project.instances || [];

        // If multi-instance, group by instance first, then by category within each
        if (instances.length > 0) {
            const sections = [];
            for (const inst of instances) {
                const tplData = templateMap[inst.template_id];
                const instPlates = project.plates.filter(p => p.instance_id === inst.id);

                if (!tplData?.categories?.length) {
                    sections.push({
                        instanceId: inst.id,
                        instanceLabel: inst.label || inst.template_name || `Instance #${inst.id}`,
                        templateId: inst.template_id,
                        groups: [{ name: null, type: null, categoryId: null, plates: instPlates }]
                    });
                    continue;
                }

                const groups = [];
                const usedPlateIds = new Set();
                for (const cat of tplData.categories) {
                    const catPlates = instPlates.filter(p => p.category_id === cat.id);
                    catPlates.forEach(p => usedPlateIds.add(p.id));

                    if (cat.type === 'fixed') {
                        groups.push({ name: cat.name, type: 'fixed', categoryId: cat.id, plates: catPlates });
                    } else if (cat.type === 'choice') {
                        const choice = project.category_choices?.find(c => c.category_id === cat.id && c.instance_id === inst.id);
                        groups.push({
                            name: cat.name, type: 'choice', categoryId: cat.id,
                            chosenOptionId: choice?.option_id,
                            chosenOptionName: choice?.option_name,
                            options: cat.options,
                            instanceId: inst.id,
                            plates: catPlates
                        });
                    }
                }
                const uncategorized = instPlates.filter(p => !usedPlateIds.has(p.id));
                if (uncategorized.length > 0) {
                    groups.push({ name: null, type: null, categoryId: null, plates: uncategorized });
                }

                sections.push({
                    instanceId: inst.id,
                    instanceLabel: inst.label || inst.template_name || `Instance #${inst.id}`,
                    templateId: inst.template_id,
                    groups
                });
            }

            // Loose files (no instance_id)
            const loosePlates = project.plates.filter(p => !p.instance_id);
            if (loosePlates.length > 0) {
                sections.push({
                    instanceId: null,
                    instanceLabel: 'Additional Files',
                    templateId: null,
                    groups: [{ name: null, type: null, categoryId: null, plates: loosePlates }]
                });
            }

            return sections;
        }

        // Legacy single-template (no instances array or empty)
        if (!templateData?.categories?.length) {
            return [{ instanceId: null, instanceLabel: null, templateId: null, groups: [{ name: null, type: null, categoryId: null, plates: project.plates }] }];
        }

        const groups = [];
        const usedPlateIds = new Set();
        for (const cat of templateData.categories) {
            const catPlates = project.plates.filter(p => p.category_id === cat.id);
            catPlates.forEach(p => usedPlateIds.add(p.id));

            if (cat.type === 'fixed') {
                groups.push({ name: cat.name, type: 'fixed', categoryId: cat.id, plates: catPlates });
            } else if (cat.type === 'choice') {
                const choice = project.category_choices?.find(c => c.category_id === cat.id);
                groups.push({
                    name: cat.name, type: 'choice', categoryId: cat.id,
                    chosenOptionId: choice?.option_id,
                    chosenOptionName: choice?.option_name,
                    options: cat.options,
                    plates: catPlates
                });
            }
        }
        const uncategorized = project.plates.filter(p => !usedPlateIds.has(p.id));
        if (uncategorized.length > 0) {
            groups.push({ name: null, type: null, categoryId: null, plates: uncategorized });
        }

        return [{ instanceId: null, instanceLabel: null, templateId: null, groups }];
    };

    if (loading) return <div className="page"><div className="loading">Loading project...</div></div>;
    if (error) return <div className="page"><div className="error">{error}</div></div>;
    if (!project) return <div className="page">Project not found.</div>;

    const progress = project.plates.length > 0
        ? Math.round((project.plates.filter(p => p.status === 'done').length / project.plates.length) * 100)
        : 0;

    const remainingTimeS = project.plates
        .filter(p => p.status !== 'done')
        .reduce((acc, p) => acc + (p.estimated_time_s || 0), 0);

    const warningBuffer = 1 + (parseInt(settings.project_deadline_warning_percent || '50') / 100);
    const isDeadlineCritical = project.due_date &&
        (Date.now() + (remainingTimeS * 1000 * warningBuffer)) > new Date(project.due_date).getTime();

    return (
        <div className="page project-detail-view" style={{ maxWidth: '1100px', margin: '0 auto', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
                <div>
                    <button className="btn btn-link" onClick={onBack} style={{ marginBottom: '8px', padding: 0 }}>← Back to Projects</button>
                    <h2 style={{ margin: 0, fontSize: '28px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {project.name}
                        <button className="btn btn-sm" onClick={() => setShowEditModal(true)} style={{ padding: '4px 8px', fontSize: '12px', background: 'var(--surface2)', border: '1px solid var(--border)' }}>Edit</button>
                    </h2>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '4px', alignItems: 'center' }}>
                        <span className="badge badge-outline" style={{ opacity: 0.8 }}>{project.template_name || 'Individual Project'}</span>
                        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Created {new Date(project.created_at).toLocaleDateString()}</span>
                        {project.due_date && (
                            <span style={{ fontSize: '13px', color: 'var(--primary)', fontWeight: 600 }}>
                                📅 Due {new Date(project.due_date).toLocaleDateString()}
                            </span>
                        )}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    {isDeadlineCritical && project.status !== 'archived' && (
                        <div className="status-badge status-badge--error" style={{ height: '36px', display: 'flex', alignItems: 'center', px: '12px', fontWeight: 800, animation: 'pulse 2s infinite' }}>
                            ⚠️ DEADLINE CRITICAL
                        </div>
                    )}
                    {project.status === 'archived' ? (
                        <button className="btn btn-primary" onClick={handleUnarchive}>Unarchive Project</button>
                    ) : (
                        <button className="btn btn-outline" onClick={handleArchive}>Archive Project</button>
                    )}
                </div>
            </div>

            {showEditModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, backdropFilter: 'blur(4px)' }}>
                    <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '20px', width: '400px', padding: '24px', boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }}>
                        <h3 style={{ margin: '0 0 20px 0' }}>Edit Project</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div>
                                <label style={{ fontSize: '13px', fontWeight: 600 }}>Project Name</label>
                                <input
                                    type="text"
                                    value={editName}
                                    onChange={e => setEditName(e.target.value)}
                                    style={{ width: '100%', padding: '10px', marginTop: '4px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }}
                                />
                            </div>
                            <div>
                                <label style={{ fontSize: '13px', fontWeight: 600 }}>Due Date (Optional)</label>
                                <input
                                    type="date"
                                    className="input"
                                    value={editDueDate}
                                    onChange={e => setEditDueDate(e.target.value)}
                                    style={{ marginTop: '4px' }}
                                />
                            </div>
                            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                                <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleUpdateProject}>Save Changes</button>
                                <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setShowEditModal(false)}>Cancel</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: '24px', alignItems: 'start' }}>
                {/* Left: Plate Checklist */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', overflow: 'visible' }}>
                        <div style={{ padding: '16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface2)' }}>
                            <h3 style={{ margin: 0, fontSize: '16px' }}>Print Plates</h3>
                            <div style={{ fontSize: '14px', fontWeight: 600 }}>{progress}% Complete</div>
                        </div>
                        <div style={{ padding: '0 8px' }}>
                            {groupPlates().map((section, si) => (
                                <React.Fragment key={section.instanceId ?? `section-${si}`}>
                                    {/* Instance header (only for multi-instance projects) */}
                                    {section.instanceLabel && groupPlates().length > 1 && (
                                        <div style={{
                                            padding: '12px 12px 4px',
                                            marginTop: si > 0 ? '8px' : 0,
                                            borderTop: si > 0 ? '3px solid var(--primary)' : 'none'
                                        }}>
                                            <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text)' }}>
                                                {section.instanceLabel}
                                            </span>
                                        </div>
                                    )}
                                    {section.groups.map((group, gi) => (
                                        <React.Fragment key={group.categoryId ?? `uncategorized-${gi}`}>
                                            {/* Category header */}
                                            {group.name && (
                                                <div style={{
                                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                    padding: '10px 12px 6px', marginTop: gi > 0 ? '4px' : 0,
                                                    borderTop: gi > 0 ? '2px solid var(--border)' : 'none'
                                                }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <span style={{ fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
                                                            {group.name}
                                                        </span>
                                                        {group.type === 'choice' && group.chosenOptionName && (
                                                            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--primary)', background: 'color-mix(in srgb, var(--primary) 15%, transparent)', padding: '2px 8px', borderRadius: '8px' }}>
                                                                {group.chosenOptionName}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {group.type === 'choice' && group.options && project.status !== 'archived' && (
                                                        <select
                                                            className="form-select"
                                                            value={group.chosenOptionId || ''}
                                                            onChange={e => handleSwapOption(group.categoryId, Number(e.target.value), group.instanceId)}
                                                            style={{ width: 'auto', fontSize: '12px', padding: '2px 8px', height: '28px' }}
                                                        >
                                                            {group.options.map(opt => (
                                                                <option key={opt.id} value={opt.id}>{opt.name}</option>
                                                            ))}
                                                        </select>
                                                    )}
                                                </div>
                                            )}
                                            {/* Plates in this group */}
                                            {group.plates.map((plate, i) => (
                                        <div
                                            key={plate.id}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '12px',
                                                padding: '10px 12px',
                                                borderBottom: i === group.plates.length - 1 ? 'none' : '1px solid var(--border)',
                                                background: plate.status === 'done' ? 'rgba(0,0,0,0.1)' : 'transparent',
                                                opacity: plate.status === 'done' ? 0.6 : 1,
                                                transition: 'all 0.2s',
                                                fontSize: '13px'
                                            }}
                                        >
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontWeight: 600, color: plate.status === 'done' ? 'var(--text-muted)' : 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {(plate.display_name || plate.filename || '').replace(/\.(gcode|3mf)$/i, '').replace(/^\d{10,}_/, '')}
                                                </div>
                                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', display: 'flex', gap: '8px' }}>
                                                    {plate.estimated_time_s ? (
                                                        <span>⏱️ {Math.floor(plate.estimated_time_s / 3600)}h {Math.floor((plate.estimated_time_s % 3600) / 60)}m</span>
                                                    ) : null}
                                                    {plate.filament_usage_g ? (
                                                        <span>⚖️ {Math.round(plate.filament_usage_g)}g</span>
                                                    ) : null}
                                                </div>
                                            </div>

                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                                                {project.status === 'archived' ? (
                                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '2px', paddingRight: '12px', textAlign: 'right' }}>
                                                        {plate.actual_start_time ? (
                                                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                                                <span>start</span>
                                                                <span style={{ fontWeight: 600, color: 'var(--text)' }}>
                                                                    {new Date(plate.actual_start_time).toLocaleString(undefined, { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                                                                </span>
                                                            </div>
                                                        ) : null}
                                                        {plate.actual_end_time ? (
                                                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                                                <span>finish</span>
                                                                <span style={{ fontWeight: 600, color: 'var(--text)' }}>
                                                                    {new Date(plate.actual_end_time).toLocaleString(undefined, { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                                                                </span>
                                                            </div>
                                                        ) : (!plate.actual_start_time ? (
                                                            <span style={{ fontStyle: 'italic', opacity: 0.7 }}>Not printed</span>
                                                        ) : null)}
                                                    </div>
                                                ) : (
                                                    <>
                                                        <PrinterSelector
                                                            printers={printers}
                                                            status={status}
                                                            plate={plate}
                                                            selectedId={selectedPrinters[plate.id]}
                                                            onSelect={id => setSelectedPrinters(prev => ({ ...prev, [plate.id]: id }))}
                                                            disabled={plate.status === 'done' || loading}
                                                        />

                                                        <button
                                                            className="btn btn-sm btn-primary"
                                                            onClick={() => handlePrint(plate)}
                                                            disabled={!selectedPrinters[plate.id] || plate.status === 'done' || loading}
                                                            style={{ height: '28px', padding: '0 10px', fontSize: '12px' }}
                                                        >
                                                            Print
                                                        </button>
                                                    </>
                                                )}

                                                <div style={{ width: '1px', height: '16px', background: 'var(--border)', margin: '0 4px' }} />

                                                <div style={{ minWidth: '70px', textAlign: 'right' }}>
                                                    {plate.status === 'done' ? (
                                                        <span style={{ color: 'var(--success)', fontWeight: 700, fontSize: '11px' }}>✓ DONE</span>
                                                    ) : (
                                                        <span style={{ color: 'var(--warning)', fontWeight: 600, fontSize: '11px' }}>{project.status === 'archived' ? 'Not printed' : 'PENDING'}</span>
                                                    )}
                                                </div>

                                                {project.status !== 'archived' && (
                                                    <button
                                                        className="btn btn-sm btn-outline"
                                                        onClick={() => updatePlateStatus(plate.id, plate.status === 'done' ? 'pending' : 'done')}
                                                        style={{ height: '28px', padding: '0 8px', fontSize: '11px', opacity: 0.7 }}
                                                    >
                                                        {plate.status === 'done' ? 'Re-open' : 'Done'}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                        </React.Fragment>
                                    ))}
                                </React.Fragment>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right: Filament Setup (Project Status moved to Sidebar) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '16px' }}>
                        <h3 style={{ margin: '0 0 16px 0', fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>Filament Setup</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {project.color_assignments?.map(ca => {
                                const color = ca.color_hex ? (ca.color_hex.startsWith('#') ? ca.color_hex : `#${ca.color_hex}`) : '#888888';
                                return (
                                    <div
                                        key={ca.id}
                                        className="spoolman-spool-card"
                                        style={{
                                            padding: '12px',
                                            cursor: 'default',
                                            borderWidth: '1px'
                                        }}
                                    >
                                        <div className="spool-card-header" style={{ marginBottom: '4px' }}>
                                            <div className="spool-color-circle" style={{ '--spool-color': color, width: '24px', height: '24px', borderRadius: '50%' }} />
                                            <div className="spool-card-info" style={{ flex: 1 }}>
                                                <span className="spool-card-name" style={{ fontSize: '13px' }}>{ca.slot_key}</span>
                                                <span className="spool-card-material" style={{ fontSize: '10px' }}>
                                                    {ca.material || '—'}
                                                    {ca.spool_id && (
                                                        <span style={{ marginLeft: '4px', opacity: 0.8 }}>#{ca.spool_id}</span>
                                                    )}
                                                </span>
                                            </div>
                                            <button
                                                className="btn btn-sm btn-outline"
                                                style={{ padding: '2px 8px', fontSize: '11px' }}
                                                onClick={() => setShowSpoolPicker({ slotKey: ca.slot_key, currentSpoolId: ca.spool_id })}
                                            >
                                                Change
                                            </button>
                                        </div>
                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                            {ca.vendor && <span>{ca.vendor} • </span>}
                                            {ca.spool_name || 'No spool assigned'}
                                            {ca.material && <span> ({ca.material})</span>}
                                        </div>
                                    </div>
                                );
                            })}
                            {project.color_assignments?.length === 0 && <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No assignments defined.</p>}
                        </div>
                    </div>
                </div>
            </div>

            {/* Spool Picker Modal */}
            {showSpoolPicker && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, backdropFilter: 'blur(4px)' }}>
                    <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '20px', width: '850px', maxWidth: '95vw', boxShadow: '0 20px 50px rgba(0,0,0,0.5)', overflow: 'hidden' }}>
                        <div style={{ padding: '20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h2 style={{ margin: 0, fontSize: '20px' }}>Change Spool</h2>
                            <button className="btn" style={{ background: 'transparent', border: 'none', fontSize: '24px', padding: 0 }} onClick={() => setShowSpoolPicker(null)}>✕</button>
                        </div>

                        <div style={{ padding: '24px', display: 'flex', gap: '20px' }}>
                            {/* Left: Slot Context */}
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <div style={{ border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden', background: 'var(--surface)' }}>
                                    <div style={{ padding: '12px', background: 'var(--surface2)', fontSize: '13px', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>
                                        Target Slot: {showSpoolPicker.slotKey}
                                    </div>
                                    <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                                        {/* Find current assignment for this slot */}
                                        {(() => {
                                            const ca = project.color_assignments?.find(a => a.slot_key === showSpoolPicker.slotKey);
                                            const color = ca?.color_hex ? (ca.color_hex.startsWith('#') ? ca.color_hex : `#${ca.color_hex}`) : '#888888';
                                            return (
                                                <div
                                                    style={{
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        alignItems: 'center',
                                                        gap: '12px',
                                                        padding: '20px',
                                                        width: '100%',
                                                        background: 'var(--surface2)',
                                                        borderRadius: '12px',
                                                        border: '2px dashed transparent',
                                                        transition: 'all 0.2s'
                                                    }}
                                                    onDragOver={e => {
                                                        e.preventDefault();
                                                        e.currentTarget.style.borderColor = 'var(--primary)';
                                                        e.currentTarget.style.background = 'var(--surface3)';
                                                    }}
                                                    onDragLeave={e => {
                                                        e.currentTarget.style.borderColor = 'transparent';
                                                        e.currentTarget.style.background = 'var(--surface2)';
                                                    }}
                                                    onDrop={e => {
                                                        e.preventDefault();
                                                        const spoolId = e.dataTransfer.getData('spoolId');
                                                        handleChangeSpool(showSpoolPicker.slotKey, spoolId);
                                                        e.currentTarget.style.borderColor = 'transparent';
                                                        e.currentTarget.style.background = 'var(--surface2)';
                                                    }}
                                                >
                                                    <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: color, border: '3px solid rgba(255,255,255,0.1)' }} />
                                                    <div style={{ textAlign: 'center' }}>
                                                        <div style={{ fontSize: '15px', fontWeight: 800 }}>{showSpoolPicker.slotKey}</div>
                                                        <div style={{ fontSize: '13px', fontWeight: 600, marginTop: '4px' }}>
                                                            {ca?.vendor && <span style={{ opacity: 0.7 }}>{ca.vendor} • </span>}
                                                            {ca?.spool_name || 'No spool assigned'}
                                                        </div>
                                                        {ca?.material && (
                                                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                                                {ca.material} {ca.spool_id && <span style={{ marginLeft: '4px', opacity: 0.6 }}>#{ca.spool_id}</span>}
                                                            </div>
                                                        )}
                                                    </div>

                                                    <button
                                                        className="btn btn-outline"
                                                        style={{ width: '100%', marginTop: '8px' }}
                                                        onClick={() => handleChangeSpool(showSpoolPicker.slotKey, null)}
                                                    >
                                                        Clear Spool
                                                    </button>
                                                </div>
                                            );
                                        })()}
                                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', margin: 0 }}>
                                            Drag a spool from the browser onto this slot to reassign.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Right: Spool Browser */}
                            <div style={{ width: '350px', display: 'flex', flexDirection: 'column', gap: '12px', borderLeft: '1px solid var(--border)', paddingLeft: '20px' }}>
                                <div style={{ fontSize: '13px', fontWeight: 600 }}>Spoolman Browser</div>
                                <input
                                    type="text"
                                    placeholder="Search spools..."
                                    className="input"
                                    value={spoolSearch}
                                    onChange={e => setSpoolSearch(e.target.value)}
                                />
                                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '400px', paddingRight: '4px' }}>
                                    {spools
                                        .filter(s => {
                                            const q = spoolSearch.toLowerCase();
                                            return (s.name?.toLowerCase().includes(q) || s.filament?.material?.toLowerCase().includes(q) || s.filament?.vendor?.name?.toLowerCase().includes(q));
                                        })
                                        .map(s => {
                                            const f = s.filament || {};
                                            const color = f.color_hex ? (f.color_hex.startsWith('#') ? f.color_hex : `#${f.color_hex}`) : '#888888';
                                            return (
                                                <div
                                                    key={s.id}
                                                    draggable
                                                    className="spoolman-spool-card"
                                                    onDragStart={e => {
                                                        e.dataTransfer.setData('spoolId', s.id);
                                                        e.currentTarget.style.opacity = '0.5';
                                                    }}
                                                    onDragEnd={e => {
                                                        e.currentTarget.style.opacity = '1';
                                                    }}
                                                    onClick={() => handleChangeSpool(showSpoolPicker.slotKey, s.id)}
                                                    style={{ padding: '10px', cursor: 'pointer', borderColor: showSpoolPicker.currentSpoolId === s.id ? 'var(--primary)' : 'var(--border)' }}
                                                >
                                                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                                        <div className="spool-color-circle" style={{ '--spool-color': color, width: '24px', height: '24px' }} />
                                                        <div style={{ flex: 1 }}>
                                                            <div style={{ fontSize: '13px', fontWeight: 600 }}>{f.name || `Spool #${s.id}`}</div>
                                                            <div style={{ fontSize: '11px', opacity: 0.7 }}>{f.material} · {f.vendor?.name} · {Math.round(s.remaining_weight || 0)}g</div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Swap Confirmation Dialog */}
            {swapConfirm && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, backdropFilter: 'blur(4px)' }}>
                    <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '16px', width: '420px', padding: '24px', boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }}>
                        <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', color: 'var(--warning)' }}>Swap with printed plates?</h3>
                        <p style={{ fontSize: '13px', margin: '0 0 16px 0' }}>
                            {swapConfirm.done_count} plate{swapConfirm.done_count !== 1 ? 's have' : ' has'} already been printed and will be removed:
                        </p>
                        <ul style={{ margin: '0 0 16px 0', paddingLeft: '20px', fontSize: '13px' }}>
                            {swapConfirm.done_plates?.map(p => (
                                <li key={p.id} style={{ color: 'var(--text-muted)' }}>{p.display_name}</li>
                            ))}
                        </ul>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button className="btn btn-danger" style={{ flex: 1 }}
                                onClick={() => handleSwapOption(swapConfirm.category_id, swapConfirm.new_option_id, true)}>
                                Swap Anyway
                            </button>
                            <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setSwapConfirm(null)}>
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
