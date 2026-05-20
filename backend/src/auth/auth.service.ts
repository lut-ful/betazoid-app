import { LoginDto } from './dto/login.dto';
import {
    ConflictException,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../users/entities/user.entity';
import { MailService } from '../mail/mail.service';
import { RegisterDto } from './dto/register.dto';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
    constructor(
        @InjectRepository(User)
        private userRepository: Repository<User>,
        @InjectDataSource()
        private dataSource: DataSource,
        private mailService: MailService,
        private jwtService: JwtService
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

    private hashToken(token: string): string {
        return crypto.createHash('sha256').update(token).digest('hex');
    }

    private async generateTokens(user: User): Promise<{ accessToken: string; refreshToken: string }> {
        const accessToken = this.jwtService.sign({ sub: user.user_id, email: user.email });

        const refreshToken = crypto.randomUUID();
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        await this.userRepository.update(user.user_id, {
            refresh_token_hash: this.hashToken(refreshToken),
            refresh_token_expires_at: expiresAt,
        });

        return { accessToken, refreshToken };
    }

    async login(dto: LoginDto): Promise<{ accessToken: string; refreshToken: string }> {
        const user = await this.userRepository.findOne({ where: { email: dto.email } });
        if (!user) {
            throw new UnauthorizedException('Invalid credentials');
        }

        const passwordMatches = await bcrypt.compare(dto.password, user.password_hash);
        if (!passwordMatches) {
            throw new UnauthorizedException('Invalid credentials');
        }

        return this.generateTokens(user);
    }

    async refresh(incomingToken: string): Promise<{ accessToken: string; refreshToken: string }> {
        const tokenHash = this.hashToken(incomingToken);

        const user = await this.userRepository.findOne({
            where: { refresh_token_hash: tokenHash },
        });

        if (!user || !user.refresh_token_expires_at || user.refresh_token_expires_at < new Date()) {
            throw new UnauthorizedException('Invalid or expired refresh token');
        }

        return this.generateTokens(user);
    }
    
    async logout(userId: string): Promise<{ message: string }> {
        await this.userRepository.update(userId, {
            refresh_token_hash: null,
            refresh_token_expires_at: null,
        });
        return { message: 'Logged out successfully' };
    }


}
