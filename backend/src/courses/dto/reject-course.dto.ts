import { IsNotEmpty, IsString } from 'class-validator';

export class RejectCourseDto {
    @IsString()
    @IsNotEmpty()
    reason!: string;
}
