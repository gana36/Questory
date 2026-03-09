import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { Mic, MicOff, Send, BookOpen, Loader2 } from 'lucide-react';
import { useStoryBuilder, type StorySessionContext } from '@/hooks/useStoryBuilder';
import { ComicPanel } from '@/components/comic/ComicPanel';
import { QuizOverlay } from '@/components/comic/QuizOverlay';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export function StoryBuilderPage() {
    const { sessionId } = useParams<{ sessionId: string }>();
    const location = useLocation();
    const navigate = useNavigate();
    const storyCtx = location.state as StorySessionContext | null;

    const {
        panels,
        activeQuiz,
        builderPhase,
        score,
        isThinking,
        status,
        closingNarration,
        connect,
        disconnect,
        sendText,
        submitQuizAnswer,
        getVolume,
    } = useStoryBuilder(sessionId ?? 'default');

    const [textInput, setTextInput] = useState('');
    const [isMicActive, setIsMicActive] = useState(false);
    const [narrationLog, setNarrationLog] = useState<string[]>([]);
    const [volume, setVolume] = useState(0);

    const panelsEndRef = useRef<HTMLDivElement>(null);
    const narrationEndRef = useRef<HTMLDivElement>(null);
    const volumeRafRef = useRef<number | null>(null);

    // Auto-connect on mount if we have context
    useEffect(() => {
        if (storyCtx && sessionId) {
            connect(storyCtx).then(() => setIsMicActive(true));
        }
        return () => disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Auto-scroll to latest panel
    useEffect(() => {
        panelsEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, [panels.length]);

    // Auto-scroll narration log
    useEffect(() => {
        narrationEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, [narrationLog.length]);

    // Build narration log from panel narrations
    useEffect(() => {
        if (panels.length > 0) {
            const lastPanel = panels[panels.length - 1];
            setNarrationLog(prev => {
                const alreadyAdded = prev.some(entry => entry === lastPanel.narration);
                if (alreadyAdded) return prev;
                return [...prev, lastPanel.narration];
            });
        }
    }, [panels]);

    // Volume animation loop
    const startVolumeLoop = useCallback(() => {
        const loop = () => {
            setVolume(getVolume());
            volumeRafRef.current = requestAnimationFrame(loop);
        };
        volumeRafRef.current = requestAnimationFrame(loop);
    }, [getVolume]);

    useEffect(() => {
        if (status === 'connected') {
            startVolumeLoop();
        }
        return () => {
            if (volumeRafRef.current) cancelAnimationFrame(volumeRafRef.current);
        };
    }, [status, startVolumeLoop]);

    const handleTextSend = (e: React.FormEvent) => {
        e.preventDefault();
        if (!textInput.trim()) return;
        sendText(textInput.trim());
        setNarrationLog(prev => [...prev, `You: ${textInput.trim()}`]);
        setTextInput('');
    };

    // Guard: no context (direct URL navigation)
    if (!storyCtx) {
        return (
            <div className="min-h-screen bg-amber-50 flex items-center justify-center p-8">
                <div className="text-center border-4 border-black rounded-2xl p-8 bg-white max-w-sm">
                    <BookOpen className="w-12 h-12 mx-auto mb-4 text-slate-400" />
                    <h2 className="font-comic text-2xl text-black mb-2">No Story Found!</h2>
                    <p className="text-slate-600 mb-6 text-sm">Please create a story first to use the comic builder.</p>
                    <button
                        onClick={() => navigate('/create')}
                        className="bg-indigo-600 text-white font-comic text-lg px-6 py-2 rounded-xl border-2 border-black"
                    >
                        Create a Story
                    </button>
                </div>
            </div>
        );
    }

    const panelCount = panels.length;

    return (
        <div className="min-h-screen bg-amber-50 flex flex-col">
            {/* ── Sticky Header ── */}
            <header className="sticky top-0 z-30 bg-white border-b-4 border-black px-4 py-2 flex items-center gap-3">
                <div className="flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-black" />
                    <span className="font-comic text-xl text-black tracking-wide">QUESTORY COMICS</span>
                    <span className="bg-black text-white font-comic text-xs px-2 py-0.5 rounded-full">
                        #{sessionId?.slice(-4).toUpperCase()}
                    </span>
                </div>

                <div className="flex items-center gap-2 ml-auto">
                    {/* Thinking indicator */}
                    {isThinking && (
                        <div className="flex items-center gap-1.5 bg-indigo-100 border-2 border-indigo-400 rounded-full px-3 py-1">
                            <Loader2 className="w-3.5 h-3.5 text-indigo-600 animate-spin" />
                            <span className="font-comic text-xs text-indigo-700 tracking-wide">NARRATING...</span>
                        </div>
                    )}

                    {/* Panel count */}
                    <div className="bg-slate-100 border-2 border-black rounded-full px-3 py-1 font-comic text-sm text-black">
                        {panelCount} {panelCount === 1 ? 'PANEL' : 'PANELS'}
                    </div>

                    {/* Score */}
                    <div className="bg-yellow-400 border-2 border-black rounded-full px-3 py-1 font-comic text-sm text-black font-bold">
                        ⭐ {score} PTS
                    </div>
                </div>
            </header>

            {/* ── Story Complete Banner ── */}
            {builderPhase === 'complete' && (
                <div className="bg-yellow-400 border-b-4 border-black px-6 py-5 text-center">
                    <h1 className="font-comic text-5xl text-black tracking-widest mb-1">THE END</h1>
                    {closingNarration && (
                        <p className="text-black text-sm font-semibold max-w-xl mx-auto mb-4">{closingNarration}</p>
                    )}
                    <div className="flex gap-3 justify-center">
                        <div className="bg-white border-2 border-black rounded-full px-4 py-1.5 font-comic text-sm text-black">
                            ⭐ Final Score: {score} PTS
                        </div>
                        <button
                            onClick={() => navigate('/create')}
                            className="bg-black text-yellow-400 font-comic text-sm px-4 py-1.5 rounded-full border-2 border-black hover:bg-slate-800 transition-colors"
                        >
                            Create Another Story →
                        </button>
                    </div>
                </div>
            )}

            {/* ── Main Content ── */}
            <div className="flex flex-1 min-h-0">

                {/* ── Left Sidebar ── */}
                <aside className="hidden lg:flex flex-col w-64 border-r-4 border-black bg-white sticky top-[57px] h-[calc(100vh-57px)]">
                    {/* Hero card */}
                    <div className="border-b-4 border-black p-4">
                        <div className="bg-amber-50 border-2 border-black rounded-xl p-3">
                            <div className="font-comic text-xs text-slate-500 uppercase tracking-wide mb-1">Hero</div>
                            <div className="font-bold text-black text-sm">{storyCtx.heroName}</div>
                            <div className="font-comic text-xs text-slate-500 mt-1 uppercase">{storyCtx.artStyle}</div>
                        </div>
                        <div className="mt-2 bg-amber-50 border-2 border-black rounded-xl p-3">
                            <div className="font-comic text-xs text-slate-500 uppercase tracking-wide mb-1">Story</div>
                            <div className="font-bold text-black text-sm capitalize">{storyCtx.topic}</div>
                        </div>
                    </div>

                    {/* Narration transcript */}
                    <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
                        <div className="font-comic text-xs text-slate-400 uppercase tracking-wide">Story Log</div>
                        {narrationLog.length === 0 ? (
                            <div className="text-xs text-slate-400 italic mt-2">The story is about to begin...</div>
                        ) : (
                            narrationLog.map((entry, i) => (
                                <div
                                    key={i}
                                    className={cn(
                                        'text-xs leading-snug rounded-lg p-2 border',
                                        entry.startsWith('You:')
                                            ? 'bg-indigo-50 border-indigo-200 text-indigo-900'
                                            : 'bg-amber-50 border-amber-200 text-amber-900'
                                    )}
                                >
                                    {entry}
                                </div>
                            ))
                        )}
                        <div ref={narrationEndRef} />
                    </div>

                    {/* Voice orb — sidebar */}
                    <div className="border-t-4 border-black p-4 flex items-center justify-center">
                        <button
                            className={cn(
                                'relative w-16 h-16 rounded-full border-4 border-black flex items-center justify-center transition-all duration-150',
                                status === 'connected'
                                    ? 'bg-indigo-600 text-white'
                                    : 'bg-slate-200 text-slate-500'
                            )}
                            style={{
                                boxShadow: status === 'connected' && volume > 0.05
                                    ? `0 0 ${8 + volume * 24}px ${4 + volume * 12}px rgba(99,102,241,0.5)`
                                    : undefined,
                                transform: `scale(${1 + volume * 0.15})`
                            }}
                            title={status === 'connected' ? 'Mic active — speak to guide the story' : 'Connecting...'}
                        >
                            {status === 'connected' ? (
                                <Mic className="w-6 h-6" />
                            ) : (
                                <MicOff className="w-6 h-6" />
                            )}
                        </button>
                    </div>
                </aside>

                {/* ── Comic Canvas ── */}
                <main className="flex-1 flex flex-col overflow-y-auto pb-24">
                    {/* Connecting state */}
                    {builderPhase === 'connecting' && (
                        <div className="flex-1 flex items-center justify-center p-12">
                            <div className="text-center">
                                <Loader2 className="w-12 h-12 mx-auto mb-4 text-indigo-600 animate-spin" />
                                <div className="font-comic text-2xl text-black">OPENING THE STORY...</div>
                            </div>
                        </div>
                    )}

                    {/* Comic grid */}
                    {panels.length > 0 && (
                        <div className="p-2">
                            <div className="bg-black border-4 border-black grid grid-cols-2 lg:grid-cols-3 gap-[3px] p-[3px]">
                                {panels.map((panel, idx) => (
                                    <ComicPanel
                                        key={panel.id}
                                        panel={panel}
                                        isLatest={idx === panels.length - 1 && builderPhase !== 'complete'}
                                        isSplash={idx === 0}
                                    />
                                ))}

                                {/* Next panel loading placeholder */}
                                {isThinking && builderPhase === 'building' && (
                                    <div className="aspect-square bg-slate-200 border-4 border-black rounded-sm animate-pulse flex items-center justify-center">
                                        <span className="font-comic text-3xl text-slate-300">...</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Empty state while building first panel */}
                    {panels.length === 0 && builderPhase === 'building' && (
                        <div className="flex-1 flex items-center justify-center p-12">
                            <div className="text-center border-4 border-dashed border-slate-300 rounded-2xl p-12">
                                <div className="font-comic text-3xl text-slate-300 mb-2">YOUR COMIC</div>
                                <div className="font-comic text-xl text-slate-400">PANELS WILL APPEAR HERE</div>
                                <div className="flex gap-1 justify-center mt-4">
                                    <div className="w-3 h-3 bg-slate-300 rounded-full animate-bounce [animation-delay:0ms]" />
                                    <div className="w-3 h-3 bg-slate-300 rounded-full animate-bounce [animation-delay:150ms]" />
                                    <div className="w-3 h-3 bg-slate-300 rounded-full animate-bounce [animation-delay:300ms]" />
                                </div>
                            </div>
                        </div>
                    )}

                    <div ref={panelsEndRef} />
                </main>
            </div>

            {/* ── Bottom Input Bar ── */}
            {builderPhase !== 'complete' && (
                <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t-4 border-black px-4 py-3 flex items-center gap-3">
                    {/* Mobile voice orb */}
                    <div
                        className={cn(
                            'lg:hidden w-11 h-11 rounded-full border-2 border-black flex items-center justify-center flex-shrink-0 transition-all duration-150',
                            status === 'connected' ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'
                        )}
                        style={{
                            boxShadow: status === 'connected' && volume > 0.05
                                ? `0 0 ${6 + volume * 16}px rgba(99,102,241,0.6)`
                                : undefined,
                        }}
                    >
                        {status === 'connected' ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                    </div>

                    <form onSubmit={handleTextSend} className="flex-1 flex gap-2">
                        <Input
                            value={textInput}
                            onChange={e => setTextInput(e.target.value)}
                            placeholder={status === 'connected' ? 'What happens next? Type or speak...' : 'Connecting...'}
                            disabled={status !== 'connected' || builderPhase === 'quiz_active'}
                            className="flex-1 border-2 border-black rounded-xl font-bold text-sm placeholder:font-normal"
                        />
                        <button
                            type="submit"
                            disabled={!textInput.trim() || status !== 'connected' || builderPhase === 'quiz_active'}
                            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white border-2 border-black rounded-xl px-3 transition-colors"
                        >
                            <Send className="w-4 h-4" />
                        </button>
                    </form>

                    {/* Score badge */}
                    <div className="hidden sm:flex bg-yellow-400 border-2 border-black rounded-full px-3 py-1.5 font-comic text-sm text-black font-bold whitespace-nowrap">
                        ⭐ {score}
                    </div>
                </div>
            )}

            {/* ── Quiz Overlay ── */}
            {activeQuiz && (
                <QuizOverlay
                    quiz={activeQuiz}
                    onAnswer={submitQuizAnswer}
                />
            )}
        </div>
    );
}
