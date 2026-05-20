'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import api from '@/lib/axios';
import { useAuthStore } from '@/store/auth.store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

const profileSchema = z.object({
    full_name: z.string().min(1, 'Name is required').max(100),
    bio: z.string().max(500).optional(),
});

type ProfileFormData = z.infer<typeof profileSchema>;

interface UserProfile {
    user_id: string;
    full_name: string;
    email: string;
    gmail: string;
    bio: string | null;
    profile_photo_url: string | null;
    is_email_verified: boolean;
    created_at: string;
    updated_at: string;
}

export default function ProfilePage() {
    const router = useRouter();
    const accessToken = useAuthStore((s) => s.accessToken);
    const clearAccessToken = useAuthStore((s) => s.clearAccessToken);
    const queryClient = useQueryClient();
    const [confirmDelete, setConfirmDelete] = useState(false);

    useEffect(() => {
        if (!accessToken) router.push('/login');
    }, [accessToken, router]);

    const { data: profile, isLoading, isError } = useQuery<UserProfile>({
        queryKey: ['profile'],
        queryFn: async () => {
            const { data } = await api.get('/users/me');
            return data;
        },
        enabled: !!accessToken,
    });

    const { register, handleSubmit, reset, formState: { errors } } = useForm<ProfileFormData>({
        resolver: zodResolver(profileSchema),
    });

    useEffect(() => {
        if (profile) {
            reset({
                full_name: profile.full_name,
                bio: profile.bio ?? '',
            });
        }
    }, [profile, reset]);

    const mutation = useMutation({
        mutationFn: (data: ProfileFormData) =>
            api.patch('/users/me', data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['profile'] });
        },
    });

    const deleteMutation = useMutation({
        mutationFn: () => api.delete('/users/me'),
        onSuccess: () => {
            clearAccessToken();
            router.push('/register');
        },
    });

    const onSubmit = (data: ProfileFormData) => mutation.mutate(data);

    if (isLoading) return <p className="p-8 text-muted-foreground">Loading...</p>;
    if (isError) return <p className="p-8 text-destructive">Failed to load profile.</p>;

    return (
        <div className="max-w-lg mx-auto px-4 py-10 space-y-6">
            <h1 className="text-xl font-semibold">My Profile</h1>

            <Card>
                <CardHeader>
                    <CardTitle>Account Info</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">Email</span>
                        <span>{profile?.email}</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">Gmail</span>
                        <span>{profile?.gmail}</span>
                    </div>
                    <p className="text-xs text-muted-foreground pt-1">
                        Gmail cannot be changed — it controls your YouTube course access.
                    </p>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Edit Profile</CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                        <div className="space-y-1">
                            <Label htmlFor="full_name">Full Name</Label>
                            <Input id="full_name" {...register('full_name')} />
                            {errors.full_name && <p className="text-sm text-destructive">{errors.full_name.message}</p>}
                        </div>

                        <div className="space-y-1">
                            <Label htmlFor="bio">Bio</Label>
                            <Textarea id="bio" {...register('bio')} rows={4} />
                            {errors.bio && <p className="text-sm text-destructive">{errors.bio.message}</p>}
                        </div>

                        {mutation.isSuccess && <p className="text-sm">Profile updated successfully.</p>}
                        {mutation.isError && <p className="text-sm text-destructive">Failed to update profile.</p>}

                        <Button type="submit" disabled={mutation.isPending}>
                            {mutation.isPending ? 'Saving...' : 'Save Changes'}
                        </Button>
                    </form>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Delete Account</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                        Permanently deletes your account. This cannot be undone.
                    </p>
                    {!confirmDelete ? (
                        <Button variant="destructive" onClick={() => setConfirmDelete(true)}>
                            Delete Account
                        </Button>
                    ) : (
                        <div className="space-y-2">
                            <p className="text-sm text-destructive">Are you sure? This action is permanent.</p>
                            <div className="flex gap-2">
                                <Button
                                    variant="destructive"
                                    disabled={deleteMutation.isPending}
                                    onClick={() => deleteMutation.mutate()}
                                >
                                    {deleteMutation.isPending ? 'Deleting...' : 'Yes, delete my account'}
                                </Button>
                                <Button variant="outline" onClick={() => setConfirmDelete(false)}>
                                    Cancel
                                </Button>
                            </div>
                            {deleteMutation.isError && (
                                <p className="text-sm text-destructive">Failed to delete account. Please try again.</p>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
