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

export class PurchaseItemDto {
  @IsString()
  @IsNotEmpty({ message: 'Item is required' })
  itemId: string;

  @IsNumber()
  @Min(0.0001, { message: 'Quantity must be greater than zero' })
  quantity: number;

  @IsNumber()
  @Min(0)
  unitCost: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  tax?: number;
}

export class CreatePurchaseDto {
  @IsDateString({}, { message: 'Invalid purchase date' })
  purchaseDate: Date;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  reference?: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  note?: string;

  @IsString()
  @IsNotEmpty({ message: 'Supplier is required' })
  supplierId: string;

  @IsString()
  @IsNotEmpty({ message: 'Stock location is required' })
  stockLocationId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseItemDto)
  @IsNotEmpty({ message: 'At least one item is required' })
  items: PurchaseItemDto[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  tax?: number;
}

export class CreatePurchaseReturnDto {
  @IsDateString({}, { message: 'Invalid return date' })
  returnDate: Date;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  reference?: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  note?: string;

  @IsString()
  @IsOptional()
  purchaseId?: string;

  @IsString()
  @IsNotEmpty({ message: 'Supplier is required' })
  supplierId: string;

  @IsString()
  @IsNotEmpty({ message: 'Stock location is required' })
  stockLocationId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseItemDto)
  @IsNotEmpty({ message: 'At least one item is required' })
  items: PurchaseItemDto[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  tax?: number;
}

export class TransferItemDto {
  @IsString()
  @IsNotEmpty({ message: 'Item is required' })
  itemId: string;

  @IsNumber()
  @Min(0.0001, { message: 'Quantity must be greater than zero' })
  quantity: number;
}

export class CreateStockTransferDto {
  @IsDateString({}, { message: 'Invalid transfer date' })
  transferDate: Date;

  @IsString()
  @IsNotEmpty({ message: 'From location is required' })
  fromLocationId: string;

  @IsString()
  @IsNotEmpty({ message: 'To location is required' })
  toLocationId: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  note?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TransferItemDto)
  @IsNotEmpty({ message: 'At least one item is required' })
  items: TransferItemDto[];
}