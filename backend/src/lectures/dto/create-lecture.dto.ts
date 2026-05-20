import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';
import { LectureContentType } from '../entities/lecture.entity';

export class CreateLectureDto {
    @IsString()
    @MinLength(1)
    @MaxLength(200)
    title!: string;

    @IsEnum(Object.values(LectureContentType))
    content_type!: LectureContentType;
}
