-- A "protected" role can only be created, modified, deleted or assigned by a
-- Developer or Super Admin. This is the switch behind the "Protected Role" toggle
-- on the Roles & Permissions screen (the same idea as the active/inactive toggle).
--
-- The two built-in full-access roles are protected so an ordinary user with
-- `roles.manage` / `users.manage` can never hand them out or change them.

ALTER TABLE "Role" ADD COLUMN "protected" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Role" SET "protected" = true
WHERE "name" IN ('Developer', 'Super Admin');