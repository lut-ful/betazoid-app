'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import api from '@/lib/axios';
import { useAuthStore } from '@/store/auth.store';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface PendingCourse {
    course_id: string;
    title: string;
    description: string;
    price: string;
    language: string;
    level: string;
    updated_at: string;
    instructor: { user_id: string; full_name: string; email: string };
    category: { category_id: string; name: string } | null;
}

export default function PendingCoursesPage() {
    const router = useRouter();
    const accessToken = useAuthStore((s) => s.accessToken);

    useEffect(() => {
        if (!accessToken) router.push('/login');
    }, [accessToken, router]);

    const { data: courses, isLoading, isError } = useQuery<PendingCourse[]>({
        queryKey: ['pending-courses'],
        queryFn: async () => {
            const { data } = await api.get('/courses/pending');
            return data;
        },
        enabled: !!accessToken,
    });

    return (
        <div className="max-w-2xl mx-auto px-4 py-12 space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Pending Course Reviews</CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
                    {isError && (
                        <p className="text-sm text-destructive">
                            Failed to load pending courses. You may not have the required permission.
                        </p>
                    )}
                    {courses && courses.length === 0 && (
                        <p className="text-sm text-muted-foreground">No courses awaiting review.</p>
                    )}
                    {courses && courses.length > 0 && (
                        <ul className="space-y-4">
                            {courses.map((course) => (
                                <li key={course.course_id} className="border-b pb-4 last:border-0">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex flex-col gap-0.5">
                                            <span className="font-medium text-sm">{course.title}</span>
                                            <span className="text-xs text-muted-foreground">
                                                {course.instructor.full_name} · {course.language} · {course.level}
                                                {course.category && ` · ${course.category.name}`}
                                            </span>
                                            <span className="text-xs text-muted-foreground">
                                                ${parseFloat(course.price).toFixed(2)}
                                            </span>
                                        </div>
                                        <Button variant="outline" size="sm" asChild>
                                            <Link href={`/admin/courses/${course.course_id}/review`}>Review</Link>
                                        </Button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
