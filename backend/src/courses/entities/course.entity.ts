import {
    Column,
    CreateDateColumn,
    Entity,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Category } from '../../categories/entities/category.entity';

export const CourseStatus = {
    DRAFT: 'draft',
    PENDING: 'pending',
    PUBLISHED: 'published',
    REJECTED: 'rejected',
} as const;
export type CourseStatus = (typeof CourseStatus)[keyof typeof CourseStatus];

export const CourseLevel = {
    BEGINNER: 'beginner',
    INTERMEDIATE: 'intermediate',
    ADVANCED: 'advanced',
} as const;
export type CourseLevel = (typeof CourseLevel)[keyof typeof CourseLevel];

@Entity('courses')
export class Course {
    @PrimaryGeneratedColumn('uuid')
    course_id!: string;

    @Column({ length: 200 })
    title!: string;

    @Column({ type: 'text' })
    description!: string;

    @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
    price!: number;

    @Column({ type: 'varchar', nullable: true })
    thumbnail_url!: string | null;

    @Column({ length: 100 })
    language!: string;

    @Column({ type: 'enum', enum: Object.values(CourseLevel) })
    level!: CourseLevel;

    @Column({
        type: 'enum',
        enum: Object.values(CourseStatus),
        default: CourseStatus.DRAFT,
    })
    status!: CourseStatus;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'instructor_id' })
    instructor!: User;

    @ManyToOne(() => Category, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'category_id' })
    category!: Category | null;

    @CreateDateColumn()
    created_at!: Date;

    @UpdateDateColumn()
    updated_at!: Date;
}
