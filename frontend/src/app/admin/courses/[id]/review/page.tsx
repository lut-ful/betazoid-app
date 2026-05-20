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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

const rejectSchema = z.object({
    reason: z.string().min(1, 'Rejection reason is required'),
});

type RejectFormData = z.infer<typeof rejectSchema>;

interface CourseDetail {
    course_id: string;
    title: string;
    description: string;
    price: string;
    thumbnail_url: string | null;
    language: string;
    level: string;
    status: string;
    instructor: { user_id: string; full_name: string; email: string };
    category: { category_id: string; name: string } | null;
    created_at: string;
    updated_at: string;
}

export default function ReviewCoursePage() {
    const router = useRouter();
    const params = useParams();
    const courseId = params.id as string;
    const accessToken = useAuthStore((s) => s.accessToken);
    const queryClient = useQueryClient();
    const [confirmApprove, setConfirmApprove] = useState(false);
    const [showRejectForm, setShowRejectForm] = useState(false);

    useEffect(() => {
        if (!accessToken) router.push('/login');
    }, [accessToken, router]);

    const { data: course, isLoading, isError } = useQuery<CourseDetail>({
        queryKey: ['course-review', courseId],
        queryFn: async () => {
            const { data } = await api.get(`/courses/${courseId}/review`);
            return data;
        },
        enabled: !!accessToken && !!courseId,
    });

    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<RejectFormData>({ resolver: zodResolver(rejectSchema) });

    const approveMutation = useMutation({
        mutationFn: () => api.post(`/courses/${courseId}/approve`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['pending-courses'] });
            router.push('/admin/courses/pending');
        },
    });

    const rejectMutation = useMutation({
        mutationFn: (data: RejectFormData) => api.post(`/courses/${courseId}/reject`, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['pending-courses'] });
            router.push('/admin/courses/pending');
        },
    });

    if (isLoading) return <p className="text-sm text-muted-foreground px-4 py-12">Loading...</p>;
    if (isError) return <p className="text-sm text-destructive px-4 py-12">Course not found or access denied.</p>;

    return (
        <div className="max-w-2xl mx-auto px-4 py-12 space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Review Course</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Title</p>
                        <p className="text-sm font-medium">{course?.title}</p>
                    </div>
                    <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Instructor</p>
                        <p className="text-sm">{course?.instructor.full_name} ({course?.instructor.email})</p>
                    </div>
                    <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Description</p>
                        <p className="text-sm whitespace-pre-wrap">{course?.description}</p>
                    </div>
                    <div className="flex gap-8">
                        <div className="space-y-1">
                            <p className="text-xs text-muted-foreground">Price</p>
                            <p className="text-sm">${course ? parseFloat(course.price).toFixed(2) : ''}</p>
                        </div>
                        <div className="space-y-1">
                            <p className="text-xs text-muted-foreground">Level</p>
                            <p className="text-sm capitalize">{course?.level}</p>
                        </div>
                        <div className="space-y-1">
                            <p className="text-xs text-muted-foreground">Language</p>
                            <p className="text-sm">{course?.language}</p>
                        </div>
                        {course?.category && (
                            <div className="space-y-1">
                                <p className="text-xs text-muted-foreground">Category</p>
                                <p className="text-sm">{course.category.name}</p>
                            </div>
                        )}
                    </div>
                    {course?.thumbnail_url && (
                        <div className="space-y-1">
                            <p className="text-xs text-muted-foreground">Thumbnail</p>
                            <p className="text-sm break-all">{course.thumbnail_url}</p>
                        </div>
                    )}

                    <Separator />

                    {course?.status !== 'pending' ? (
                        <div className="space-y-2">
                            <p className="text-sm text-muted-foreground">
                                This course is no longer pending (status: <span className="capitalize">{course?.status}</span>).
                            </p>
                            <Button variant="outline" asChild>
                                <Link href="/admin/courses/pending">Back to queue</Link>
                            </Button>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <p className="text-sm font-medium">Decision</p>

                            {!confirmApprove && !showRejectForm && (
                                <div className="flex gap-2">
                                    <Button onClick={() => setConfirmApprove(true)}>Approve</Button>
                                    <Button variant="destructive" onClick={() => setShowRejectForm(true)}>
                                        Reject
                                    </Button>
                                    <Button variant="outline" asChild>
                                        <Link href="/admin/courses/pending">Back</Link>
                                    </Button>
                                </div>
                            )}

                            {confirmApprove && (
                                <div className="space-y-2">
                                    <p className="text-sm">Approve this course and publish it?</p>
                                    {approveMutation.isError && (
                                        <p className="text-sm text-destructive">
                                            {(approveMutation.error as any)?.response?.data?.message ?? 'Failed to approve.'}
                                        </p>
                                    )}
                                    <div className="flex gap-2">
                                        <Button
                                            disabled={approveMutation.isPending}
                                            onClick={() => approveMutation.mutate()}
                                        >
                                            {approveMutation.isPending ? 'Approving...' : 'Confirm Approve'}
                                        </Button>
                                        <Button variant="outline" onClick={() => setConfirmApprove(false)}>
                                            Cancel
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {showRejectForm && (
                                <form
                                    onSubmit={handleSubmit((data) => rejectMutation.mutate(data))}
                                    className="space-y-3"
                                >
                                    <div className="space-y-1">
                                        <Label htmlFor="reason">Rejection reason</Label>
                                        <Textarea
                                            id="reason"
                                            {...register('reason')}
                                            placeholder="Explain what the instructor needs to change..."
                                        />
                                        {errors.reason && (
                                            <p className="text-sm text-destructive">{errors.reason.message}</p>
                                        )}
                                    </div>
                                    {rejectMutation.isError && (
                                        <p className="text-sm text-destructive">
                                            {(rejectMutation.error as any)?.response?.data?.message ?? 'Failed to reject.'}
                                        </p>
                                    )}
                                    <div className="flex gap-2">
                                        <Button
                                            type="submit"
                                            variant="destructive"
                                            disabled={rejectMutation.isPending}
                                        >
                                            {rejectMutation.isPending ? 'Rejecting...' : 'Confirm Reject'}
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={() => setShowRejectForm(false)}
                                        >
                                            Cancel
                                        </Button>
                                    </div>
                                </form>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
