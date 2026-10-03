import { IsNotEmpty, IsOptional, IsString, MaxLength, IsEnum, IsNumber, IsDateString } from 'class-validator';

export type Status = 'active' | 'inactive';

export const statusEnum = () => ['active', 'inactive'];

/**
 * Codes are assigned by the server from the chart scheme
 * (`A1` > `A1-01` > `A1-01-0001`) and are deliberately absent from every DTO
 * here. `ValidationPipe` runs with `whitelist: true`, so a `code` sent by a
 * client is stripped rather than applied — there is no path for a user to type
 * one, and a stored code can never contradict the hierarchy it sits in.
 */
export class CreateHeadAccountDto {
  @IsEnum(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'], {
    message: 'Account type must be ASSET, LIABILITY, EQUITY, REVENUE or EXPENSE',
  })
  accountType: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';

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
  @IsNotEmpty({ message: 'Account name is required' })
  @MaxLength(150)
  name: string;

  @IsString()
  @IsNotEmpty({ message: 'Sub head is required' })
  subHeadId: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsNumber()
  openingBalance?: number;

  @IsEnum(['DR', 'CR'], { message: 'Opening balance side must be DR or CR' })
  @IsOptional()
  openingBalanceType?: 'DR' | 'CR';

  @IsDateString()
  @IsOptional()
  openingDate?: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  status?: string;
}

export class UpdateMainAccountDto {
  @IsString()
  @IsOptional()
  @MaxLength(150)
  name?: string;

  @IsString()
  @IsOptional()
  subHeadId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsNumber()
  openingBalance?: number;

  @IsEnum(['DR', 'CR'])
  @IsOptional()
  openingBalanceType?: 'DR' | 'CR';

  @IsDateString()
  @IsOptional()
  openingDate?: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  status?: string;
}