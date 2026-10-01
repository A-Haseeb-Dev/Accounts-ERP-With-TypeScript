-- Revert the four departments added in 20260919150000_add_more_standard_departments.
-- The client only wanted the software's default department list discussed, not
-- these records added to the live company. No employees/designations referenced them,
-- so a plain delete is safe. Idempotent: only removes the exact seeded codes.

DELETE FROM "Department"
WHERE "organizationId" = 'default-org'
  AND "code" IN ('DEPT-RD', 'DEPT-LEGAL', 'DEPT-RECRUITMENT', 'DEPT-PLANNING')
  AND "id" IN ('dept-rd', 'dept-legal', 'dept-recruitment', 'dept-planning');