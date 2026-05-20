'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import api from '@/lib/axios';

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

    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<FormData>({
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
            <div>
                <p>Invalid reset link.</p>
                <Link href="/forgot-password">Request a new one</Link>
            </div>
        );
    }

    return (
        <div>
            <h1>Reset Password</h1>

            <form onSubmit={handleSubmit(onSubmit)}>
                <div>
                    <label>New Password</label>
                    <input type="password" {...register('new_password')} />
                    {errors.new_password && <p>{errors.new_password.message}</p>}
                </div>

                <div>
                    <label>Confirm Password</label>
                    <input type="password" {...register('confirm_password')} />
                    {errors.confirm_password && <p>{errors.confirm_password.message}</p>}
                </div>

                <button type="submit" disabled={mutation.isPending}>
                    {mutation.isPending ? 'Updating...' : 'Reset Password'}
                </button>

                {mutation.isError && <p>Invalid or expired reset link.</p>}
            </form>
        </div>
    );
}

export default function ResetPasswordPage() {
    return (
        <Suspense fallback={<p>Loading...</p>}>
            <ResetPasswordForm />
        </Suspense>
    );
}
