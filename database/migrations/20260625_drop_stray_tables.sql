-- Cleanup migration: drops stale tables that existed in the live database
-- but are not used by the NestJS backend.
--
-- Categories:
--   1. Old camelCase/Prisma-era tables (replaced by snake_case equivalents)
--   2. Orphan tables never referenced by any service
--
-- All tables below were confirmed empty (0 rows) before dropping.
-- Applied to compliance_pro @ 54.160.231.151 on 2026-06-25.

-- Old Prisma-era camelCase schema (replaced by current snake_case tables)
DROP TABLE IF EXISTS circulars CASCADE;          -- replaced by: circular
DROP TABLE IF EXISTS compliance_tasks CASCADE;   -- replaced by: compliance_task
DROP TABLE IF EXISTS assignments CASCADE;        -- replaced by: assignment
DROP TABLE IF EXISTS authorities CASCADE;        -- replaced by: authority
DROP TABLE IF EXISTS branch_depts CASCADE;       -- replaced by: branch_dept
DROP TABLE IF EXISTS notifications CASCADE;      -- replaced by: notification
DROP TABLE IF EXISTS task_sets CASCADE;          -- replaced by: task_set
DROP TABLE IF EXISTS task_set_mappings CASCADE;  -- replaced by: task_set_mapping

-- Orphan tables never used by any module
DROP TABLE IF EXISTS document_chunks CASCADE;    -- old vector store, replaced by compliance_task.embedding
DROP TABLE IF EXISTS roles CASCADE;              -- never referenced by any service

