-- Change assigned_by from uuid to text so we can store officer names
-- The column has never been populated, so no data migration needed
ALTER TABLE public.kvk_assignments ALTER COLUMN assigned_by TYPE text;
