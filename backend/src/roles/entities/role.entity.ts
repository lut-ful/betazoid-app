import {
    Column,
    CreateDateColumn,
    Entity,
    OneToMany,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';
import { UserRole } from './user-role.entity';

@Entity('roles')
export class Role {
    @PrimaryGeneratedColumn('uuid')
    role_id!: string;

    @Column({ unique: true, length: 100 })
    name!: string;

    @Column({ type: 'text', nullable: true })
    description!: string | null;

    @OneToMany(() => UserRole, (ur) => ur.role)
    userRoles!: UserRole[];

    @CreateDateColumn()
    created_at!: Date;

    @UpdateDateColumn()
    updated_at!: Date;
}
