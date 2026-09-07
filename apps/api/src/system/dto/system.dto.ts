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

  @IsString()
  @IsOptional()
  saleFooter?: string;

  @IsString()
  @IsOptional()
  saleTerms?: string;

  @IsString()
  @IsOptional()
  purchaseFooter?: string;

  @IsString()
  @IsOptional()
  purchaseTerms?: string;

  @IsString()
  @IsOptional()
  salesReturnFooter?: string;

  @IsString()
  @IsOptional()
  salesReturnTerms?: string;

  @IsString()
  @IsOptional()
  purchaseReturnFooter?: string;

  @IsString()
  @IsOptional()
  purchaseReturnTerms?: string;
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
  salesReturnPrefix?: string;

  @IsString()
  @IsOptional()
  purchaseReturnPrefix?: string;

  @IsString()
  @IsOptional()
  stockTransferPrefix?: string;

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

  @IsString()
  @IsOptional()
  @Matches(/^(true|false)$/, { message: 'Must be true or false' })
  invoiceShowBalance?: string;

  @IsString()
  @IsOptional()
  @Matches(/^(true|false)$/, { message: 'Must be true or false' })
  invoiceShowAmountWords?: string;

  @IsString()
  @IsOptional()
  @Matches(/^(true|false)$/, { message: 'Must be true or false' })
  invoiceShowDate?: string;

  @IsString()
  @IsOptional()
  @Matches(/^(true|false)$/, { message: 'Must be true or false' })
  reportShowBranding?: string;

  @IsString()
  @IsOptional()
  @Matches(/^(true|false)$/, { message: 'Must be true or false' })
  reportShowLogo?: string;

  @IsString()
  @IsOptional()
  @Matches(/^(A4|A5|Letter)$/, { message: 'Paper size must be A4, A5 or Letter' })
  paperSize?: string;

  @IsString()
  @IsOptional()
  @Matches(/^([5-9][0-9]|100)$/, { message: 'Print scale must be between 50 and 100' })
  printScale?: string;
}

export class ImportSettingsDto {
  @IsOptional()
  version?: number;

  @IsObject()
  @IsOptional()
  settings?: Record<string, string>;

  @IsObject()
  @IsOptional()
  branding?: Record<string, unknown>;
}