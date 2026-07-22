-- Add due_date to task_set_mapping table
ALTER TABLE task_set_mapping 
ADD COLUMN IF NOT EXISTS due_date DATE;
