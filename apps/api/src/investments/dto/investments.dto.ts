import {
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateInvestorDto {
  /**
   * The investor's own code. It is optional - when it is left out one is
   * generated (`INV-0001`), which is what most users want.
   */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  code?: string;

  @IsString()
  @IsNotEmpty({ message: 'Investor name is required' })
  @MaxLength(150)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  cnic?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  /**
   * The ledger account that carries this investor's capital. When it is set,
   * the principal is credited straight to this account, so the amount owed to
   * the investor is a real account balance.
   */
  @IsOptional()
  @IsString()
  mainAccountId?: string;

  @IsOptional()
  @IsNumber()
  openingBalance?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class UpdateInvestorDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  cnic?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsString()
  mainAccountId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class CreateInvestmentDto {
  @IsString()
  @IsNotEmpty({ message: 'Investor is required' })
  investorId: string;

  @IsNumber()
  @Min(0, { message: 'Principal cannot be negative' })
  principal: number;

  @IsOptional()
  @IsDateString({}, { message: 'Invalid start date' })
  startDate?: string;

  @IsOptional()
  @IsInt()
  @Min(1, { message: 'Term must be at least one month' })
  termMonths?: number;

  @IsOptional()
  @IsIn(['FIXED', 'PROFIT_SHARE'], { message: 'Return type must be FIXED or PROFIT_SHARE' })
  returnType?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  monthlyReturn?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  profitSharePercent?: number;

  /** The cash/bank account the money is received into and paid out of. */
  @IsOptional()
  @IsString()
  fundingAccountId?: string;

  /** Overrides the capital account the principal is credited to. */
  @IsOptional()
  @IsString()
  capitalAccountId?: string;

  /** Overrides the expense account the monthly returns are charged to. */
  @IsOptional()
  @IsString()
  returnExpenseAccountId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class UpdateInvestmentDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  principal?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  termMonths?: number;

  @IsOptional()
  @IsIn(['FIXED', 'PROFIT_SHARE'])
  returnType?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  monthlyReturn?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  profitSharePercent?: number;

  @IsOptional()
  @IsString()
  fundingAccountId?: string;

  @IsOptional()
  @IsString()
  capitalAccountId?: string;

  @IsOptional()
  @IsString()
  returnExpenseAccountId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

/** Records the money received against an investment. */
export class ReceiveInvestmentDto {
  @IsOptional()
  @IsDateString({}, { message: 'Invalid received date' })
  receivedDate?: string;

  /** The cash/bank account the money landed in. */
  @IsOptional()
  @IsString()
  fundingAccountId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

/** Pays one installment - a monthly return or the principal coming back. */
export class PayInstallmentDto {
  @IsOptional()
  @IsDateString({}, { message: 'Invalid payment date' })
  paidDate?: string;

  /**
   * The amount to pay. It defaults to the scheduled amount, and is required
   * for a profit-share return where the amount is only known at payout time.
   */
  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  /** The cash/bank account the money is paid out of. */
  @IsOptional()
  @IsString()
  fundingAccountId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

/** Closes an investment and returns the principal to the investor. */
export class CloseInvestmentDto {
  @IsOptional()
  @IsDateString({}, { message: 'Invalid closing date' })
  closedDate?: string;

  @IsOptional()
  @IsString()
  fundingAccountId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class InvestmentInstallmentDto {
  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateInstallmentDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsDateString({}, { message: 'Invalid due date' })
  dueDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class CreateInvestmentInstallmentDto {
  @IsOptional()
  @IsIn(['RETURN', 'PRINCIPAL'], { message: 'Kind must be RETURN or PRINCIPAL' })
  kind?: string;

  @IsDateString({}, { message: 'Invalid due date' })
  dueDate: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class InvestmentQueryDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  investorId?: string;
}
