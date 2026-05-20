'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import api from '@/lib/axios';

const schema = z.object({
    email: z.string().email('Enter a valid email'),
});

type FormData = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<FormData>({
        resolver: zodResolver(schema),
    });

    const mutation = useMutation({
        mutationFn: (data: FormData) =>
            api.post('/auth/forgot-password', data).then((res) => res.data),
        onSuccess: (data) => setSuccessMessage(data.message),
    });

    const onSubmit = (data: FormData) => mutation.mutate(data);

    return (
        <div>
            <h1>Forgot Password</h1>

            {successMessage ? (
                <p>{successMessage}</p>
            ) : (
                <form onSubmit={handleSubmit(onSubmit)}>
                    <div>
                        <label>Email</label>
                        <input type="email" {...register('email')} />
                        {errors.email && <p>{errors.email.message}</p>}
                    </div>

                    <button type="submit" disabled={mutation.isPending}>
                        {mutation.isPending ? 'Sending...' : 'Send Reset Link'}
                    </button>

                    {mutation.isError && <p>Something went wrong. Please try again.</p>}
                </form>
            )}

            <Link href="/login">Back to login</Link>
        </div>
    );
}
