import { useEffect, useState } from 'react';
import { API_URL } from '@/config';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { BookOpen, Loader2, Star } from 'lucide-react';
import { getMediaUrl } from '@/lib/utils';
import { ComicPanel } from '@/components/comic/ComicPanel';

interface StoryPanel {
    id?: string;
    panelIndex?: number;
    narration?: string;
    speechBubble?: string;
    learningObjective?: string;
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
        fetch(`${API_URL}/api/library`)
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
                    <div className="flex flex-col gap-12">
                        {stories.map((story) => (
                            <div key={story.id} className="bg-white border-4 border-black rounded-2xl p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col">
                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 border-b-4 border-black pb-4">
                                    <div>
                                        <div className="flex items-center gap-3 mb-1">
                                            <h2 className="text-3xl font-comic font-bold text-black uppercase line-clamp-1" title={story.topic || 'Questory Adventure'}>
                                                {story.topic || 'Questory Adventure'}
                                            </h2>
                                            {story.status === "completed" && (
                                                <span className="bg-emerald-400 border-2 border-black text-black font-comic text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide whitespace-nowrap">
                                                    Finished
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-slate-600 font-semibold">Hero: {story.heroName || 'Unknown'} • {story.totalPanels || (story.panels ? story.panels.length : 0)} Panels</p>
                                    </div>
                                    <div className="flex items-center gap-3 w-full sm:w-auto">
                                        {story.score !== undefined && story.score > 0 && (
                                            <div className="bg-yellow-400 border-2 border-black text-black font-comic text-sm px-3 py-1.5 rounded-xl font-bold uppercase tracking-wide flex items-center shadow-sm whitespace-nowrap">
                                                <Star className="w-4 h-4 mr-1 fill-black" />
                                                {story.score} PTS
                                            </div>
                                        )}
                                        <Link to={`/view/${story.id}`} className="w-full sm:w-auto">
                                            <Button className="w-full bg-yellow-400 hover:bg-yellow-500 text-black font-comic text-sm border-2 border-black rounded-xl transition-colors shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5">
                                                Read <BookOpen className="w-4 h-4 ml-1" />
                                            </Button>
                                        </Link>
                                    </div>
                                </div>
                                
                                {/* Comic Panels Strip */}
                                {story.panels && story.panels.length > 0 ? (
                                    <div className="flex overflow-x-auto gap-6 pb-6 pt-2 px-2 snap-x hide-scrollbar" style={{ maskImage: 'linear-gradient(to right, black 95%, transparent 100%)' }}>
                                        {story.panels.map((panel, idx) => {
                                             const comicPanelState = {
                                                 id: panel.id || `panel_${idx}`,
                                                 panelIndex: panel.panelIndex !== undefined ? panel.panelIndex : idx,
                                                 narration: panel.narration || '',
                                                 speechBubble: panel.speechBubble,
                                                 learningObjective: panel.learningObjective,
                                                 imageUrl: getMediaUrl(panel.imageUrl),
                                                 imageStatus: panel.imageUrl ? 'ready' as const : 'loading' as const,
                                             };
                                             return (
                                                 <div key={idx} className="flex-none w-[280px] md:w-[320px] lg:w-[350px] snap-start hover:scale-[1.02] transition-transform duration-200">
                                                     <ComicPanel panel={comicPanelState} isLatest={false} isSplash={false} />
                                                 </div>
                                             );
                                        })}
                                    </div>
                                ) : (
                                    <div className="py-16 bg-zinc-50 border-2 border-dashed border-slate-300 rounded-xl flex items-center justify-center">
                                        <div className="text-center">
                                            <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                                            <p className="font-comic text-slate-400 text-lg">No panels to display</p>
                                        </div>
                                    </div>
                                )}
                            </div>
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
            {/* Adding basic custom scrollbar hiding for clean look */}
            <style>{`
                .hide-scrollbar::-webkit-scrollbar {
                    display: none;
                }
                .hide-scrollbar {
                    -ms-overflow-style: none;
                    scrollbar-width: none;
                }
            `}</style>
        </div>
    );
}
