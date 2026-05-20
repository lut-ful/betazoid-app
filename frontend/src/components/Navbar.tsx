'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';
import api from '@/lib/axios';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

export default function Navbar() {
    const router = useRouter();
    const accessToken = useAuthStore((s) => s.accessToken);
    const clearAccessToken = useAuthStore((s) => s.clearAccessToken);

    async function handleLogout() {
        try {
            await api.post('/auth/logout');
        } catch {
            // token may already be expired — still clear client state
        } finally {
            clearAccessToken();
            router.push('/login');
        }
    }

    return (
        <header className="w-full border-b">
            <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
                <Link href="/" className="font-semibold">
                    Betazoid
                </Link>

                <nav className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" asChild>
                        <Link href="/search">Browse</Link>
                    </Button>
                    <Separator orientation="vertical" className="h-5" />
                    {accessToken ? (
                        <>
                            <Button variant="ghost" asChild>
                                <Link href="/profile">Profile</Link>
                            </Button>
                            <Separator orientation="vertical" className="h-5" />
                            <Button variant="outline" size="sm" onClick={handleLogout}>
                                Logout
                            </Button>
                        </>
                    ) : (
                        <>
                            <Button variant="ghost" asChild>
                                <Link href="/login">Login</Link>
                            </Button>
                            <Button size="sm" asChild>
                                <Link href="/register">Register</Link>
                            </Button>
                        </>
                    )}
                </nav>
            </div>
        </header>
    );
}
