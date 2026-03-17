import { useState, useEffect } from 'react';

export default function BugReportDialog({ onClose }) {
    const [issueType, setIssueType] = useState('bug');
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [includeLogs, setIncludeLogs] = useState(true);
    const [canDirectReport, setCanDirectReport] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetch('/api/settings')
            .then(r => r.json())
            .then(s => {
                if (s.direct_reports_enabled === 'true' && s.github_token) {
                    setCanDirectReport(true);
                }
            })
            .catch(() => {});
    }, []);

    async function handleSubmit(e) {
        e.preventDefault();
        setError(null);

        const logs = (issueType === 'bug' && includeLogs && window.lastConsoleErrors?.length > 0)
            ? window.lastConsoleErrors.join('\n')
            : null;

        if (canDirectReport) {
            setIsSending(true);
            try {
                const res = await fetch('/api/extras/report-bug', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ type: issueType, title, description, logs })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Failed to send report');
                
                setIsSuccess(true);
                setTimeout(onClose, 2000);
            } catch (err) {
                setError(err.message);
                setIsSending(false);
            }
        } else {
            let body = description;
            if (logs) {
                body += '\n\n### Console Logs\n```text\n' + logs + '\n```';
            }

            const labels = [];
            if (issueType === 'bug') labels.push('bug');
            if (issueType === 'feature') labels.push('Feature request');
            if (issueType === 'docs') labels.push('documentation');

            const url = new URL('https://github.com/Hellsparks/marathon-overview/issues/new');
            url.searchParams.append('title', title);
            url.searchParams.append('body', body);
            url.searchParams.append('labels', labels.join(','));

            window.open(url.toString(), '_blank');
            onClose();
        }
    }

    if (isSuccess) {
        return (
            <div className="bug-report-dialog-overlay" onClick={onClose}>
                <div className="bug-report-dialog sm-form" style={{ textAlign: 'center', padding: '40px 20px' }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
                    <h2 style={{ margin: 0, color: 'var(--success)' }}>Report Sent!</h2>
                    <p style={{ opacity: 0.7 }}>Thank you for your feedback.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="bug-report-dialog-overlay" onClick={onClose}>
            <div className="bug-report-dialog sm-form" onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <h2 style={{ margin: 0, fontSize: 18, color: 'var(--text)' }}>Submit Feedback / Issue</h2>
                    <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 20 }}>&times;</button>
                </div>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {error && (
                        <div style={{ padding: '8px 12px', background: 'var(--danger)', color: '#fff', borderRadius: 4, fontSize: 13 }}>
                            {error}
                        </div>
                    )}

                    <div className="sm-field">
                        <label className="sm-label">Issue Type</label>
                        <select className="sm-input" value={issueType} onChange={e => setIssueType(e.target.value)}>
                            <option value="bug">Bug Report</option>
                            <option value="feature">Feature Request</option>
                            <option value="docs">Documentation Issue</option>
                        </select>
                    </div>

                    <div className="sm-field">
                        <label className="sm-label">Title</label>
                        <input 
                            className="sm-input" 
                            type="text" 
                            required 
                            placeholder="Brief description of the issue"
                            value={title} 
                            onChange={e => setTitle(e.target.value)} 
                        />
                    </div>

                    <div className="sm-field">
                        <label className="sm-label">Description</label>
                        <textarea 
                            className="sm-input" 
                            required 
                            rows={6}
                            placeholder="Please provide details, steps to reproduce, or Context..."
                            style={{ resize: 'vertical' }}
                            value={description} 
                            onChange={e => setDescription(e.target.value)} 
                        />
                    </div>

                    {issueType === 'bug' && (
                        <div className="sm-field">
                            <label className="sm-label" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 500 }}>
                                <input 
                                    type="checkbox" 
                                    checked={includeLogs} 
                                    onChange={e => setIncludeLogs(e.target.checked)} 
                                />
                                Include recent console errors/warnings
                            </label>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                                Appends the last {window.lastConsoleErrors?.length || 0} local console messages to help with debugging.
                            </div>
                        </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 8 }}>
                        <button type="button" className="btn v-btn" onClick={onClose}>Cancel</button>
                        <button type="submit" className="btn btn-primary v-btn" disabled={!title.trim() || !description.trim() || isSending}>
                            {isSending ? 'Sending...' : (canDirectReport ? 'Send Now' : 'Create on GitHub')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
