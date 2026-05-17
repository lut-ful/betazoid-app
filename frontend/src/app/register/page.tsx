'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import api from '@/lib/axios';
import { useState } from 'react';

const registerSchema = z.object({
    full_name: z.string().min(1, 'Full name is required').max(100),
    email: z.string().email('Invalid email'),
    gmail: z
        .string()
        .email('Invalid Gmail')
        .refine((val) => val.endsWith('@gmail.com'), {
            message: 'Must be a Gmail address',
        }),
    password: z.string().min(8, 'Password must be at least 8 characters'),
});

type RegisterFormData = z.infer<typeof registerSchema>;

export default function RegisterPage() {
    const [successMessage, setSuccessMessage] = useState('');
    const [errorMessage, setErrorMessage] = useState('');

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<RegisterFormData>({
        resolver: zodResolver(registerSchema),
    });

    const onSubmit = async (data: RegisterFormData) => {
        setSuccessMessage('');
        setErrorMessage('');
        try {
            const response = await api.post('/auth/register', data);
            setSuccessMessage(response.data.message);
        } catch (err: any) {
            const msg =
                err.response?.data?.message || 'Something went wrong. Try again.';
            setErrorMessage(Array.isArray(msg) ? msg.join(', ') : msg);
        }
    };

    return (
        <div>
            <h1>Create an Account</h1>
            <form onSubmit={handleSubmit(onSubmit)}>
                <div>
                    <label>Full Name</label>
                    <input {...register('full_name')} />
                    {errors.full_name && <p>{errors.full_name.message}</p>}
                </div>
                <div>
                    <label>Email</label>
                    <input type="email" {...register('email')} />
                    {errors.email && <p>{errors.email.message}</p>}
                </div>
                <div>
                    <label>Gmail (used for course access)</label>
                    <input type="email" {...register('gmail')} />
                    {errors.gmail && <p>{errors.gmail.message}</p>}
                </div>
                <div>
                    <label>Password</label>
                    <input type="password" {...register('password')} />
                    {errors.password && <p>{errors.password.message}</p>}
                </div>
                {successMessage && <p style={{ color: 'green' }}>{successMessage}</p>}
                {errorMessage && <p style={{ color: 'red' }}>{errorMessage}</p>}
                <button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? 'Registering...' : 'Register'}
                </button>
            </form>
        </div>
    );
}
