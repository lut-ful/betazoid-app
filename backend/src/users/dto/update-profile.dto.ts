import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class UpdateProfileDto {
    @IsOptional()
    @IsString()
    @MaxLength(100)
    full_name?: string;

    @IsOptional()
    @IsString()
    @MaxLength(500)
    bio?: string;

    @IsOptional()
    @IsUrl()
    profile_photo_url?: string;
}
