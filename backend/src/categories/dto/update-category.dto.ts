import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';

export class UpdateCategoryDto {
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    name?: string;

    // null = remove the parent (make top-level); undefined = leave unchanged; string = set new parent
    @IsOptional()
    @ValidateIf((_, val) => val !== null)
    @IsUUID()
    parentCategoryId?: string | null;
}
