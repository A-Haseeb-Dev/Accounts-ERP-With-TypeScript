import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateBankAccountDto {
  @IsString()
  @MaxLength(150)
  name: string;

  @IsString()
  @IsOptional()
  @MaxLength(150)
  accountTitle?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  accountNumber?: string;

  @IsString()
  @IsOptional()
  mainAccountId?: string;

  @IsString()
  @IsOptional()
  status?: string;
}

export class UpdateBankAccountDto {
  @IsString()
  @IsOptional()
  @MaxLength(150)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(150)
  accountTitle?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  accountNumber?: string;

  @IsString()
  @IsOptional()
  mainAccountId?: string;

  @IsString()
  @IsOptional()
  status?: string;
}