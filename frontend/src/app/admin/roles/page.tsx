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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const createRoleSchema = z.object({
    name: z.string().min(1, 'Role name is required').max(100),
    description: z.string().optional(),
});

type CreateRoleFormData = z.infer<typeof createRoleSchema>;

interface Role {
    role_id: string;
    name: string;
    description: string | null;
    created_at: string;
}

export default function RolesPage() {
    const router = useRouter();
    const accessToken = useAuthStore((s) => s.accessToken);
    const queryClient = useQueryClient();

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

    const { register, handleSubmit, reset, formState: { errors } } = useForm<CreateRoleFormData>({
        resolver: zodResolver(createRoleSchema),
    });

    const mutation = useMutation({
        mutationFn: (data: CreateRoleFormData) => api.post('/roles', data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['roles'] });
            reset();
        },
    });

    const onSubmit = (data: CreateRoleFormData) => mutation.mutate(data);

    return (
        <div className="max-w-2xl mx-auto px-4 py-12 space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Create Role</CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                        <div className="space-y-1">
                            <Label htmlFor="name">Role Name</Label>
                            <Input id="name" {...register('name')} placeholder="e.g. Moderator" />
                            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
                        </div>

                        <div className="space-y-1">
                            <Label htmlFor="description">Description (optional)</Label>
                            <Textarea id="description" {...register('description')} rows={2} />
                        </div>

                        {mutation.isSuccess && <p className="text-sm">Role created successfully.</p>}
                        {mutation.isError && (
                            <p className="text-sm text-destructive">
                                {(mutation.error as any)?.response?.data?.message ?? 'Failed to create role.'}
                            </p>
                        )}

                        <Button type="submit" disabled={mutation.isPending}>
                            {mutation.isPending ? 'Creating...' : 'Create Role'}
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
                        <ul className="space-y-2">
                            {roles.map((role) => (
                                <li key={role.role_id} className="flex flex-col gap-0.5 border-b pb-2 last:border-0">
                                    <span className="font-medium text-sm">{role.name}</span>
                                    {role.description && (
                                        <span className="text-xs text-muted-foreground">{role.description}</span>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
