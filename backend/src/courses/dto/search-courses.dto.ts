import { IsIn, IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';
import { CourseLevel } from '../entities/course.entity';

export class SearchCoursesDto {
    @IsOptional()
    @IsString()
    q?: string;

    @IsOptional()
    @IsUUID()
    category?: string;

    @IsOptional()
    @IsIn(Object.values(CourseLevel))
    level?: string;

    @IsOptional()
    @IsString()
    language?: string;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    minPrice?: number;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    maxPrice?: number;
}
