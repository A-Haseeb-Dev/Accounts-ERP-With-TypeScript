import { IsObject, IsOptional, IsString, Matches } from 'class-validator';

export class UpdateBrandingDto {
  @IsString()
  @IsOptional()
  businessName?: string;

  @IsString()
  @IsOptional()
  shortName?: string;

  @IsString()
  @IsOptional()
  logoUrl?: string;

  @IsString()
  @IsOptional()
  faviconUrl?: string;

  @IsString()
  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'Primary color must be a hex color like #2563eb' })
  primaryColor?: string;

  @IsString()
  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'Secondary color must be a hex color' })
  secondaryColor?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  ntn?: string;

  @IsString()
  @IsOptional()
  invoiceFooter?: string;

  @IsString()
  @IsOptional()
  invoiceTerms?: string;

  @IsString()
  @IsOptional()
  reportFooter?: string;
}

export class UpdateSettingsDto {
  @IsString()
  @IsOptional()
  currency?: string;

  @IsString()
  @IsOptional()
  dateFormat?: string;

  @IsString()
  @IsOptional()
  timezone?: string;

  @IsString()
  @IsOptional()
  invoicePrefix?: string;

  @IsString()
  @IsOptional()
  purchasePrefix?: string;

  @IsString()
  @IsOptional()
  voucherPrefix?: string;

  @IsString()
  @IsOptional()
  @Matches(/^(true|false)$/, { message: 'Must be true or false' })
  negativeInventory?: string;

  @IsString()
  @IsOptional()
  defaultStockLocationId?: string;

  @IsString()
  @IsOptional()
  defaultCustomerId?: string;

  @IsString()
  @IsOptional()
  defaultSupplierId?: string;

  @IsObject()
  @IsOptional()
  values?: Record<string, string>;
}