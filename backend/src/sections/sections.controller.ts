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
import { SectionsService } from './sections.service';
import { CreateSectionDto } from './dto/create-section.dto';
import { UpdateSectionDto } from './dto/update-section.dto';
import { ReorderSectionsDto } from './dto/reorder-sections.dto';

@Controller('courses/:courseId/sections')
@UseGuards(JwtAuthGuard)
export class SectionsController {
    constructor(private readonly sectionsService: SectionsService) {}

    @Post()
    @HttpCode(HttpStatus.CREATED)
    create(
        @Param('courseId') courseId: string,
        @Body() dto: CreateSectionDto,
        @Request() req: any,
    ) {
        return this.sectionsService.create(courseId, dto, req.user.userId);
    }

    @Get()
    findAll(@Param('courseId') courseId: string, @Request() req: any) {
        return this.sectionsService.findByCourse(courseId, req.user.userId);
    }

    @Post('reorder')
    @HttpCode(HttpStatus.OK)
    reorder(
        @Param('courseId') courseId: string,
        @Body() dto: ReorderSectionsDto,
        @Request() req: any,
    ) {
        return this.sectionsService.reorder(courseId, dto, req.user.userId);
    }

    @Patch(':sectionId')
    update(
        @Param('courseId') courseId: string,
        @Param('sectionId') sectionId: string,
        @Body() dto: UpdateSectionDto,
        @Request() req: any,
    ) {
        return this.sectionsService.update(courseId, sectionId, dto, req.user.userId);
    }

    @Delete(':sectionId')
    @HttpCode(HttpStatus.NO_CONTENT)
    remove(
        @Param('courseId') courseId: string,
        @Param('sectionId') sectionId: string,
        @Request() req: any,
    ) {
        return this.sectionsService.remove(courseId, sectionId, req.user.userId);
    }
}
