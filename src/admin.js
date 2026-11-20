const URL = import.meta.env?.VITE_SUPABASE_URL;
const KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY;
const loginPanel = document.querySelector('#login-panel');
const dashboard = document.querySelector('#dashboard');
const loginForm = document.querySelector('#login-form');
const errorBox = document.querySelector('#admin-error');
const signout = document.querySelector('#signout');
const detailsModal = document.querySelector('#details-modal');
const inviteCard = document.querySelector('#invite-card');
const inviteForm = document.querySelector('#invite-form');
const inviteStatus = document.querySelector('#invite-status');
const inviteToggle = document.querySelector('#toggle-invite');
let accessToken = null;

function showError(message) { errorBox.textContent = message; errorBox.hidden = false; }
function setSignedIn(signedIn) { loginPanel.hidden = signedIn; dashboard.hidden = !signedIn; signout.hidden = !signedIn; }
function dateLabel(date) { return new Intl.DateTimeFormat('en-JM', { dateStyle: 'medium' }).format(new Date(date)); }
function safe(value) { const span = document.createElement('span'); span.textContent = value ?? ''; return span.innerHTML; }

async function loadApplications() {
  const response = await fetch(`${URL}/rest/v1/loan_applications?select=*&order=created_at.desc&limit=200`, {
    headers: { apikey: KEY, Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) throw new Error(response.status === 403 ? 'Your account does not have permission to view applications.' : 'Could not load applications. Please try again.');
  const applications = await response.json();
  document.querySelector('#total-count').textContent = applications.length;
  document.querySelector('#new-count').textContent = applications.filter(row => !row.status || row.status === 'new').length;
  const body = document.querySelector('#applications-body');
  body.replaceChildren();
  document.querySelector('#empty-state').hidden = applications.length > 0;
  for (const row of applications) {
    const tr = document.createElement('tr');
    const status = row.status || 'new';
    tr.dataset.status = status;
    tr.innerHTML = `<td><strong>${safe(row.first_name)} ${safe(row.last_name)}</strong><small>${safe(row.parish)} · ${safe(row.town)}</small></td><td><strong>${safe(row.phone)}</strong><small>${safe(row.email)}</small></td><td><strong>JMD $${Number(row.loan_amount).toLocaleString('en-JM')}</strong><small>${safe(row.loan_purpose)} · ${safe(row.loan_term)}</small></td><td><strong>${safe(row.employer_name)}</strong><small>${safe(row.job_title)}</small></td><td>${safe(dateLabel(row.created_at))}</td><td><span class="status-badge status-${safe(status)}">${safe(statusLabel(status))}</span></td><td class="row-actions"><select class="status-select" aria-label="Update status for ${safe(row.first_name)} ${safe(row.last_name)}"><option value="new" ${status === 'new' ? 'selected' : ''}>New</option><option value="pending_approval" ${status === 'pending_approval' ? 'selected' : ''}>Pending approval</option><option value="approved" ${status === 'approved' ? 'selected' : ''}>Approved</option></select><button type="button" class="delete-application" aria-label="Delete application for ${safe(row.first_name)} ${safe(row.last_name)}">Delete</button></td>`;
    tr.tabIndex = 0;
    tr.setAttribute('aria-label', `View ${row.first_name} ${row.last_name} application details`);
    tr.addEventListener('click', event => { if (!event.target.closest('.row-actions')) showDetails(row); });
    tr.addEventListener('keydown', event => { if (event.key === 'Enter' && event.target === tr) showDetails(row); });
    const statusSelect = tr.querySelector('.status-select');
    statusSelect.addEventListener('click', event => event.stopPropagation());
    statusSelect.addEventListener('change', event => updateApplicationStatus(row, event.target.value, event.target));
    const deleteButton = tr.querySelector('.delete-application');
    deleteButton.addEventListener('click', event => { event.stopPropagation(); deleteApplication(row, deleteButton); });
    body.append(tr);
  }
  filterApplications();
}

function filterApplications() {
  const query = document.querySelector('#application-search').value.trim().toLowerCase();
  const status = document.querySelector('#status-filter').value;
  let visible = 0;
  for (const row of document.querySelectorAll('#applications-body tr')) {
    const matchesQuery = !query || row.textContent.toLowerCase().includes(query);
    const matchesStatus = status === 'all' || row.dataset.status === status;
    row.hidden = !(matchesQuery && matchesStatus);
    if (!row.hidden) visible++;
  }
  const empty = document.querySelector('#empty-state');
  empty.hidden = visible > 0;
  if (document.querySelectorAll('#applications-body tr').length && visible === 0) empty.textContent = 'No applications match these filters.';
  else empty.textContent = 'No applications yet. New submissions will appear here.';
}

function statusLabel(status) {
  return ({ new: 'New', pending_approval: 'Pending approval', approved: 'Approved' })[status] || 'New';
}

async function updateApplicationStatus(row, status, control) {
  control.disabled = true;
  try {
    const response = await fetch(`${URL}/rest/v1/loan_applications?id=eq.${encodeURIComponent(row.id)}`, {
      method: 'PATCH',
      headers: { apikey: KEY, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ status })
    });
    if (!response.ok) throw new Error('Could not update this application. Apply the dashboard permissions in Supabase, then try again.');
    row.status = status;
    await loadApplications();
  } catch (error) {
    showError(error.message);
    control.value = row.status || 'new';
  } finally {
    control.disabled = false;
  }
}

async function deleteApplication(row, button) {
  if (!window.confirm(`Permanently delete the application for ${row.first_name} ${row.last_name}? This cannot be undone.`)) return;
  button.disabled = true;
  try {
    const response = await fetch(`${URL}/rest/v1/loan_applications?id=eq.${encodeURIComponent(row.id)}`, {
      method: 'DELETE',
      headers: { apikey: KEY, Authorization: `Bearer ${accessToken}`, Prefer: 'return=minimal' }
    });
    if (!response.ok) throw new Error('Could not delete this application. Apply the dashboard permissions in Supabase, then try again.');
    await loadApplications();
  } catch (error) {
    showError(error.message);
    button.disabled = false;
  }
}

function showDetails(row) {
  document.querySelector('#modal-name').textContent = `${row.first_name} ${row.last_name}`;
  const labels = { created_at: 'Submitted', first_name: 'First name', middle_name: 'Middle name', last_name: 'Last name', date_of_birth: 'Date of birth', trn: 'TRN', id_type: 'ID type', phone: 'Mobile number', other_phone: 'Other phone', email: 'Email address', home_address: 'Home address', town: 'Town / city', parish: 'Parish', residence: 'Residence', time_at_address: 'Time at this address', employment_status: 'Employment status', employment_duration: 'Employment duration', employer_name: 'Employer / business name', employer_sector: 'Employer sector', job_title: 'Job title / occupation', branch_department: 'Branch / department', company_address: 'Company / work address', company_phone: 'Company phone', supervisor_name: 'Supervisor / manager', supervisor_phone: 'Supervisor phone', salary_deduction_allowed: 'Salary deduction allowed', pay_frequency: 'Pay frequency', net_pay: 'Net pay per pay period (JMD)', next_pay_date: 'Next pay date', has_additional_income: 'Additional income', loan_amount: 'Amount requested (JMD)', loan_term: 'Preferred term', loan_purpose: 'Loan purpose', repayment_route: 'Repayment / security route', promo_code: 'Promo code', loan_explanation: 'Loan purpose explanation', has_off_payroll_loans: 'Loans not recorded on payslip', family_ref_name: 'Family reference name', family_ref_phone: 'Family reference phone', family_ref_relationship: 'Family reference relationship', family_ref_address: 'Family reference address', other_ref_name: 'Non-family reference name', other_ref_phone: 'Non-family reference phone', other_ref_relationship: 'Non-family reference relationship', other_ref_address: 'Non-family reference address', documents: 'Documents ready', terms_accepted: 'Terms and privacy accepted', marketing_consent: 'Marketing consent' };
  const fields = document.querySelector('#modal-fields');
  fields.replaceChildren();
  for (const [key, label] of Object.entries(labels)) {
    const value = key === 'created_at' ? dateLabel(row[key]) : (key === 'net_pay' || key === 'loan_amount') && row[key] !== null ? `JMD $${Number(row[key]).toLocaleString('en-JM')}` : Array.isArray(row[key]) ? row[key].join(', ') || 'None selected' : row[key];
    if (value === null || value === undefined || value === '') continue;
    const item = document.createElement('div'); item.className = 'modal-field';
    const title = document.createElement('span'); title.textContent = label;
    const detail = document.createElement('strong'); detail.textContent = String(value);
    item.append(title, detail); fields.append(item);
  }
  detailsModal.showModal();
}

async function signInWithToken(token) {
  accessToken = token;
  try { await loadApplications(); setSignedIn(true); }
  catch (error) { sessionStorage.removeItem('kemlan_admin_session'); accessToken = null; setSignedIn(false); showError(error.message); }
}

loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!URL || !KEY) return showError('Admin database is not configured yet. Add the Supabase settings to .env.local.');
  errorBox.hidden = true;
  const button = loginForm.querySelector('button'); button.disabled = true; button.textContent = 'Signing in…';
  const form = new FormData(loginForm);
  try {
    const response = await fetch(`${URL}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: form.get('email'), password: form.get('password') }) });
    const session = await response.json();
    if (!response.ok) throw new Error(session.msg || session.message || 'Sign in failed. Check your email and password.');
    sessionStorage.setItem('kemlan_admin_session', session.access_token);
    await signInWithToken(session.access_token);
  } catch (error) { showError(error.message); }
  finally { button.disabled = false; button.innerHTML = 'Sign in <span>→</span>'; }
});

signout.addEventListener('click', () => { sessionStorage.removeItem('kemlan_admin_session'); accessToken = null; setSignedIn(false); });
inviteToggle.addEventListener('click', () => {
  inviteCard.hidden = !inviteCard.hidden;
  inviteToggle.setAttribute('aria-expanded', String(!inviteCard.hidden));
  if (!inviteCard.hidden) inviteForm.querySelector('input').focus();
});
inviteForm.addEventListener('submit', async event => {
  event.preventDefault();
  inviteStatus.classList.remove('error');
  inviteStatus.textContent = '';
  const button = inviteForm.querySelector('button');
  button.disabled = true;
  button.textContent = 'Sending invitation…';
  const email = new FormData(inviteForm).get('email');
  try {
    const response = await fetch('/api/staff-invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ email })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Could not send invitation. Please try again.');
    inviteStatus.textContent = `Invitation sent to ${email}. They will need to set a password from their email.`;
    inviteForm.reset();
  } catch (error) {
    inviteStatus.textContent = error.message;
    inviteStatus.classList.add('error');
  } finally {
    button.disabled = false;
    button.textContent = 'Send invitation';
  }
});
document.querySelector('#close-modal').addEventListener('click', () => detailsModal.close());
detailsModal.addEventListener('click', event => { if (event.target === detailsModal) detailsModal.close(); });
document.querySelector('#refresh').addEventListener('click', async () => { try { await loadApplications(); } catch (error) { showError(error.message); } });
document.querySelector('#application-search').addEventListener('input', filterApplications);
document.querySelector('#status-filter').addEventListener('change', filterApplications);
const session = sessionStorage.getItem('kemlan_admin_session');
if (session && URL && KEY) signInWithToken(session);
