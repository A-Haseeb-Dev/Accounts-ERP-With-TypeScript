import { IsArray, IsNotEmpty, IsOptional, IsString, MaxLength, IsEnum, IsNumber } from 'class-validator';

export type Status = 'active' | 'inactive';

export const statusEnum = () => ['active', 'inactive'];

export class CreateHeadAccountDto {
  @IsString()
  @IsNotEmpty({ message: 'Account code is required' })
  @MaxLength(20)
  code: string;

  @IsString()
  @IsNotEmpty({ message: 'Account name is required' })
  @MaxLength(150)
  name: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  status?: string;
}

export class UpdateHeadAccountDto {
  @IsString()
  @IsOptional()
  @MaxLength(20)
  code?: string;

  @IsString()
  @IsOptional()
  @MaxLength(150)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  status?: string;
}

export class CreateSubHeadDto {
  @IsString()
  @IsNotEmpty({ message: 'Sub head code is required' })
  @MaxLength(20)
  code: string;

  @IsString()
  @IsNotEmpty({ message: 'Sub head name is required' })
  @MaxLength(150)
  name: string;

  @IsString()
  @IsNotEmpty({ message: 'Head account is required' })
  headAccountId: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  status?: string;
}

export class UpdateSubHeadDto {
  @IsString()
  @IsOptional()
  @MaxLength(20)
  code?: string;

  @IsString()
  @IsOptional()
  @MaxLength(150)
  name?: string;

  @IsString()
  @IsOptional()
  headAccountId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  status?: string;
}

export class CreateMainAccountDto {
  @IsString()
  @IsNotEmpty({ message: 'Account code is required' })
  @MaxLength(20)
  code: string;

  @IsString()
  @IsNotEmpty({ message: 'Account name is required' })
  @MaxLength(150)
  name: string;

  @IsString()
  @IsOptional()
  subHeadId?: string;

  @IsEnum(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'], {
    message: 'Account type must be ASSET, LIABILITY, EQUITY, REVENUE or EXPENSE',
  })
  @IsNotEmpty({ message: 'Account type is required' })
  accountType: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsNumber()
  openingBalance?: number;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  status?: string;
}

export class UpdateMainAccountDto {
  @IsString()
  @IsOptional()
  @MaxLength(20)
  code?: string;

  @IsString()
  @IsOptional()
  @MaxLength(150)
  name?: string;

  @IsString()
  @IsOptional()
  subHeadId?: string;

  @IsEnum(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'])
  @IsOptional()
  accountType?: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsNumber()
  openingBalance?: number;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  status?: string;
}