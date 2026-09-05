-- BrandingSetting: company contact details printed on invoices/reports

ALTER TABLE "BrandingSetting" ADD COLUMN "address" TEXT,
ADD COLUMN "phone" TEXT,
ADD COLUMN "email" TEXT,
ADD COLUMN "ntn" TEXT;