const json = (res, status, body) => {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8').send(JSON.stringify(body));
};
const privilegedHeaders = key => key.startsWith('sb_secret_') ? { apikey: key } : { apikey: key, Authorization: `Bearer ${key}` };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'Method not allowed.' });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json(res, 503, { error: 'Add SUPABASE_URL, SUPABASE_ANON_KEY, and the server-only SUPABASE_SECRET_KEY to Vercel, then redeploy. The legacy SUPABASE_SERVICE_ROLE_KEY is also supported.' });
  }

  const bearer = req.headers.authorization || '';
  const token = bearer.startsWith('Bearer ') ? bearer.slice(7) : '';
  if (!token) return json(res, 401, { error: 'Please sign in again.' });

  let email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json(res, 400, { error: 'Enter a valid staff email address.' });
  }

  const base = supabaseUrl.replace(/\/$/, '');
  try {
    const userResponse = await fetch(`${base}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` }
    });
    if (!userResponse.ok) return json(res, 401, { error: 'Your session has expired. Please sign in again.' });
    const currentUser = await userResponse.json();

    const allowlistResponse = await fetch(`${base}/rest/v1/admin_users?select=user_id&user_id=eq.${encodeURIComponent(currentUser.id)}&limit=1`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` }
    });
    if (!allowlistResponse.ok) return json(res, 502, { error: 'Could not verify staff permissions.' });
    const allowlist = await allowlistResponse.json();
    if (!allowlist.length) return json(res, 403, { error: 'Only an authorized administrator can invite staff.' });

    const inviteResponse = await fetch(`${base}/auth/v1/invite`, {
      method: 'POST',
      headers: { ...privilegedHeaders(serviceKey), 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const inviteData = await inviteResponse.json().catch(() => ({}));
    if (!inviteResponse.ok) {
      const duplicate = /already|registered|exists/i.test(inviteData.msg || inviteData.message || inviteData.error_description || '');
      return json(res, duplicate ? 409 : 400, { error: duplicate ? 'That email already has a Kemlan account.' : 'Supabase could not send the invitation. Check the Auth email settings and try again.' });
    }

    const invitedUserId = inviteData.id || inviteData.user?.id;
    if (!invitedUserId) return json(res, 502, { error: 'The invitation was sent, but Supabase did not return the account ID needed to grant dashboard access.' });

    const grantResponse = await fetch(`${base}/rest/v1/admin_users`, {
      method: 'POST',
      headers: {
        ...privilegedHeaders(serviceKey),
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({ user_id: invitedUserId })
    });
    if (!grantResponse.ok) {
      return json(res, 502, { error: 'The invitation email was sent, but dashboard access could not be granted. Ask an administrator to finish adding this account.' });
    }

    return json(res, 200, { ok: true });
  } catch {
    return json(res, 502, { error: 'Could not contact the staff account service. Please try again.' });
  }
}
