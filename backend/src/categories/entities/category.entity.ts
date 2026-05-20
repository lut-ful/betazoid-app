import {
    Column,
    CreateDateColumn,
    Entity,
    JoinColumn,
    ManyToOne,
    OneToMany,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';

@Entity('categories')
export class Category {
    @PrimaryGeneratedColumn('uuid')
    category_id!: string;

    @Column({ length: 100, unique: true })
    name!: string;

    @ManyToOne(() => Category, (cat) => cat.children, { nullable: true, onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'parent_category_id' })
    parent!: Category | null;

    @OneToMany(() => Category, (cat) => cat.parent)
    children!: Category[];

    @CreateDateColumn()
    created_at!: Date;

    @UpdateDateColumn()
    updated_at!: Date;
}
