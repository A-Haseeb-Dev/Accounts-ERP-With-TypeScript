import { IsBoolean, IsString } from 'class-validator';

export class UpdateFeatureDto {
  @IsString()
  code!: string;

  @IsBoolean()
  enabled!: boolean;
}