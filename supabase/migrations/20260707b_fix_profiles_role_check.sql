-- 20260707_customer_hierarchy_and_statements.sql introduced the
-- `marketing_member` role (used in RLS policies and the Staff page's
-- role dropdown) but never updated the `profiles.role` CHECK constraint
-- itself. As a result, assigning "Marketing Member" to any staff member
-- on the Staff page fails with:
--
--   new row for relation "profiles" violates check constraint
--   "profiles_role_check"
--
-- This adds `marketing_member` to the allowed set. Safe to run multiple
-- times.

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('owner', 'builder', 'salesman', 'marketing_member'));
