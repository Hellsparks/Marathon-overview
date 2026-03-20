import { createPortal } from 'react-dom';

export default function ConfirmDialog({ message, onConfirm, onCancel }) {
  return createPortal(
    <div className="dialog-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="dialog">
        <p>{message}</p>
        <div className="dialog-actions">
          <button className="btn btn-danger" onClick={onConfirm}>Confirm</button>
          <button className="btn" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
