-- AlterTable
ALTER TABLE "Department" ADD COLUMN     "salaryExpenseAccountId" TEXT;

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "exitDate" TIMESTAMP(3),
ADD COLUMN     "exitReason" TEXT;

-- AlterTable
ALTER TABLE "PayrollItem" ADD COLUMN     "componentBreakdown" JSONB;

-- AlterTable
ALTER TABLE "PayrollRun" ADD COLUMN     "disbursementVoucherId" TEXT,
ADD COLUMN     "paidAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SalaryComponent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'EARNING',
    "calcType" TEXT NOT NULL DEFAULT 'FIXED',
    "value" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "organizationId" TEXT NOT NULL DEFAULT 'default-org',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalaryComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeSalaryComponent" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "organizationId" TEXT NOT NULL DEFAULT 'default-org',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeSalaryComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeLoan" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "installment" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "startMonth" INTEGER NOT NULL,
    "startYear" INTEGER NOT NULL,
    "paidAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "note" TEXT,
    "organizationId" TEXT NOT NULL DEFAULT 'default-org',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeLoan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeSalaryRecord" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "basicSalary" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "allowance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "effectiveDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "createdById" TEXT,
    "organizationId" TEXT NOT NULL DEFAULT 'default-org',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeSalaryRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SalaryComponent_type_status_idx" ON "SalaryComponent"("type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SalaryComponent_name_organizationId_key" ON "SalaryComponent"("name", "organizationId");

-- CreateIndex
CREATE INDEX "EmployeeSalaryComponent_componentId_idx" ON "EmployeeSalaryComponent"("componentId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeSalaryComponent_employeeId_componentId_key" ON "EmployeeSalaryComponent"("employeeId", "componentId");

-- CreateIndex
CREATE INDEX "EmployeeLoan_employeeId_idx" ON "EmployeeLoan"("employeeId");

-- CreateIndex
CREATE INDEX "EmployeeLoan_status_idx" ON "EmployeeLoan"("status");

-- CreateIndex
CREATE INDEX "EmployeeSalaryRecord_employeeId_idx" ON "EmployeeSalaryRecord"("employeeId");

-- CreateIndex
CREATE INDEX "Department_salaryExpenseAccountId_idx" ON "Department"("salaryExpenseAccountId");

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_salaryExpenseAccountId_fkey" FOREIGN KEY ("salaryExpenseAccountId") REFERENCES "MainAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryComponent" ADD CONSTRAINT "SalaryComponent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeSalaryComponent" ADD CONSTRAINT "EmployeeSalaryComponent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeSalaryComponent" ADD CONSTRAINT "EmployeeSalaryComponent_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeSalaryComponent" ADD CONSTRAINT "EmployeeSalaryComponent_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "SalaryComponent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeLoan" ADD CONSTRAINT "EmployeeLoan_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeLoan" ADD CONSTRAINT "EmployeeLoan_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeSalaryRecord" ADD CONSTRAINT "EmployeeSalaryRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeSalaryRecord" ADD CONSTRAINT "EmployeeSalaryRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;