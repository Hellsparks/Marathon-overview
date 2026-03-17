import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { usePrinters } from '../hooks/usePrinters';
import PrinterGrid from '../components/dashboard/PrinterGrid';

export default function DashboardPage() {
  const { status } = useOutletContext();
  const { printers, loading, error, reorder } = usePrinters();
  const [editMode, setEditMode] = useState(false);

  if (loading) return <div className="loading">Loading printers...</div>;
  if (error)   return <div className="error">Error: {error}</div>;

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 className="page-title" style={{ margin: 0 }}>Dashboard</h1>
        {printers.length > 1 && (
          <button
            className={`btn btn-sm${editMode ? ' btn-primary' : ''}`}
            onClick={() => setEditMode(e => !e)}
          >
            {editMode ? 'Done' : 'Reorder'}
          </button>
        )}
      </div>
      <PrinterGrid printers={printers} status={status} editMode={editMode} onReorder={reorder} />
    </div>
  );
}
