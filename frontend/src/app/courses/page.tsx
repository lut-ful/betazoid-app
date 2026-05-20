'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import api from '@/lib/axios';
import { useAuthStore } from '@/store/auth.store';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Course {
    course_id: string;
    title: string;
    description: string;
    price: string;
    thumbnail_url: string | null;
    language: string;
    level: string;
    status: string;
    category: { category_id: string; name: string } | null;
    created_at: string;
}

export default function CoursesPage() {
    const router = useRouter();
    const accessToken = useAuthStore((s) => s.accessToken);

    useEffect(() => {
        if (!accessToken) router.push('/login');
    }, [accessToken, router]);

    const { data: courses, isLoading, isError } = useQuery<Course[]>({
        queryKey: ['my-courses'],
        queryFn: async () => {
            const { data } = await api.get('/courses');
            return data;
        },
        enabled: !!accessToken,
    });

    return (
        <div className="max-w-2xl mx-auto px-4 py-12 space-y-6">
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle>My Courses</CardTitle>
                        <Button asChild>
                            <Link href="/courses/create">New Course</Link>
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
                    {isError && <p className="text-sm text-destructive">Failed to load courses.</p>}
                    {courses && courses.length === 0 && (
                        <p className="text-sm text-muted-foreground">No courses yet. Create your first one.</p>
                    )}
                    {courses && courses.length > 0 && (
                        <ul className="space-y-4">
                            {courses.map((course) => (
                                <li key={course.course_id} className="border-b pb-4 last:border-0">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex flex-col gap-0.5">
                                            <span className="font-medium text-sm">{course.title}</span>
                                            <span className="text-xs text-muted-foreground capitalize">
                                                {course.status} · {course.level} · {course.language}
                                            </span>
                                            <span className="text-xs text-muted-foreground">
                                                ${parseFloat(course.price).toFixed(2)}
                                                {course.category && ` · ${course.category.name}`}
                                            </span>
                                        </div>
                                        {course.status === 'draft' && (
                                            <Button variant="outline" size="sm" asChild>
                                                <Link href={`/courses/${course.course_id}/edit`}>Edit</Link>
                                            </Button>
                                        )}
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
