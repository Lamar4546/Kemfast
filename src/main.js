const STEPS = [...document.querySelectorAll('.form-step')];
const FORM = document.querySelector('#application-form');
const NEXT = document.querySelector('#next-button');
const BACK = document.querySelector('#back-button');
const SEND = document.querySelector('#submit-button');
const ERROR = document.querySelector('#form-error');
const SUPABASE_URL = import.meta.env?.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY;
const UPLOADS = document.querySelector('#document-uploads');
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_FILE_COUNT = 8;
const STEP_LABELS = ['Personal & address', 'Employment & income', 'Loan request', 'References & documents'];
let currentStep = 0;

function updateStep() {
  STEPS.forEach((step, i) => step.classList.toggle('active', i === currentStep));
  const count = String(currentStep + 1).padStart(2, '0');
  document.querySelector('#progress-fill').style.width = `${((currentStep + 1) / STEPS.length) * 100}%`;
  document.querySelector('#progress-label').textContent = `Step ${currentStep + 1} of ${STEPS.length}`;
  document.querySelector('#section-label').textContent = STEP_LABELS[currentStep];
  document.querySelector('#step-count').innerHTML = `${count} <i>/</i> ${String(STEPS.length).padStart(2, '0')}`;
  document.querySelector('#side-number').textContent = count;
  document.querySelector('#side-title').textContent = ['A little about you.', 'Tell us about your work.', 'What do you need?', 'Almost there.'][currentStep];
  document.querySelector('#side-copy').textContent = ['Let’s start with your contact details and where you live.', 'Share your work and take-home pay details.', 'Tell us how much you need and what it is for.', 'Add your references and tick the documents you have ready.'][currentStep];
  BACK.hidden = currentStep === 0;
  NEXT.hidden = currentStep === STEPS.length - 1;
  SEND.hidden = currentStep !== STEPS.length - 1;
  ERROR.hidden = true;
}

function validateStep() {
  for (const input of STEPS[currentStep].querySelectorAll('input, select, textarea')) {
    if (!input.checkValidity()) { input.reportValidity(); return false; }
  }
  return true;
}

NEXT.addEventListener('click', () => {
  if (!validateStep()) return;
  currentStep = Math.min(currentStep + 1, STEPS.length - 1);
  updateStep();
  document.querySelector('#application').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
BACK.addEventListener('click', () => { currentStep = Math.max(currentStep - 1, 0); updateStep(); });

function selectedFiles() {
  const files = [...UPLOADS.files];
  if (files.length > MAX_FILE_COUNT) throw new Error(`Choose no more than ${MAX_FILE_COUNT} documents.`);
  for (const file of files) {
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)) throw new Error('Choose PDF, JPG, or PNG documents only.');
    if (file.size > MAX_FILE_BYTES) throw new Error('Each document must be 8 MB or smaller.');
  }
  return files;
}

UPLOADS.addEventListener('change', () => {
  const list = document.querySelector('#upload-list');
  try {
    const files = selectedFiles();
    list.classList.remove('upload-error');
    list.textContent = files.length ? `${files.length} optional ${files.length === 1 ? 'file' : 'files'} selected: ${files.map(file => file.name).join(', ')}` : 'No files selected.';
  } catch (error) {
    UPLOADS.value = '';
    list.textContent = error.message;
    list.classList.add('upload-error');
  }
});

async function uploadDocuments(files, applicationId) {
  const uploads = [];
  for (const file of files) {
    const signResponse = await fetch('/api/document-upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applicationId, fileName: file.name, contentType: file.type, size: file.size })
    });
    const signed = await signResponse.json().catch(() => ({}));
    if (!signResponse.ok) throw new Error(signed.error || 'Could not prepare a secure document upload.');
    const uploadResponse = await fetch(signed.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type, apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      body: file
    });
    if (!uploadResponse.ok) throw new Error(`Could not upload “${file.name}”. You can remove the file and submit without uploads.`);
    uploads.push({ path: signed.path, name: signed.name, content_type: signed.contentType, size: signed.size });
  }
  return uploads;
}

FORM.addEventListener('submit', async event => {
  event.preventDefault();
  if (!validateStep()) return;
  let files;
  try { files = selectedFiles(); }
  catch (error) { ERROR.textContent = error.message; ERROR.hidden = false; return; }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    ERROR.textContent = 'The application service is not connected yet. Please call (876) 790-7674 for assistance.';
    ERROR.hidden = false;
    return;
  }
  SEND.disabled = true;
  SEND.textContent = files.length ? 'Uploading & sending…' : 'Sending…';
  ERROR.hidden = true;
  const data = new FormData(FORM);
  const values = Object.fromEntries(data.entries());
  values.documents = data.getAll('documents');
  delete values.document_uploads;
  values.terms_accepted = true;
  delete values.consent;
  values.marketing_consent = data.has('marketing_consent');
  values.net_pay = Number(values.net_pay);
  values.loan_amount = Number(values.loan_amount);
  try {
    values.id = crypto.randomUUID();
    values.uploaded_documents = await uploadDocuments(files, values.id);
    const response = await fetch(`${SUPABASE_URL}/rest/v1/loan_applications`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(values)
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.message || 'Application could not be submitted. Please try again.');
    }
    FORM.hidden = true;
    document.querySelector('#success-panel').hidden = false;
  } catch (error) {
    ERROR.textContent = error.message || 'Something went wrong. Please try again or call us.';
    ERROR.hidden = false;
    SEND.disabled = false;
    SEND.innerHTML = 'Submit application <span>→</span>';
  }
});

document.querySelector('#new-application').addEventListener('click', () => {
  FORM.reset(); FORM.hidden = false; document.querySelector('#success-panel').hidden = true;
  document.querySelector('#upload-list').textContent = '';
  currentStep = 0; SEND.disabled = false; SEND.innerHTML = 'Submit application <span>→</span>'; updateStep();
});

const trn = FORM.elements.trn;
trn.addEventListener('input', () => {
  const digits = trn.value.replace(/\D/g, '').slice(0, 9);
  trn.value = digits.replace(/(\d{3})(?=\d)/g, '$1-');
});
const dob = FORM.elements.date_of_birth;
const adultCutoff = new Date(); adultCutoff.setFullYear(adultCutoff.getFullYear() - 18);
dob.max = adultCutoff.toISOString().slice(0, 10);
updateStep();

const offer = document.querySelector('#qr-offer');
const params = new URLSearchParams(window.location.search);
if ((params.get('source') || params.get('utm_source') || '').toLowerCase() === 'qr') {
  window.setTimeout(() => offer.showModal(), 350);
}
document.querySelector('#close-offer').addEventListener('click', () => offer.close());
document.querySelector('#offer-apply').addEventListener('click', () => offer.close());
offer.addEventListener('click', event => { if (event.target === offer) offer.close(); });
