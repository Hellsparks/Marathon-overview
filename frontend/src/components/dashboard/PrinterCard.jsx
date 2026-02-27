import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import StatusBadge from '../common/StatusBadge';
import TempGauge from '../common/TempGauge';
import ProgressBar from '../common/ProgressBar';
import ConfirmDialog from '../common/ConfirmDialog';
import { pausePrint, resumePrint, cancelPrint } from '../../api/control';

export default function PrinterCard({ printer, status }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const online = status?._online;
  const state = online ? (status?.print_stats?.state ?? 'standby') : 'offline';
  const progress = status?.display_status?.progress ?? 0;
  const filename = status?.print_stats?.filename ?? '';
  const extruder = status?.extruder;
  const bed = status?.heater_bed;
  const isPrinting = state === 'printing';
  const isPaused = state === 'paused';

  async function handlePause() {
    setBusy(true);
    try { await pausePrint(printer.id); } catch (e) { alert(e.message); }
    setBusy(false);
  }

  async function handleResume() {
    setBusy(true);
    try { await resumePrint(printer.id); } catch (e) { alert(e.message); }
    setBusy(false);
  }

  async function handleCancel() {
    setBusy(true);
    try { await cancelPrint(printer.id); } catch (e) { alert(e.message); }
    finally { setBusy(false); setConfirming(false); }
  }

  return (
    <div className={`printer-card state-${state}`}>
      <div className="printer-card-header">
        <h3 className="printer-name">{printer.name}</h3>
        <StatusBadge state={state} />
      </div>

      {online ? (
        <>
          <div className="printer-temps">
            <TempGauge label="Hotend" actual={extruder?.temperature} target={extruder?.target} />
            <TempGauge label="Bed"    actual={bed?.temperature}      target={bed?.target} />
          </div>

          {(isPrinting || isPaused) && (
            <>
              <ProgressBar value={progress} filename={filename} />
              <div className="printer-actions">
                {isPrinting && (
                  <button className="btn btn-sm" onClick={handlePause} disabled={busy}>
                    Pause
                  </button>
                )}
                {isPaused && (
                  <button className="btn btn-sm btn-primary" onClick={handleResume} disabled={busy}>
                    Resume
                  </button>
                )}
                <button className="btn btn-sm btn-danger" onClick={() => setConfirming(true)} disabled={busy}>
                  Cancel
                </button>
              </div>
            </>
          )}

          <div className="printer-card-footer">
            <button className="btn-link" onClick={() => navigate(`/queue/${printer.id}`)}>
              View Queue →
            </button>
          </div>
        </>
      ) : (
        <div className="printer-offline-msg">
          {status?._error ? `Error: ${status._error}` : 'Printer unreachable'}
        </div>
      )}

      {confirming && (
        <ConfirmDialog
          message={`Cancel print on ${printer.name}?`}
          onConfirm={handleCancel}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}
