import {
    IsEnum,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    IsUUID,
    MaxLength,
    Min,
} from 'class-validator';
import { CourseLevel } from '../entities/course.entity';

export class CreateCourseDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(200)
    title!: string;

    @IsString()
    @IsNotEmpty()
    description!: string;

    @IsNumber()
    @Min(0)
    price!: number;

    @IsString()
    @IsOptional()
    thumbnail_url?: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    language!: string;

    @IsEnum(CourseLevel)
    level!: CourseLevel;

    @IsUUID()
    @IsOptional()
    categoryId?: string;
}
