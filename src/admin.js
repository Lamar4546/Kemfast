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
let selectedApplication = null;
let currentPage = 1;
const PAGE_SIZE = 20;

function showError(message) {
  if (!errorBox) { console.error(message); return; }
  errorBox.textContent = message;
  errorBox.hidden = false;
}
function setSignedIn(signedIn) {
  loginPanel.hidden = signedIn;
  dashboard.hidden = !signedIn;
  signout.hidden = !signedIn;
  document.body.classList.toggle('admin-signed-in', signedIn);
}
function dateLabel(date) { return new Intl.DateTimeFormat('en-JM', { dateStyle: 'medium' }).format(new Date(date)); }
function dateTimeLabel(date) { return new Intl.DateTimeFormat('en-JM', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date)); }
function safe(value) { const span = document.createElement('span'); span.textContent = value ?? ''; return span.innerHTML; }
function applicationSource(row) {
  if (row.application_source === 'qr' || row.application_source === 'website') return row.application_source;
  return 'unknown';
}

async function loadApplications() {
  const response = await fetch(`${URL}/rest/v1/loan_applications?select=*&order=created_at.desc&limit=1000`, {
    headers: { apikey: KEY, Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) throw new Error(response.status === 403 ? 'Your account does not have permission to view applications.' : 'Could not load applications. Please try again.');
  const applications = await response.json();
  document.querySelector('#total-count').textContent = applications.length;
  document.querySelector('#new-count').textContent = applications.filter(row => !row.status || row.status === 'new').length;
  document.querySelector('#pending-count').textContent = applications.filter(row => row.status === 'pending_approval').length;
  document.querySelector('#approved-count').textContent = applications.filter(row => row.status === 'approved').length;
  document.querySelector('#rejected-count').textContent = applications.filter(row => row.status === 'rejected').length;
  const totals = {
    new: applications.filter(row => !row.status || row.status === 'new').length,
    pending: applications.filter(row => row.status === 'pending_approval').length,
    approved: applications.filter(row => row.status === 'approved').length,
    rejected: applications.filter(row => row.status === 'rejected').length
  };
  for (const [key, count] of Object.entries(totals)) {
    document.querySelector(`#breakdown-${key}-count`).textContent = count;
    document.querySelector(`#breakdown-${key}-bar`).style.width = `${applications.length ? (count / applications.length) * 100 : 0}%`;
  }
  document.querySelector('#qr-overview-count').textContent = applications.filter(row => applicationSource(row) === 'qr').length;
  const body = document.querySelector('#applications-body');
  body.replaceChildren();
  document.querySelector('#empty-state').hidden = applications.length > 0;
  for (const row of applications) {
    const tr = document.createElement('tr');
    const status = row.status || 'new';
    const source = applicationSource(row);
    tr.dataset.status = status;
    tr.dataset.source = source;
    tr.dataset.submitted = localDateKey(row.created_at);
    const reference = String(row.id || '').slice(0, 8).toUpperCase();
    tr.innerHTML = `<td><strong class="application-reference">${safe(reference)}</strong></td><td><strong>${safe([row.first_name, row.middle_name, row.last_name].filter(Boolean).join(' '))}</strong><small>${safe(row.parish)} · ${safe(row.town)}</small></td><td><strong>${safe(row.phone)}</strong><small>${safe(row.email)}</small></td><td><strong>JMD $${Number(row.loan_amount).toLocaleString('en-JM')}</strong><small>${safe(row.loan_purpose)} · ${safe(row.loan_term)}</small></td><td><span class="source-badge source-${source}">${source === 'qr' ? 'QR code' : source === 'website' ? 'Website' : 'Not recorded'}</span></td><td>${safe(dateTimeLabel(row.created_at))}</td><td><span class="status-badge status-${safe(status)}">${safe(statusLabel(status))}</span></td><td class="row-actions"><select class="status-select" aria-label="Update status for ${safe(row.first_name)} ${safe(row.last_name)}"><option value="new" ${status === 'new' ? 'selected' : ''}>New</option><option value="pending_approval" ${status === 'pending_approval' ? 'selected' : ''}>Pending approval</option><option value="approved" ${status === 'approved' ? 'selected' : ''}>Approved</option><option value="rejected" ${status === 'rejected' ? 'selected' : ''}>Rejected</option></select><button type="button" class="delete-application" aria-label="Delete application for ${safe(row.first_name)} ${safe(row.last_name)}">Delete</button></td>`;
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
  const source = document.querySelector('#source-filter').value;
  const fromDate = document.querySelector('#from-date').value;
  const toDate = document.querySelector('#to-date').value;
  const rows = [...document.querySelectorAll('#applications-body tr')];
  const matching = [];
  for (const row of rows) {
    const matchesQuery = !query || row.textContent.toLowerCase().includes(query);
    const matchesStatus = status === 'all' || row.dataset.status === status;
    const matchesSource = source === 'all' || row.dataset.source === source;
    const matchesDate = (!fromDate || row.dataset.submitted >= fromDate) && (!toDate || row.dataset.submitted <= toDate);
    row.hidden = !(matchesQuery && matchesStatus && matchesSource && matchesDate);
    if (!row.hidden) matching.push(row);
  }
  const pageCount = Math.max(1, Math.ceil(matching.length / PAGE_SIZE));
  currentPage = Math.min(currentPage, pageCount);
  const start = (currentPage - 1) * PAGE_SIZE;
  matching.forEach((row, index) => { row.hidden = index < start || index >= start + PAGE_SIZE; });
  const visible = matching.length;
  const empty = document.querySelector('#empty-state');
  empty.hidden = visible > 0;
  if (rows.length && visible === 0) empty.textContent = 'No applications match these filters.';
  else empty.textContent = 'No applications yet. New submissions will appear here.';
  const first = visible ? start + 1 : 0;
  const last = Math.min(start + PAGE_SIZE, visible);
  document.querySelector('#pagination-summary').textContent = `Showing ${first}–${last} of ${visible} applications`;
  const pages = document.querySelector('#pagination-pages');
  pages.replaceChildren();
  for (let page = 1; page <= pageCount; page++) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = `page-button${page === currentPage ? ' active' : ''}`;
    button.textContent = page; button.setAttribute('aria-label', `Page ${page}`); button.setAttribute('aria-current', page === currentPage ? 'page' : 'false');
    button.addEventListener('click', () => { currentPage = page; filterApplications(); });
    pages.append(button);
  }
  document.querySelector('#previous-page').disabled = currentPage === 1;
  document.querySelector('#next-page').disabled = currentPage === pageCount;
}

function localDateKey(date) {
  const value = new Date(date);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function statusLabel(status) {
  return ({ new: 'New enquiry', pending_approval: 'Pending approval', approved: 'Approved', rejected: 'Rejected' })[status] || 'New enquiry';
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
  if (!window.confirm(`Permanently delete the application for ${row.first_name} ${row.last_name}? This cannot be undone.`)) return false;
  button.disabled = true;
  try {
    const response = await fetch(`${URL}/rest/v1/loan_applications?id=eq.${encodeURIComponent(row.id)}`, {
      method: 'DELETE',
      headers: { apikey: KEY, Authorization: `Bearer ${accessToken}`, Prefer: 'return=minimal' }
    });
    if (!response.ok) throw new Error('Could not delete this application. Apply the dashboard permissions in Supabase, then try again.');
    await loadApplications();
    return true;
  } catch (error) {
    showError(error.message);
    button.disabled = false;
    return false;
  }
}

const FIELD_LABELS = { created_at: 'Submitted', status: 'Application status', application_source: 'Application source', id: 'Application ID', first_name: 'First name', middle_name: 'Middle name', last_name: 'Last name', date_of_birth: 'Date of birth', trn: 'TRN', id_type: 'ID type', phone: 'Mobile number', other_phone: 'Other phone', email: 'Email address', home_address: 'Home address', town: 'Town / city', parish: 'Parish', residence: 'Residence', time_at_address: 'Time at this address', employment_status: 'Employment status', employment_duration: 'Employment duration', employer_name: 'Employer / business name', employer_sector: 'Employer sector', job_title: 'Job title / occupation', branch_department: 'Branch / department', company_address: 'Company / work address', company_phone: 'Company phone', supervisor_name: 'Supervisor / manager', supervisor_phone: 'Supervisor phone', salary_deduction_allowed: 'Salary deduction allowed', pay_frequency: 'Pay frequency', net_pay: 'Net pay per pay period (JMD)', next_pay_date: 'Next pay date', has_additional_income: 'Additional income', loan_amount: 'Amount requested (JMD)', loan_term: 'Preferred term', loan_purpose: 'Loan purpose', repayment_route: 'Repayment / security route', promo_code: 'Promo code', loan_explanation: 'Loan purpose explanation', has_off_payroll_loans: 'Loans not recorded on payslip', family_ref_name: 'Family reference name', family_ref_phone: 'Family reference phone', family_ref_relationship: 'Family reference relationship', family_ref_address: 'Family reference address', other_ref_name: 'Non-family reference name', other_ref_phone: 'Non-family reference phone', other_ref_relationship: 'Non-family reference relationship', other_ref_address: 'Non-family reference address', documents: 'Documents ready', terms_accepted: 'Terms and privacy accepted', marketing_consent: 'Marketing consent' };
const DETAIL_GROUPS = [
  ['Personal details', ['first_name', 'middle_name', 'last_name', 'date_of_birth', 'trn', 'id_type', 'phone', 'other_phone', 'email']],
  ['Home address', ['home_address', 'town', 'parish', 'residence', 'time_at_address']],
  ['Employment and income', ['employment_status', 'employment_duration', 'employer_name', 'employer_sector', 'job_title', 'branch_department', 'company_address', 'company_phone', 'supervisor_name', 'supervisor_phone', 'salary_deduction_allowed', 'pay_frequency', 'net_pay', 'next_pay_date', 'has_additional_income', 'has_off_payroll_loans']],
  ['Loan request', ['loan_amount', 'loan_term', 'loan_purpose', 'repayment_route', 'promo_code', 'loan_explanation']],
  ['References', ['family_ref_name', 'family_ref_phone', 'family_ref_relationship', 'family_ref_address', 'other_ref_name', 'other_ref_phone', 'other_ref_relationship', 'other_ref_address']],
  ['Documents and consent', ['documents', 'terms_accepted', 'marketing_consent']]
];

function fieldValue(row, key) {
  if (key === 'created_at') return dateTimeLabel(row[key]);
  if (key === 'application_source') return ({ qr: 'QR code', website: 'Website / direct', unknown: 'Not recorded' })[applicationSource(row)];
  if (key === 'status') return statusLabel(row[key] || 'new');
  if ((key === 'net_pay' || key === 'loan_amount') && row[key] !== null && row[key] !== undefined) return `JMD $${Number(row[key]).toLocaleString('en-JM')}`;
  if (Array.isArray(row[key])) return row[key].join(', ') || 'None selected';
  if (typeof row[key] === 'boolean') return row[key] ? 'Yes' : 'No';
  return row[key];
}

function showDetails(row) {
  selectedApplication = row;
  document.querySelector('#modal-name').textContent = `${row.first_name} ${row.last_name}`;
  document.querySelector('#modal-submitted').textContent = `Submitted ${dateTimeLabel(row.created_at)} · ${String(row.id || '').slice(0, 8).toUpperCase()}`;
  const status = row.status || 'new';
  const badge = document.querySelector('#modal-status-badge');
  badge.textContent = statusLabel(status); badge.className = `status-badge status-${status}`;
  document.querySelector('#detail-status').value = status;
  document.querySelector('#contact-email').href = `mailto:${row.email || ''}`;
  document.querySelector('#contact-call').href = `tel:${row.phone || ''}`;
  document.querySelector('#contact-whatsapp').href = `https://wa.me/${String(row.phone || '').replace(/\D/g, '')}`;
  const fields = document.querySelector('#modal-fields');
  fields.replaceChildren();
  for (const [heading, keys] of DETAIL_GROUPS) {
    const available = keys.filter(key => row[key] !== null && row[key] !== undefined && row[key] !== '');
    if (!available.length) continue;
    const section = document.createElement('section'); section.className = 'detail-section';
    const title = document.createElement('h3'); title.textContent = heading; section.append(title);
    const grid = document.createElement('div'); grid.className = 'modal-fields';
    for (const key of available) {
      const item = document.createElement('div'); item.className = 'modal-field';
      const label = document.createElement('span'); label.textContent = FIELD_LABELS[key];
      const value = document.createElement('strong'); value.textContent = String(fieldValue(row, key));
      item.append(label, value); grid.append(item);
    }
    section.append(grid); fields.append(section);
  }
  const source = document.createElement('p'); source.className = `details-source source-${applicationSource(row)}`;
  source.textContent = applicationSource(row) === 'unknown' ? 'Application source was not recorded for this older submission.' : `Application received through ${applicationSource(row) === 'qr' ? 'QR code' : 'website / direct link'}`;
  fields.prepend(source);
  if (Array.isArray(row.uploaded_documents) && row.uploaded_documents.length) {
    const heading = document.createElement('h3');
    heading.className = 'uploaded-heading';
    heading.textContent = 'Uploaded documents';
    fields.append(heading);
    for (const file of row.uploaded_documents) {
      const wrap = document.createElement('div');
      wrap.className = 'uploaded-file';
      const name = document.createElement('strong');
      name.textContent = [file.document_type, file.name].filter(Boolean).join(' · ') || 'Uploaded document';
      const action = document.createElement('button');
      action.type = 'button';
      action.className = 'document-link-button';
      action.textContent = 'Create secure download link';
      action.addEventListener('click', async () => {
        action.disabled = true;
        action.textContent = 'Preparing link…';
        try {
          const response = await fetch('/api/document-link', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
            body: JSON.stringify({ applicationId: row.id, path: file.path })
          });
          const result = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(result.error || 'Could not create the document link.');
          const link = document.createElement('a');
          link.href = result.url;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.textContent = 'Download document';
          link.className = 'document-download-link';
          action.replaceWith(link);
        } catch (error) {
          action.textContent = error.message;
          action.disabled = false;
        }
      });
      wrap.append(name, action);
      fields.append(wrap);
    }
  }
  if (!detailsModal.open) detailsModal.showModal();
  document.querySelector('#print-application').onclick = () => printApplication(row);
}

function printApplication(row) {
  const sheet = document.querySelector('#print-sheet');
  sheet.replaceChildren();
  const header = document.createElement('header'); header.className = 'print-header';
  const logo = document.createElement('img'); logo.src = '/kemlan-logo.png'; logo.alt = 'Kemlan Financing';
  const brand = document.createElement('div');
  const title = document.createElement('h1'); title.textContent = 'Loan application';
  const ref = document.createElement('p'); ref.textContent = `Application ID: ${row.id}`;
  brand.append(title, ref); header.append(logo, brand);
  const summary = document.createElement('div'); summary.className = 'print-summary';
  for (const [label, value] of [['Applicant', `${row.first_name} ${row.middle_name || ''} ${row.last_name}`.replace(/\s+/g, ' ').trim()], ['Submitted', dateTimeLabel(row.created_at)], ['Status', statusLabel(row.status || 'new')], ['Source', fieldValue(row, 'application_source')]]) {
    const item = document.createElement('div'); const caption = document.createElement('span'); caption.textContent = label; const text = document.createElement('strong'); text.textContent = value; item.append(caption, text); summary.append(item);
  }
  sheet.append(header, summary);
  for (const [heading, keys] of DETAIL_GROUPS) {
    const available = keys.filter(key => row[key] !== null && row[key] !== undefined && row[key] !== '');
    if (!available.length) continue;
    const section = document.createElement('section'); section.className = 'print-section';
    const h2 = document.createElement('h2'); h2.textContent = heading; section.append(h2);
    const grid = document.createElement('dl');
    for (const key of available) {
      const pair = document.createElement('div'); const dt = document.createElement('dt'); dt.textContent = FIELD_LABELS[key]; const dd = document.createElement('dd'); dd.textContent = String(fieldValue(row, key)); pair.append(dt, dd); grid.append(pair);
    }
    section.append(grid); sheet.append(section);
  }
  if (Array.isArray(row.uploaded_documents) && row.uploaded_documents.length) {
    const uploads = document.createElement('section'); uploads.className = 'print-section';
    const h2 = document.createElement('h2'); h2.textContent = 'Uploaded documents'; uploads.append(h2);
    const list = document.createElement('p'); list.textContent = row.uploaded_documents.map(file => [file.document_type, file.name].filter(Boolean).join(' — ')).join('; '); uploads.append(list); sheet.append(uploads);
  }
  const declaration = document.createElement('section'); declaration.className = 'print-declaration';
  const declarationHeading = document.createElement('h2'); declarationHeading.textContent = 'Applicant declaration';
  const declarationText = document.createElement('p'); declarationText.textContent = 'I confirm the information provided is accurate and agree to the Terms and Conditions and Privacy Policy.';
  const signature = document.createElement('div'); signature.className = 'signature-lines';
  signature.innerHTML = '<span>Applicant signature</span><span>Date</span>';
  declaration.append(declarationHeading, declarationText, signature); sheet.append(declaration);
  document.body.classList.add('print-mode');
  window.setTimeout(() => window.print(), 80);
}

document.querySelector('#save-detail-status').addEventListener('click', async event => {
  if (!selectedApplication) return;
  const button = event.currentTarget;
  const value = document.querySelector('#detail-status').value;
  button.disabled = true;
  try {
    const response = await fetch(`${URL}/rest/v1/loan_applications?id=eq.${encodeURIComponent(selectedApplication.id)}`, {
      method: 'PATCH', headers: { apikey: KEY, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ status: value })
    });
    if (!response.ok) throw new Error('Could not update this application. Run the latest Supabase schema from supabase/schema.sql and try again.');
    selectedApplication.status = value;
    await loadApplications();
    showDetails(selectedApplication);
  } catch (error) { showError(error.message); }
  finally { button.disabled = false; }
});

document.querySelector('#delete-detail-application').addEventListener('click', async event => {
  if (!selectedApplication) return;
  const button = event.currentTarget;
  if (await deleteApplication(selectedApplication, button)) detailsModal.close();
});

window.addEventListener('afterprint', () => document.body.classList.remove('print-mode'));

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
document.querySelector('#source-filter').addEventListener('change', filterApplications);
document.querySelector('#filter-applications').addEventListener('click', filterApplications);
document.querySelector('#clear-filters').addEventListener('click', () => {
  document.querySelector('#application-search').value = '';
  document.querySelector('#status-filter').value = 'all';
  document.querySelector('#source-filter').value = 'all';
  document.querySelector('#from-date').value = '';
  document.querySelector('#to-date').value = '';
  currentPage = 1;
  filterApplications();
});
document.querySelector('#view-qr-applications').addEventListener('click', () => {
  document.querySelector('#source-filter').value = 'qr';
  filterApplications();
  setActiveNavigation('qr');
  document.querySelector('.application-filters').scrollIntoView({ behavior: 'smooth', block: 'center' });
});
function setActiveNavigation(active) {
  document.querySelectorAll('.sidebar-nav [data-dashboard-filter]').forEach(button => {
    button.classList.toggle('active', button.dataset.dashboardFilter === active && (active !== 'all' || button.textContent.includes('All applications')));
  });
}
document.querySelectorAll('.sidebar-nav [data-dashboard-filter]').forEach(button => button.addEventListener('click', () => {
  const value = button.dataset.dashboardFilter;
  document.querySelector('#status-filter').value = ['new', 'pending_approval', 'approved', 'rejected'].includes(value) ? value : 'all';
  document.querySelector('#source-filter').value = value === 'qr' ? 'qr' : 'all';
  currentPage = 1;
  filterApplications();
  document.querySelectorAll('.sidebar-nav [data-dashboard-filter]').forEach(item => item.classList.toggle('active', item === button));
  if (value !== 'all' || button.textContent.includes('All applications')) document.querySelector('.table-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
}));
document.querySelector('#previous-page').addEventListener('click', () => { currentPage = Math.max(1, currentPage - 1); filterApplications(); });
document.querySelector('#next-page').addEventListener('click', () => { currentPage += 1; filterApplications(); });
document.querySelector('#sidebar-staff').addEventListener('click', () => {
  if (inviteCard.hidden) inviteToggle.click();
  inviteCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
});
const session = sessionStorage.getItem('kemlan_admin_session');
if (session && URL && KEY) signInWithToken(session);
