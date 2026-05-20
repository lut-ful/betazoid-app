'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import api from '@/lib/axios';
import { useAuthStore } from '@/store/auth.store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

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

interface Course {
    course_id: string;
    title: string;
    description: string;
    price: string;
    thumbnail_url: string | null;
    language: string;
    level: 'beginner' | 'intermediate' | 'advanced';
    status: string;
    category: { category_id: string; name: string } | null;
}

interface Category {
    category_id: string;
    name: string;
}

export default function EditCoursePage() {
    const router = useRouter();
    const params = useParams();
    const courseId = params.id as string;
    const accessToken = useAuthStore((s) => s.accessToken);
    const queryClient = useQueryClient();
    const [confirmSubmit, setConfirmSubmit] = useState(false);

    useEffect(() => {
        if (!accessToken) router.push('/login');
    }, [accessToken, router]);

    const { data: course, isLoading, isError } = useQuery<Course>({
        queryKey: ['course', courseId],
        queryFn: async () => {
            const { data } = await api.get(`/courses/${courseId}`);
            return data;
        },
        enabled: !!accessToken && !!courseId,
    });

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
        reset,
        formState: { errors },
    } = useForm<CourseFormData>({
        resolver: zodResolver(courseSchema),
    });

    useEffect(() => {
        if (course) {
            reset({
                title: course.title,
                description: course.description,
                price: parseFloat(course.price),
                thumbnail_url: course.thumbnail_url ?? '',
                language: course.language,
                level: course.level,
                categoryId: course.category?.category_id ?? '',
            });
        }
    }, [course, reset]);

    const mutation = useMutation({
        mutationFn: (data: CourseFormData) =>
            api.patch(`/courses/${courseId}`, {
                ...data,
                categoryId: data.categoryId || undefined,
                thumbnail_url: data.thumbnail_url || undefined,
            }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['my-courses'] });
            queryClient.invalidateQueries({ queryKey: ['course', courseId] });
        },
    });

    const submitMutation = useMutation({
        mutationFn: () => api.post(`/courses/${courseId}/submit`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['my-courses'] });
            queryClient.invalidateQueries({ queryKey: ['course', courseId] });
            setConfirmSubmit(false);
        },
    });

    if (isLoading) return <p className="text-sm text-muted-foreground px-4 py-12">Loading...</p>;
    if (isError) return <p className="text-sm text-destructive px-4 py-12">Course not found.</p>;

    if (course?.status === 'pending') {
        return (
            <div className="max-w-md mx-auto px-4 py-12">
                <Card>
                    <CardHeader>
                        <CardTitle>{course.title}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                            This course is currently under review and cannot be edited.
                        </p>
                        <Button variant="outline" asChild>
                            <Link href="/courses">Back to My Courses</Link>
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="max-w-md mx-auto px-4 py-12">
            <Card>
                <CardHeader>
                    <CardTitle>Edit Course</CardTitle>
                </CardHeader>
                <CardContent>
                    <form
                        onSubmit={handleSubmit((data) => mutation.mutate(data))}
                        className="space-y-4"
                    >
                        <div className="space-y-1">
                            <Label htmlFor="title">Title</Label>
                            <Input id="title" {...register('title')} />
                            {errors.title && <p className="text-sm text-destructive">{errors.title.message}</p>}
                        </div>

                        <div className="space-y-1">
                            <Label htmlFor="description">Description</Label>
                            <Textarea id="description" {...register('description')} />
                            {errors.description && <p className="text-sm text-destructive">{errors.description.message}</p>}
                        </div>

                        <div className="space-y-1">
                            <Label htmlFor="price">Price (USD)</Label>
                            <Input id="price" type="number" step="0.01" min="0" {...register('price', { valueAsNumber: true })} />
                            {errors.price && <p className="text-sm text-destructive">{errors.price.message}</p>}
                        </div>

                        <div className="space-y-1">
                            <Label htmlFor="language">Language</Label>
                            <Input id="language" {...register('language')} />
                            {errors.language && <p className="text-sm text-destructive">{errors.language.message}</p>}
                        </div>

                        <div className="space-y-1">
                            <Label htmlFor="level">Level</Label>
                            <select
                                id="level"
                                {...register('level')}
                                className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background"
                            >
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
                        </div>

                        {mutation.isSuccess && <p className="text-sm">Course saved.</p>}
                        {mutation.isError && (
                            <p className="text-sm text-destructive">
                                {(mutation.error as any)?.response?.data?.message ?? 'Failed to save course.'}
                            </p>
                        )}

                        <div className="flex gap-2">
                            <Button type="submit" disabled={mutation.isPending}>
                                {mutation.isPending ? 'Saving...' : 'Save Changes'}
                            </Button>
                            <Button variant="outline" asChild>
                                <Link href="/courses">Back</Link>
                            </Button>
                        </div>
                    </form>

                    <Separator className="my-6" />

                    <div className="space-y-2">
                        <p className="text-sm font-medium">Ready to publish?</p>
                        <p className="text-sm text-muted-foreground">
                            Submit your course for admin review. You will not be able to edit it while the review is pending.
                        </p>
                        {!confirmSubmit ? (
                            <Button variant="outline" onClick={() => setConfirmSubmit(true)}>
                                Submit for Review
                            </Button>
                        ) : (
                            <div className="space-y-2">
                                <p className="text-sm text-destructive">
                                    Once submitted you cannot edit this course until the review is complete. Continue?
                                </p>
                                {submitMutation.isError && (
                                    <p className="text-sm text-destructive">
                                        {(submitMutation.error as any)?.response?.data?.message ?? 'Failed to submit course.'}
                                    </p>
                                )}
                                <div className="flex gap-2">
                                    <Button
                                        disabled={submitMutation.isPending}
                                        onClick={() => submitMutation.mutate()}
                                    >
                                        {submitMutation.isPending ? 'Submitting...' : 'Confirm Submit'}
                                    </Button>
                                    <Button variant="outline" onClick={() => setConfirmSubmit(false)}>
                                        Cancel
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
