const BUCKET = 'loan-documents';
const MAX_BYTES = 8 * 1024 * 1024;
const DOCUMENT_TYPES = new Set(['Government ID', 'TRN', 'Recent photograph', 'Proof of address / JP letter', '3 months payslips', '2 months bank statements', 'Work ID']);
const json = (res, status, body) => res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8').send(JSON.stringify(body));
const privilegedHeaders = key => key.startsWith('sb_secret_') ? { apikey: key } : { apikey: key, Authorization: `Bearer ${key}` };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'Method not allowed.' });
  }
  const base = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !serviceKey) return json(res, 503, { error: 'Add SUPABASE_URL and the server-only SUPABASE_SECRET_KEY to Vercel, then redeploy. The legacy SUPABASE_SERVICE_ROLE_KEY is also supported.' });

  const { applicationId, fileName, contentType, size, documentType } = req.body || {};
  if (typeof applicationId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(applicationId)) return json(res, 400, { error: 'Invalid application reference.' });
  if (typeof fileName !== 'string' || !fileName.trim() || fileName.length > 180 || !DOCUMENT_TYPES.has(documentType) || !Number.isInteger(size) || size < 1 || size > MAX_BYTES) {
    return json(res, 400, { error: 'Choose a listed document type and a file that is 8 MB or smaller.' });
  }

  const extension = fileName.split('.').pop().toLowerCase();
  const isPdf = contentType === 'application/pdf' && extension === 'pdf';
  const isJpg = contentType === 'image/jpeg' && ['jpg', 'jpeg'].includes(extension);
  if (documentType === '2 months bank statements' ? !isPdf : !(isPdf || isJpg)) {
    return json(res, 400, { error: documentType === '2 months bank statements' ? 'Bank statements must be PDF files.' : 'Documents must be PDF or JPG files.' });
  }
  const path = `${applicationId}/${crypto.randomUUID()}.${extension}`;
  try {
    const response = await fetch(`${base}/storage/v1/object/upload/sign/${BUCKET}/${path}`, {
      method: 'POST',
      headers: { ...privilegedHeaders(serviceKey), 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.url || !result.token) return json(res, 502, { error: 'Could not prepare the secure upload. Please try again.' });
    return json(res, 200, { path, token: result.token, uploadUrl: `${base}/storage/v1${result.url}`, name: fileName.trim(), contentType, documentType, size });
  } catch {
    return json(res, 502, { error: 'Could not contact secure document storage.' });
  }
}
