import {
    Column,
    CreateDateColumn,
    Entity,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';

@Entity('users')
export class User {
    @PrimaryGeneratedColumn('uuid')
    user_id: string;

    @Column({ length: 100 })
    full_name: string;

    @Column({ unique: true })
    email: string;

    @Column({ unique: true })
    gmail: string;

    @Column()
    password_hash: string;

    @Column({ default: false })
    is_email_verified: boolean;

    @Column({ nullable: true })
    email_verification_token: string;

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;
}
