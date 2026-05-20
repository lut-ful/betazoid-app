'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import api from '@/lib/axios';
import { useAuthStore } from '@/store/auth.store';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Permission {
    permission_id: string;
    name: string;
}

interface RoleWithPermissions {
    role_id: string;
    name: string;
    permissions: Permission[];
}

function groupByModule(permissions: Permission[]): Record<string, Permission[]> {
    return permissions.reduce<Record<string, Permission[]>>((acc, p) => {
        const module = p.name.split(':')[1] ?? 'other';
        if (!acc[module]) acc[module] = [];
        acc[module].push(p);
        return acc;
    }, {});
}

export default function RolePermissionsPage() {
    const router = useRouter();
    const params = useParams();
    const roleId = params.id as string;
    const accessToken = useAuthStore((s) => s.accessToken);
    const queryClient = useQueryClient();

    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [initialized, setInitialized] = useState(false);

    useEffect(() => {
        if (!accessToken) router.push('/login');
    }, [accessToken, router]);

    const { data: allPermissions, isLoading: loadingAll } = useQuery<Permission[]>({
        queryKey: ['permissions'],
        queryFn: async () => {
            const { data } = await api.get('/permissions');
            return data;
        },
        enabled: !!accessToken,
    });

    const { data: role, isLoading: loadingRole } = useQuery<RoleWithPermissions>({
        queryKey: ['role', roleId, 'permissions'],
        queryFn: async () => {
            const { data } = await api.get(`/roles/${roleId}/permissions`);
            return data;
        },
        enabled: !!accessToken && !!roleId,
    });

    useEffect(() => {
        if (role && !initialized) {
            setSelected(new Set(role.permissions.map((p) => p.permission_id)));
            setInitialized(true);
        }
    }, [role, initialized]);

    const mutation = useMutation({
        mutationFn: (permissionIds: string[]) =>
            api.put(`/roles/${roleId}/permissions`, { permissionIds }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['role', roleId, 'permissions'] });
        },
    });

    function toggle(id: string) {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    function handleSave() {
        mutation.mutate([...selected]);
    }

    const isLoading = loadingAll || loadingRole;
    const grouped = allPermissions ? groupByModule(allPermissions) : {};
    const modules = Object.keys(grouped).sort();

    return (
        <div className="max-w-2xl mx-auto px-4 py-12 space-y-6">
            <div className="flex items-center justify-between">
                <Button asChild variant="outline">
                    <Link href="/admin/roles">← Back to Roles</Link>
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>
                        {role ? `Permissions — ${role.name}` : 'Permissions'}
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}

                    {!isLoading && modules.map((module) => (
                        <div key={module}>
                            <p className="text-sm font-medium mb-1 capitalize">{module}</p>
                            <div className="space-y-1 pl-2">
                                {grouped[module].map((perm) => (
                                    <label
                                        key={perm.permission_id}
                                        className="flex items-center gap-2 text-sm cursor-pointer"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={selected.has(perm.permission_id)}
                                            onChange={() => toggle(perm.permission_id)}
                                        />
                                        <span>{perm.name.split(':')[0]}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    ))}

                    {mutation.isSuccess && (
                        <p className="text-sm">Permissions saved successfully.</p>
                    )}
                    {mutation.isError && (
                        <p className="text-sm text-destructive">
                            {(mutation.error as any)?.response?.data?.message ?? 'Failed to save permissions.'}
                        </p>
                    )}

                    {!isLoading && (
                        <Button onClick={handleSave} disabled={mutation.isPending}>
                            {mutation.isPending ? 'Saving...' : 'Save Permissions'}
                        </Button>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
