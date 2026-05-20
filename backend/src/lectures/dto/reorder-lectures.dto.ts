import { IsArray, IsUUID } from 'class-validator';

export class ReorderLecturesDto {
    @IsArray()
    @IsUUID(undefined, { each: true })
    orderedIds!: string[];
}
