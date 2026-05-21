'use client';

import { useEffect, useRef, useState } from 'react';
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

const BACKEND_ORIGIN = 'http://localhost:3002';

interface LectureResource {
    resource_id: string;
    title: string;
    resource_type: 'file' | 'link';
    url: string;
    original_filename: string | null;
    created_at: string;
}

const linkSchema = z.object({
    title: z.string().min(1, 'Title is required').max(200),
    url: z.string().url('Must be a valid URL (include http:// or https://)'),
});
type LinkForm = z.infer<typeof linkSchema>;

const fileSchema = z.object({
    title: z.string().min(1, 'Title is required').max(200),
});
type FileForm = z.infer<typeof fileSchema>;

export default function ResourcesPage() {
    const router = useRouter();
    const params = useParams();
    const courseId = params.id as string;
    const sectionId = params.sectionId as string;
    const lectureId = params.lectureId as string;
    const accessToken = useAuthStore((s) => s.accessToken);
    const queryClient = useQueryClient();

    const fileInputRef = useRef<HTMLInputElement>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'link' | 'file'>('link');

    useEffect(() => {
        if (!accessToken) router.push('/login');
    }, [accessToken, router]);

    const resourcesBase = `/courses/${courseId}/sections/${sectionId}/lectures/${lectureId}/resources`;

    const { data: resources, isLoading, isError } = useQuery<LectureResource[]>({
        queryKey: ['resources', courseId, sectionId, lectureId],
        queryFn: async () => {
            const { data } = await api.get(resourcesBase);
            return data;
        },
        enabled: !!accessToken && !!courseId && !!sectionId && !!lectureId,
    });

    const {
        register: registerLink,
        handleSubmit: handleLinkSubmit,
        reset: resetLink,
        formState: { errors: linkErrors },
    } = useForm<LinkForm>({ resolver: zodResolver(linkSchema) });

    const {
        register: registerFile,
        handleSubmit: handleFileSubmit,
        reset: resetFile,
        formState: { errors: fileErrors },
    } = useForm<FileForm>({ resolver: zodResolver(fileSchema) });

    const addLinkMutation = useMutation({
        mutationFn: (data: LinkForm) => api.post(`${resourcesBase}/link`, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['resources', courseId, sectionId, lectureId] });
            resetLink();
        },
    });

    const addFileMutation = useMutation({
        mutationFn: async ({ title, file }: { title: string; file: File }) => {
            const formData = new FormData();
            formData.append('title', title);
            formData.append('file', file);
            return api.post(`${resourcesBase}/file`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['resources', courseId, sectionId, lectureId] });
            resetFile();
            if (fileInputRef.current) fileInputRef.current.value = '';
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (resourceId: string) => api.delete(`${resourcesBase}/${resourceId}`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['resources', courseId, sectionId, lectureId] });
            setConfirmDeleteId(null);
        },
    });

    function onLinkSubmit(data: LinkForm) {
        addLinkMutation.mutate(data);
    }

    function onFileSubmit(data: FileForm) {
        const file = fileInputRef.current?.files?.[0];
        if (!file) return;
        addFileMutation.mutate({ title: data.title, file });
    }

    function resourceHref(resource: LectureResource) {
        if (resource.resource_type === 'link') return resource.url;
        return `${BACKEND_ORIGIN}${resource.url}`;
    }

    if (isLoading) return <p className="text-sm text-muted-foreground px-4 py-12">Loading...</p>;
    if (isError) return <p className="text-sm text-destructive px-4 py-12">Failed to load resources.</p>;

    return (
        <div className="max-w-2xl mx-auto px-4 py-12">
            <Card>
                <CardHeader>
                    <CardTitle>Lecture Resources</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Button variant="outline" asChild>
                        <Link href={`/courses/${courseId}/sections/${sectionId}/lectures`}>
                            ← Back to Lectures
                        </Link>
                    </Button>

                    <Separator />

                    {/* Tab selector */}
                    <div className="flex gap-2">
                        <Button
                            variant={activeTab === 'link' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setActiveTab('link')}
                        >
                            Add Link
                        </Button>
                        <Button
                            variant={activeTab === 'file' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setActiveTab('file')}
                        >
                            Upload File
                        </Button>
                    </div>

                    {/* Add link form */}
                    {activeTab === 'link' && (
                        <form onSubmit={handleLinkSubmit(onLinkSubmit)} className="space-y-2">
                            <div className="space-y-1">
                                <Label>Title</Label>
                                <Input placeholder="e.g. Slide deck" {...registerLink('title')} />
                                {linkErrors.title && (
                                    <p className="text-sm text-destructive">{linkErrors.title.message}</p>
                                )}
                            </div>
                            <div className="space-y-1">
                                <Label>URL</Label>
                                <Input placeholder="https://example.com/slides.pdf" {...registerLink('url')} />
                                {linkErrors.url && (
                                    <p className="text-sm text-destructive">{linkErrors.url.message}</p>
                                )}
                            </div>
                            <Button type="submit" disabled={addLinkMutation.isPending}>
                                {addLinkMutation.isPending ? 'Adding...' : 'Add Link'}
                            </Button>
                            {addLinkMutation.isError && (
                                <p className="text-sm text-destructive">
                                    {(addLinkMutation.error as any)?.response?.data?.message ?? 'Failed to add link.'}
                                </p>
                            )}
                            {addLinkMutation.isSuccess && (
                                <p className="text-sm">Link added.</p>
                            )}
                        </form>
                    )}

                    {/* Upload file form */}
                    {activeTab === 'file' && (
                        <form onSubmit={handleFileSubmit(onFileSubmit)} className="space-y-2">
                            <div className="space-y-1">
                                <Label>Title</Label>
                                <Input placeholder="e.g. Exercise files" {...registerFile('title')} />
                                {fileErrors.title && (
                                    <p className="text-sm text-destructive">{fileErrors.title.message}</p>
                                )}
                            </div>
                            <div className="space-y-1">
                                <Label>File (PDF, ZIP, PPT, DOC, XLS — max 50 MB)</Label>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".pdf,.zip,.ppt,.pptx,.doc,.docx,.xls,.xlsx"
                                    className="w-full border border-border rounded px-3 py-2 text-sm bg-background"
                                />
                            </div>
                            <Button type="submit" disabled={addFileMutation.isPending}>
                                {addFileMutation.isPending ? 'Uploading...' : 'Upload File'}
                            </Button>
                            {addFileMutation.isError && (
                                <p className="text-sm text-destructive">
                                    {(addFileMutation.error as any)?.response?.data?.message ?? 'Failed to upload file.'}
                                </p>
                            )}
                            {addFileMutation.isSuccess && (
                                <p className="text-sm">File uploaded.</p>
                            )}
                        </form>
                    )}

                    <Separator />

                    {/* Resources list */}
                    {resources?.length === 0 && (
                        <p className="text-sm text-muted-foreground">No resources attached yet.</p>
                    )}

                    <div className="space-y-2">
                        {resources?.map((resource) => (
                            <div key={resource.resource_id} className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-muted-foreground uppercase w-8">
                                        {resource.resource_type === 'file' ? 'file' : 'link'}
                                    </span>
                                    <span className="flex-1 text-sm">
                                        <a
                                            href={resourceHref(resource)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="underline"
                                        >
                                            {resource.title}
                                        </a>
                                        {resource.original_filename && (
                                            <span className="ml-2 text-xs text-muted-foreground">
                                                ({resource.original_filename})
                                            </span>
                                        )}
                                    </span>
                                    <Button
                                        size="sm"
                                        variant="destructive"
                                        onClick={() => {
                                            setConfirmDeleteId(resource.resource_id);
                                        }}
                                    >
                                        Delete
                                    </Button>
                                </div>

                                {confirmDeleteId === resource.resource_id && (
                                    <div className="ml-10 space-y-2">
                                        <p className="text-sm text-destructive">
                                            Delete &quot;{resource.title}&quot;? This cannot be undone.
                                        </p>
                                        <div className="flex gap-2">
                                            <Button
                                                size="sm"
                                                variant="destructive"
                                                disabled={deleteMutation.isPending}
                                                onClick={() => deleteMutation.mutate(resource.resource_id)}
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
