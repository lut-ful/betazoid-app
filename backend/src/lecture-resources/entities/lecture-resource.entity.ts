import {
    Column,
    CreateDateColumn,
    Entity,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';
import { Lecture } from '../../lectures/entities/lecture.entity';

export const ResourceType = {
    FILE: 'file',
    LINK: 'link',
} as const;
export type ResourceType = (typeof ResourceType)[keyof typeof ResourceType];

@Entity('lecture_resources')
export class LectureResource {
    @PrimaryGeneratedColumn('uuid')
    resource_id!: string;

    @Column({ length: 200 })
    title!: string;

    @Column({ type: 'enum', enum: Object.values(ResourceType) })
    resource_type!: ResourceType;

    @Column({ type: 'varchar' })
    url!: string;

    @Column({ type: 'varchar', nullable: true })
    original_filename!: string | null;

    @ManyToOne(() => Lecture, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'lecture_id' })
    lecture!: Lecture;

    @CreateDateColumn()
    created_at!: Date;

    @UpdateDateColumn()
    updated_at!: Date;
}
