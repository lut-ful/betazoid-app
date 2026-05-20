'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/axios';
import { useAuthStore } from '@/store/auth.store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Role {
    role_id: string;
    name: string;
}

interface UserWithRoles {
    user_id: string;
    full_name: string;
    email: string;
    userRoles: { role: Role }[];
}

export default function AssignRolePage() {
    const router = useRouter();
    const accessToken = useAuthStore((s) => s.accessToken);
    const queryClient = useQueryClient();

    const [search, setSearch] = useState('');
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
    const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);

    useEffect(() => {
        if (!accessToken) router.push('/login');
    }, [accessToken, router]);

    const { data: users, isLoading: usersLoading, isError: usersError } = useQuery<UserWithRoles[]>({
        queryKey: ['admin-users', search],
        queryFn: async () => {
            const { data } = await api.get('/roles/users', { params: { search } });
            return data;
        },
        enabled: !!accessToken,
    });

    const { data: roles, isLoading: rolesLoading } = useQuery<Role[]>({
        queryKey: ['roles'],
        queryFn: async () => {
            const { data } = await api.get('/roles');
            return data;
        },
        enabled: !!accessToken,
    });

    const assignMutation = useMutation({
        mutationFn: ({ userId, roleIds }: { userId: string; roleIds: string[] }) =>
            api.put(`/roles/users/${userId}/roles`, { roleIds }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin-users'] });
            setSelectedUserId(null);
            setSelectedRoleIds([]);
        },
    });

    const handleSelectUser = (user: UserWithRoles) => {
        setSelectedUserId(user.user_id);
        setSelectedRoleIds(user.userRoles.map((ur) => ur.role.role_id));
    };

    const toggleRole = (roleId: string) => {
        setSelectedRoleIds((prev) =>
            prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId],
        );
    };

    const selectedUser = users?.find((u) => u.user_id === selectedUserId);

    return (
        <div className="max-w-2xl mx-auto px-4 py-12 space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Assign Roles to User</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-1">
                        <Label htmlFor="search">Search Users</Label>
                        <Input
                            id="search"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search by name or email"
                        />
                    </div>

                    {usersLoading && <p className="text-sm text-muted-foreground">Loading users...</p>}
                    {usersError && <p className="text-sm text-destructive">Failed to load users.</p>}
                    {users && users.length === 0 && (
                        <p className="text-sm text-muted-foreground">No users found.</p>
                    )}

                    {users && users.length > 0 && (
                        <ul className="space-y-2">
                            {users.map((user) => (
                                <li
                                    key={user.user_id}
                                    className="flex items-center justify-between border-b pb-2 last:border-0"
                                >
                                    <div className="flex flex-col gap-0.5">
                                        <span className="font-medium text-sm">{user.full_name}</span>
                                        <span className="text-xs text-muted-foreground">{user.email}</span>
                                        <span className="text-xs text-muted-foreground">
                                            Roles:{' '}
                                            {user.userRoles.length > 0
                                                ? user.userRoles.map((ur) => ur.role.name).join(', ')
                                                : 'None'}
                                        </span>
                                    </div>
                                    <Button variant="outline" size="sm" onClick={() => handleSelectUser(user)}>
                                        Assign Roles
                                    </Button>
                                </li>
                            ))}
                        </ul>
                    )}
                </CardContent>
            </Card>

            {selectedUser && (
                <Card>
                    <CardHeader>
                        <CardTitle>Assign Roles — {selectedUser.full_name}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {rolesLoading && <p className="text-sm text-muted-foreground">Loading roles...</p>}

                        {roles && (
                            <div className="space-y-2">
                                {roles.map((role) => (
                                    <label
                                        key={role.role_id}
                                        className="flex items-center gap-2 cursor-pointer"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={selectedRoleIds.includes(role.role_id)}
                                            onChange={() => toggleRole(role.role_id)}
                                        />
                                        <span className="text-sm">{role.name}</span>
                                    </label>
                                ))}
                            </div>
                        )}

                        {assignMutation.isSuccess && (
                            <p className="text-sm">Roles assigned successfully.</p>
                        )}
                        {assignMutation.isError && (
                            <p className="text-sm text-destructive">
                                {(assignMutation.error as any)?.response?.data?.message ?? 'Failed to assign roles.'}
                            </p>
                        )}

                        <div className="flex gap-2">
                            <Button
                                disabled={assignMutation.isPending}
                                onClick={() =>
                                    assignMutation.mutate({
                                        userId: selectedUser.user_id,
                                        roleIds: selectedRoleIds,
                                    })
                                }
                            >
                                {assignMutation.isPending ? 'Saving...' : 'Save Roles'}
                            </Button>
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setSelectedUserId(null);
                                    setSelectedRoleIds([]);
                                }}
                            >
                                Cancel
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
