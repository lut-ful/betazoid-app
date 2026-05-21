import {
    BadRequestException,
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    Post,
    Request,
    UploadedFile,
    UseGuards,
    UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LectureResourcesService } from './lecture-resources.service';
import { AddLinkDto } from './dto/add-link.dto';

const resourceStorage = diskStorage({
    destination: join(process.cwd(), 'uploads', 'resources'),
    filename: (_req, file, cb) => {
        const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        cb(null, `${unique}${extname(file.originalname)}`);
    },
});

const allowedExtensions = ['.pdf', '.zip', '.ppt', '.pptx', '.doc', '.docx', '.xls', '.xlsx'];

@Controller('courses/:courseId/sections/:sectionId/lectures/:lectureId/resources')
@UseGuards(JwtAuthGuard)
export class LectureResourcesController {
    constructor(private readonly service: LectureResourcesService) {}

    @Post('link')
    @HttpCode(HttpStatus.CREATED)
    addLink(
        @Param('courseId') courseId: string,
        @Param('sectionId') sectionId: string,
        @Param('lectureId') lectureId: string,
        @Body() dto: AddLinkDto,
        @Request() req: any,
    ) {
        return this.service.addLink(courseId, sectionId, lectureId, dto, req.user.userId);
    }

    @Post('file')
    @HttpCode(HttpStatus.CREATED)
    @UseInterceptors(
        FileInterceptor('file', {
            storage: resourceStorage,
            fileFilter: (_req, file, cb) => {
                if (allowedExtensions.includes(extname(file.originalname).toLowerCase())) {
                    cb(null, true);
                } else {
                    cb(
                        new BadRequestException(
                            `File type not allowed. Allowed: ${allowedExtensions.join(', ')}`,
                        ),
                        false,
                    );
                }
            },
            limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
        }),
    )
    addFile(
        @Param('courseId') courseId: string,
        @Param('sectionId') sectionId: string,
        @Param('lectureId') lectureId: string,
        @Body('title') title: string,
        @UploadedFile() file: Express.Multer.File,
        @Request() req: any,
    ) {
        if (!file) throw new BadRequestException('File is required');
        if (!title?.trim()) throw new BadRequestException('Title is required');
        return this.service.addFile(
            courseId,
            sectionId,
            lectureId,
            file,
            title.trim(),
            req.user.userId,
        );
    }

    @Get()
    findAll(
        @Param('courseId') courseId: string,
        @Param('sectionId') sectionId: string,
        @Param('lectureId') lectureId: string,
        @Request() req: any,
    ) {
        return this.service.findByLecture(courseId, sectionId, lectureId, req.user.userId);
    }

    @Delete(':resourceId')
    @HttpCode(HttpStatus.NO_CONTENT)
    remove(
        @Param('courseId') courseId: string,
        @Param('sectionId') sectionId: string,
        @Param('lectureId') lectureId: string,
        @Param('resourceId') resourceId: string,
        @Request() req: any,
    ) {
        return this.service.remove(courseId, sectionId, lectureId, resourceId, req.user.userId);
    }
}
