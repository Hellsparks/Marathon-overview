import { useNavigate, useLocation } from 'react-router-dom';
import PrinterTab from './PrinterTab';

export default function PrinterTabBar({ printers, status }) {
  const navigate = useNavigate();
  const location = useLocation();

  const isOverview = location.pathname === '/';
  const activePrinterId = location.pathname.startsWith('/printer/')
    ? location.pathname.split('/')[2]
    : null;

  return (
    <div className="printer-tab-bar">
      <button
        className={`printer-tab-overview${isOverview ? ' active' : ''}`}
        onClick={() => navigate('/')}
      >
        Overview
      </button>
      {printers.map(p => (
        <PrinterTab
          key={p.id}
          printer={p}
          status={status?.[p.id]}
          active={String(p.id) === activePrinterId}
          onClick={() => navigate(`/printer/${p.id}`)}
        />
      ))}
    </div>
  );
}
