'use client';

import { useState } from 'react';
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

const schema = z.object({
    email: z.email('Enter a valid email'),
});

type FormData = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
        resolver: zodResolver(schema),
    });

    const mutation = useMutation({
        mutationFn: (data: FormData) =>
            api.post('/auth/forgot-password', data).then((res) => res.data),
        onSuccess: (data) => setSuccessMessage(data.message),
    });

    const onSubmit = (data: FormData) => mutation.mutate(data);

    return (
        <div className="max-w-md mx-auto px-4 py-12">
            <Card>
                <CardHeader>
                    <CardTitle>Forgot Password</CardTitle>
                </CardHeader>
                <CardContent>
                    {successMessage ? (
                        <div className="space-y-3">
                            <p className="text-sm">{successMessage}</p>
                            <Link href="/login" className="text-sm">Back to login</Link>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                            <div className="space-y-1">
                                <Label htmlFor="email">Email</Label>
                                <Input id="email" type="email" {...register('email')} />
                                {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
                            </div>

                            {mutation.isError && <p className="text-sm text-destructive">Something went wrong. Please try again.</p>}

                            <Button type="submit" className="w-full" disabled={mutation.isPending}>
                                {mutation.isPending ? 'Sending...' : 'Send Reset Link'}
                            </Button>

                            <p className="text-sm text-center">
                                <Link href="/login">Back to login</Link>
                            </p>
                        </form>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
