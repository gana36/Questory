import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { Mic, MicOff, Send, BookOpen, Loader2 } from 'lucide-react';
import {
    useStoryBuilder,
    type StoryHeadstart,
    type StoryHeadstartPanel,
    type StoryHeadstartStatus,
    type StorySessionContext,
} from '@/hooks/useStoryBuilder';
import { ComicPanel } from '@/components/comic/ComicPanel';
import { QuizOverlay } from '@/components/comic/QuizOverlay';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

function normalizeHeadstartPanel(raw: unknown, index: number): StoryHeadstartPanel | null {
    if (!raw || typeof raw !== 'object') {
        return null;
    }

    const panel = raw as Record<string, unknown>;
    const narration = typeof panel.narration === 'string' ? panel.narration : '';
    const visualDescription = typeof panel.visual_description === 'string' ? panel.visual_description : '';
    if (!narration || !visualDescription) {
        return null;
    }

    return {
        panelId: typeof panel.panel_id === 'string' ? panel.panel_id : `panel_${index + 1}`,
        storyRole: typeof panel.story_role === 'string' ? panel.story_role : 'story',
        narration,
        speechBubble: typeof panel.speech_bubble === 'string' ? panel.speech_bubble : undefined,
        visualDescription,
        learningObjective: typeof panel.learning_objective === 'string' ? panel.learning_objective : undefined,
        explanationFocus: typeof panel.explanation_focus === 'string' ? panel.explanation_focus : narration,
        childQuestion: typeof panel.child_question === 'string' ? panel.child_question : 'What do you think happens next?',
        questionPurpose: typeof panel.question_purpose === 'string' ? panel.question_purpose : undefined,
        integrationHint: typeof panel.integration_hint === 'string' ? panel.integration_hint : undefined,
    };
}

function normalizeHeadstart(raw: unknown): StoryHeadstart | null {
    if (!raw || typeof raw !== 'object') {
        return null;
    }

    const headstart = raw as Record<string, unknown>;
    const panels = Array.isArray(headstart.panels)
        ? headstart.panels
            .map((panel, index) => normalizeHeadstartPanel(panel, index))
            .filter((panel): panel is StoryHeadstartPanel => Boolean(panel))
        : [];

    if (panels.length === 0) {
        return null;
    }

    return {
        title: typeof headstart.title === 'string' ? headstart.title : 'Questory Adventure',
        storyGoal: typeof headstart.story_goal === 'string' ? headstart.story_goal : 'Learn through the adventure.',
        openingHook: typeof headstart.opening_hook === 'string' ? headstart.opening_hook : 'A new mission is about to begin.',
        panelCount: typeof headstart.panel_count === 'number' ? headstart.panel_count : panels.length,
        panels,
        closingNarration: typeof headstart.closing_narration === 'string' ? headstart.closing_narration : 'The opening mission is complete.',
        liveCustomizationBrief: typeof headstart.live_customization_brief === 'string'
            ? headstart.live_customization_brief
            : 'Let the child shape what happens next while staying on topic.',
    };
}

function mapStorySessionToContext(
    data: Record<string, unknown>,
    fallback: StorySessionContext | null
): StorySessionContext {
    const normalizedHeadstart = normalizeHeadstart(data.storyHeadstart);
    const rawStatus = typeof data.storyHeadstartStatus === 'string'
        ? data.storyHeadstartStatus
        : fallback?.storyHeadstartStatus;
    const storyHeadstartStatus: StoryHeadstartStatus = rawStatus === 'ready'
        || rawStatus === 'failed'
        || rawStatus === 'generating'
        || rawStatus === 'pending'
        ? rawStatus
        : normalizedHeadstart
            ? 'ready'
            : 'pending';

    return {
        topic: typeof data.topic === 'string' ? data.topic : fallback?.topic ?? '',
        storyConcept: typeof data.storyConcept === 'string' ? data.storyConcept : fallback?.storyConcept ?? '',
        heroName: typeof data.selectedHero === 'string'
            ? data.selectedHero
            : typeof data.heroName === 'string'
                ? data.heroName
                : fallback?.heroName ?? '',
        artStyle: typeof data.artStyle === 'string' ? data.artStyle : fallback?.artStyle ?? 'comic',
        ageRange: typeof data.ageRange === 'number' ? data.ageRange : fallback?.ageRange ?? 2,
        quizFrequency: typeof data.quizFrequency === 'string'
            ? data.quizFrequency
            : fallback?.quizFrequency ?? 'after each teaching panel',
        storyHeadstartStatus,
        storyHeadstart: normalizedHeadstart ?? fallback?.storyHeadstart ?? null,
    };
}

export function StoryBuilderPage() {
    const { sessionId } = useParams<{ sessionId: string }>();
    const location = useLocation();
    const navigate = useNavigate();
    const [storyCtx, setStoryCtx] = useState<StorySessionContext | null>(() => {
        const initialState = (location.state as StorySessionContext | null) ?? null;
        if (!initialState) {
            return null;
        }
        return {
            ...initialState,
            storyHeadstartStatus: initialState.storyHeadstartStatus ?? 'pending',
            storyHeadstart: initialState.storyHeadstart ?? null,
        };
    });
    const [storySessionError, setStorySessionError] = useState<string | null>(null);

    const {
        panels,
        stagedPanel,
        activeQuiz,
        builderPhase,
        score,
        isThinking,
        status,
        closingNarration,
        bridgeMessage,
        canAcceptChildInput,
        connect,
        disconnect,
        sendText,
        forceSendText,
        submitQuizAnswer,
        getVolume,
        manualReconnect,
    } = useStoryBuilder(sessionId ?? 'default');

    const handleConcludeStory = useCallback(() => {
        if (status === 'connected') {
            forceSendText("SYSTEM DIRECTIVE: The player wishes to conclude the story now. Please wrap up the adventure in one or two sentences and invoke the story_complete tool.");
        }
    }, [status, forceSendText]);

    const [textInput, setTextInput] = useState('');
    const [narrationLog, setNarrationLog] = useState<string[]>([]);
    const [volume, setVolume] = useState(0);

    const panelsEndRef = useRef<HTMLDivElement>(null);
    const narrationEndRef = useRef<HTMLDivElement>(null);
    const volumeRafRef = useRef<number | null>(null);

    useEffect(() => {
        if (!sessionId) {
            return;
        }

        let cancelled = false;
        let pollTimer: number | null = null;

        const fetchStorySession = () => {
            fetch(`http://localhost:8000/api/story-session/${sessionId}`)
                .then(async (response) => {
                    if (!response.ok) {
                        throw new Error(`Failed to load story session (${response.status})`);
                    }
                    return response.json();
                })
                .then((data) => {
                    if (cancelled) {
                        return;
                    }

                    setStorySessionError(null);
                    setStoryCtx((prev) => mapStorySessionToContext(data as Record<string, unknown>, prev));

                    const nextStatus = typeof data.storyHeadstartStatus === 'string' ? data.storyHeadstartStatus : null;
                    if (nextStatus === 'pending' || nextStatus === 'generating') {
                        pollTimer = window.setTimeout(fetchStorySession, 900);
                    }
                })
                .catch((error) => {
                    if (cancelled) {
                        return;
                    }
                    console.error('[StoryBuilder] Failed to load backend story session', error);
                    setStorySessionError(error instanceof Error ? error.message : 'Failed to load story session');
                });
        };

        fetchStorySession();

        return () => {
            cancelled = true;
            if (pollTimer) {
                window.clearTimeout(pollTimer);
            }
        };
    }, [sessionId]);

    // Auto-connect on mount if we have context
    useEffect(() => {
        if (
            storyCtx
            && sessionId
            && storyCtx.storyHeadstartStatus !== 'pending'
            && storyCtx.storyHeadstartStatus !== 'generating'
        ) {
            connect(storyCtx);
        }
        return () => disconnect();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [storyCtx, sessionId]);

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
        if (!textInput.trim() || !canAcceptChildInput) return;
        sendText(textInput.trim());
        setNarrationLog(prev => [...prev, `You: ${textInput.trim()}`]);
        setTextInput('');
    };

    // Guard: no context (direct URL navigation)
    if (!storyCtx || storyCtx.storyHeadstartStatus === 'pending' || storyCtx.storyHeadstartStatus === 'generating') {
        return (
            <div className="min-h-screen bg-amber-50 flex items-center justify-center p-8">
                <div className="text-center border-4 border-black rounded-2xl p-8 bg-white max-w-sm">
                    {sessionId ? (
                        <>
                            <Loader2 className="w-12 h-12 mx-auto mb-4 text-indigo-600 animate-spin" />
                            <h2 className="font-comic text-2xl text-black mb-2">Preparing Story...</h2>
                            <p className="text-slate-600 mb-2 text-sm">
                                Building the pre-generated comic headstart before the live guide takes over.
                            </p>
                            <p className="text-slate-500 mb-6 text-xs">
                                {storySessionError ?? 'This usually finishes in a few seconds.'}
                            </p>
                        </>
                    ) : (
                        <>
                            <BookOpen className="w-12 h-12 mx-auto mb-4 text-slate-400" />
                            <h2 className="font-comic text-2xl text-black mb-2">No Story Found!</h2>
                            <p className="text-slate-600 mb-6 text-sm">Please create a story first to use the comic builder.</p>
                            <button
                                onClick={() => navigate('/create')}
                                className="bg-indigo-600 text-white font-comic text-lg px-6 py-2 rounded-xl border-2 border-black"
                            >
                                Create a Story
                            </button>
                        </>
                    )}
                </div>
            </div>
        );
    }

    const panelCount = panels.length + (stagedPanel ? 1 : 0);
    const hasPendingScene = Boolean(stagedPanel);
    const inputLocked = !canAcceptChildInput;
    const pendingSceneLabel = stagedPanel
        ? stagedPanel.imageStatus === 'loading'
            ? panels.length === 0
                ? 'ILLUSTRATING THE OPENING SCENE...'
                : 'ILLUSTRATING THE NEXT SCENE...'
            : 'SCENE READY. SWAPPING NOW...'
        : null;

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

                    {pendingSceneLabel && (
                        <div className="flex items-center gap-1.5 bg-emerald-100 border-2 border-emerald-400 rounded-full px-3 py-1">
                            <Loader2 className={cn(
                                'w-3.5 h-3.5 text-emerald-700',
                                stagedPanel?.imageStatus === 'loading' && 'animate-spin'
                            )} />
                            <span className="font-comic text-[11px] text-emerald-800 tracking-wide">
                                {pendingSceneLabel}
                            </span>
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

                    {/* ── CINEMATIC FOCUS STAGE (latest panel) ── */}
                    {panels.length > 0 && builderPhase !== 'complete' && (() => {
                        const activePanel = panels[panels.length - 1];
                        const isImageReady = activePanel.imageStatus === 'ready' && activePanel.imageUrl;
                        return (
                            <div className="relative w-full" style={{ perspective: '1200px' }}>
                                {/* Main stage container with 3D tilt */}
                                <div
                                    className={cn(
                                        "relative mx-auto w-full max-w-5xl overflow-hidden rounded-xl border-4 border-black shadow-2xl transition-all duration-1000",
                                        isThinking
                                            ? "shadow-[0_0_60px_rgba(99,102,241,0.5)]"
                                            : "shadow-[0_8px_30px_rgba(0,0,0,0.4)]"
                                    )}
                                    style={{
                                        aspectRatio: '16 / 9',
                                        transform: isThinking
                                            ? 'rotateX(1deg) scale(1.01)'
                                            : 'rotateX(0deg) scale(1)',
                                        transformOrigin: 'center bottom',
                                        transition: 'transform 1.5s cubic-bezier(0.25, 0.46, 0.45, 0.94), box-shadow 1s ease',
                                    }}
                                >
                                    {/* Panel image with Ken Burns slow zoom */}
                                    {isImageReady ? (
                                        <img
                                            src={activePanel.imageUrl}
                                            alt={`Active Panel ${activePanel.panelIndex + 1}`}
                                            className="absolute inset-0 w-full h-full object-cover"
                                            style={{
                                                animation: isThinking
                                                    ? 'kenBurnsZoom 12s ease-in-out infinite alternate'
                                                    : 'none',
                                                transform: isThinking ? undefined : 'scale(1.05)',
                                                transition: 'transform 2s ease',
                                            }}
                                        />
                                    ) : (
                                        <div className="absolute inset-0 bg-gradient-to-br from-slate-200 via-slate-300 to-slate-200 animate-pulse flex items-center justify-center">
                                            <div className="text-center">
                                                <Loader2 className="w-10 h-10 mx-auto mb-2 text-slate-400 animate-spin" />
                                                <div className="font-comic text-xl text-slate-400 tracking-wider">PAINTING THE SCENE...</div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Cinematic gradient overlay for readability */}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent pointer-events-none" />

                                    {/* Panel number badge */}
                                    <div className="absolute top-4 left-4 z-20 bg-black/80 text-white font-bold text-sm w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-sm border border-white/20">
                                        {activePanel.panelIndex + 1}
                                    </div>

                                    {/* "LIVE" badge while narrating */}
                                    {isThinking && (
                                        <div className="absolute top-4 right-4 z-20 flex items-center gap-1.5 bg-red-600 border-2 border-white/30 text-white font-comic text-xs px-3 py-1 rounded-full animate-pulse shadow-lg">
                                            <div className="w-2 h-2 bg-white rounded-full animate-ping" />
                                            LIVE
                                        </div>
                                    )}

                                    {builderPhase === 'scene_transition' && stagedPanel && (
                                        <div className="absolute inset-0 z-10 bg-white/15 backdrop-blur-[2px] flex items-center justify-center">
                                            <div className="bg-black/75 text-white border-2 border-white/20 rounded-full px-4 py-2 font-comic text-sm tracking-wide shadow-xl">
                                                SCENE CHANGE
                                            </div>
                                        </div>
                                    )}

                                    {/* Speech bubble */}
                                    {activePanel.speechBubble && isImageReady && (
                                        <div className="absolute top-16 right-6 max-w-[50%] z-20">
                                            <div className="relative bg-white border-2 border-black rounded-2xl px-4 py-2 text-black font-bold text-sm leading-tight shadow-xl">
                                                {activePanel.speechBubble}
                                                <div className="absolute -bottom-2 left-4 w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[10px] border-t-black" />
                                                <div className="absolute -bottom-1.5 left-4 w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[10px] border-t-white" />
                                            </div>
                                        </div>
                                    )}

                                    {/* Bottom caption bar */}
                                    <div className="absolute bottom-0 left-0 right-0 z-20 px-6 py-4">
                                        {activePanel.learningObjective && (
                                            <div className="mb-2">
                                                <span className="text-xs bg-yellow-400 border-2 border-black text-black font-bold rounded-full px-3 py-1 leading-tight shadow-md">
                                                    {activePanel.learningObjective}
                                                </span>
                                            </div>
                                        )}
                                        <p className="font-comic text-white text-base md:text-lg leading-relaxed drop-shadow-lg max-w-3xl">
                                            {activePanel.narration}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        );
                    })()}

                    {/* ── PAST PANELS TIMELINE (smaller grid of older panels) ── */}
                    {panels.length > 1 && (
                        <div className="px-2 pt-2 pb-1">
                            <div className="font-comic text-xs text-slate-400 uppercase tracking-widest mb-1.5 px-1">Story So Far</div>
                            <div className="flex gap-[3px] overflow-x-auto pb-2 snap-x">
                                {panels.slice(0, -1).map((panel) => (
                                    <div
                                        key={panel.id}
                                        className="flex-shrink-0 w-40 md:w-52 snap-start"
                                    >
                                        <ComicPanel
                                            panel={panel}
                                            isLatest={false}
                                            isSplash={false}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Complete state — show all panels in full grid */}
                    {builderPhase === 'complete' && panels.length > 0 && (
                        <div className="p-2">
                            <div className="bg-black border-4 border-black grid grid-cols-2 lg:grid-cols-3 gap-[3px] p-[3px]">
                                {panels.map((panel, idx) => (
                                    <ComicPanel
                                        key={panel.id}
                                        panel={panel}
                                        isLatest={false}
                                        isSplash={idx === 0}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Next panel loading placeholder */}
                    {hasPendingScene && panels.length > 0 && (
                        <div className="px-3 pt-2">
                            <div className="inline-flex items-center gap-2 rounded-full border-2 border-black bg-white px-3 py-1.5 shadow-sm">
                                <Loader2 className={cn(
                                    'w-4 h-4 text-indigo-600',
                                    stagedPanel?.imageStatus === 'loading' && 'animate-spin'
                                )} />
                                <span className="font-comic text-xs text-slate-700 tracking-wide">
                                    {bridgeMessage}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Immersive opening state while the first panel is still hidden */}
                    {panels.length === 0 && builderPhase !== 'complete' && builderPhase !== 'connecting' && (
                        <div className="flex-1 flex items-center justify-center p-6 md:p-10">
                            <div className="relative w-full max-w-5xl overflow-hidden rounded-[28px] border-4 border-black bg-[linear-gradient(135deg,#fff7ed_0%,#fef3c7_38%,#dbeafe_100%)] shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
                                <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-indigo-300/35 blur-3xl" />
                                <div className="absolute -left-16 bottom-0 h-40 w-40 rounded-full bg-amber-300/40 blur-3xl" />

                                <div className="relative grid gap-6 md:grid-cols-[1.35fr_0.95fr] p-6 md:p-10">
                                    <div className="space-y-5">
                                        <div className="inline-flex items-center gap-2 rounded-full border-2 border-black bg-white/80 px-3 py-1.5 shadow-sm backdrop-blur">
                                            <Loader2 className="w-4 h-4 text-indigo-600 animate-spin" />
                                            <span className="font-comic text-xs text-slate-800 tracking-[0.18em]">
                                                STORY GUIDE LIVE
                                            </span>
                                        </div>

                                        <div>
                                            <p className="font-comic text-sm uppercase tracking-[0.25em] text-slate-600 mb-2">
                                                Opening Mission
                                            </p>
                                            <h1 className="font-comic text-4xl md:text-5xl leading-none text-slate-950">
                                                {storyCtx.heroName} is stepping into a {storyCtx.topic} adventure.
                                            </h1>
                                        </div>

                                        <p className="max-w-2xl text-sm md:text-base font-semibold text-slate-700 leading-relaxed">
                                            {bridgeMessage}
                                        </p>

                                        {stagedPanel?.narration && (
                                            <div className="rounded-3xl border-2 border-black bg-white/80 p-4 shadow-sm">
                                                <div className="font-comic text-xs uppercase tracking-[0.22em] text-slate-500 mb-2">
                                                    First Beat Locked In
                                                </div>
                                                <p className="text-sm md:text-base font-semibold text-slate-900 leading-relaxed">
                                                    {stagedPanel.narration}
                                                </p>
                                            </div>
                                        )}

                                        <div className="flex flex-wrap gap-2">
                                            <div className="rounded-full border-2 border-black bg-white px-3 py-1 font-comic text-xs text-slate-800">
                                                HERO: {storyCtx.heroName}
                                            </div>
                                            <div className="rounded-full border-2 border-black bg-white px-3 py-1 font-comic text-xs text-slate-800">
                                                STYLE: {storyCtx.artStyle}
                                            </div>
                                            <div className="rounded-full border-2 border-black bg-white px-3 py-1 font-comic text-xs text-slate-800">
                                                QUIZZES: {storyCtx.quizFrequency}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="rounded-[24px] border-4 border-black bg-slate-950 text-white p-5 md:p-6 shadow-xl">
                                        <div className="font-comic text-xs uppercase tracking-[0.25em] text-indigo-200 mb-4">
                                            While The Scene Loads
                                        </div>
                                        <div className="space-y-4">
                                            <div className="rounded-2xl bg-white/10 border border-white/10 p-4">
                                                <div className="text-xs uppercase tracking-[0.18em] text-indigo-200 mb-1">
                                                    Status
                                                </div>
                                                <div className="font-comic text-lg">
                                                    {pendingSceneLabel ?? 'GUIDE IS PREPARING THE STORY'}
                                                </div>
                                            </div>
                                            <div className="rounded-2xl bg-white/10 border border-white/10 p-4">
                                                <div className="text-xs uppercase tracking-[0.18em] text-indigo-200 mb-1">
                                                    What You Hear
                                                </div>
                                                <div className="text-sm leading-relaxed text-slate-100">
                                                    Gemini should welcome the child, frame the mission, and stay on-topic until the first scene is visible.
                                                </div>
                                            </div>
                                            <div className="flex gap-2 pt-1">
                                                <div className="h-2 flex-1 rounded-full bg-white/15 overflow-hidden">
                                                    <div className="h-full w-2/3 rounded-full bg-amber-300 animate-pulse" />
                                                </div>
                                                <div className="h-2 w-10 rounded-full bg-indigo-300/50 animate-pulse" />
                                            </div>
                                        </div>
                                    </div>
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
                            disabled={inputLocked}
                            className="flex-1 border-2 border-black rounded-xl font-bold text-sm placeholder:font-normal"
                        />
                        <button
                            type="submit"
                            disabled={!textInput.trim() || inputLocked}
                            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white border-2 border-black rounded-xl px-3 transition-colors"
                        >
                            <Send className="w-4 h-4" />
                        </button>
                    </form>

                    {/* Score badge */}
                    <div className="hidden sm:flex bg-yellow-400 border-2 border-black rounded-full px-3 py-1.5 font-comic text-sm text-black font-bold whitespace-nowrap">
                        ⭐ {score}
                    </div>
                    
                    {/* Conclude Button */}
                    <button
                        type="button"
                        onClick={handleConcludeStory}
                        disabled={status !== 'connected' || inputLocked}
                        className="bg-orange-500 hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-comic text-xs border-2 border-black rounded-xl px-4 py-1.5 transition-colors uppercase font-bold tracking-wide whitespace-nowrap"
                        title="End this adventure"
                    >
                        Finish Story
                    </button>
                </div>
            )}

            {/* ── Reconnecting Overlay ── */}
            {status === 'reconnecting' && (
                <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center">
                    <div className="bg-white border-4 border-black rounded-2xl p-8 max-w-xs text-center shadow-xl">
                        <Loader2 className="w-10 h-10 mx-auto mb-3 text-amber-500 animate-spin" />
                        <h2 className="font-comic text-2xl text-black mb-1">RECONNECTING...</h2>
                        <p className="text-slate-600 text-sm">The story guide is coming back.</p>
                        <p className="text-slate-500 text-xs mt-1">Your panels are safe!</p>
                    </div>
                </div>
            )}

            {/* ── Connection Lost Overlay ── */}
            {status === 'error' && (
                <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center">
                    <div className="bg-white border-4 border-black rounded-2xl p-8 max-w-xs text-center shadow-xl">
                        <div className="text-4xl mb-3">📡</div>
                        <h2 className="font-comic text-2xl text-black mb-1">CONNECTION LOST</h2>
                        <p className="text-slate-600 text-sm mb-4">
                            {panels.length > 0
                                ? `Your ${panels.length} ${panels.length === 1 ? 'panel' : 'panels'} and score are saved!`
                                : 'The guide lost the connection before the first scene could land.'}
                        </p>
                        <button
                            onClick={manualReconnect}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-comic text-lg px-6 py-2 rounded-xl border-2 border-black transition-colors"
                        >
                            Tap to Retry
                        </button>
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
