'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth.store';
import api from '@/lib/axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

interface UserProfile {
    user_id: string;
    full_name: string;
    email: string;
    gmail: string;
    bio: string | null;
    profile_photo_url: string | null;
    is_email_verified: boolean;
    created_at: string;
}

export default function HomePage() {
    const accessToken = useAuthStore((s) => s.accessToken);

    const { data: profile } = useQuery<UserProfile>({
        queryKey: ['profile'],
        queryFn: async () => {
            const { data } = await api.get('/users/me');
            return data;
        },
        enabled: !!accessToken,
    });

    if (!accessToken) {
        return (
            <div className="max-w-2xl mx-auto px-4 py-16">
                <h1 className="text-2xl font-semibold mb-2">Welcome to Betazoid</h1>
                <p className="text-muted-foreground mb-6">
                    An online learning platform. Register to get started or log in to continue.
                </p>
                <div className="flex gap-3">
                    <Button asChild>
                        <Link href="/register">Create an Account</Link>
                    </Button>
                    <Button variant="outline" asChild>
                        <Link href="/login">Sign In</Link>
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-2xl mx-auto px-4 py-10">
            <h1 className="text-xl font-semibold mb-6">
                Welcome back{profile ? `, ${profile.full_name}` : ''}
            </h1>

            {profile && (
                <Card>
                    <CardHeader>
                        <CardTitle>Account Overview</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Full Name</span>
                            <span>{profile.full_name}</span>
                        </div>
                        <Separator />
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Email</span>
                            <span>{profile.email}</span>
                        </div>
                        <Separator />
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Gmail</span>
                            <span>{profile.gmail}</span>
                        </div>
                        <Separator />
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Email Verified</span>
                            <span>{profile.is_email_verified ? 'Yes' : 'No'}</span>
                        </div>
                        <Separator />
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Bio</span>
                            <span>{profile.bio ?? '—'}</span>
                        </div>
                        <Separator />
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Member Since</span>
                            <span>{new Date(profile.created_at).toLocaleDateString()}</span>
                        </div>
                    </CardContent>
                </Card>
            )}

            <div className="mt-4">
                <Button variant="outline" asChild>
                    <Link href="/profile">Edit Profile</Link>
                </Button>
            </div>
        </div>
    );
}
