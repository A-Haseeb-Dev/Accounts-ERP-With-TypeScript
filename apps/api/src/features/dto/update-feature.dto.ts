import { IsArray, IsBoolean, IsString } from 'class-validator';

export class UpdateFeatureDto {
  @IsString()
  code!: string;

  @IsBoolean()
  enabled!: boolean;
}

export class UpdateFeaturesDto {
  @IsArray()
  @IsString({ each: true })
  codes!: string[];

  @IsBoolean()
  enabled!: boolean;
}
