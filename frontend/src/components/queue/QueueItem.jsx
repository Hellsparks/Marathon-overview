export default function QueueItem({ job, onRemove }) {
  return (
    <div className="queue-item">
      <div className="queue-item-info">
        <span className="queue-filename">{job.filename}</span>
        <span className={`queue-state state-${job.state}`}>{job.state}</span>
      </div>
      <button className="btn btn-sm btn-danger" onClick={() => onRemove(job.job_id)}>
        Remove
      </button>
    </div>
  );
}
