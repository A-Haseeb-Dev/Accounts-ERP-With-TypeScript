-- Payroll funding account: the account a payroll run's salaries are paid from.
-- The run may only be generated/posted while this account holds enough to cover
-- the total net pay, so a company cannot distribute more salary than it has
-- funded (it can transfer money in from another account first).

-- AlterTable
ALTER TABLE "PayrollRun" ADD COLUMN     "fundingAccountId" TEXT;

-- CreateIndex
CREATE INDEX "PayrollRun_fundingAccountId_idx" ON "PayrollRun"("fundingAccountId");

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_fundingAccountId_fkey" FOREIGN KEY ("fundingAccountId") REFERENCES "MainAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
