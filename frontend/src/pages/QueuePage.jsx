import { useParams } from 'react-router-dom';
import { useQueue } from '../hooks/useQueue';
import { usePrinters } from '../hooks/usePrinters';
import { useOutletContext } from 'react-router-dom';
import PrinterCard from '../components/dashboard/PrinterCard';
import QueuePanel from '../components/queue/QueuePanel';

export default function QueuePage() {
  const { printerId } = useParams();
  const { status } = useOutletContext();
  const { printers } = usePrinters();
  const { queue, loading, error, refresh } = useQueue(printerId);

  const printer = printers.find(p => String(p.id) === printerId);

  if (!printer) return <div className="loading">Loading…</div>;

  return (
    <div className="page">
      <h1 className="page-title">Queue — {printer.name}</h1>

      <div className="queue-page-layout">
        <div className="queue-page-card">
          <PrinterCard printer={printer} status={status[printer.id]} />
        </div>

        <div className="queue-page-panel">
          {loading ? (
            <div className="loading">Loading queue…</div>
          ) : error ? (
            <div className="error">Error: {error}</div>
          ) : (
            <QueuePanel printerId={printerId} queue={queue} onRefresh={refresh} />
          )}
        </div>
      </div>
    </div>
  );
}
