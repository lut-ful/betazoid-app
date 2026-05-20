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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

const CONTENT_TYPES = ['video', 'article', 'quiz'] as const;
type ContentType = (typeof CONTENT_TYPES)[number];

interface Lecture {
    lecture_id: string;
    title: string;
    content_type: ContentType;
    order: number;
    is_free_preview: boolean;
}

const addLectureSchema = z.object({
    title: z.string().min(1, 'Title is required').max(200),
    content_type: z.enum(CONTENT_TYPES),
});

type AddLectureForm = z.infer<typeof addLectureSchema>;

export default function LecturesPage() {
    const router = useRouter();
    const params = useParams();
    const courseId = params.id as string;
    const sectionId = params.sectionId as string;
    const accessToken = useAuthStore((s) => s.accessToken);
    const queryClient = useQueryClient();

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editTitle, setEditTitle] = useState('');
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

    useEffect(() => {
        if (!accessToken) router.push('/login');
    }, [accessToken, router]);

    const { data: lectures, isLoading, isError } = useQuery<Lecture[]>({
        queryKey: ['lectures', courseId, sectionId],
        queryFn: async () => {
            const { data } = await api.get(`/courses/${courseId}/sections/${sectionId}/lectures`);
            return data;
        },
        enabled: !!accessToken && !!courseId && !!sectionId,
    });

    const {
        register,
        handleSubmit,
        reset,
        formState: { errors },
    } = useForm<AddLectureForm>({
        resolver: zodResolver(addLectureSchema),
        defaultValues: { content_type: 'video' },
    });

    const addMutation = useMutation({
        mutationFn: (data: AddLectureForm) =>
            api.post(`/courses/${courseId}/sections/${sectionId}/lectures`, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['lectures', courseId, sectionId] });
            reset({ content_type: 'video' });
        },
    });

    const renameMutation = useMutation({
        mutationFn: ({ lectureId, title }: { lectureId: string; title: string }) =>
            api.patch(`/courses/${courseId}/sections/${sectionId}/lectures/${lectureId}`, { title }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['lectures', courseId, sectionId] });
            setEditingId(null);
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (lectureId: string) =>
            api.delete(`/courses/${courseId}/sections/${sectionId}/lectures/${lectureId}`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['lectures', courseId, sectionId] });
            setConfirmDeleteId(null);
        },
    });

    const reorderMutation = useMutation({
        mutationFn: (orderedIds: string[]) =>
            api.post(`/courses/${courseId}/sections/${sectionId}/lectures/reorder`, { orderedIds }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['lectures', courseId, sectionId] });
        },
    });

    const togglePreviewMutation = useMutation({
        mutationFn: ({ lectureId, is_free_preview }: { lectureId: string; is_free_preview: boolean }) =>
            api.patch(`/courses/${courseId}/sections/${sectionId}/lectures/${lectureId}`, { is_free_preview }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['lectures', courseId, sectionId] });
        },
    });

    function moveLecture(index: number, direction: 'up' | 'down') {
        if (!lectures) return;
        const ordered = [...lectures].sort((a, b) => a.order - b.order);
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= ordered.length) return;
        const ids = ordered.map((l) => l.lecture_id);
        [ids[index], ids[targetIndex]] = [ids[targetIndex], ids[index]];
        reorderMutation.mutate(ids);
    }

    if (isLoading) return <p className="text-sm text-muted-foreground px-4 py-12">Loading...</p>;
    if (isError) return <p className="text-sm text-destructive px-4 py-12">Failed to load lectures.</p>;

    const sorted = lectures ? [...lectures].sort((a, b) => a.order - b.order) : [];

    return (
        <div className="max-w-2xl mx-auto px-4 py-12">
            <Card>
                <CardHeader>
                    <CardTitle>Manage Lectures</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Button variant="outline" asChild>
                        <Link href={`/courses/${courseId}/sections`}>← Back to Sections</Link>
                    </Button>

                    <Separator />

                    <form
                        onSubmit={handleSubmit((data) => addMutation.mutate(data))}
                        className="space-y-2"
                    >
                        <Label>Add Lecture</Label>
                        <div className="space-y-1">
                            <Input placeholder="Lecture title" {...register('title')} />
                            {errors.title && (
                                <p className="text-sm text-destructive">{errors.title.message}</p>
                            )}
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="content_type">Content type</Label>
                            <select
                                id="content_type"
                                {...register('content_type')}
                                className="w-full border border-border rounded px-3 py-2 text-sm bg-background"
                            >
                                {CONTENT_TYPES.map((t) => (
                                    <option key={t} value={t}>
                                        {t.charAt(0).toUpperCase() + t.slice(1)}
                                    </option>
                                ))}
                            </select>
                            {errors.content_type && (
                                <p className="text-sm text-destructive">{errors.content_type.message}</p>
                            )}
                        </div>
                        <Button type="submit" disabled={addMutation.isPending}>
                            {addMutation.isPending ? 'Adding...' : 'Add Lecture'}
                        </Button>
                        {addMutation.isError && (
                            <p className="text-sm text-destructive">
                                {(addMutation.error as any)?.response?.data?.message ?? 'Failed to add lecture.'}
                            </p>
                        )}
                    </form>

                    <Separator />

                    {sorted.length === 0 && (
                        <p className="text-sm text-muted-foreground">No lectures yet. Add one above.</p>
                    )}

                    <div className="space-y-2">
                        {sorted.map((lecture, index) => (
                            <div key={lecture.lecture_id} className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm text-muted-foreground w-5">{index + 1}.</span>

                                    {editingId === lecture.lecture_id ? (
                                        <div className="flex gap-2 flex-1">
                                            <Input
                                                value={editTitle}
                                                onChange={(e) => setEditTitle(e.target.value)}
                                                className="flex-1"
                                            />
                                            <Button
                                                size="sm"
                                                disabled={renameMutation.isPending}
                                                onClick={() =>
                                                    renameMutation.mutate({
                                                        lectureId: lecture.lecture_id,
                                                        title: editTitle,
                                                    })
                                                }
                                            >
                                                Save
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => setEditingId(null)}
                                            >
                                                Cancel
                                            </Button>
                                        </div>
                                    ) : (
                                        <span className="flex-1 text-sm">
                                            {lecture.title}{' '}
                                            <span className="text-muted-foreground">
                                                [{lecture.content_type}]
                                            </span>
                                            {lecture.is_free_preview && (
                                                <span className="ml-2 text-xs border border-border px-1 rounded">
                                                    Free Preview
                                                </span>
                                            )}
                                        </span>
                                    )}

                                    {editingId !== lecture.lecture_id && (
                                        <div className="flex gap-1">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                disabled={index === 0 || reorderMutation.isPending}
                                                onClick={() => moveLecture(index, 'up')}
                                            >
                                                ↑
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                disabled={
                                                    index === sorted.length - 1 ||
                                                    reorderMutation.isPending
                                                }
                                                onClick={() => moveLecture(index, 'down')}
                                            >
                                                ↓
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                disabled={togglePreviewMutation.isPending}
                                                onClick={() =>
                                                    togglePreviewMutation.mutate({
                                                        lectureId: lecture.lecture_id,
                                                        is_free_preview: !lecture.is_free_preview,
                                                    })
                                                }
                                            >
                                                {lecture.is_free_preview ? 'Remove Preview' : 'Set Preview'}
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => {
                                                    setEditingId(lecture.lecture_id);
                                                    setEditTitle(lecture.title);
                                                    setConfirmDeleteId(null);
                                                }}
                                            >
                                                Rename
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="destructive"
                                                onClick={() => {
                                                    setConfirmDeleteId(lecture.lecture_id);
                                                    setEditingId(null);
                                                }}
                                            >
                                                Delete
                                            </Button>
                                        </div>
                                    )}
                                </div>

                                {confirmDeleteId === lecture.lecture_id && (
                                    <div className="ml-6 space-y-2">
                                        <p className="text-sm text-destructive">
                                            Delete &quot;{lecture.title}&quot;? This cannot be undone.
                                        </p>
                                        {deleteMutation.isError && (
                                            <p className="text-sm text-destructive">
                                                {(deleteMutation.error as any)?.response?.data?.message ??
                                                    'Failed to delete.'}
                                            </p>
                                        )}
                                        <div className="flex gap-2">
                                            <Button
                                                size="sm"
                                                variant="destructive"
                                                disabled={deleteMutation.isPending}
                                                onClick={() => deleteMutation.mutate(lecture.lecture_id)}
                                            >
                                                {deleteMutation.isPending ? 'Deleting...' : 'Confirm'}
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => setConfirmDeleteId(null)}
                                            >
                                                Cancel
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
