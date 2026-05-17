import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
    private transporter: nodemailer.Transporter;

    constructor(private config: ConfigService) {
        this.transporter = nodemailer.createTransport({
            host: config.get('MAIL_HOST'),
            port: config.get<number>('MAIL_PORT'),
            auth: {
                user: config.get('MAIL_USER'),
                pass: config.get('MAIL_PASS'),
            },
        });
    }

    async sendRegistrationConfirmation(to: string, name: string): Promise<void> {
        await this.transporter.sendMail({
            from: this.config.get('MAIL_FROM'),
            to,
            subject: 'Welcome to Betazoid!',
            html: `
        <h2>Hi ${name},</h2>
        <p>Your account has been created successfully. Welcome to Betazoid!</p>`,
        });
    }
}
