import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateRoleDto {
  @IsString()
  @IsNotEmpty({ message: 'Role name is required' })
  @MaxLength(100)
  name: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @IsBoolean()
  @IsOptional()
  isSystem?: boolean;

  /** Protected roles can only be created, edited, deleted and assigned by a Developer or Super Admin. */
  @IsBoolean()
  @IsOptional()
  protected?: boolean;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  permissionIds?: string[];
}

export class UpdateRoleDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  /** Protected roles can only be created, edited, deleted and assigned by a Developer or Super Admin. */
  @IsBoolean()
  @IsOptional()
  protected?: boolean;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  permissionIds?: string[];
}