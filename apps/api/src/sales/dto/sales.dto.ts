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

  @IsOptional()
  @IsDateString({}, { message: 'Invalid due date' })
  dueDate?: string;

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
  commission?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amountPaid?: number;
}

/**
 * One line of a delivery order.
 *
 * `saleItemId` names the invoice line being dispatched. It is what lets a
 * part-delivered invoice be tracked: the quantity shipped is recorded against
 * that exact line, and a second delivery order can ship the rest.
 */
export class DeliveryOrderItemDto {
  @IsString()
  @IsNotEmpty({ message: 'Item is required' })
  itemId: string;

  @IsNumber()
  @Min(0.0001, { message: 'Quantity must be greater than zero' })
  quantity: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPrice?: number;

  @IsOptional()
  @IsString()
  saleItemId?: string;
}

export class CreateDeliveryOrderDto {
  @IsOptional()
  @IsDateString({}, { message: 'Invalid delivery date' })
  deliveryDate?: string;

  /**
   * The invoice this dispatch settles. When it is given, the delivery order
   * lines default to what the invoice still owes and every line is checked
   * against the invoice, so more cannot be shipped than was invoiced.
   */
  @IsOptional()
  @IsString()
  saleId?: string;

  @IsString()
  @IsOptional()
  customerId?: string;

  @IsString()
  @IsOptional()
  stockLocationId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  reference?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  deliveryTo?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  vehicleNo?: string;

  @IsString()
  @IsOptional()
  @MaxLength(150)
  driverName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  driverPhone?: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  note?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DeliveryOrderItemDto)
  @IsOptional()
  items?: DeliveryOrderItemDto[];
}


export class CreateQuotationDto {
  @IsDateString({}, { message: 'Invalid quotation date' })
  quotationDate: Date;

  @IsOptional()
  @IsDateString({}, { message: 'Invalid valid-until date' })
  validUntil?: string;

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

  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  tax?: number;
}