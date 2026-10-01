-- Departments used to be inserted as a fixed standard set by earlier migrations.
-- Departments are reference data: each company defines its own org structure, so
-- the standard rows are removed and every new install starts empty.
--
-- "Employee"."departmentId" and "Designation"."departmentId" are ON DELETE SET
-- NULL, so this never removes employee or designation records - it only clears
-- the department pointer on rows that still pointed at one of these.
DELETE FROM "Department";