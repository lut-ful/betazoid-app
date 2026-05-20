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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const categorySchema = z.object({
    name: z.string().min(1, 'Name is required').max(100),
    parentCategoryId: z.string().optional(),
});

type CategoryFormData = z.infer<typeof categorySchema>;

interface Category {
    category_id: string;
    name: string;
    parent: { category_id: string; name: string } | null;
    children: { category_id: string; name: string }[];
    created_at: string;
}

function EditCategoryForm({
    category,
    allCategories,
    onDone,
}: {
    category: Category;
    allCategories: Category[];
    onDone: () => void;
}) {
    const queryClient = useQueryClient();
    const { register, handleSubmit, formState: { errors } } = useForm<CategoryFormData>({
        resolver: zodResolver(categorySchema),
        defaultValues: {
            name: category.name,
            parentCategoryId: category.parent?.category_id ?? '',
        },
    });

    const mutation = useMutation({
        mutationFn: (data: CategoryFormData) =>
            api.patch(`/categories/${category.category_id}`, {
                name: data.name,
                parentCategoryId: data.parentCategoryId || null,
            }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['categories'] });
            onDone();
        },
    });

    const eligibleParents = allCategories.filter(
        (c) => c.category_id !== category.category_id,
    );

    return (
        <form onSubmit={handleSubmit((data) => mutation.mutate(data))} className="space-y-2 mt-2">
            <div className="space-y-1">
                <Label htmlFor={`name-${category.category_id}`}>Name</Label>
                <Input id={`name-${category.category_id}`} {...register('name')} />
                {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
            </div>
            <div className="space-y-1">
                <Label htmlFor={`parent-${category.category_id}`}>Parent Category</Label>
                <select
                    id={`parent-${category.category_id}`}
                    {...register('parentCategoryId')}
                    className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background"
                >
                    <option value="">— None (top-level) —</option>
                    {eligibleParents.map((c) => (
                        <option key={c.category_id} value={c.category_id}>
                            {c.name}
                        </option>
                    ))}
                </select>
            </div>
            {mutation.isError && (
                <p className="text-sm text-destructive">
                    {(mutation.error as any)?.response?.data?.message ?? 'Failed to update category.'}
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

function DeleteCategoryButton({ category }: { category: Category }) {
    const queryClient = useQueryClient();
    const [confirmDelete, setConfirmDelete] = useState(false);

    const mutation = useMutation({
        mutationFn: () => api.delete(`/categories/${category.category_id}`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['categories'] });
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
            {category.children.length > 0 && (
                <p className="text-sm text-destructive">
                    Warning: this category has {category.children.length} subcategor
                    {category.children.length > 1 ? 'ies' : 'y'}. Reassign or delete them first.
                </p>
            )}
            <p className="text-sm text-destructive">Are you sure? This cannot be undone.</p>
            {mutation.isError && (
                <p className="text-sm text-destructive">
                    {(mutation.error as any)?.response?.data?.message ?? 'Failed to delete category.'}
                </p>
            )}
            <div className="flex gap-2">
                <Button
                    variant="destructive"
                    size="sm"
                    disabled={mutation.isPending}
                    onClick={() => mutation.mutate()}
                >
                    {mutation.isPending ? 'Deleting...' : 'Confirm'}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>
                    Cancel
                </Button>
            </div>
        </div>
    );
}

export default function CategoriesPage() {
    const router = useRouter();
    const accessToken = useAuthStore((s) => s.accessToken);
    const queryClient = useQueryClient();
    const [editingId, setEditingId] = useState<string | null>(null);

    useEffect(() => {
        if (!accessToken) router.push('/login');
    }, [accessToken, router]);

    const { data: categories, isLoading, isError } = useQuery<Category[]>({
        queryKey: ['categories'],
        queryFn: async () => {
            const { data } = await api.get('/categories');
            return data;
        },
        enabled: !!accessToken,
    });

    const { register, handleSubmit, reset, formState: { errors } } = useForm<CategoryFormData>({
        resolver: zodResolver(categorySchema),
    });

    const createMutation = useMutation({
        mutationFn: (data: CategoryFormData) =>
            api.post('/categories', {
                name: data.name,
                parentCategoryId: data.parentCategoryId || undefined,
            }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['categories'] });
            reset();
        },
    });

    return (
        <div className="max-w-2xl mx-auto px-4 py-12 space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Create Category</CardTitle>
                </CardHeader>
                <CardContent>
                    <form
                        onSubmit={handleSubmit((data) => createMutation.mutate(data))}
                        className="space-y-4"
                    >
                        <div className="space-y-1">
                            <Label htmlFor="name">Name</Label>
                            <Input id="name" {...register('name')} placeholder="e.g. Web Development" />
                            {errors.name && (
                                <p className="text-sm text-destructive">{errors.name.message}</p>
                            )}
                        </div>

                        <div className="space-y-1">
                            <Label htmlFor="parentCategoryId">Parent Category (optional)</Label>
                            <select
                                id="parentCategoryId"
                                {...register('parentCategoryId')}
                                className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background"
                            >
                                <option value="">— None (top-level) —</option>
                                {categories?.map((c) => (
                                    <option key={c.category_id} value={c.category_id}>
                                        {c.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {createMutation.isSuccess && (
                            <p className="text-sm">Category created successfully.</p>
                        )}
                        {createMutation.isError && (
                            <p className="text-sm text-destructive">
                                {(createMutation.error as any)?.response?.data?.message ??
                                    'Failed to create category.'}
                            </p>
                        )}

                        <Button type="submit" disabled={createMutation.isPending}>
                            {createMutation.isPending ? 'Creating...' : 'Create Category'}
                        </Button>
                    </form>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>All Categories</CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
                    {isError && <p className="text-sm text-destructive">Failed to load categories.</p>}
                    {categories && categories.length === 0 && (
                        <p className="text-sm text-muted-foreground">No categories yet.</p>
                    )}
                    {categories && categories.length > 0 && (
                        <ul className="space-y-4">
                            {categories.map((cat) => (
                                <li key={cat.category_id} className="border-b pb-4 last:border-0">
                                    {editingId === cat.category_id ? (
                                        <EditCategoryForm
                                            category={cat}
                                            allCategories={categories}
                                            onDone={() => setEditingId(null)}
                                        />
                                    ) : (
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex flex-col gap-0.5">
                                                <span className="font-medium text-sm">{cat.name}</span>
                                                {cat.parent && (
                                                    <span className="text-xs text-muted-foreground">
                                                        Parent: {cat.parent.name}
                                                    </span>
                                                )}
                                                {cat.children.length > 0 && (
                                                    <span className="text-xs text-muted-foreground">
                                                        {cat.children.length} subcategor
                                                        {cat.children.length > 1 ? 'ies' : 'y'}
                                                    </span>
                                                )}
                                            </div>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setEditingId(cat.category_id)}
                                            >
                                                Edit
                                            </Button>
                                        </div>
                                    )}
                                    {editingId !== cat.category_id && (
                                        <DeleteCategoryButton category={cat} />
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
