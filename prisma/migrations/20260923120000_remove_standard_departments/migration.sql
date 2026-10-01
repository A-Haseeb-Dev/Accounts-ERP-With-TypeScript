-- Departments were inserted as a fixed standard set by earlier migrations.
-- Departments are reference data: every company defines its own org structure,
-- so those rows are removed and installs start empty. Departments the company
-- created itself keep their own codes and are left alone.
--
-- "Employee"."departmentId" and "Designation"."departmentId" are ON DELETE SET
-- NULL, so this never removes an employee or designation record - it only
-- clears the department pointer on rows that pointed at one of these.
DELETE FROM "Department"
WHERE "id" IN (
    'dept-sales', 'dept-purchase', 'dept-accounts', 'dept-hr', 'dept-it',
    'dept-warehouse', 'dept-production', 'dept-qc', 'dept-marketing',
    'dept-delivery', 'dept-support', 'dept-admin', 'dept-reception',
    'dept-security', 'dept-rd', 'dept-legal', 'dept-recruitment',
    'dept-planning'
);