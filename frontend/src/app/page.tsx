'use client';

import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';
import api from '@/lib/axios';

export default function LogoutButton() {
    const router = useRouter();
    const clearAccessToken = useAuthStore((s) => s.clearAccessToken);

    async function handleLogout() {
        try {
            await api.post('/auth/logout');
        } catch {
            // Ignore errors — the server may have already expired the token.
            // We still clear client state.
        } finally {
            clearAccessToken();
            router.push('/login');
        }
    }

    return (
        <button onClick={handleLogout}>
            Logout
        </button>
    );
}
