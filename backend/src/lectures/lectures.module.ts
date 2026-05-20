import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LecturesController } from './lectures.controller';
import { LecturesService } from './lectures.service';
import { Lecture } from './entities/lecture.entity';
import { Section } from '../sections/entities/section.entity';

@Module({
    imports: [TypeOrmModule.forFeature([Lecture, Section])],
    controllers: [LecturesController],
    providers: [LecturesService],
    exports: [LecturesService],
})
export class LecturesModule {}
