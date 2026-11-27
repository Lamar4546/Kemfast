# Kemlan schema transition notes

## Which schema belongs to this website

The website in this repository uses Supabase, so its runtime database is
PostgreSQL. Use [`../supabase/schema.sql`](../supabase/schema.sql) for that
backend. The supplied `kemlan_schema_export.sql` and the SQL files in
`kemlan.zip` are for MySQL/MariaDB. They include MySQL-only syntax such as
`AUTO_INCREMENT`, `ENUM`, `ENGINE=InnoDB`, `USE`, and MySQL `ALTER TABLE`
forms. Do not run those files in Supabase or paste them into the website's
schema file.

The export describes an older, broader system. The ZIP contains later MySQL
migrations, through July 2026, that extend its loan workflow, documents,
scoring, rate tables, drafts, guarantors, and application form. The website's
current form and admin dashboard intentionally use a smaller field set and a
different status workflow.

## Changes made for the website backend

The Supabase schema remains the source of truth for the current website. Its
upgrade section now also adds `has_off_payroll_loans` and `marketing_consent`
when upgrading an existing project. It adds indexes for newest-first admin
lists and status/source filtering. Public inserts are limited to form columns,
and the insert policy requires new submissions to start with status `new`; only
allowlisted staff can read, update status, or delete application records.

Run the updated `supabase/schema.sql` in the Supabase SQL Editor for both a new
project and an existing project. It is written to be repeatable. Verify it on a
staging Supabase project first if it contains data that must be retained.

## Legacy-to-website mapping

| MySQL export / later migrations | Website / transition handling |
| --- | --- |
| `users` and MySQL password hashes | Create staff in Supabase Auth and add their UUID to `public.admin_users`. Do not copy password hashes into the website database. Invite staff to set a new password. |
| Integer application `id` and `uuid` | The website uses UUID `id`. Generate a new UUID per imported row and keep a separate cross-reference during import. |
| `reference_number` | Keep the old reference in the import cross-reference; the current dashboard displays the new UUID-derived reference. |
| `submitted` | `new` |
| `under_review` | `pending_approval` |
| `approved`, `rejected` | Same status |
| `draft` | Keep out of the submitted-application queue. Import only if draft-resume behavior is being migrated too. |
| `disbursed`, `closed` | The current dashboard has no equivalent state. Preserve these as legacy history; do not relabel them as approved. |
| MySQL `documents` records and file paths | Transfer files into the private Supabase `loan-documents` bucket and create `uploaded_documents` metadata only after each file is verified. Do not expose old file paths as public links. |
| `how_heard_about_us` and other source-less rows | Set `application_source` to `unknown` unless a reliable QR/website source is available. Do not assume old records came from the website. |
| Scoring rules/results and loan-rate tables | Not read by the current admin website. Keep them in the legacy system until the scoring/rate behavior is deliberately added and reviewed. |
| Extra historic form fields | Keep them in a controlled legacy archive if they must be retained. Do not silently add them to the new applicant form or drop them during transfer. |

## Migration hazards found in the ZIP

The ZIP is a MySQL migration history, not a ready-to-run Supabase migration. In
particular:

- `2026_04_13_recreate_documents_table.sql` drops and recreates `documents`.
  Its own comments require confirming the table is empty first.
- `2026_05_28_align_notifications_to_canonical_schema.sql` drops and recreates
  `notifications`.
- `2026_01_09_update_scoring_to_prescreening.sql` deletes all current
  `scoring_rules` before reseeding them.
- The migrations update the older form and workflow, including fields the QR
  application currently does not collect. Applying them unchanged would not
  make the Supabase backend compatible.

## Safe transition sequence

1. Keep a restorable backup of the current MySQL database and uploaded files.
2. Apply the Supabase schema to a staging project and verify public submission,
   staff sign-in, status changes, document uploads, and document viewing.
3. Export legacy rows and files separately. Build an explicit column mapping;
   preserve original IDs, reference numbers, and statuses in a cross-reference.
4. Import a small sample first, using the status mapping above and `unknown`
   source where attribution cannot be proven.
5. Compare row counts, references, dates, amounts, and document checksums before
   switching any live traffic. Keep the source database read-only until the
   new system has been reconciled.

This repository does not contain credentials or a connection to the old MySQL
database, so the supplied data has not been imported or modified.
