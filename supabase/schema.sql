-- Run once in Supabase SQL Editor. This schema matches the Kemlan QR application.
-- Public visitors may submit. Only signed-in, allowlisted staff may read applications.
create extension if not exists pgcrypto;

create table if not exists public.loan_applications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  first_name text not null,
  middle_name text,
  last_name text not null,
  date_of_birth date not null,
  trn text not null check (trn ~ '^\d{3}-?\d{3}-?\d{3}$'),
  id_type text not null,
  phone text not null,
  other_phone text,
  email text not null,
  home_address text not null,
  town text not null,
  parish text not null,
  residence text not null,
  time_at_address text not null,
  employment_status text not null,
  employment_duration text not null,
  employer_name text not null,
  employer_sector text not null,
  job_title text not null,
  branch_department text,
  company_address text not null,
  company_phone text not null,
  supervisor_name text not null,
  supervisor_phone text not null,
  salary_deduction_allowed text not null check (salary_deduction_allowed in ('Yes','No')),
  pay_frequency text not null,
  net_pay numeric(12,2) not null check (net_pay >= 0),
  next_pay_date date not null,
  has_additional_income text not null check (has_additional_income in ('Yes','No')),
  loan_amount numeric(12,2) not null check (loan_amount > 0),
  loan_term text not null,
  loan_purpose text not null,
  repayment_route text not null,
  promo_code text,
  loan_explanation text not null,
  has_off_payroll_loans text not null check (has_off_payroll_loans in ('Yes','No')),
  family_ref_name text not null,
  family_ref_phone text not null,
  family_ref_relationship text not null,
  family_ref_address text not null,
  other_ref_name text not null,
  other_ref_phone text not null,
  other_ref_relationship text not null,
  other_ref_address text not null,
  documents text[] not null default '{}',
  terms_accepted boolean not null default true,
  marketing_consent boolean not null default false
);

-- Upgrade the first QR-form schema if it has already been created in this project.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='loan_applications' and column_name='employment_length')
     and not exists (select 1 from information_schema.columns where table_schema='public' and table_name='loan_applications' and column_name='employment_duration') then
    alter table public.loan_applications rename column employment_length to employment_duration;
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='loan_applications' and column_name='salary_cycle')
     and not exists (select 1 from information_schema.columns where table_schema='public' and table_name='loan_applications' and column_name='pay_frequency') then
    alter table public.loan_applications rename column salary_cycle to pay_frequency;
  end if;
end $$;

alter table public.loan_applications
  add column if not exists middle_name text,
  add column if not exists id_type text,
  add column if not exists other_phone text,
  add column if not exists residence text,
  add column if not exists time_at_address text,
  add column if not exists employment_status text,
  add column if not exists employment_duration text,
  add column if not exists employer_sector text,
  add column if not exists branch_department text,
  add column if not exists company_address text,
  add column if not exists company_phone text,
  add column if not exists supervisor_name text,
  add column if not exists supervisor_phone text,
  add column if not exists salary_deduction_allowed text,
  add column if not exists pay_frequency text,
  add column if not exists repayment_route text,
  add column if not exists promo_code text,
  add column if not exists loan_explanation text,
  add column if not exists family_ref_name text,
  add column if not exists family_ref_phone text,
  add column if not exists family_ref_relationship text,
  add column if not exists family_ref_address text,
  add column if not exists other_ref_name text,
  add column if not exists other_ref_phone text,
  add column if not exists other_ref_relationship text,
  add column if not exists other_ref_address text,
  add column if not exists documents text[] not null default '{}',
  add column if not exists terms_accepted boolean not null default true;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now()
);

alter table public.loan_applications enable row level security;
alter table public.admin_users enable row level security;

create or replace function public.is_kemlan_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.admin_users where user_id = (select auth.uid()));
$$;
revoke all on function public.is_kemlan_admin() from public;
grant execute on function public.is_kemlan_admin() to authenticated;

drop policy if exists "Anyone can submit an application" on public.loan_applications;
create policy "Anyone can submit an application" on public.loan_applications
  for insert to anon, authenticated with check (true);

drop policy if exists "Kemlan staff can view applications" on public.loan_applications;
create policy "Kemlan staff can view applications" on public.loan_applications
  for select to authenticated using ((select public.is_kemlan_admin()));

drop policy if exists "Admins can view their own allowlist entry" on public.admin_users;
create policy "Admins can view their own allowlist entry" on public.admin_users
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on public.loan_applications from anon, authenticated;
grant insert on public.loan_applications to anon, authenticated;
grant select on public.loan_applications to authenticated;
revoke all on public.admin_users from anon, authenticated;
grant select on public.admin_users to authenticated;

-- After adding the staff account in Supabase Auth > Users, run this with their email:
-- insert into public.admin_users (user_id)
-- select id from auth.users where email = 'manager@kemlanfinancing.com';
