-- Additional standard departments requested by the client: R&D / Product
-- Development, Legal & Compliance, Recruitment, and Planning. Same conventions
-- as the earlier department seed: fixed ids (`dept-*`), `DEPT-` codes so the auto
-- `DEP-###` numbering counter is never touched, and idempotent inserts.

INSERT INTO "Department" ("id", "code", "name", "description", "status", "organizationId", "createdAt", "updatedAt")
SELECT 'dept-rd', 'DEPT-RD', 'R&D / Product Development', 'Develops new products, improves existing designs and drives innovation', 'active', 'default-org', now(), now()
WHERE NOT EXISTS (SELECT 1 FROM "Department" WHERE "code" = 'DEPT-RD' AND "organizationId" = 'default-org');

INSERT INTO "Department" ("id", "code", "name", "description", "status", "organizationId", "createdAt", "updatedAt")
SELECT 'dept-legal', 'DEPT-LEGAL', 'Legal & Compliance', 'Handles contracts, regulatory compliance and legal matters', 'active', 'default-org', now(), now()
WHERE NOT EXISTS (SELECT 1 FROM "Department" WHERE "code" = 'DEPT-LEGAL' AND "organizationId" = 'default-org');

INSERT INTO "Department" ("id", "code", "name", "description", "status", "organizationId", "createdAt", "updatedAt")
SELECT 'dept-recruitment', 'DEPT-RECRUITMENT', 'Recruitment', 'Screens, hires and onboards new staff for the company', 'active', 'default-org', now(), now()
WHERE NOT EXISTS (SELECT 1 FROM "Department" WHERE "code" = 'DEPT-RECRUITMENT' AND "organizationId" = 'default-org');

INSERT INTO "Department" ("id", "code", "name", "description", "status", "organizationId", "createdAt", "updatedAt")
SELECT 'dept-planning', 'DEPT-PLANNING', 'Planning', 'Coordinates production schedules, demand planning and capacity', 'active', 'default-org', now(), now()
WHERE NOT EXISTS (SELECT 1 FROM "Department" WHERE "code" = 'DEPT-PLANNING' AND "organizationId" = 'default-org');