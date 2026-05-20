import {
    Column,
    CreateDateColumn,
    Entity,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';
import { Section } from '../../sections/entities/section.entity';

export const LectureContentType = {
    VIDEO: 'video',
    ARTICLE: 'article',
    QUIZ: 'quiz',
} as const;
export type LectureContentType = (typeof LectureContentType)[keyof typeof LectureContentType];

@Entity('lectures')
export class Lecture {
    @PrimaryGeneratedColumn('uuid')
    lecture_id!: string;

    @Column({ length: 200 })
    title!: string;

    @Column({ type: 'enum', enum: Object.values(LectureContentType) })
    content_type!: LectureContentType;

    @Column({ type: 'int', default: 0 })
    order!: number;

    @Column({ type: 'boolean', default: false })
    is_free_preview!: boolean;

    @ManyToOne(() => Section, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'section_id' })
    section!: Section;

    @CreateDateColumn()
    created_at!: Date;

    @UpdateDateColumn()
    updated_at!: Date;
}
