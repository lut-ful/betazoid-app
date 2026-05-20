import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoursesController } from './courses.controller';
import { CoursesService } from './courses.service';
import { Course } from './entities/course.entity';
import { Category } from '../categories/entities/category.entity';
import { Section } from '../sections/entities/section.entity';
import { Lecture } from '../lectures/entities/lecture.entity';
import { MailModule } from '../mail/mail.module';

@Module({
    imports: [TypeOrmModule.forFeature([Course, Category, Section, Lecture]), MailModule],
    controllers: [CoursesController],
    providers: [CoursesService],
    exports: [CoursesService],
})
export class CoursesModule {}
