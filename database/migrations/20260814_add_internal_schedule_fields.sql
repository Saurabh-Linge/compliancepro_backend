-- =============================================================================
-- MIGRATION: Add schedule fields for INTERNAL task sets
-- Adds: reference_no, reporting_time, due_time, day_of_week,
--       days_of_month, schedule_day, schedule_month
-- Safe & Idempotent: Uses IF NOT EXISTS
-- =============================================================================

BEGIN;

ALTER TABLE task_set
  ADD COLUMN IF NOT EXISTS reference_no   VARCHAR(200),
  ADD COLUMN IF NOT EXISTS reporting_time VARCHAR(10),
  ADD COLUMN IF NOT EXISTS due_time       VARCHAR(10),
  ADD COLUMN IF NOT EXISTS day_of_week    INT,
  ADD COLUMN IF NOT EXISTS days_of_month  TEXT,
  ADD COLUMN IF NOT EXISTS schedule_day   INT,
  ADD COLUMN IF NOT EXISTS schedule_month INT;

COMMIT;

-- Verify
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'task_set'
  AND column_name IN (
    'reference_no','reporting_time','due_time',
    'day_of_week','days_of_month','schedule_day','schedule_month'
  )
ORDER BY column_name;
