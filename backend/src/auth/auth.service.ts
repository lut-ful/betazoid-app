import {
    ConflictException,
    Injectable,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../users/entities/user.entity';
import { MailService } from '../mail/mail.service';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
    constructor(
        @InjectRepository(User)
        private userRepository: Repository<User>,
        @InjectDataSource()
        private dataSource: DataSource,
        private mailService: MailService,
    ) { }

    async register(dto: RegisterDto): Promise<{ message: string }> {
        const existingUser = await this.userRepository.findOne({
            where: { email: dto.email },
        });
        if (existingUser) {
            throw new ConflictException('Email is already registered');
        }

        const existingGmail = await this.userRepository.findOne({
            where: { gmail: dto.gmail },
        });
        if (existingGmail) {
            throw new ConflictException('Gmail is already registered');
        }

        const password_hash = await bcrypt.hash(dto.password, 10);

        await this.dataSource.transaction(async (manager) => {
            const user = manager.create(User, {
                full_name: dto.full_name,
                email: dto.email,
                gmail: dto.gmail,
                password_hash,
            });
            await manager.save(user);
            await this.mailService.sendRegistrationConfirmation(
                user.email,
                user.full_name,
            );
        });

        return { message: 'Registration successful. Check your email.' };
    }
}
