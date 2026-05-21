import { IsNotEmpty, IsString, IsUrl, MaxLength } from 'class-validator';

export class AddLinkDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(200)
    title!: string;

    @IsUrl({}, { message: 'url must be a valid URL including http:// or https://' })
    url!: string;
}
