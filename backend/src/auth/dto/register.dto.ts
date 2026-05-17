import {
    IsEmail,
    IsNotEmpty,
    IsString,
    Matches,
    MaxLength,
    MinLength,
} from 'class-validator';

export class RegisterDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    full_name: string;

    @IsEmail()
    email: string;

    @IsEmail()
    @Matches(/@gmail\.com$/, { message: 'gmail must be a valid Gmail address' })
    gmail: string;

    @IsString()
    @MinLength(8)
    password: string;
}
