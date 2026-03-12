import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2, Star, Target } from 'lucide-react';
import { ComicPanel } from '@/components/comic/ComicPanel';

interface StoryPanelData {
    panelId: string;
    imageUrl?: string;
    narration: string;
    speechBubble?: string;
    learningObjective?: string;
}

interface SavedStory {
    id: string;
    topic?: string;
    storyConcept?: string;
    heroName?: string;
    score?: number;
    closingNarration?: string;
    status: string;
    panels: StoryPanelData[];
}

export function StoryViewerPage() {
    const { sessionId } = useParams();
    const [story, setStory] = useState<SavedStory | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        fetch(`http://localhost:8000/api/story-session/${sessionId}`)
            .then(res => res.json())
            .then(data => {
                setStory(data);
                setIsLoading(false);
            })
            .catch(err => {
                console.error('Failed to fetch story', err);
                setIsLoading(false);
            });
    }, [sessionId]);

    if (isLoading) {
        return (
            <div className="min-h-screen bg-amber-50 flex items-center justify-center">
                <Loader2 className="w-12 h-12 text-indigo-600 animate-spin" />
            </div>
        );
    }

    if (!story || !story.panels || story.panels.length === 0) {
        return (
            <div className="min-h-screen bg-amber-50 flex flex-col items-center justify-center p-4 text-center">
                <div className="text-6xl mb-4">🤷</div>
                <h1 className="text-3xl font-comic font-bold text-black uppercase mb-4">Story Not Found</h1>
                <Link to="/library">
                    <Button className="bg-indigo-600 hover:bg-indigo-700 text-white font-comic text-lg border-2 border-black rounded-xl shadow-md">
                        Back to Library
                    </Button>
                </Link>
            </div>
        );
    }

    const title = story.topic || (story.heroName ? `${story.heroName}'s Adventure` : 'Questory Adventure');

    return (
        <div className="min-h-screen bg-amber-50 flex flex-col md:flex-row">
            {/* Left Sidebar Fixed */}
            <div className="w-full md:w-80 md:fixed md:inset-y-0 md:left-0 bg-white border-b-4 md:border-b-0 md:border-r-4 border-black p-6 flex flex-col z-10 shadow-[4px_0px_0px_rgba(0,0,0,1)]">
                <div className="mb-8">
                    <Link to="/library" className="inline-flex">
                        <Button variant="outline" size="sm" className="font-comic border-2 border-black mb-6 hover:bg-indigo-50">
                            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Library
                        </Button>
                    </Link>
                    <h1 className="text-3xl font-comic font-black text-black uppercase leading-tight tracking-wide mb-2">
                        {title}
                    </h1>
                    <p className="text-slate-600 font-semibold mb-6">
                        Hero: {story.heroName || 'Unknown'}
                    </p>

                    <div className="flex gap-2flex-wrap mb-4">
                        {story.status === 'completed' ? (
                            <span className="bg-emerald-400 text-black font-comic text-xs px-3 py-1 font-bold border-2 border-black rounded-full uppercase">
                                The End
                            </span>
                        ) : (
                            <span className="bg-orange-400 text-black font-comic text-xs px-3 py-1 font-bold border-2 border-black rounded-full uppercase">
                                To Be Continued...
                            </span>
                        )}
                        {story.score !== undefined && story.score > 0 && (
                            <span className="bg-yellow-400 text-black font-comic text-xs px-3 py-1 font-bold border-2 border-black rounded-full uppercase flex items-center">
                                <Star className="w-3 h-3 mr-1 fill-black" /> {story.score} Pts
                            </span>
                        )}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto mb-6 pr-2">
                    <h3 className="font-comic font-bold text-black uppercase border-b-2 border-black mb-3 pb-1">Chapters</h3>
                    <ul className="space-y-3">
                        {story.panels.map((p, idx) => (
                            <li key={p.panelId} className="flex gap-3 items-start group">
                                <div className="w-6 h-6 rounded-full bg-indigo-100 border-2 border-black flex-shrink-0 flex items-center justify-center font-comic font-bold text-xs mt-0.5 group-hover:bg-yellow-400 transition-colors">
                                    {idx + 1}
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-slate-800 line-clamp-2 leading-snug">
                                        {p.narration}
                                    </p>
                                    {p.learningObjective && (
                                        <p className="text-[10px] text-slate-500 font-bold mt-1 uppercase flex gap-1 items-center">
                                            <Target className="w-3 h-3" /> {p.learningObjective}
                                        </p>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>

            {/* Right Side Scrolling Layout */}
            <div className="flex-1 md:ml-80 p-4 md:p-8 lg:p-12 overflow-y-auto w-full">
                <div className="max-w-2xl mx-auto flex flex-col gap-12 pb-24">
                    {story.panels.map((panelData, index) => {
                         const comicPanelState = {
                             id: panelData.panelId,
                             panelIndex: index,
                             narration: panelData.narration,
                             speechBubble: panelData.speechBubble,
                             learningObjective: panelData.learningObjective,
                             imageUrl: panelData.imageUrl,
                             imageStatus: panelData.imageUrl ? 'ready' as const : 'loading' as const,
                         };
                         return (
                            <div key={panelData.panelId} className="w-full flex justify-center">
                               <ComicPanel panel={comicPanelState} index={index} />
                            </div>
                         );
                    })}

                    {/* Closing Section */}
                    {story.status === 'completed' && story.closingNarration ? (
                        <div className="bg-white border-4 border-black p-6 rounded-2xl shadow-[8px_8px_0px_rgba(0,0,0,1)] text-center mt-8 relative overflow-hidden">
                            <div className="absolute top-0 right-0 left-0 h-4 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPjxjaXJjbGUgY3g9IjQiIGN5PSI0IiByPSIyIiBmaWxsPSJibGFjayIvPjwvc3ZnPg==')] opacity-10"></div>
                            <h2 className="text-4xl font-comic font-black text-black uppercase mb-4 tracking-wider">The End</h2>
                            <p className="text-lg font-medium italic text-slate-700 font-comic">
                                "...{story.closingNarration}"
                            </p>
                        </div>
                    ) : (
                        story.status !== 'completed' && (
                           <div className="bg-orange-100 border-4 border-black border-dashed p-6 rounded-2xl text-center mt-8">
                               <h2 className="text-2xl font-comic font-bold text-black uppercase mb-2">To Be Continued...</h2>
                               <p className="text-slate-600 font-semibold">This adventure isn't over yet!</p>
                           </div>
                        )
                    )}
                </div>
            </div>
        </div>
    );
}
