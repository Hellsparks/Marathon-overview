import { useFiles } from '../hooks/useFiles';
import FileUpload from '../components/files/FileUpload';
import FileList from '../components/files/FileList';

export default function FilesPage() {
  const { files, loading, error, refresh } = useFiles();

  return (
    <div className="page">
      <h1 className="page-title">G-code Files</h1>

      <section className="page-section">
        <h2 className="section-title">Upload</h2>
        <FileUpload onUploaded={refresh} />
        <p className="section-hint">
          You can also configure your slicer (PrusaSlicer, OrcaSlicer, Cura) to upload directly
          by pointing it at this server's URL with the OctoPrint preset.
        </p>
      </section>

      <section className="page-section">
        <h2 className="section-title">Stored Files</h2>
        {loading ? (
          <div className="loading">Loading files…</div>
        ) : error ? (
          <div className="error">Error: {error}</div>
        ) : (
          <FileList files={files} onDeleted={refresh} />
        )}
      </section>
    </div>
  );
}
