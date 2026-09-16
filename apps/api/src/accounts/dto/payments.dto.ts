import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class PaymentAllocationDto {
  @IsEnum(['SALE', 'PURCHASE', 'SALES_RETURN', 'PURCHASE_RETURN'], {
    message: 'documentType must be SALE, PURCHASE, SALES_RETURN or PURCHASE_RETURN',
  })
  documentType: 'SALE' | 'PURCHASE' | 'SALES_RETURN' | 'PURCHASE_RETURN';

  @IsString()
  @IsNotEmpty({ message: 'documentId is required' })
  documentId: string;

  @IsNumber()
  @IsNotEmpty({ message: 'allocatedAmount is required' })
  allocatedAmount: number;
}

export class CreatePaymentDto {
  @IsEnum(['RECEIPT', 'PAYMENT'], { message: 'paymentType must be RECEIPT or PAYMENT' })
  paymentType: 'RECEIPT' | 'PAYMENT';

  @IsEnum(['CUSTOMER', 'SUPPLIER'], { message: 'partyType must be CUSTOMER or SUPPLIER' })
  partyType: 'CUSTOMER' | 'SUPPLIER';

  @IsString()
  @IsNotEmpty({ message: 'Party is required' })
  partyId: string;

  @IsString()
  @IsNotEmpty({ message: 'Cash / bank account is required' })
  mainAccountId: string;

  @IsEnum(['CASH', 'CHEQUE', 'BANK'], { message: 'method must be CASH, CHEQUE or BANK' })
  @IsNotEmpty({ message: 'Payment method is required' })
  method: 'CASH' | 'CHEQUE' | 'BANK';

  @IsString()
  @IsOptional()
  @MaxLength(50)
  chequeNumber?: string;

  @IsString()
  @IsOptional()
  bankAccountId?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Invalid cheque date' })
  chequeDate?: string;

  @IsNumber()
  @IsNotEmpty({ message: 'Amount is required' })
  amount: number;

  @IsString()
  @IsOptional()
  paymentDate?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  reference?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  narration?: string;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => PaymentAllocationDto)
  allocations?: PaymentAllocationDto[];
}

export class CancelPaymentDto {
  @IsString()
  @IsNotEmpty({ message: 'Reason is required' })
  reason: string;
}