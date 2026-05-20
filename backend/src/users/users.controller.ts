import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Patch, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Controller('users')
export class UsersController {
    constructor(private usersService: UsersService) {}

    @Get('me')
    @UseGuards(JwtAuthGuard)
    getProfile(@Req() req: Request & { user: { userId: string } }) {
        return this.usersService.getProfile(req.user.userId);
    }

    @Patch('me')
    @HttpCode(HttpStatus.OK)
    @UseGuards(JwtAuthGuard)
    updateProfile(
        @Req() req: Request & { user: { userId: string } },
        @Body() dto: UpdateProfileDto,
    ) {
        return this.usersService.updateProfile(req.user.userId, dto);
    }

    @Delete('me')
    @HttpCode(HttpStatus.NO_CONTENT)
    @UseGuards(JwtAuthGuard)
    deleteAccount(@Req() req: Request & { user: { userId: string } }) {
        return this.usersService.deleteAccount(req.user.userId);
    }
}
