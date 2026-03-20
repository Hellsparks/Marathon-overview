import { useState, useEffect } from 'react';

export default function FilamentsPanel() {
    const [count, setCount] = useState(null);

    useEffect(() => {
        fetch('/api/spoolman/filaments')
            .then(r => r.json())
            .then(d => setCount(Array.isArray(d) ? d.length : 0))
            .catch(() => setCount(0));
    }, []);

    return (
        <div className="rp-content">
            <h3 className="rp-title">Filaments</h3>
            <div className="rp-big-stat">
                <span className="rp-big-number">{count ?? '…'}</span>
                <span className="rp-big-label">filaments in Spoolman</span>
            </div>
        </div>
    );
}
