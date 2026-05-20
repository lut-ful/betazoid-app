'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import api from '@/lib/axios';
import { useAuthStore } from '@/store/auth.store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const loginSchema = z.object({
    email: z.email('Invalid email'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function LoginPage() {
    const [errorMessage, setErrorMessage] = useState('');
    const router = useRouter();
    const setAccessToken = useAuthStore((state) => state.setAccessToken);

    const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginFormData>({
        resolver: zodResolver(loginSchema),
    });

    const onSubmit = async (data: LoginFormData) => {
        setErrorMessage('');
        try {
            const response = await api.post('/auth/login', data);
            setAccessToken(response.data.access_token);
            router.push('/');
        } catch (err: any) {
            const msg = err.response?.data?.message || 'Something went wrong.';
            setErrorMessage(Array.isArray(msg) ? msg.join(', ') : msg);
        }
    };

    return (
        <div className="max-w-md mx-auto px-4 py-12">
            <Card>
                <CardHeader>
                    <CardTitle>Sign In</CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                        <div className="space-y-1">
                            <Label htmlFor="email">Email</Label>
                            <Input id="email" type="email" {...register('email')} />
                            {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
                        </div>

                        <div className="space-y-1">
                            <Label htmlFor="password">Password</Label>
                            <Input id="password" type="password" {...register('password')} />
                            {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
                        </div>

                        {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}

                        <Button type="submit" className="w-full" disabled={isSubmitting}>
                            {isSubmitting ? 'Signing in...' : 'Sign In'}
                        </Button>

                        <div className="flex justify-between text-sm">
                            <Link href="/forgot-password">Forgot password?</Link>
                            <Link href="/register">Create an account</Link>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
