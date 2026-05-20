import {
    Body,
    Controller,
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
import { CoursesService } from './courses.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';

@Controller('courses')
@UseGuards(JwtAuthGuard)
export class CoursesController {
    constructor(private readonly coursesService: CoursesService) {}

    @Post()
    @HttpCode(HttpStatus.CREATED)
    create(@Body() dto: CreateCourseDto, @Request() req: any) {
        return this.coursesService.create(dto, req.user.userId);
    }

    @Get()
    findMyCourses(@Request() req: any) {
        return this.coursesService.findByInstructor(req.user.userId);
    }

    @Get(':id')
    findOne(@Param('id') id: string, @Request() req: any) {
        return this.coursesService.findOne(id, req.user.userId);
    }

    @Patch(':id')
    update(
        @Param('id') id: string,
        @Body() dto: UpdateCourseDto,
        @Request() req: any,
    ) {
        return this.coursesService.update(id, dto, req.user.userId);
    }

    @Post(':id/submit')
    @HttpCode(HttpStatus.OK)
    submit(@Param('id') id: string, @Request() req: any) {
        return this.coursesService.submitForReview(id, req.user.userId);
    }
}
