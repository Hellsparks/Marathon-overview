import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import StatusBadge from '../common/StatusBadge';
import TempControl from '../common/TempControl';
import ProgressBar from '../common/ProgressBar';
import ConfirmDialog from '../common/ConfirmDialog';
import WebcamStream from './WebcamStream';
import { pausePrint, resumePrint, cancelPrint, sendGcode } from '../../api/control';

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

  async function run(fn) {
    setBusy(true);
    try { await fn(); } catch (e) { alert(e.message); }
    finally { setBusy(false); }
  }

  async function handleSetTemp(heater, temp) {
    try {
      await sendGcode(printer.id, `SET_HEATER_TEMPERATURE HEATER=${heater} TARGET=${temp}`);
    } catch (e) {
      alert(e.message);
    }
  }

  async function handleCancel() {
    setBusy(true);
    try { await cancelPrint(printer.id); } catch (e) { alert(e.message); }
    finally { setBusy(false); setConfirming(false); }
  }

  return (
    <div className={`printer-card state-${state}`}>
      {/* Header */}
      <div className="printer-card-header">
        <h3 className="printer-name">{printer.name}</h3>
        <StatusBadge state={state} />
      </div>

      {online ? (
        <>
          {/* Temperature controls */}
          <div className="printer-temps">
            <TempControl
              label="Hotend"
              actual={extruder?.temperature}
              target={extruder?.target}
              onSet={temp => handleSetTemp('extruder', temp)}
            />
            <TempControl
              label="Bed"
              actual={bed?.temperature}
              target={bed?.target}
              onSet={temp => handleSetTemp('heater_bed', temp)}
            />
          </div>

          {/* Printer actions */}
          <div className="printer-actions">
            <button
              className="btn btn-sm"
              onClick={() => run(() => sendGcode(printer.id, 'G28'))}
              disabled={busy || isPrinting}
              title="Home all axes"
            >
              Home
            </button>
            <button
              className="btn btn-sm"
              onClick={() => run(() => sendGcode(printer.id, 'QUAD_GANTRY_LEVEL'))}
              disabled={busy || isPrinting}
              title="Quad Gantry Level"
            >
              QGL
            </button>

            {isPrinting && (
              <button className="btn btn-sm" onClick={() => run(() => pausePrint(printer.id))} disabled={busy}>
                Pause
              </button>
            )}
            {isPaused && (
              <button className="btn btn-sm btn-primary" onClick={() => run(() => resumePrint(printer.id))} disabled={busy}>
                Resume
              </button>
            )}
            {(isPrinting || isPaused) && (
              <button className="btn btn-sm btn-danger" onClick={() => setConfirming(true)} disabled={busy}>
                Cancel
              </button>
            )}
          </div>

          {/* Progress (only when active) */}
          {(isPrinting || isPaused) && (
            <ProgressBar value={progress} filename={filename} />
          )}

          {/* Webcam */}
          <WebcamStream printerId={printer.id} />

          {/* Footer */}
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
