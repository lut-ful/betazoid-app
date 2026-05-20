'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
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

const courseSchema = z.object({
    title: z.string().min(1, 'Title is required').max(200),
    description: z.string().min(1, 'Description is required'),
    price: z.number().min(0, 'Price must be 0 or more'),
    thumbnail_url: z.string().optional(),
    language: z.string().min(1, 'Language is required').max(100),
    level: z.enum(['beginner', 'intermediate', 'advanced'] as const),
    categoryId: z.string().optional(),
});

type CourseFormData = z.infer<typeof courseSchema>;

interface Category {
    category_id: string;
    name: string;
}

export default function CreateCoursePage() {
    const router = useRouter();
    const accessToken = useAuthStore((s) => s.accessToken);

    useEffect(() => {
        if (!accessToken) router.push('/login');
    }, [accessToken, router]);

    const { data: categories } = useQuery<Category[]>({
        queryKey: ['categories'],
        queryFn: async () => {
            const { data } = await api.get('/categories');
            return data;
        },
        enabled: !!accessToken,
    });

    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<CourseFormData>({
        resolver: zodResolver(courseSchema),
        defaultValues: { price: 0 },
    });

    const mutation = useMutation({
        mutationFn: (data: CourseFormData) =>
            api.post('/courses', {
                ...data,
                categoryId: data.categoryId || undefined,
                thumbnail_url: data.thumbnail_url || undefined,
            }),
        onSuccess: (res) => {
            router.push(`/courses/${res.data.course_id}/edit`);
        },
    });

    return (
        <div className="max-w-md mx-auto px-4 py-12">
            <Card>
                <CardHeader>
                    <CardTitle>Create New Course</CardTitle>
                </CardHeader>
                <CardContent>
                    <form
                        onSubmit={handleSubmit((data) => mutation.mutate(data))}
                        className="space-y-4"
                    >
                        <div className="space-y-1">
                            <Label htmlFor="title">Title</Label>
                            <Input id="title" {...register('title')} placeholder="e.g. Introduction to Python" />
                            {errors.title && <p className="text-sm text-destructive">{errors.title.message}</p>}
                        </div>

                        <div className="space-y-1">
                            <Label htmlFor="description">Description</Label>
                            <Textarea id="description" {...register('description')} placeholder="What will students learn?" />
                            {errors.description && <p className="text-sm text-destructive">{errors.description.message}</p>}
                        </div>

                        <div className="space-y-1">
                            <Label htmlFor="price">Price (USD)</Label>
                            <Input id="price" type="number" step="0.01" min="0" {...register('price', { valueAsNumber: true })} />
                            {errors.price && <p className="text-sm text-destructive">{errors.price.message}</p>}
                        </div>

                        <div className="space-y-1">
                            <Label htmlFor="language">Language</Label>
                            <Input id="language" {...register('language')} placeholder="e.g. English" />
                            {errors.language && <p className="text-sm text-destructive">{errors.language.message}</p>}
                        </div>

                        <div className="space-y-1">
                            <Label htmlFor="level">Level</Label>
                            <select
                                id="level"
                                {...register('level')}
                                className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background"
                            >
                                <option value="">— Select level —</option>
                                <option value="beginner">Beginner</option>
                                <option value="intermediate">Intermediate</option>
                                <option value="advanced">Advanced</option>
                            </select>
                            {errors.level && <p className="text-sm text-destructive">{errors.level.message}</p>}
                        </div>

                        <div className="space-y-1">
                            <Label htmlFor="categoryId">Category (optional)</Label>
                            <select
                                id="categoryId"
                                {...register('categoryId')}
                                className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background"
                            >
                                <option value="">— None —</option>
                                {categories?.map((c) => (
                                    <option key={c.category_id} value={c.category_id}>
                                        {c.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-1">
                            <Label htmlFor="thumbnail_url">Thumbnail URL (optional)</Label>
                            <Input id="thumbnail_url" {...register('thumbnail_url')} placeholder="https://..." />
                            {errors.thumbnail_url && <p className="text-sm text-destructive">{errors.thumbnail_url.message}</p>}
                        </div>

                        {mutation.isError && (
                            <p className="text-sm text-destructive">
                                {(mutation.error as any)?.response?.data?.message ?? 'Failed to create course.'}
                            </p>
                        )}

                        <Button type="submit" className="w-full" disabled={mutation.isPending}>
                            {mutation.isPending ? 'Creating...' : 'Create Course'}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
