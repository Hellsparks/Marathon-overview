import { useOutletContext } from 'react-router-dom';
import { usePrinters } from '../hooks/usePrinters';
import PrinterGrid from '../components/dashboard/PrinterGrid';

export default function DashboardPage() {
  const { status } = useOutletContext();
  const { printers, loading, error } = usePrinters();

  if (loading) return <div className="loading">Loading printers...</div>;
  if (error)   return <div className="error">Error: {error}</div>;

  return (
    <div className="page">
      <h1 className="page-title">Dashboard</h1>
      <PrinterGrid printers={printers} status={status} />
    </div>
  );
}
