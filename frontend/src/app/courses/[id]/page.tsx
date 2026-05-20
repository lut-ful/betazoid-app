'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

interface PublicLecture {
    lecture_id: string;
    title: string;
    content_type: string;
    order: number;
    is_free_preview: boolean;
}

interface PublicSection {
    section_id: string;
    title: string;
    order: number;
    lectures: PublicLecture[];
}

interface PublicCourseDetail {
    course_id: string;
    title: string;
    description: string;
    price: number;
    thumbnail_url: string | null;
    language: string;
    level: string;
    rating: number;
    instructor_name: string;
    category_name: string | null;
    sections: PublicSection[];
}

export default function CourseDetailPage() {
    const params = useParams();
    const courseId = params.id as string;

    const { data: course, isLoading, isError } = useQuery<PublicCourseDetail>({
        queryKey: ['course-public', courseId],
        queryFn: async () => {
            const { data } = await api.get(`/courses/${courseId}/public`);
            return data;
        },
        enabled: !!courseId,
    });

    if (isLoading) return <p className="text-sm text-muted-foreground px-4 py-12">Loading...</p>;
    if (isError || !course) return <p className="text-sm text-destructive px-4 py-12">Course not found.</p>;

    return (
        <div className="max-w-2xl mx-auto px-4 py-12 space-y-4">
            <Card>
                <CardHeader>
                    <CardTitle>{course.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                    <p className="text-sm text-muted-foreground">{course.description}</p>
                    <Separator />
                    <div className="text-sm space-y-1">
                        <p>Instructor: {course.instructor_name}</p>
                        {course.category_name && <p>Category: {course.category_name}</p>}
                        <p>Level: {course.level}</p>
                        <p>Language: {course.language}</p>
                        <p>Rating: {course.rating}</p>
                        <p>Price: ${course.price.toFixed(2)}</p>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Course Content</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {course.sections.length === 0 && (
                        <p className="text-sm text-muted-foreground">No content yet.</p>
                    )}
                    {course.sections.map((section) => (
                        <div key={section.section_id} className="space-y-2">
                            <p className="text-sm font-medium">{section.title}</p>
                            {section.lectures.length === 0 && (
                                <p className="text-sm text-muted-foreground ml-4">No lectures.</p>
                            )}
                            <div className="space-y-1 ml-4">
                                {section.lectures.map((lecture) => (
                                    <div key={lecture.lecture_id} className="flex items-center gap-2 text-sm">
                                        <span>
                                            {lecture.title}{' '}
                                            <span className="text-muted-foreground">[{lecture.content_type}]</span>
                                        </span>
                                        {lecture.is_free_preview ? (
                                            <span className="text-xs border border-border px-1 rounded">
                                                Free Preview
                                            </span>
                                        ) : (
                                            <span className="text-xs text-muted-foreground">Enrolled only</span>
                                        )}
                                    </div>
                                ))}
                            </div>
                            <Separator />
                        </div>
                    ))}
                </CardContent>
            </Card>
        </div>
    );
}
