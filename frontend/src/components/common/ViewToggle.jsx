import React from 'react';

export default function ViewToggle({ viewMode, onChange }) {
    return (
        <div className="file-view-toggle" style={{ height: '40px', display: 'flex', flexShrink: 0 }}>
            <button
                className={viewMode === 'list' ? 'active' : ''}
                onClick={() => onChange('list')}
                title="List View"
                style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
                ☰
            </button>
            <button
                className={viewMode === 'grid-small' ? 'active' : ''}
                onClick={() => onChange('grid-small')}
                title="Small Grid"
                style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
                ⚏
            </button>
            <button
                className={viewMode === 'grid-large' ? 'active' : ''}
                onClick={() => onChange('grid-large')}
                title="Large Grid"
                style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
                ☷
            </button>
        </div>
    );
}
