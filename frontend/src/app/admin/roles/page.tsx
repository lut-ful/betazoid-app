'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
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

const roleSchema = z.object({
    name: z.string().min(1, 'Role name is required').max(100),
    description: z.string().optional(),
});

type RoleFormData = z.infer<typeof roleSchema>;

interface Role {
    role_id: string;
    name: string;
    description: string | null;
    userCount: number;
    created_at: string;
}

function EditRoleForm({ role, onDone }: { role: Role; onDone: () => void }) {
    const queryClient = useQueryClient();
    const { register, handleSubmit, formState: { errors } } = useForm<RoleFormData>({
        resolver: zodResolver(roleSchema),
        defaultValues: { name: role.name, description: role.description ?? '' },
    });

    const mutation = useMutation({
        mutationFn: (data: RoleFormData) => api.patch(`/roles/${role.role_id}`, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['roles'] });
            onDone();
        },
    });

    return (
        <form onSubmit={handleSubmit((data) => mutation.mutate(data))} className="space-y-2 mt-2">
            <div className="space-y-1">
                <Label htmlFor={`name-${role.role_id}`}>Role Name</Label>
                <Input id={`name-${role.role_id}`} {...register('name')} />
                {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
            </div>
            <div className="space-y-1">
                <Label htmlFor={`desc-${role.role_id}`}>Description</Label>
                <Textarea id={`desc-${role.role_id}`} {...register('description')} rows={2} />
            </div>
            {mutation.isError && (
                <p className="text-sm text-destructive">
                    {(mutation.error as any)?.response?.data?.message ?? 'Failed to update role.'}
                </p>
            )}
            <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={mutation.isPending}>
                    {mutation.isPending ? 'Saving...' : 'Save'}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={onDone}>
                    Cancel
                </Button>
            </div>
        </form>
    );
}

function DeleteRoleButton({ role }: { role: Role }) {
    const queryClient = useQueryClient();
    const [confirmDelete, setConfirmDelete] = useState(false);

    const mutation = useMutation({
        mutationFn: () => api.delete(`/roles/${role.role_id}`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['roles'] });
        },
    });

    if (!confirmDelete) {
        return (
            <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(true)}>
                Delete
            </Button>
        );
    }

    return (
        <div className="space-y-2 mt-2">
            {role.userCount > 0 && (
                <p className="text-sm text-destructive">
                    Warning: this role is assigned to {role.userCount} user{role.userCount > 1 ? 's' : ''}. Deleting it will remove their access.
                </p>
            )}
            <p className="text-sm text-destructive">Are you sure? This cannot be undone.</p>
            {mutation.isError && (
                <p className="text-sm text-destructive">
                    {(mutation.error as any)?.response?.data?.message ?? 'Failed to delete role.'}
                </p>
            )}
            <div className="flex gap-2">
                <Button variant="destructive" size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
                    {mutation.isPending ? 'Deleting...' : 'Confirm'}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>
                    Cancel
                </Button>
            </div>
        </div>
    );
}

export default function RolesPage() {
    const router = useRouter();
    const accessToken = useAuthStore((s) => s.accessToken);
    const queryClient = useQueryClient();
    const [editingId, setEditingId] = useState<string | null>(null);

    useEffect(() => {
        if (!accessToken) router.push('/login');
    }, [accessToken, router]);

    const { data: roles, isLoading, isError } = useQuery<Role[]>({
        queryKey: ['roles'],
        queryFn: async () => {
            const { data } = await api.get('/roles');
            return data;
        },
        enabled: !!accessToken,
    });

    const { register, handleSubmit, reset, formState: { errors } } = useForm<RoleFormData>({
        resolver: zodResolver(roleSchema),
    });

    const createMutation = useMutation({
        mutationFn: (data: RoleFormData) => api.post('/roles', data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['roles'] });
            reset();
        },
    });

    return (
        <div className="max-w-2xl mx-auto px-4 py-12 space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Create Role</CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit((data) => createMutation.mutate(data))} className="space-y-4">
                        <div className="space-y-1">
                            <Label htmlFor="name">Role Name</Label>
                            <Input id="name" {...register('name')} placeholder="e.g. Moderator" />
                            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
                        </div>

                        <div className="space-y-1">
                            <Label htmlFor="description">Description (optional)</Label>
                            <Textarea id="description" {...register('description')} rows={2} />
                        </div>

                        {createMutation.isSuccess && <p className="text-sm">Role created successfully.</p>}
                        {createMutation.isError && (
                            <p className="text-sm text-destructive">
                                {(createMutation.error as any)?.response?.data?.message ?? 'Failed to create role.'}
                            </p>
                        )}

                        <Button type="submit" disabled={createMutation.isPending}>
                            {createMutation.isPending ? 'Creating...' : 'Create Role'}
                        </Button>
                    </form>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>All Roles</CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
                    {isError && <p className="text-sm text-destructive">Failed to load roles.</p>}
                    {roles && roles.length === 0 && (
                        <p className="text-sm text-muted-foreground">No roles yet.</p>
                    )}
                    {roles && roles.length > 0 && (
                        <ul className="space-y-4">
                            {roles.map((role) => (
                                <li key={role.role_id} className="border-b pb-4 last:border-0">
                                    {editingId === role.role_id ? (
                                        <EditRoleForm role={role} onDone={() => setEditingId(null)} />
                                    ) : (
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex flex-col gap-0.5">
                                                <span className="font-medium text-sm">{role.name}</span>
                                                {role.description && (
                                                    <span className="text-xs text-muted-foreground">{role.description}</span>
                                                )}
                                                <span className="text-xs text-muted-foreground">
                                                    {role.userCount} user{role.userCount !== 1 ? 's' : ''} assigned
                                                </span>
                                            </div>
                                            <div className="flex gap-2 shrink-0">
                                                <Button asChild variant="outline" size="sm">
                                                    <Link href={`/admin/roles/${role.role_id}/permissions`}>
                                                        Permissions
                                                    </Link>
                                                </Button>
                                                <Button variant="outline" size="sm" onClick={() => setEditingId(role.role_id)}>
                                                    Edit
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                    {editingId !== role.role_id && <DeleteRoleButton role={role} />}
                                </li>
                            ))}
                        </ul>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
