import { useParams } from 'react-router-dom';
import { usePrinters } from '../hooks/usePrinters';

export default function PrinterIframePage() {
  const { printerId } = useParams();
  const { printers, loading } = usePrinters();

  const printer = printers.find(p => String(p.id) === printerId);
  // Mainsail runs on port 80 of the same host as Moonraker
  const mainsailUrl = printer ? `http://${printer.host}` : null;

  return (
    <div className="printer-iframe-page">
      {loading ? (
        <div className="loading">Loading...</div>
      ) : mainsailUrl ? (
        <iframe
          key={mainsailUrl}
          src={mainsailUrl}
          className="printer-iframe"
          title={printer.name}
          allowFullScreen
        />
      ) : (
        <div className="error">Printer not found</div>
      )}
    </div>
  );
}
