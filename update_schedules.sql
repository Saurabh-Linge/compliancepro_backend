UPDATE task_set 
SET assignment_time = '09:00',
    due_time = '17:00',
    reporting_time = '17:30'
WHERE frequency = '0';

UPDATE task_set
SET assignment_day_of_week = '1',
    due_day_of_week = '3',
    reporting_day_of_week = '5'
WHERE frequency = '7';

UPDATE task_set
SET assignment_days_of_month = '1',
    due_days_of_month = '10',
    reporting_days_of_month = '14'
WHERE frequency = '1';

UPDATE task_set
SET assignment_days_of_month = '1',
    due_days_of_month = '25',
    reporting_days_of_month = '27'
WHERE frequency = '2';

UPDATE task_set
SET assignment_schedule = '1st of Quarter',
    due_schedule = '15th of Quarter',
    reporting_schedule = '25th of Quarter'
WHERE frequency = '3';

UPDATE task_set
SET assignment_schedule = '1st of Half',
    due_schedule = '25th of Half',
    reporting_schedule = '27th of Half'
WHERE frequency = '4';

UPDATE task_set
SET assignment_schedule = '1 Jan',
    due_schedule = '15 Dec',
    reporting_schedule = '25 Dec'
WHERE frequency = '5';
