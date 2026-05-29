export async function exportStitch(publicId, clips, duration) {
  const res = await fetch('/api/stitch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ publicId, clips, duration }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Stitch failed');
  return data;
}

export async function exportIndividualClips(publicId, clips, duration) {
  const res = await fetch('/api/export-clips', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ publicId, clips, duration }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Export failed');
  return data;
}
