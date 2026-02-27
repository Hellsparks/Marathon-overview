import { apiFetch } from './client';

export const getFiles = () => apiFetch('/api/files');

export const deleteFile = (id) =>
  apiFetch(`/api/files/${id}`, { method: 'DELETE' });

export const sendFile = (fileId, printerId, options = {}) =>
  apiFetch(`/api/files/${fileId}/send`, {
    method: 'POST',
    body: JSON.stringify({ printerId, ...options }),
  });

export async function uploadFile(file, onProgress) {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/files/upload');

    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        const err = JSON.parse(xhr.responseText || '{}');
        reject(new Error(err.error || `Upload failed: ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(formData);
  });
}
