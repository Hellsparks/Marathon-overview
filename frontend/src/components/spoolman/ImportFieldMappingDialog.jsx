import { useState } from 'react';
import { createPortal } from 'react-dom';

const ENTITY_LABELS = { vendor: 'Vendor', filament: 'Filament', spool: 'Spool' };
const ACTION_CREATE = 'create';
const ACTION_MAP = 'map';
const ACTION_SKIP = 'skip';

export default function ImportFieldMappingDialog({ missing, existing, onConfirm, onCancel }) {
  // Build initial state: { vendor: { [key]: { action, mapTo } }, ... }
  const [choices, setChoices] = useState(() => {
    const init = {};
    for (const entity of ['vendor', 'filament', 'spool']) {
      init[entity] = {};
      for (const field of (missing[entity] || [])) {
        init[entity][field.key] = { action: ACTION_CREATE, mapTo: '' };
      }
    }
    return init;
  });

  const setChoice = (entity, key, patch) => {
    setChoices(prev => ({
      ...prev,
      [entity]: {
        ...prev[entity],
        [key]: { ...prev[entity][key], ...patch },
      },
    }));
  };

  const handleConfirm = () => {
    const createFields = [];
    const fieldMappings = {};

    for (const entity of ['vendor', 'filament', 'spool']) {
      for (const field of (missing[entity] || [])) {
        const choice = choices[entity][field.key];
        if (choice.action === ACTION_CREATE) {
          createFields.push({ entity, ...field });
        } else if (choice.action === ACTION_MAP && choice.mapTo) {
          if (!fieldMappings[entity]) fieldMappings[entity] = {};
          fieldMappings[entity][field.key] = choice.mapTo;
        } else if (choice.action === ACTION_SKIP) {
          if (!fieldMappings[entity]) fieldMappings[entity] = {};
          fieldMappings[entity][field.key] = '__skip__';
        }
      }
    }

    onConfirm(createFields, fieldMappings);
  };

  const totalMissing = ['vendor', 'filament', 'spool'].reduce(
    (sum, e) => sum + (missing[e]?.length || 0), 0
  );

  return createPortal(
    <div className="dialog-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div
        className="dialog"
        style={{ maxWidth: '640px', width: '90vw' }}
      >
        <h2 style={{ fontSize: '17px', marginBottom: '8px' }}>Field Mapping Required</h2>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
          The backup contains {totalMissing} custom field{totalMissing !== 1 ? 's' : ''} that
          {totalMissing !== 1 ? ' do' : ' does'} not exist on the target Spoolman instance.
          Choose how to handle each one.
        </p>

        {['vendor', 'filament', 'spool'].map(entity => {
          const fields = missing[entity] || [];
          if (fields.length === 0) return null;
          const existingFields = existing[entity] || [];

          return (
            <div key={entity} style={{ marginBottom: '16px' }}>
              <div style={{
                fontSize: '13px', fontWeight: 600, marginBottom: '8px',
                textTransform: 'capitalize', color: 'var(--text)',
              }}>
                {ENTITY_LABELS[entity]} Fields
              </div>
              <table style={{
                width: '100%', fontSize: '13px',
                borderCollapse: 'collapse',
              }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                    <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 500 }}>Field</th>
                    <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 500 }}>Type</th>
                    <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 500 }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {fields.map(field => {
                    const choice = choices[entity][field.key];
                    return (
                      <tr key={field.key} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px' }}>
                          <div style={{ fontWeight: 500 }}>{field.name || field.key}</div>
                          {field.name && field.name !== field.key && (
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                              key: {field.key}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '8px', color: 'var(--text-muted)' }}>
                          {field.field_type || 'text'}
                        </td>
                        <td style={{ padding: '8px' }}>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                            <select
                              className="form-input"
                              value={choice.action}
                              onChange={e => setChoice(entity, field.key, {
                                action: e.target.value,
                                mapTo: e.target.value === ACTION_MAP ? (existingFields[0]?.key || '') : '',
                              })}
                              style={{ fontSize: '12px', padding: '4px 8px', minWidth: '100px' }}
                            >
                              <option value={ACTION_CREATE}>Create</option>
                              {existingFields.length > 0 && (
                                <option value={ACTION_MAP}>Map to...</option>
                              )}
                              <option value={ACTION_SKIP}>Skip</option>
                            </select>
                            {choice.action === ACTION_MAP && (
                              <select
                                className="form-input"
                                value={choice.mapTo}
                                onChange={e => setChoice(entity, field.key, { mapTo: e.target.value })}
                                style={{ fontSize: '12px', padding: '4px 8px', minWidth: '120px' }}
                              >
                                {existingFields.map(ef => (
                                  <option key={ef.key} value={ef.key}>
                                    {ef.name || ef.key}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })}

        <div className="dialog-actions">
          <button className="btn btn-primary" onClick={handleConfirm}>
            Continue Import
          </button>
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
