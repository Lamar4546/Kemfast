const BUCKET = 'loan-documents';
const MAX_BYTES = 8 * 1024 * 1024;
const TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);
const json = (res, status, body) => res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8').send(JSON.stringify(body));

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'Method not allowed.' });
  }
  const base = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !serviceKey) return json(res, 503, { error: 'Document uploads are not configured yet.' });

  const { applicationId, fileName, contentType, size } = req.body || {};
  if (typeof applicationId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(applicationId)) return json(res, 400, { error: 'Invalid application reference.' });
  if (typeof fileName !== 'string' || !fileName.trim() || fileName.length > 180 || !TYPES.has(contentType) || !Number.isInteger(size) || size < 1 || size > MAX_BYTES) {
    return json(res, 400, { error: 'Use a PDF, JPG, or PNG file that is 8 MB or smaller.' });
  }

  const extension = ({ 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' })[contentType];
  const path = `${applicationId}/${crypto.randomUUID()}.${extension}`;
  try {
    const response = await fetch(`${base}/storage/v1/object/upload/sign/${BUCKET}/${path}`, {
      method: 'POST',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.url || !result.token) return json(res, 502, { error: 'Could not prepare the secure upload. Please try again.' });
    return json(res, 200, { path, token: result.token, uploadUrl: `${base}/storage/v1${result.url}`, name: fileName.trim(), contentType, size });
  } catch {
    return json(res, 502, { error: 'Could not contact secure document storage.' });
  }
}
