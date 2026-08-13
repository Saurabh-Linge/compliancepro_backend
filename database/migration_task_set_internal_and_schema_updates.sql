-- =============================================================================
-- COMPLIANCE PRO - PGADMIN MIGRATION SCRIPT
-- Description: Adds all new columns for Internal Task Sets, Authority Mapping,
--              Task Timelines, and Assignment Remarks.
-- Safe & Idempotent: Uses IF NOT EXISTS clauses so it can be run multiple times.
-- Target DBs: compliance_pro_local, compliance_pro (remote / production)
-- =============================================================================

BEGIN;

-- 1. Update task_set table: Add type and authority_id
ALTER TABLE task_set 
  ADD COLUMN IF NOT EXISTS type VARCHAR(20) DEFAULT 'REGULAR',
  ADD COLUMN IF NOT EXISTS authority_id INT REFERENCES authority(id) ON DELETE SET NULL;

-- 2. Update compliance_task table: Add authority_id
ALTER TABLE compliance_task
  ADD COLUMN IF NOT EXISTS authority_id INT REFERENCES authority(id) ON DELETE SET NULL;

-- 3. Update task_set_mapping table: Add due_date
ALTER TABLE task_set_mapping 
  ADD COLUMN IF NOT EXISTS due_date DATE;

-- 4. Update assignment_task table: Add due_date, proposed_due_date, and review remarks
ALTER TABLE assignment_task 
  ADD COLUMN IF NOT EXISTS due_date DATE,
  ADD COLUMN IF NOT EXISTS proposed_due_date DATE,
  ADD COLUMN IF NOT EXISTS proposed_remark TEXT,
  ADD COLUMN IF NOT EXISTS timeline_review_remark TEXT;

-- 5. Update assignment table: Add timeline_remark
ALTER TABLE assignment 
  ADD COLUMN IF NOT EXISTS timeline_remark TEXT;

COMMIT;

-- Verify updated table structures
SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_name IN ('task_set', 'compliance_task', 'task_set_mapping', 'assignment_task', 'assignment')
  AND column_name IN ('type', 'authority_id', 'due_date', 'proposed_due_date', 'proposed_remark', 'timeline_review_remark', 'timeline_remark')
ORDER BY table_name, column_name;
