import { useState, useRef } from 'react';
import PrinterCard from './PrinterCard';

export default function PrinterGrid({ printers, status, editMode, onReorder }) {
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);
  const dragNodeRef = useRef(null);

  if (!printers.length) {
    return (
      <div className="empty-state">
        <p>No printers configured yet.</p>
        <a href="/settings">Add a printer in Settings →</a>
      </div>
    );
  }

  function handleDragStart(e, index) {
    setDragIndex(index);
    dragNodeRef.current = e.currentTarget;
    e.dataTransfer.effectAllowed = 'move';
    // Cards with custom CSS use display:contents on a wrapper, which breaks the
    // browser's default drag image (it captures the whole grid instead).
    // Use the .printer-card element as a custom drag image.
    const card = e.currentTarget.querySelector('.printer-card');
    if (card) {
      const rect = card.getBoundingClientRect();
      const offsetX = e.clientX - rect.left;
      const offsetY = e.clientY - rect.top;
      e.dataTransfer.setDragImage(card, offsetX, offsetY);
    }
    // Slight delay so the dragged element doesn't flash
    requestAnimationFrame(() => {
      if (dragNodeRef.current) dragNodeRef.current.style.opacity = '0.4';
    });
  }

  function handleDragOver(e, index) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (index !== overIndex) setOverIndex(index);
  }

  function handleDrop(e, index) {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) return;
    const reordered = [...printers];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(index, 0, moved);
    onReorder?.(reordered.map(p => p.id));
    setDragIndex(null);
    setOverIndex(null);
  }

  function handleDragEnd() {
    if (dragNodeRef.current) dragNodeRef.current.style.opacity = '1';
    setDragIndex(null);
    setOverIndex(null);
  }

  return (
    <div className="printer-grid">
      {printers.map((printer, i) => (
        <div
          key={printer.id}
          draggable={editMode}
          onDragStart={editMode ? e => handleDragStart(e, i) : undefined}
          onDragOver={editMode ? e => handleDragOver(e, i) : undefined}
          onDragEnter={editMode ? e => e.preventDefault() : undefined}
          onDrop={editMode ? e => handleDrop(e, i) : undefined}
          onDragEnd={editMode ? handleDragEnd : undefined}
          className={`printer-grid-item${editMode ? ' edit-mode' : ''}${editMode && overIndex === i && dragIndex !== i ? ' drop-target' : ''}`}
        >
          <PrinterCard
            printer={printer}
            status={status[printer.id]}
          />
        </div>
      ))}
    </div>
  );
}
