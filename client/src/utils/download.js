import { apiUrl } from '../apiBase.js';

/**
 * Trigger a file download via the API (server sets Content-Disposition).
 */
export function forceDownload(downloadPath, filename) {
  const a = document.createElement('a');
  a.href = apiUrl(downloadPath);
  a.download = filename || 'download.mp4';
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * POST JSON to a download endpoint and save the streamed file.
 */
export async function forceDownloadPost(apiPath, body, filename) {
  const res = await fetch(apiUrl(apiPath), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let message = `Download failed (${res.status})`;
    try {
      const data = await res.json();
      if (data.error) message = data.error;
    } catch {
      /* response was not JSON */
    }
    throw new Error(message);
  }

  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename || 'download.mp4';
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
  }
}
