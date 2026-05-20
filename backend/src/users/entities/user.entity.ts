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

    @Column({ type: 'varchar', nullable: true })
    email_verification_token: string | null;

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;

    @Column({ type: 'varchar', nullable: true })
    refresh_token_hash: string | null;

    @Column({ type: 'timestamptz', nullable: true })
    refresh_token_expires_at: Date | null;

    @Column({ type: 'varchar', nullable: true })
    reset_password_token: string | null;

    @Column({ type: 'timestamptz', nullable: true })
    reset_password_expires_at: Date | null;

}
