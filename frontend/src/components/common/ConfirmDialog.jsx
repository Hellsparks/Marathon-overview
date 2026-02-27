export default function ConfirmDialog({ message, onConfirm, onCancel }) {
  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="dialog" onClick={e => e.stopPropagation()}>
        <p>{message}</p>
        <div className="dialog-actions">
          <button className="btn btn-danger" onClick={onConfirm}>Confirm</button>
          <button className="btn" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
