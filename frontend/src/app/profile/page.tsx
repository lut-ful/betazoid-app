'use client';

import { useEffect } from 'react';
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

const profileSchema = z.object({
    full_name: z.string().min(1, 'Name is required').max(100),
    bio: z.string().max(500).optional(),
    profile_photo_url: z.string().url('Must be a valid URL').optional().or(z.literal('')),
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
    const queryClient = useQueryClient();

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
                profile_photo_url: profile.profile_photo_url ?? '',
            });
        }
    }, [profile, reset]);

    const mutation = useMutation({
        mutationFn: (data: ProfileFormData) => {
            const payload: Partial<ProfileFormData> = { full_name: data.full_name };
            if (data.bio !== undefined) payload.bio = data.bio;
            if (data.profile_photo_url) payload.profile_photo_url = data.profile_photo_url;
            return api.patch('/users/me', payload);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['profile'] });
        },
    });

    const onSubmit = (data: ProfileFormData) => mutation.mutate(data);

    if (isLoading) return <p>Loading...</p>;
    if (isError) return <p>Failed to load profile.</p>;

    return (
        <div className="max-w-lg mx-auto mt-10 p-6">
            <h1 className="text-2xl font-bold mb-6">My Profile</h1>

            <div className="mb-4">
                <Label>Gmail (read-only)</Label>
                <Input value={profile?.gmail ?? ''} disabled />
                <p className="text-sm text-muted-foreground mt-1">
                    Gmail cannot be changed — it controls your YouTube course access.
                </p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div>
                    <Label htmlFor="full_name">Full Name</Label>
                    <Input id="full_name" {...register('full_name')} />
                    {errors.full_name && <p className="text-sm text-red-500">{errors.full_name.message}</p>}
                </div>

                <div>
                    <Label htmlFor="bio">Bio</Label>
                    <Textarea id="bio" {...register('bio')} rows={4} />
                    {errors.bio && <p className="text-sm text-red-500">{errors.bio.message}</p>}
                </div>

                <div>
                    <Label htmlFor="profile_photo_url">Profile Photo URL</Label>
                    <Input id="profile_photo_url" {...register('profile_photo_url')} placeholder="https://..." />
                    {errors.profile_photo_url && <p className="text-sm text-red-500">{errors.profile_photo_url.message}</p>}
                </div>

                {mutation.isSuccess && <p className="text-sm text-green-600">Profile updated successfully.</p>}
                {mutation.isError && <p className="text-sm text-red-500">Failed to update profile.</p>}

                <Button type="submit" disabled={mutation.isPending}>
                    {mutation.isPending ? 'Saving...' : 'Save Changes'}
                </Button>
            </form>
        </div>
    );
}
