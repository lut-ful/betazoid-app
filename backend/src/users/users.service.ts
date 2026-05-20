import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class UsersService {
    constructor(
        @InjectRepository(User)
        private usersRepository: Repository<User>,
    ) {}

    async getProfile(userId: string): Promise<Omit<User, 'password_hash' | 'refresh_token_hash' | 'refresh_token_expires_at' | 'reset_password_token' | 'reset_password_expires_at' | 'email_verification_token'>> {
        const user = await this.usersRepository.findOne({ where: { user_id: userId } });
        if (!user) throw new NotFoundException('User not found');

        const {
            password_hash,
            refresh_token_hash,
            refresh_token_expires_at,
            reset_password_token,
            reset_password_expires_at,
            email_verification_token,
            ...profile
        } = user;

        return profile;
    }

    async updateProfile(userId: string, dto: UpdateProfileDto): Promise<ReturnType<UsersService['getProfile']>> {
        const user = await this.usersRepository.findOne({ where: { user_id: userId } });
        if (!user) throw new NotFoundException('User not found');

        if (dto.full_name !== undefined) user.full_name = dto.full_name;
        if (dto.bio !== undefined) user.bio = dto.bio;
        if (dto.profile_photo_url !== undefined) user.profile_photo_url = dto.profile_photo_url;

        await this.usersRepository.save(user);
        return this.getProfile(userId);
    }

    async deleteAccount(userId: string): Promise<void> {
        const user = await this.usersRepository.findOne({ where: { user_id: userId } });
        if (!user) throw new NotFoundException('User not found');
        await this.usersRepository.remove(user);
    }
}
