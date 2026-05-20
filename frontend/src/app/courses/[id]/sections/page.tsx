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

interface Section {
    section_id: string;
    title: string;
    order: number;
}

const addSectionSchema = z.object({
    title: z.string().min(1, 'Title is required').max(200),
});

type AddSectionForm = z.infer<typeof addSectionSchema>;

export default function SectionsPage() {
    const router = useRouter();
    const params = useParams();
    const courseId = params.id as string;
    const accessToken = useAuthStore((s) => s.accessToken);
    const queryClient = useQueryClient();

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editTitle, setEditTitle] = useState('');
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

    useEffect(() => {
        if (!accessToken) router.push('/login');
    }, [accessToken, router]);

    const { data: sections, isLoading, isError } = useQuery<Section[]>({
        queryKey: ['sections', courseId],
        queryFn: async () => {
            const { data } = await api.get(`/courses/${courseId}/sections`);
            return data;
        },
        enabled: !!accessToken && !!courseId,
    });

    const {
        register,
        handleSubmit,
        reset,
        formState: { errors },
    } = useForm<AddSectionForm>({ resolver: zodResolver(addSectionSchema) });

    const addMutation = useMutation({
        mutationFn: (data: AddSectionForm) => api.post(`/courses/${courseId}/sections`, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['sections', courseId] });
            reset();
        },
    });

    const renameMutation = useMutation({
        mutationFn: ({ sectionId, title }: { sectionId: string; title: string }) =>
            api.patch(`/courses/${courseId}/sections/${sectionId}`, { title }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['sections', courseId] });
            setEditingId(null);
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (sectionId: string) =>
            api.delete(`/courses/${courseId}/sections/${sectionId}`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['sections', courseId] });
            setConfirmDeleteId(null);
        },
    });

    const reorderMutation = useMutation({
        mutationFn: (orderedIds: string[]) =>
            api.post(`/courses/${courseId}/sections/reorder`, { orderedIds }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['sections', courseId] });
        },
    });

    function moveSection(index: number, direction: 'up' | 'down') {
        if (!sections) return;
        const ordered = [...sections].sort((a, b) => a.order - b.order);
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= ordered.length) return;
        const ids = ordered.map((s) => s.section_id);
        [ids[index], ids[targetIndex]] = [ids[targetIndex], ids[index]];
        reorderMutation.mutate(ids);
    }

    if (isLoading) return <p className="text-sm text-muted-foreground px-4 py-12">Loading...</p>;
    if (isError) return <p className="text-sm text-destructive px-4 py-12">Failed to load sections.</p>;

    const sorted = sections ? [...sections].sort((a, b) => a.order - b.order) : [];

    return (
        <div className="max-w-2xl mx-auto px-4 py-12">
            <Card>
                <CardHeader>
                    <CardTitle>Manage Sections</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Button variant="outline" asChild>
                        <Link href={`/courses/${courseId}/edit`}>← Back to Course</Link>
                    </Button>

                    <Separator />

                    <form
                        onSubmit={handleSubmit((data) => addMutation.mutate(data))}
                        className="space-y-2"
                    >
                        <Label htmlFor="title">Add Section</Label>
                        <div className="flex gap-2">
                            <Input
                                id="title"
                                placeholder="Section title"
                                {...register('title')}
                            />
                            <Button type="submit" disabled={addMutation.isPending}>
                                {addMutation.isPending ? 'Adding...' : 'Add'}
                            </Button>
                        </div>
                        {errors.title && (
                            <p className="text-sm text-destructive">{errors.title.message}</p>
                        )}
                        {addMutation.isError && (
                            <p className="text-sm text-destructive">
                                {(addMutation.error as any)?.response?.data?.message ?? 'Failed to add section.'}
                            </p>
                        )}
                    </form>

                    <Separator />

                    {sorted.length === 0 && (
                        <p className="text-sm text-muted-foreground">No sections yet. Add one above.</p>
                    )}

                    <div className="space-y-2">
                        {sorted.map((section, index) => (
                            <div key={section.section_id} className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm text-muted-foreground w-5">{index + 1}.</span>

                                    {editingId === section.section_id ? (
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
                                                        sectionId: section.section_id,
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
                                        <span className="flex-1 text-sm">{section.title}</span>
                                    )}

                                    {editingId !== section.section_id && (
                                        <div className="flex gap-1">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                disabled={index === 0 || reorderMutation.isPending}
                                                onClick={() => moveSection(index, 'up')}
                                            >
                                                ↑
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                disabled={index === sorted.length - 1 || reorderMutation.isPending}
                                                onClick={() => moveSection(index, 'down')}
                                            >
                                                ↓
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => {
                                                    setEditingId(section.section_id);
                                                    setEditTitle(section.title);
                                                    setConfirmDeleteId(null);
                                                }}
                                            >
                                                Rename
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="destructive"
                                                onClick={() => {
                                                    setConfirmDeleteId(section.section_id);
                                                    setEditingId(null);
                                                }}
                                            >
                                                Delete
                                            </Button>
                                        </div>
                                    )}
                                </div>

                                {confirmDeleteId === section.section_id && (
                                    <div className="ml-6 space-y-2">
                                        <p className="text-sm text-destructive">
                                            Delete &quot;{section.title}&quot;? This cannot be undone.
                                        </p>
                                        {deleteMutation.isError && (
                                            <p className="text-sm text-destructive">
                                                {(deleteMutation.error as any)?.response?.data?.message ?? 'Failed to delete.'}
                                            </p>
                                        )}
                                        <div className="flex gap-2">
                                            <Button
                                                size="sm"
                                                variant="destructive"
                                                disabled={deleteMutation.isPending}
                                                onClick={() => deleteMutation.mutate(section.section_id)}
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
