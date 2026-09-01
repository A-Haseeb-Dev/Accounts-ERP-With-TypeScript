import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class VoucherEntryDto {
  @IsString()
  @IsNotEmpty({ message: 'Account is required' })
  mainAccountId: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  debit?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  credit?: number;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  narration?: string;
}

export class CreateVoucherDto {
  @IsString()
  @IsNotEmpty({ message: 'Voucher type is required' })
  voucherType: 'JOURNAL' | 'CREDIT' | 'DEBIT';

  @IsDateString({}, { message: 'Invalid date' })
  voucherDate: Date;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  reference?: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  description?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VoucherEntryDto)
  @IsNotEmpty({ message: 'At least one entry is required' })
  entries: VoucherEntryDto[];
}

export class PostVoucherDto {
  @IsString()
  @IsOptional()
  id?: string;
}

export class CancelVoucherDto {
  @IsString()
  @IsNotEmpty({ message: 'Cancellation reason is required' })
  reason: string;
}