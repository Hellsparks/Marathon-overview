import PrinterCard from './PrinterCard';

export default function PrinterGrid({ printers, status }) {
  if (!printers.length) {
    return (
      <div className="empty-state">
        <p>No printers configured yet.</p>
        <a href="/settings">Add a printer in Settings →</a>
      </div>
    );
  }

  return (
    <div className="printer-grid">
      {printers.map(printer => (
        <PrinterCard
          key={printer.id}
          printer={printer}
          status={status[printer.id]}
        />
      ))}
    </div>
  );
}
