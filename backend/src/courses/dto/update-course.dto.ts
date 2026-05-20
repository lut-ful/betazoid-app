import {
    IsEnum,
    IsNumber,
    IsOptional,
    IsString,
    IsUUID,
    MaxLength,
    Min,
} from 'class-validator';
import { CourseLevel } from '../entities/course.entity';

export class UpdateCourseDto {
    @IsString()
    @IsOptional()
    @MaxLength(200)
    title?: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsNumber()
    @IsOptional()
    @Min(0)
    price?: number;

    @IsString()
    @IsOptional()
    thumbnail_url?: string;

    @IsString()
    @IsOptional()
    @MaxLength(100)
    language?: string;

    @IsEnum(CourseLevel)
    @IsOptional()
    level?: CourseLevel;

    @IsUUID()
    @IsOptional()
    categoryId?: string;
}
