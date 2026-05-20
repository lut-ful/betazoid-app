import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { LectureContentType } from '../entities/lecture.entity';

export class UpdateLectureDto {
    @IsOptional()
    @IsString()
    @MinLength(1)
    @MaxLength(200)
    title?: string;

    @IsOptional()
    @IsEnum(Object.values(LectureContentType))
    content_type?: LectureContentType;

    @IsOptional()
    @IsBoolean()
    is_free_preview?: boolean;
}
