import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateRoleDto {
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    name?: string;

    @IsOptional()
    @IsString()
    description?: string;
}
