import { useState, useEffect } from 'react';
import { createVendor, getFields } from '../../api/spoolman';

export default function AddVendorDialog({ onClose, onCreated }) {
    const [name, setName] = useState('');
    const [comment, setComment] = useState('');
    const [extraFields, setExtraFields] = useState([]);
    const [extra, setExtra] = useState({});
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        getFields('vendor').then(fields => {
            setExtraFields(fields || []);
        }).catch(() => {});
    }, []);

    async function handleSubmit(e) {
        e.preventDefault();
        if (!name.trim()) return;
        setBusy(true);
        try {
            const body = { name: name.trim() };
            if (comment.trim()) body.comment = comment.trim();
            if (Object.keys(extra).length) body.extra = extra;
            const created = await createVendor(body);
            onCreated(created);
        } catch (err) {
            alert(err.message);
        } finally {
            setBusy(false);
        }
    }

    function setExtraVal(key, val) {
        setExtra(prev => ({ ...prev, [key]: val }));
    }

    return (
        <div className="spool-dialog-overlay" onClick={onClose}>
            <div className="spool-dialog" onClick={e => e.stopPropagation()}>
                <div className="spool-dialog-header">
                    <h3 className="spool-dialog-title">Add Manufacturer</h3>
                    <button className="spool-dialog-close" onClick={onClose}>✕</button>
                </div>

                <form onSubmit={handleSubmit} className="sm-form">
                    <div className="sm-field">
                        <label className="sm-label">Name *</label>
                        <input
                            className="sm-input"
                            type="text"
                            placeholder="e.g. eSun"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            autoFocus
                            required
                        />
                    </div>
                    <div className="sm-field">
                        <label className="sm-label">Comment</label>
                        <input
                            className="sm-input"
                            type="text"
                            placeholder="Optional"
                            value={comment}
                            onChange={e => setComment(e.target.value)}
                        />
                    </div>

                    {extraFields.map(f => (
                        <div key={f.key} className="sm-field">
                            <label className="sm-label">
                                {f.name}{f.unit ? ` (${f.unit})` : ''}
                            </label>
                            <input
                                className="sm-input"
                                type={f.field_type === 'float' || f.field_type === 'integer' ? 'number' : 'text'}
                                step={f.field_type === 'float' ? 'any' : undefined}
                                placeholder={f.default_value ?? ''}
                                value={extra[f.key] ?? ''}
                                onChange={e => setExtraVal(f.key, e.target.value)}
                            />
                        </div>
                    ))}

                    <div className="spool-dialog-actions">
                        <button type="button" className="btn v-btn" onClick={onClose} disabled={busy}>Cancel</button>
                        <button type="submit" className="btn btn-primary v-btn" disabled={busy || !name.trim()}>
                            {busy ? 'Saving…' : 'Create'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
