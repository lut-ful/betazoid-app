'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import api from '@/lib/axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const registerSchema = z.object({
    full_name: z.string().min(1, 'Full name is required').max(100),
    email: z.email('Invalid email'),
    gmail: z
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
    const router = useRouter();

    const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<RegisterFormData>({
        resolver: zodResolver(registerSchema),
    });

    const onSubmit = async (data: RegisterFormData) => {
        setSuccessMessage('');
        setErrorMessage('');
        try {
            const response = await api.post('/auth/register', data);
            setSuccessMessage(response.data.message);
            setTimeout(() => router.push('/login'), 2000);
        } catch (err: any) {
            const msg = err.response?.data?.message || 'Something went wrong. Try again.';
            setErrorMessage(Array.isArray(msg) ? msg.join(', ') : msg);
        }
    };

    return (
        <div className="max-w-md mx-auto px-4 py-12">
            <Card>
                <CardHeader>
                    <CardTitle>Create an Account</CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                        <div className="space-y-1">
                            <Label htmlFor="full_name">Full Name</Label>
                            <Input id="full_name" {...register('full_name')} />
                            {errors.full_name && <p className="text-sm text-destructive">{errors.full_name.message}</p>}
                        </div>

                        <div className="space-y-1">
                            <Label htmlFor="email">Email</Label>
                            <Input id="email" type="email" {...register('email')} />
                            {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
                        </div>

                        <div className="space-y-1">
                            <Label htmlFor="gmail">Gmail (used for course access)</Label>
                            <Input id="gmail" type="email" {...register('gmail')} />
                            {errors.gmail && <p className="text-sm text-destructive">{errors.gmail.message}</p>}
                            <p className="text-xs text-muted-foreground">
                                Cannot be changed after registration — controls your YouTube course access.
                            </p>
                        </div>

                        <div className="space-y-1">
                            <Label htmlFor="password">Password</Label>
                            <Input id="password" type="password" {...register('password')} />
                            {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
                        </div>

                        {successMessage && <p className="text-sm">{successMessage} Redirecting to login...</p>}
                        {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}

                        <Button type="submit" className="w-full" disabled={isSubmitting || !!successMessage}>
                            {isSubmitting ? 'Registering...' : 'Register'}
                        </Button>

                        <p className="text-sm text-center">
                            Already have an account?{' '}
                            <Link href="/login">Sign in</Link>
                        </p>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
