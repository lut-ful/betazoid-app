import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    Patch,
    Post,
    Request,
    UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LecturesService } from './lectures.service';
import { CreateLectureDto } from './dto/create-lecture.dto';
import { UpdateLectureDto } from './dto/update-lecture.dto';
import { ReorderLecturesDto } from './dto/reorder-lectures.dto';

@Controller('courses/:courseId/sections/:sectionId/lectures')
@UseGuards(JwtAuthGuard)
export class LecturesController {
    constructor(private readonly lecturesService: LecturesService) {}

    @Post()
    @HttpCode(HttpStatus.CREATED)
    create(
        @Param('courseId') courseId: string,
        @Param('sectionId') sectionId: string,
        @Body() dto: CreateLectureDto,
        @Request() req: any,
    ) {
        return this.lecturesService.create(courseId, sectionId, dto, req.user.userId);
    }

    @Get()
    findAll(
        @Param('courseId') courseId: string,
        @Param('sectionId') sectionId: string,
        @Request() req: any,
    ) {
        return this.lecturesService.findBySection(courseId, sectionId, req.user.userId);
    }

    @Post('reorder')
    @HttpCode(HttpStatus.OK)
    reorder(
        @Param('courseId') courseId: string,
        @Param('sectionId') sectionId: string,
        @Body() dto: ReorderLecturesDto,
        @Request() req: any,
    ) {
        return this.lecturesService.reorder(courseId, sectionId, dto, req.user.userId);
    }

    @Patch(':lectureId')
    update(
        @Param('courseId') courseId: string,
        @Param('sectionId') sectionId: string,
        @Param('lectureId') lectureId: string,
        @Body() dto: UpdateLectureDto,
        @Request() req: any,
    ) {
        return this.lecturesService.update(courseId, sectionId, lectureId, dto, req.user.userId);
    }

    @Delete(':lectureId')
    @HttpCode(HttpStatus.NO_CONTENT)
    remove(
        @Param('courseId') courseId: string,
        @Param('sectionId') sectionId: string,
        @Param('lectureId') lectureId: string,
        @Request() req: any,
    ) {
        return this.lecturesService.remove(courseId, sectionId, lectureId, req.user.userId);
    }
}
