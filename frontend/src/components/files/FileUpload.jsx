import { useState, useRef } from 'react';
import { uploadFile } from '../../api/files';

export default function FileUpload({ onUploaded }) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const inputRef = useRef();

  async function handleFiles(files) {
    if (!files.length) return;
    setError(null);
    setUploading(true);
    setProgress(0);

    try {
      for (const file of files) {
        await uploadFile(file, setProgress);
      }
      onUploaded?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    handleFiles([...e.dataTransfer.files]);
  }

  return (
    <div
      className={`upload-zone ${dragging ? 'dragging' : ''} ${uploading ? 'uploading' : ''}`}
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => !uploading && inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".gcode,.gc,.g,.gco,.bgcode"
        multiple
        hidden
        onChange={e => handleFiles([...e.target.files])}
      />
      {uploading ? (
        <div>
          <div className="upload-progress-bar">
            <div className="upload-progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <p>Uploading… {progress}%</p>
        </div>
      ) : (
        <>
          <p className="upload-zone-text">Drag &amp; drop G-code files here</p>
          <p className="upload-zone-sub">or click to browse (.gcode, .bgcode)</p>
        </>
      )}
      {error && <p className="upload-error">{error}</p>}
    </div>
  );
}
