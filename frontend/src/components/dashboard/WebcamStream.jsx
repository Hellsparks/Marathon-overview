import { useState, useEffect } from 'react';
import { getWebcams } from '../../api/control';

export default function WebcamStream({ printerId }) {
  const [streamUrl, setStreamUrl] = useState(null);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
    getWebcams(printerId)
      .then(webcams => {
        const cam = webcams.find(w => w.stream_url) ?? null;
        setStreamUrl(cam?.stream_url ?? null);
      })
      .catch(() => setStreamUrl(null));
  }, [printerId]);

  if (!streamUrl) return null;

  return (
    <div className="webcam-wrap">
      {imgError ? (
        <div className="webcam-offline">Webcam unavailable</div>
      ) : (
        <img
          src={streamUrl}
          alt="Webcam"
          className="webcam-stream"
          onError={() => setImgError(true)}
        />
      )}
    </div>
  );
}
