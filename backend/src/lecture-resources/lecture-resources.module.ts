import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LectureResourcesController } from './lecture-resources.controller';
import { LectureResourcesService } from './lecture-resources.service';
import { LectureResource } from './entities/lecture-resource.entity';
import { Lecture } from '../lectures/entities/lecture.entity';
import { Section } from '../sections/entities/section.entity';

@Module({
    imports: [TypeOrmModule.forFeature([LectureResource, Lecture, Section])],
    controllers: [LectureResourcesController],
    providers: [LectureResourcesService],
})
export class LectureResourcesModule {}
