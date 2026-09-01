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

export class SaleItemDto {
  @IsString()
  @IsNotEmpty({ message: 'Item is required' })
  itemId: string;

  @IsNumber()
  @Min(0.0001, { message: 'Quantity must be greater than zero' })
  quantity: number;

  @IsNumber()
  @Min(0)
  unitPrice: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  tax?: number;
}

export class CreateSaleDto {
  @IsDateString({}, { message: 'Invalid sale date' })
  saleDate: Date;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  reference?: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  note?: string;

  @IsString()
  @IsNotEmpty({ message: 'Customer is required' })
  customerId: string;

  @IsString()
  @IsNotEmpty({ message: 'Stock location is required' })
  stockLocationId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  @IsNotEmpty({ message: 'At least one item is required' })
  items: SaleItemDto[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  tax?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amountPaid?: number;
}

export class CreateSalesReturnDto {
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
  saleId?: string;

  @IsString()
  @IsNotEmpty({ message: 'Customer is required' })
  customerId: string;

  @IsString()
  @IsNotEmpty({ message: 'Stock location is required' })
  stockLocationId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  @IsNotEmpty({ message: 'At least one item is required' })
  items: SaleItemDto[];
}