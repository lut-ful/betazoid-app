'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import api from '@/lib/axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const schema = z
    .object({
        new_password: z.string().min(8, 'Password must be at least 8 characters'),
        confirm_password: z.string(),
    })
    .refine((data) => data.new_password === data.confirm_password, {
        message: 'Passwords do not match',
        path: ['confirm_password'],
    });

type FormData = z.infer<typeof schema>;

function ResetPasswordForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const token = searchParams.get('token');

    const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
        resolver: zodResolver(schema),
    });

    const mutation = useMutation({
        mutationFn: (data: FormData) =>
            api.post('/auth/reset-password', {
                token,
                new_password: data.new_password,
            }).then((res) => res.data),
        onSuccess: () => router.push('/login'),
    });

    const onSubmit = (data: FormData) => mutation.mutate(data);

    if (!token) {
        return (
            <div className="space-y-3">
                <p className="text-sm text-destructive">Invalid or missing reset link.</p>
                <Link href="/forgot-password" className="text-sm">Request a new reset link</Link>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1">
                <Label htmlFor="new_password">New Password</Label>
                <Input id="new_password" type="password" {...register('new_password')} />
                {errors.new_password && <p className="text-sm text-destructive">{errors.new_password.message}</p>}
            </div>

            <div className="space-y-1">
                <Label htmlFor="confirm_password">Confirm Password</Label>
                <Input id="confirm_password" type="password" {...register('confirm_password')} />
                {errors.confirm_password && <p className="text-sm text-destructive">{errors.confirm_password.message}</p>}
            </div>

            {mutation.isError && <p className="text-sm text-destructive">Invalid or expired reset link.</p>}

            <Button type="submit" className="w-full" disabled={mutation.isPending}>
                {mutation.isPending ? 'Updating...' : 'Reset Password'}
            </Button>
        </form>
    );
}

export default function ResetPasswordPage() {
    return (
        <div className="max-w-md mx-auto px-4 py-12">
            <Card>
                <CardHeader>
                    <CardTitle>Reset Password</CardTitle>
                </CardHeader>
                <CardContent>
                    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading...</p>}>
                        <ResetPasswordForm />
                    </Suspense>
                </CardContent>
            </Card>
        </div>
    );
}
