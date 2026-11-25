# Kemlan quick loan application

A branded mobile-first QR landing page, four-part application form, and staff-only application dashboard. The form saves to Supabase. The dashboard is at `/admin.html`.

## Run locally

1. Install Node.js 20.19+ or 22.12+.
2. Run `npm install`.
3. Copy `.env.example` to `.env.local` and fill in the Supabase project URL and publishable/anon key.
4. Run `npm run dev` and open the printed local URL. Vite serves the dashboard at `/admin.html`.

## Set up Supabase

1. Create a Supabase project.
2. Open **SQL Editor**, paste and run [`supabase/schema.sql`](supabase/schema.sql).
3. In **Project Settings → API**, copy the Project URL and publishable key (or legacy anon key) into `.env.local`. Never put the service role key in this frontend.
4. Create the manager's account in **Authentication → Users**, then add its UUID to the `admin_users` allowlist using the SQL command at the bottom of `schema.sql`.
5. On Vercel, configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for the frontend build. For staff invitations and private document uploads, add `SUPABASE_URL` and `SUPABASE_SECRET_KEY` as server environment variables. Use the Supabase secret key (`sb_secret_...`) from **Project Settings → API Keys**. The older `SUPABASE_SERVICE_ROLE_KEY` is also supported. Never prefix a privileged key with `VITE_` or expose it in browser code.
6. Deploy to an HTTPS host. Set the QR code destination to `https://YOUR-DOMAIN/?source=qr` so only QR-tagged visits see the discount offer. Use the plain `/` URL for other traffic and give authorized staff the `/admin.html` URL. A QR visit cannot be identified reliably unless the QR destination includes this tag.

If this Supabase project already has the application table, run the updated `supabase/schema.sql` again to add dashboard status and admin update/delete permissions, create the private `loan-documents` bucket, and add document metadata. It uses `if not exists` and recreates the staff policies, so it can be safely re-run. Admins can search/filter applications, set them to New, Pending approval, or Approved, and permanently delete a record after confirming the action. Uploaded document links are generated only for signed-in, allowlisted staff and expire after five minutes. After changing a Vercel environment variable, redeploy so the new server function receives it.

The browser's anon key is designed to be public. Row level security is what protects the records: unauthenticated visitors have insert permission only, while application reads are limited to allowlisted staff. The admin login session is held in the current browser tab's session storage and is cleared when staff sign out. Invitation delivery depends on the Supabase Auth email provider and its configured templates.

## Form scope

The application follows the supplied DOCX and omits ID number, directions/landmarks, the employment end/contract question, extension fields, HR/payroll contact fields, other-income source and amount, living expenses, and the original section 6. It asks whether applicants have additional income and loans not recorded on their payslip. Section 8 is titled “Checklist of documents to submit.” Applicants can optionally upload up to eight PDF or JPG files (8 MB each); bank statements are PDF only. Uploads are never required to submit. Files are stored in the private Supabase bucket and listed by document type in the admin application details.

## Notes for deployment

- Verify the Terms and Privacy Policy destinations and approved consent wording with Kemlan before publishing.
- The app intentionally collects TRN and date of birth. Limit dashboard access to staff who need it, and set organization retention and deletion procedures before production use.
- Static hosting alone does not rate-limit public submissions. Add CAPTCHA or a server-side rate limit if the QR page receives spam.
