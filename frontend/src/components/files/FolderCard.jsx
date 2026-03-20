import { useState } from 'react';

export default function FolderCard({
    folder,
    onDoubleClick,
    onRename,
    onDelete,
    onDropItem
}) {
    const [isDragOver, setIsDragOver] = useState(false);

    const handleDragOver = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (!isDragOver) setIsDragOver(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        setIsDragOver(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragOver(false);

        // Parse the dragged item data
        try {
            const dataStr = e.dataTransfer.getData('application/json');
            if (dataStr) {
                const item = JSON.parse(dataStr);
                // Prevent dropping a folder into itself
                if (item.type === 'folder' && item.id === folder.id) return;

                onDropItem?.(item, folder.id);
            }
        } catch (err) {
            console.error('Drop parsing error', err);
        }
    };

    const handleDragStart = (e) => {
        const data = { type: 'folder', id: folder.id };
        e.dataTransfer.setData('application/json', JSON.stringify(data));
        e.dataTransfer.effectAllowed = 'move';
    };

    return (
        <div
            className={`folder-card ${isDragOver ? 'drag-over' : ''}`}
            onDoubleClick={() => onDoubleClick?.(folder)}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            draggable="true"
            onDragStart={handleDragStart}
            style={{
                position: 'relative',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                padding: '12px 16px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                transition: 'transform 0.15s, border-color 0.15s, box-shadow 0.15s'
            }}
            title="Double-click to open"
            onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.15)';
                e.currentTarget.style.borderColor = 'var(--primary)';
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
                e.currentTarget.style.borderColor = 'var(--border)';
            }}
        >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: 'var(--text-muted)' }}>
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
            <div style={{ flex: 1, minWidth: 0, paddingRight: '64px' }}>
                <div style={{ fontWeight: 600, fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {folder.name}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {folder.file_count === 1 ? '1 file' : `${folder.file_count || 0} files`}
                </div>
            </div>

            <button
                className="spool-adjust-btn"
                onClick={(e) => { e.stopPropagation(); onRename?.(folder); }}
                title="Rename folder"
                style={{ top: '50%', transform: 'translateY(-50%)', right: '38px', backgroundColor: 'var(--surface2)' }}
            >
                ⚙
            </button>
            <button
                className="spool-delete-btn"
                onClick={(e) => { e.stopPropagation(); onDelete?.(folder); }}
                title="Delete folder"
                style={{ top: '50%', transform: 'translateY(-50%)', right: '8px', backgroundColor: 'var(--surface2)' }}
            >
                🗑
            </button>
        </div>
    );
}
