import { useState, useEffect, useCallback } from 'react';
import {
  getMaintenance,
  createTask,
  deleteTask,
  setInterval as setMaintenanceInterval,
  markDone,
} from '../api/maintenance';
import MaintenancePrinterCard from '../components/maintenance/MaintenancePrinterCard';

export default function MaintenancePage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newTaskName, setNewTaskName] = useState('');
  const [adding, setAdding] = useState(false);
  const [pendingIntervals, setPendingIntervals] = useState({});
  const [busy, setBusy] = useState({});

  const load = useCallback(async () => {
    try {
      const d = await getMaintenance();
      setData(d);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleAddTask(e) {
    e.preventDefault();
    if (!newTaskName.trim()) return;
    setAdding(true);
    try {
      await createTask(newTaskName.trim());
      setNewTaskName('');
      await load();
    } catch (e) {
      alert(e.message);
    } finally {
      setAdding(false);
    }
  }

  async function handleDeleteTask(taskId) {
    if (!confirm('Delete this maintenance task and all its history?')) return;
    try { await deleteTask(taskId); await load(); } catch (e) { alert(e.message); }
  }

  async function handleSetInterval(taskId, printerId) {
    const key = `${taskId}_${printerId}`;
    const hours = parseInt(pendingIntervals[key], 10);
    if (isNaN(hours) || hours < 0) return;
    setBusy(b => ({ ...b, [key]: true }));
    try {
      await setMaintenanceInterval(taskId, printerId, hours);
      setPendingIntervals(p => { const n = { ...p }; delete n[key]; return n; });
      await load();
    } catch (e) { alert(e.message); }
    finally { setBusy(b => ({ ...b, [key]: false })); }
  }

  async function handleMarkDone(taskId, printerId) {
    const key = `${taskId}_${printerId}_done`;
    setBusy(b => ({ ...b, [key]: true }));
    try { await markDone(taskId, printerId); await load(); }
    catch (e) { alert(e.message); }
    finally { setBusy(b => ({ ...b, [key]: false })); }
  }

  if (loading) return <div className="page-loading">Loading maintenance data…</div>;
  if (error) return <div className="error-banner">Error: {error}</div>;

  const { tasks, printers, intervals, history } = data;

  return (
    <div className="maintenance-page">
      <div className="maintenance-header">
        <h1 className="page-title">Maintenance</h1>
      </div>

      {/* ── Printer cards ─────────────────────────────────────────── */}
      {printers.length > 0 && (
        <div className="printer-grid" style={{ marginBottom: '28px' }}>
          {printers.map(printer => (
            <MaintenancePrinterCard
              key={printer.id}
              printer={printer}
              tasks={tasks}
              intervals={intervals}
              history={history}
              onMarkDone={handleMarkDone}
              busy={busy}
            />
          ))}
        </div>
      )}

      {/* ── Config section ─────────────────────────────────────────── */}
      <div className="maint-config-section">
        <h2 className="maint-config-title">Tasks &amp; Intervals</h2>

        <form className="maint-add-form" onSubmit={handleAddTask}>
          <input
            className="maint-task-input"
            type="text"
            placeholder="New task (e.g. Lubricate X/Y rails)"
            value={newTaskName}
            onChange={e => setNewTaskName(e.target.value)}
            disabled={adding}
          />
          <button className="btn btn-primary v-btn" type="submit" disabled={adding || !newTaskName.trim()}>
            {adding ? 'Adding…' : '+ Add Task'}
          </button>
        </form>

        {tasks.length > 0 && printers.length > 0 && (
          <div className="maint-table-wrap">
            <table className="maint-table">
              <thead>
                <tr>
                  <th className="maint-th">Task</th>
                  {printers.map(p => (
                    <th key={p.id} className="maint-th maint-th-printer">{p.name}</th>
                  ))}
                  <th className="maint-th" />
                </tr>
              </thead>
              <tbody>
                {tasks.map(task => (
                  <tr key={task.id} className="maint-row">
                    <td className="maint-td maint-td-task">{task.name}</td>
                    {printers.map(printer => {
                      const key = `${task.id}_${printer.id}`;
                      const current = intervals[key] || 0;
                      const pending = pendingIntervals[key];
                      const isDirty = pending !== undefined;
                      const displayVal = isDirty ? pending : (current || '');
                      return (
                        <td key={printer.id} className="maint-td">
                          <div className="maint-interval-row">
                            <input
                              className="maint-interval-input"
                              type="number"
                              min="0"
                              placeholder="—"
                              value={displayVal}
                              onChange={e => setPendingIntervals(p => ({ ...p, [key]: e.target.value }))}
                              title="Interval in print hours"
                            />
                            <span className="maint-interval-label">h</span>
                            {isDirty && (
                              <button
                                className="maint-save-btn"
                                onClick={() => handleSetInterval(task.id, printer.id)}
                                disabled={busy[key]}
                              >
                                {busy[key] ? '…' : '✓'}
                              </button>
                            )}
                          </div>
                        </td>
                      );
                    })}
                    <td className="maint-td" style={{ width: 32 }}>
                      <button
                        className="maint-delete-btn"
                        onClick={() => handleDeleteTask(task.id)}
                        title="Delete task"
                      >✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tasks.length === 0 && (
          <p className="maint-empty">No tasks yet. Add one above to get started.</p>
        )}
      </div>
    </div>
  );
}
