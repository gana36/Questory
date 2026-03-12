import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { BookOpen, Loader2, Star } from 'lucide-react';

interface StoryPanel {
    imageUrl?: string;
}

interface SavedStory {
    id: string;
    topic?: string;
    heroName?: string;
    score?: number;
    status?: string;
    totalPanels?: number;
    panels?: StoryPanel[];
}

export function LibraryPage() {
    const [stories, setStories] = useState<SavedStory[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        fetch('http://localhost:8000/api/library')
            .then(res => res.json())
            .then(data => {
                setStories(data.stories || []);
                setIsLoading(false);
            })
            .catch(err => {
                console.error('Failed to fetch library', err);
                setIsLoading(false);
            });
    }, []);

    return (
        <div className="min-h-screen bg-amber-50 flex flex-col p-4 md:p-6 lg:p-8">
            <div className="max-w-6xl mx-auto w-full">
                <div className="flex justify-between items-center mb-10 border-b-4 border-black pb-4">
                    <div className="flex items-center gap-3">
                        <BookOpen className="w-8 h-8 text-black" />
                        <h1 className="text-4xl font-comic font-bold text-black uppercase tracking-wide">Your Comic Library</h1>
                    </div>
                    <Link to="/create">
                        <Button className="bg-indigo-600 hover:bg-indigo-700 text-white font-comic text-lg px-6 py-2 rounded-xl border-2 border-black transition-colors">
                            New Adventure
                        </Button>
                    </Link>
                </div>

                {isLoading ? (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="w-12 h-12 text-indigo-600 animate-spin" />
                    </div>
                ) : stories.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {stories.map((story) => (
                            <Card key={story.id} className="overflow-hidden bg-white border-4 border-black rounded-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-1 transition-all">
                                <div className="h-40 bg-zinc-100 flex items-center justify-center border-b-4 border-black relative overflow-hidden">
                                    {story.panels && story.panels.length > 0 && story.panels[0].imageUrl ? (
                                        <img src={story.panels[0].imageUrl} alt="Cover" className="w-full h-full object-cover" />
                                    ) : (
                                        <BookOpen className="w-16 h-16 text-slate-300" />
                                    )}
                                    <div className="absolute top-2 right-2 flex flex-col items-end gap-1">
                                        {story.score !== undefined && story.score > 0 && (
                                            <div className="bg-yellow-400 border-2 border-black text-black font-comic text-xs px-2 py-0.5 rounded-full font-bold uppercase tracking-wide flex items-center shadow-sm">
                                                <Star className="w-3 h-3 mr-1 fill-black" />
                                                {story.score} PTS
                                            </div>
                                        )}
                                        {story.status === "completed" && (
                                            <div className="bg-emerald-400 border-2 border-black text-black font-comic text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide shadow-sm">
                                                Finished
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <CardHeader className="pb-2 bg-amber-50">
                                    <CardTitle className="font-comic text-xl text-black line-clamp-2 uppercase leading-tight mb-1" title={story.topic || 'Questory Adventure'}>
                                        {story.topic || 'Questory Adventure'}
                                    </CardTitle>
                                    <CardDescription className="text-slate-600 font-semibold text-sm">Hero: {story.heroName || 'Unknown'}</CardDescription>
                                </CardHeader>
                                <CardContent className="pt-4 bg-amber-50 border-t-2 border-black/10 flex justify-between items-center">
                                    <span className="text-sm font-bold text-slate-500">{story.totalPanels || (story.panels ? story.panels.length : 0)} Panels</span>
                                    <Link to={`/view/${story.id}`}>
                                        <Button className="bg-yellow-400 hover:bg-yellow-500 text-black font-comic text-sm border-2 border-black rounded-xl transition-colors">
                                            Read Comic <BookOpen className="w-4 h-4 ml-1" />
                                        </Button>
                                    </Link>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-24 bg-white rounded-2xl border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
                        <div className="text-6xl mb-6">🏜️</div>
                        <h2 className="text-3xl font-comic text-black uppercase mb-2">It's quiet in here...</h2>
                        <p className="text-slate-600 font-semibold mb-8">Start your first learning adventure to fill up your library screen!</p>
                        <Link to="/create">
                            <Button className="bg-indigo-600 hover:bg-indigo-700 text-white font-comic text-xl px-8 py-4 rounded-xl border-2 border-black transition-colors shadow-md">
                                Create a Story
                            </Button>
                        </Link>
                    </div>
                )}
            </div>
        </div>
    );
}
