-- Re-seed the standard 14-department set. The client asked to go back to the
-- original 14 (the four added in 20260919150000 were not wanted), and the live
-- company's department rows were later removed. This restores exactly the
-- standard set, idempotently (existing rows with the same code are kept).
-- Uses the fixed `dept-*` ids and `DEPT-` codes; the auto `DEP-001` counter is
-- never touched.

INSERT INTO "Department" ("id", "code", "name", "description", "status", "organizationId", "createdAt", "updatedAt")
SELECT 'dept-sales', 'DEPT-SALES', 'Sales', 'Handles sales, quotations, invoicing and customer relations', 'active', 'default-org', now(), now()
WHERE NOT EXISTS (SELECT 1 FROM "Department" WHERE "code" = 'DEPT-SALES' AND "organizationId" = 'default-org');

INSERT INTO "Department" ("id", "code", "name", "description", "status", "organizationId", "createdAt", "updatedAt")
SELECT 'dept-purchase', 'DEPT-PURCHASE', 'Purchase / Procurement', 'Responsible for buying goods, raw materials and vendor dealings', 'active', 'default-org', now(), now()
WHERE NOT EXISTS (SELECT 1 FROM "Department" WHERE "code" = 'DEPT-PURCHASE' AND "organizationId" = 'default-org');

INSERT INTO "Department" ("id", "code", "name", "description", "status", "organizationId", "createdAt", "updatedAt")
SELECT 'dept-accounts', 'DEPT-ACCOUNTS', 'Accounts / Finance', 'Manages bookkeeping, vouchers, payments, payroll and financial reports', 'active', 'default-org', now(), now()
WHERE NOT EXISTS (SELECT 1 FROM "Department" WHERE "code" = 'DEPT-ACCOUNTS' AND "organizationId" = 'default-org');

INSERT INTO "Department" ("id", "code", "name", "description", "status", "organizationId", "createdAt", "updatedAt")
SELECT 'dept-hr', 'DEPT-HR', 'Human Resources', 'Oversees hiring, attendance, leave, payroll and employee records', 'active', 'default-org', now(), now()
WHERE NOT EXISTS (SELECT 1 FROM "Department" WHERE "code" = 'DEPT-HR' AND "organizationId" = 'default-org');

INSERT INTO "Department" ("id", "code", "name", "description", "status", "organizationId", "createdAt", "updatedAt")
SELECT 'dept-it', 'DEPT-IT', 'Information Technology', 'Manages software, hardware, networks and technical support', 'active', 'default-org', now(), now()
WHERE NOT EXISTS (SELECT 1 FROM "Department" WHERE "code" = 'DEPT-IT' AND "organizationId" = 'default-org');

INSERT INTO "Department" ("id", "code", "name", "description", "status", "organizationId", "createdAt", "updatedAt")
SELECT 'dept-warehouse', 'DEPT-WAREHOUSE', 'Warehouse / Store', 'Controls stock, store room, transfers and inventory', 'active', 'default-org', now(), now()
WHERE NOT EXISTS (SELECT 1 FROM "Department" WHERE "code" = 'DEPT-WAREHOUSE' AND "organizationId" = 'default-org');

INSERT INTO "Department" ("id", "code", "name", "description", "status", "organizationId", "createdAt", "updatedAt")
SELECT 'dept-production', 'DEPT-PRODUCTION', 'Production / Manufacturing', 'Handles manufacturing, assembly and job work', 'active', 'default-org', now(), now()
WHERE NOT EXISTS (SELECT 1 FROM "Department" WHERE "code" = 'DEPT-PRODUCTION' AND "organizationId" = 'default-org');

INSERT INTO "Department" ("id", "code", "name", "description", "status", "organizationId", "createdAt", "updatedAt")
SELECT 'dept-qc', 'DEPT-QC', 'Quality Control', 'Inspects products for quality and compliance', 'active', 'default-org', now(), now()
WHERE NOT EXISTS (SELECT 1 FROM "Department" WHERE "code" = 'DEPT-QC' AND "organizationId" = 'default-org');

INSERT INTO "Department" ("id", "code", "name", "description", "status", "organizationId", "createdAt", "updatedAt")
SELECT 'dept-marketing', 'DEPT-MARKETING', 'Marketing', 'Plans promotions, advertising and market campaigns', 'active', 'default-org', now(), now()
WHERE NOT EXISTS (SELECT 1 FROM "Department" WHERE "code" = 'DEPT-MARKETING' AND "organizationId" = 'default-org');

INSERT INTO "Department" ("id", "code", "name", "description", "status", "organizationId", "createdAt", "updatedAt")
SELECT 'dept-delivery', 'DEPT-DELIVERY', 'Delivery / Transport', 'Handles dispatch, delivery and transport fleet', 'active', 'default-org', now(), now()
WHERE NOT EXISTS (SELECT 1 FROM "Department" WHERE "code" = 'DEPT-DELIVERY' AND "organizationId" = 'default-org');

INSERT INTO "Department" ("id", "code", "name", "description", "status", "organizationId", "createdAt", "updatedAt")
SELECT 'dept-support', 'DEPT-SUPPORT', 'Customer Support', 'Responds to customer queries and after-sales service', 'active', 'default-org', now(), now()
WHERE NOT EXISTS (SELECT 1 FROM "Department" WHERE "code" = 'DEPT-SUPPORT' AND "organizationId" = 'default-org');

INSERT INTO "Department" ("id", "code", "name", "description", "status", "organizationId", "createdAt", "updatedAt")
SELECT 'dept-admin', 'DEPT-ADMIN', 'Administration', 'Handles office administration and general management', 'active', 'default-org', now(), now()
WHERE NOT EXISTS (SELECT 1 FROM "Department" WHERE "code" = 'DEPT-ADMIN' AND "organizationId" = 'default-org');

INSERT INTO "Department" ("id", "code", "name", "description", "status", "organizationId", "createdAt", "updatedAt")
SELECT 'dept-reception', 'DEPT-RECEPTION', 'Reception', 'Front desk, visitor management and general inquiries', 'active', 'default-org', now(), now()
WHERE NOT EXISTS (SELECT 1 FROM "Department" WHERE "code" = 'DEPT-RECEPTION' AND "organizationId" = 'default-org');

INSERT INTO "Department" ("id", "code", "name", "description", "status", "organizationId", "createdAt", "updatedAt")
SELECT 'dept-security', 'DEPT-SECURITY', 'Security', 'Guards premises, monitors entry and ensures safety', 'active', 'default-org', now(), now()
WHERE NOT EXISTS (SELECT 1 FROM "Department" WHERE "code" = 'DEPT-SECURITY' AND "organizationId" = 'default-org');