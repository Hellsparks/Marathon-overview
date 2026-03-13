import { useParams } from 'react-router-dom';
import { usePrinters } from '../hooks/usePrinters';

export default function PrinterDetailPage() {
    const { id } = useParams();
    const { printers, loading } = usePrinters();

    if (loading) return <div className="loading">Loading…</div>;

    const printer = printers.find(p => p.id === parseInt(id));
    if (!printer) return <div className="error">Printer not found</div>;

    // Mainsail runs on port 80 (the web UI port), not the Moonraker API port.
    // If host is a full URL (e.g. OctoEverywhere), use it directly.
    const mainsailUrl = /^https?:\/\//i.test(printer.host)
      ? printer.host.replace(/\/+$/, '')
      : `http://${printer.host}`;

    return (
        <div className="printer-detail-page">
            <iframe
                src={mainsailUrl}
                title={printer.name}
                className="printer-mainsail-frame"
                allow="fullscreen"
            />
        </div>
    );
}
