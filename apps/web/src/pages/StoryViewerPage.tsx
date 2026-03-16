import { useEffect, useState } from 'react';
import { API_URL } from '@/config';
import { useParams, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2, Star, Target, Play } from 'lucide-react';
import { ComicPanel } from '@/components/comic/ComicPanel';
import { SlideshowOverlay } from '@/components/comic/SlideshowOverlay';
import { getMediaUrl } from '@/lib/utils';

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
    is_permanently_saved?: boolean;
    panels: StoryPanelData[];
}

const getDynamicPanelClasses = (index: number, total: number) => {
    const getSpan = (cols: number) => {
        const baseCells = total + 1;
        const rem = baseCells % cols;
        const pad = rem === 0 ? 0 : cols - rem;
        const MathW = (baseCells < cols) ? total : rem;
        
        let baseSpan = index === 0 ? 2 : 1;
        if (cols === 1) return baseSpan;
        
        if (pad > 0 && index >= total - MathW) {
            const d = (total - 1) - index;
            const extra = Math.floor(pad / MathW) + (d < (pad % MathW) ? 1 : 0);
            return baseSpan + extra;
        }
        return baseSpan;
    };

    const smSpan = getSpan(1); 
    const mdSpan = getSpan(2);
    const lgSpan = getSpan(3);

    const classes = [
        smSpan === 2 ? 'col-span-2 aspect-video' : 'col-span-1 aspect-square',
        
        mdSpan === 1 ? 'md:col-span-1 md:aspect-square' :
        mdSpan === 2 ? 'md:col-span-2 md:aspect-video' :
        'md:col-span-3 md:aspect-[3/1]',
        
        lgSpan === 1 ? 'lg:col-span-1 lg:aspect-square' :
        lgSpan === 2 ? 'lg:col-span-2 lg:aspect-video' :
        lgSpan === 3 ? 'lg:col-span-3 lg:aspect-[3/1]' :
        'lg:col-span-4 lg:aspect-[4/1]'
    ];
    
    return classes.join(' ');
};

export function StoryViewerPage() {
    const { sessionId } = useParams();
    const [story, setStory] = useState<SavedStory | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [hasSaved, setHasSaved] = useState(false);
    const [slideshowActive, setSlideshowActive] = useState(false);

    useEffect(() => {
        fetch(`${API_URL}/api/story-session/${sessionId}`)
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

    const handleSaveToLibrary = async () => {
        if (!sessionId) return;
        setIsSaving(true);
        try {
            const res = await fetch(`${API_URL}/api/library/save/${sessionId}`, {
                method: 'POST'
            });
            if (res.ok) {
                setHasSaved(true);
            } else {
                console.error("Failed to save story");
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsSaving(false);
        }
    };

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
    const totalPanels = story.panels.length;

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
                    
                    <div className="flex flex-col gap-3">
                        <button
                            onClick={() => setSlideshowActive(true)}
                            className="bg-indigo-600 text-white font-comic text-sm border-2 border-black font-bold uppercase py-2 px-4 rounded-xl shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_rgba(0,0,0,1)] active:translate-y-[4px] active:shadow-none transition-all flex items-center justify-center gap-2"
                        >
                            <Play className="w-5 h-5 fill-white" />
                            Play Slideshow
                        </button>
                        
                        <button
                            onClick={handleSaveToLibrary}
                            disabled={isSaving || hasSaved || story.is_permanently_saved}
                            className={`font-comic text-sm border-2 border-black font-bold uppercase py-2 px-4 rounded-xl shadow-[4px_4px_0px_rgba(0,0,0,1)] transition-all flex items-center justify-center gap-2 ${
                                hasSaved || story.is_permanently_saved 
                                    ? "bg-green-500 text-white shadow-none translate-y-[4px]" 
                                    : "bg-orange-500 text-white hover:translate-y-[2px] hover:shadow-[2px_2px_0px_rgba(0,0,0,1)] active:translate-y-[4px] active:shadow-none"
                            }`}
                        >
                            {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                            {hasSaved || story.is_permanently_saved ? 'Saved Permanently ✓' : 'Save to Library File'}
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto mt-6 mb-6 pr-2">
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
                <div className="w-full max-w-[1600px] mx-auto flex flex-col pb-24">
                    <div className="bg-white border-4 border-black grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-[3px] p-[3px]">
                        {story.panels.map((panelData, index) => {
                             const comicPanelState = {
                                 id: panelData.panelId,
                                 panelIndex: index,
                                 narration: panelData.narration,
                                 speechBubble: panelData.speechBubble,
                                 learningObjective: panelData.learningObjective,
                                 imageUrl: getMediaUrl(panelData.imageUrl),
                                 imageStatus: panelData.imageUrl ? 'ready' as const : 'loading' as const,
                             };
                             return (
                                <ComicPanel 
                                    key={panelData.panelId} 
                                    panel={comicPanelState} 
                                    isLatest={false} 
                                    className={getDynamicPanelClasses(index, totalPanels)}
                                />
                             );
                        })}
                    </div>

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

            {slideshowActive && (
                <SlideshowOverlay 
                    panels={story.panels} 
                    onClose={() => setSlideshowActive(false)} 
                />
            )}
        </div>
    );
}
