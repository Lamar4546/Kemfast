const BUCKET = 'loan-documents';
const json = (res, status, body) => res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8').send(JSON.stringify(body));

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'Method not allowed.' });
  }
  const base = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !anonKey || !serviceKey) return json(res, 503, { error: 'Document access is not configured.' });
  const token = (req.headers.authorization || '').startsWith('Bearer ') ? req.headers.authorization.slice(7) : '';
  if (!token) return json(res, 401, { error: 'Please sign in again.' });
  const { applicationId, path } = req.body || {};
  if (typeof applicationId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(applicationId) || typeof path !== 'string' || !path.startsWith(`${applicationId}/`) || path.includes('..')) {
    return json(res, 400, { error: 'Invalid document reference.' });
  }

  try {
    const userResponse = await fetch(`${base}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: `Bearer ${token}` } });
    if (!userResponse.ok) return json(res, 401, { error: 'Your session expired. Sign in again.' });
    const user = await userResponse.json();
    const adminResponse = await fetch(`${base}/rest/v1/admin_users?select=user_id&user_id=eq.${encodeURIComponent(user.id)}&limit=1`, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
    if (!adminResponse.ok) return json(res, 502, { error: 'Could not verify staff permissions.' });
    if (!(await adminResponse.json()).length) return json(res, 403, { error: 'Authorized staff access is required.' });

    const recordResponse = await fetch(`${base}/rest/v1/loan_applications?select=uploaded_documents&id=eq.${encodeURIComponent(applicationId)}&limit=1`, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
    if (!recordResponse.ok) return json(res, 502, { error: 'Could not verify the application document.' });
    const [application] = await recordResponse.json();
    if (!application || !Array.isArray(application.uploaded_documents) || !application.uploaded_documents.some(file => file?.path === path)) return json(res, 404, { error: 'Document not found for this application.' });

    const objectPath = path.split('/').map(encodeURIComponent).join('/');
    const signResponse = await fetch(`${base}/storage/v1/object/sign/${BUCKET}/${objectPath}`, {
      method: 'POST',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: 300, download: true })
    });
    const signed = await signResponse.json().catch(() => ({}));
    if (!signResponse.ok || !signed.signedURL) return json(res, 502, { error: 'Could not open this document.' });
    return json(res, 200, { url: `${base}/storage/v1${signed.signedURL}` });
  } catch {
    return json(res, 502, { error: 'Could not contact secure document storage.' });
  }
}
