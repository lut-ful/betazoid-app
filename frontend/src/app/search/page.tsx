'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

interface CourseResult {
    course_id: string;
    title: string;
    instructor_name: string;
    category_name: string | null;
    level: string;
    language: string;
    price: number;
    rating: number;
    thumbnail_url: string | null;
}

interface Category {
    category_id: string;
    name: string;
}

interface SearchParams {
    q: string;
    category: string;
    level: string;
    language: string;
    minPrice: string;
    maxPrice: string;
}

const LEVELS = ['', 'beginner', 'intermediate', 'advanced'];

export default function SearchPage() {
    const [params, setParams] = useState<SearchParams>({
        q: '',
        category: '',
        level: '',
        language: '',
        minPrice: '',
        maxPrice: '',
    });
    const [submitted, setSubmitted] = useState<SearchParams>(params);

    const { data: categories } = useQuery<Category[]>({
        queryKey: ['categories'],
        queryFn: async () => {
            const { data } = await api.get('/categories');
            return data;
        },
    });

    const { data: results, isLoading, isError } = useQuery<CourseResult[]>({
        queryKey: ['course-search', submitted],
        queryFn: async () => {
            const query = new URLSearchParams();
            if (submitted.q) query.set('q', submitted.q);
            if (submitted.category) query.set('category', submitted.category);
            if (submitted.level) query.set('level', submitted.level);
            if (submitted.language) query.set('language', submitted.language);
            if (submitted.minPrice) query.set('minPrice', submitted.minPrice);
            if (submitted.maxPrice) query.set('maxPrice', submitted.maxPrice);
            const { data } = await api.get(`/courses/search?${query.toString()}`);
            return data;
        },
    });

    function handleChange(field: keyof SearchParams, value: string) {
        setParams((prev) => ({ ...prev, [field]: value }));
    }

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setSubmitted(params);
    }

    return (
        <div className="max-w-2xl mx-auto px-4 py-12 space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Browse Courses</CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-1">
                            <Label htmlFor="q">Keyword</Label>
                            <Input
                                id="q"
                                placeholder="e.g. JavaScript, Python..."
                                value={params.q}
                                onChange={(e) => handleChange('q', e.target.value)}
                            />
                        </div>

                        <div className="flex gap-4">
                            <div className="space-y-1 flex-1">
                                <Label htmlFor="category">Category</Label>
                                <select
                                    id="category"
                                    value={params.category}
                                    onChange={(e) => handleChange('category', e.target.value)}
                                    className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background"
                                >
                                    <option value="">All categories</option>
                                    {categories?.map((c) => (
                                        <option key={c.category_id} value={c.category_id}>
                                            {c.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="space-y-1 flex-1">
                                <Label htmlFor="level">Level</Label>
                                <select
                                    id="level"
                                    value={params.level}
                                    onChange={(e) => handleChange('level', e.target.value)}
                                    className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background"
                                >
                                    {LEVELS.map((l) => (
                                        <option key={l} value={l}>
                                            {l ? l.charAt(0).toUpperCase() + l.slice(1) : 'All levels'}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="flex gap-4">
                            <div className="space-y-1 flex-1">
                                <Label htmlFor="language">Language</Label>
                                <Input
                                    id="language"
                                    placeholder="e.g. English"
                                    value={params.language}
                                    onChange={(e) => handleChange('language', e.target.value)}
                                />
                            </div>

                            <div className="space-y-1 flex-1">
                                <Label htmlFor="minPrice">Min Price ($)</Label>
                                <Input
                                    id="minPrice"
                                    type="number"
                                    min="0"
                                    placeholder="0"
                                    value={params.minPrice}
                                    onChange={(e) => handleChange('minPrice', e.target.value)}
                                />
                            </div>

                            <div className="space-y-1 flex-1">
                                <Label htmlFor="maxPrice">Max Price ($)</Label>
                                <Input
                                    id="maxPrice"
                                    type="number"
                                    min="0"
                                    placeholder="Any"
                                    value={params.maxPrice}
                                    onChange={(e) => handleChange('maxPrice', e.target.value)}
                                />
                            </div>
                        </div>

                        <Button type="submit" className="w-full">Search</Button>
                    </form>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Results</CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoading && <p className="text-sm text-muted-foreground">Searching...</p>}
                    {isError && <p className="text-sm text-destructive">Search failed. Please try again.</p>}
                    {results && results.length === 0 && (
                        <p className="text-sm text-muted-foreground">No courses found. Try different filters.</p>
                    )}
                    {results && results.length > 0 && (
                        <ul className="space-y-4">
                            {results.map((course) => (
                                <li key={course.course_id} className="border-b pb-4 last:border-0">
                                    <div className="flex gap-3 items-start">
                                        {course.thumbnail_url && (
                                            <img
                                                src={course.thumbnail_url}
                                                alt={course.title}
                                                className="w-20 h-14 object-cover rounded shrink-0"
                                            />
                                        )}
                                        <div className="flex flex-col gap-0.5 flex-1">
                                            <span className="font-medium text-sm">{course.title}</span>
                                            <span className="text-xs text-muted-foreground">
                                                by {course.instructor_name}
                                                {course.category_name && ` · ${course.category_name}`}
                                            </span>
                                            <span className="text-xs text-muted-foreground capitalize">
                                                {course.level} · {course.language}
                                            </span>
                                            <div className="flex items-center justify-between mt-1">
                                                <span className="text-xs text-muted-foreground">
                                                    ★ {Number(course.rating).toFixed(1)}
                                                </span>
                                                <span className="text-sm font-medium">
                                                    ${Number(course.price).toFixed(2)}
                                                </span>
                                            </div>
                                        </div>
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
