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

    async sendPasswordResetEmail(to: string, name: string, resetUrl: string): Promise<void> {
        await this.transporter.sendMail({
            from: this.config.get('MAIL_FROM'),
            to,
            subject: 'Reset your Betazoid password',
            html: `
    <h2>Hi ${name},</h2>
    <p>Click the link below to reset your password. This link expires in 30 minutes.</p>
    <a href="${resetUrl}">Reset Password</a>
    <p>If you did not request a password reset, ignore this email.</p>`,
        });
    }

    async sendCourseSubmittedNotification(
        adminEmail: string,
        instructorName: string,
        courseTitle: string,
        courseId: string,
    ): Promise<void> {
        await this.transporter.sendMail({
            from: this.config.get('MAIL_FROM'),
            to: adminEmail,
            subject: `Course submitted for review: ${courseTitle}`,
            html: `
    <h2>New course pending review</h2>
    <p><strong>Course:</strong> ${courseTitle}</p>
    <p><strong>Instructor:</strong> ${instructorName}</p>
    <p><strong>Course ID:</strong> ${courseId}</p>
    <p>Please log in to review and approve or reject this course.</p>`,
        });
    }

}
