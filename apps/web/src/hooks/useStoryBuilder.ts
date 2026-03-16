import { useState, useRef, useCallback, useEffect, useReducer } from 'react';
import { WS_URL } from '@/config';

export type BuilderStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';
export type BuilderPhase =
    | 'connecting'
    | 'intro_live'
    | 'scene_transition'
    | 'scene_live'
    | 'quiz_queued'
    | 'quiz_active'
    | 'quiz_feedback'
    | 'complete';

export interface ComicPanelState {
    id: string;
    panelIndex: number;
    narration: string;
    speechBubble?: string;
    learningObjective?: string;
    imageUrl?: string;
    imageStatus: 'loading' | 'ready' | 'error';
}

export interface ActiveQuiz {
    quizId: string;
    question: string;
    options: string[];
    correctIndex: number;
    explanation: string;
    pointValue: number;
}

export type StoryHeadstartStatus = 'pending' | 'generating' | 'ready' | 'failed';

export interface StoryHeadstartPanel {
    panelId: string;
    storyRole: string;
    narration: string;
    speechBubble?: string;
    visualDescription: string;
    learningObjective?: string;
    explanationFocus: string;
    childQuestion: string;
    questionPurpose?: string;
    integrationHint?: string;
}

export interface StoryHeadstart {
    title: string;
    storyGoal: string;
    openingHook: string;
    panelCount: number;
    panels: StoryHeadstartPanel[];
    closingNarration: string;
    liveCustomizationBrief: string;
}

export interface StorySessionContext {
    topic: string;
    storyConcept?: string;
    heroName: string;
    artStyle: string;
    ageRange: number;
    quizFrequency: string;
    storyHeadstartStatus?: StoryHeadstartStatus;
    storyHeadstart?: StoryHeadstart | null;
}

interface StoryBuilderRuntimeState {
    builderPhase: BuilderPhase;
    panels: ComicPanelState[];
    stagedPanel: ComicPanelState | null;
    queuedQuiz: ActiveQuiz | null;
    activeQuiz: ActiveQuiz | null;
    score: number;
    closingNarration: string | null;
    bridgeMessage: string;
}

type StoryBuilderAction =
    | { type: 'RESET_SESSION' }
    | {
        type: 'GUIDE_TEXT_RECEIVED';
        text: string;
      }
    | {
        type: 'SCENE_STAGE_STARTED';
        panelId: string;
        narration: string;
        speechBubble?: string;
        learningObjective?: string;
      }
    | {
        type: 'SCENE_READY';
        panelId: string;
        imageUrl?: string;
        imageStatus: 'ready' | 'error';
      }
    | { type: 'SCENE_REVEALED' }
    | {
        type: 'QUIZ_QUEUED';
        quiz: ActiveQuiz;
      }
    | { type: 'QUIZ_ACTIVATED' }
    | {
        type: 'QUIZ_SUBMITTED';
        isCorrect: boolean;
        pointValue: number;
      }
    | {
        type: 'STORY_COMPLETE';
        closingNarration: string;
      }
    | {
        type: 'RESTORE_PANELS';
        panels: ComicPanelState[];
      };

const AGE_LABELS: Record<number, string> = {
    0: 'Pre-K (ages 3-4)',
    1: 'Early Elementary (ages 5-7)',
    2: 'Elementary (ages 8-10)',
    3: 'Middle School (ages 11-13)',
    4: 'Teen (ages 14+)',
};

const MAX_RECONNECT_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 1000; // 1s -> 2s -> 4s

const INITIAL_RUNTIME_STATE: StoryBuilderRuntimeState = {
    builderPhase: 'connecting',
    panels: [],
    stagedPanel: null,
    queuedQuiz: null,
    activeQuiz: null,
    score: 0,
    closingNarration: null,
    bridgeMessage: 'Opening the story...',
};

function canAcceptChildInputForState(
    status: BuilderStatus,
    phase: BuilderPhase,
    guideTurnComplete: boolean,
    isThinking: boolean
): boolean {
    return status === 'connected'
        && guideTurnComplete
        && !isThinking
        && (phase === 'intro_live' || phase === 'scene_live');
}

function normalizeGuideTextForUi(text: string): string {
    const raw = text.trim();
    const cleaned = raw.replace(/\*\*/g, '').trim();
    const lower = cleaned.toLowerCase();

    if (
        raw.includes('**')
        || lower.includes('panel ')
        || lower.includes('arc ')
        || lower.includes('comic structure')
        || lower.includes('crafting first panel')
        || lower.includes('developing panel')
        || lower.includes('launching panel')
        || lower.includes('building panel')
        || lower.includes('developing the next panels')
    ) {
        return 'Your guide is opening the adventure.';
    }

    return cleaned;
}

function getRemainingHeadstartPanels(
    ctx: StorySessionContext,
    runtimeState?: StoryBuilderRuntimeState
): StoryHeadstartPanel[] {
    const headstart = ctx.storyHeadstart;
    if (!headstart?.panels?.length) {
        return [];
    }

    if (!runtimeState) {
        return headstart.panels;
    }

    const usedIds = new Set(runtimeState.panels.map(panel => panel.id));
    if (runtimeState.stagedPanel) {
        usedIds.add(runtimeState.stagedPanel.id);
    }

    return headstart.panels.filter(panel => !usedIds.has(panel.panelId));
}

function buildHeadstartPromptBlock(
    ctx: StorySessionContext,
    runtimeState?: StoryBuilderRuntimeState
): string {
    const headstart = ctx.storyHeadstart;
    if (!headstart?.panels?.length) {
        return '';
    }

    const remainingPanels = getRemainingHeadstartPanels(ctx, runtimeState);
    const nextPreparedPanel = remainingPanels[0];
    return `
[PRIVATE RUNTIME GUIDANCE - NEVER READ THIS BLOCK ALOUD]
Prepared story headstart title: ${headstart.title}
Prepared story goal: ${headstart.storyGoal}
Prepared opening hook: ${headstart.openingHook}
Prepared panel count: ${headstart.panelCount}
Prepared panels still to use: ${remainingPanels.length}
Remaining prepared panel IDs in order: ${remainingPanels.map((panel) => panel.panelId).join(', ') || 'none'}

Rules for the prepared headstart:
- While any prepared panels remain, reveal them with present_prebuilt_panel in order.
- Do not skip, replace, or rewrite the prepared panels.
- The backend will send the visible panel narration and hidden teaching/question guidance after each reveal.
- Speak only natural story narration, explanation, and dialogue for the child.
- Never read panel IDs, JSON-style fields, labels, or runtime instructions aloud.
- For each panel, ask at most one concept-grounded question, and make it a scene-shaping question when possible so the child's answer can influence the next panel.
- A panel may end with either:
  1. one scene-shaping question and then waiting for the reply, or
  2. one short narration beat that invites a brief acknowledgement.
- Do not move to the next panel until the current panel interaction has been completed.
- If the child gives a strong answer, appreciate it specifically and weave it into the next transition.
- After the prepared panels are exhausted, continue with live customization using add_comic_panel.
- Customization brief after the prepared sequence: ${headstart.liveCustomizationBrief}
${nextPreparedPanel ? `The very next prepared panel you must reveal is ${nextPreparedPanel.panelId}.` : 'There is no prepared panel remaining.'}
`;
}

function buildInitialPrompt(ctx: StorySessionContext): string {
    const ageLabel = AGE_LABELS[ctx.ageRange] ?? 'Elementary (ages 8-10)';
    const remainingPanels = getRemainingHeadstartPanels(ctx);
    const firstPreparedPanel = remainingPanels[0];
    const openingTool = firstPreparedPanel ? `present_prebuilt_panel for ${firstPreparedPanel.panelId}` : 'add_comic_panel for panel_1';
    return `Let's build our comic story!
Topic: ${ctx.topic}
Story Concept: ${ctx.storyConcept ?? ''}
Hero: ${ctx.heroName}
Art Style: ${ctx.artStyle}
Audience Age: ${ageLabel}
Quiz Frequency: ${ctx.quizFrequency}
${buildHeadstartPromptBlock(ctx)}

Rules for your very first turn:
- Speak directly to the child in 1-2 short spoken sentences.
- Your spoken output must contain only child-facing narration or dialogue, never runtime guidance.
- Do not explain your plan.
- Do not mention panels, structure, or what you are about to do.
- Do not use markdown or headings.
- Immediately call ${openingTool}.

While the first scene is being illustrated, keep the child engaged with the mission and hero.
Continue the story only after each panel becomes visible.`;
}

function buildRecoveryOpeningPrompt(ctx: StorySessionContext): string {
    const ageLabel = AGE_LABELS[ctx.ageRange] ?? 'Elementary (ages 8-10)';
    const remainingPanels = getRemainingHeadstartPanels(ctx);
    const firstPreparedPanel = remainingPanels[0];
    const openingTool = firstPreparedPanel ? `present_prebuilt_panel for ${firstPreparedPanel.panelId}` : 'add_comic_panel for panel_1';
    return `Story settings:
Topic: ${ctx.topic}
Story Concept: ${ctx.storyConcept ?? ''}
Hero: ${ctx.heroName}
Art Style: ${ctx.artStyle}
Audience Age: ${ageLabel}
${buildHeadstartPromptBlock(ctx)}

In your next response:
1. Speak directly to the child in exactly 1 or 2 short sentences.
2. Say only child-facing narration or dialogue, never runtime guidance.
3. Immediately call ${openingTool}.
4. Do not use markdown, headings, or planning language.
5. Do not talk about panels or story structure.`;
}

function buildResumePrompt(ctx: StorySessionContext, runtimeState: StoryBuilderRuntimeState): string {
    const ageLabel = AGE_LABELS[ctx.ageRange] ?? 'Elementary (ages 8-10)';
    const panelSummary = runtimeState.panels
        .map((panel, index) => `Panel ${index + 1}: ${panel.narration}`)
        .join('\n');
    const stagedSummary = runtimeState.stagedPanel
        ? `A staged scene was in progress: ${runtimeState.stagedPanel.narration}`
        : 'No staged scene was pending.';
    const quizSummary = runtimeState.activeQuiz
        ? `Active quiz: ${runtimeState.activeQuiz.question}`
        : runtimeState.queuedQuiz
            ? `A quiz was queued and about to appear: ${runtimeState.queuedQuiz.question}`
            : 'No quiz was active.';

    return `[CONTEXT RESUME] We are in the middle of building a comic story together.
Topic: ${ctx.topic}
Story Concept: ${ctx.storyConcept ?? ''}
Hero: ${ctx.heroName}
Art Style: ${ctx.artStyle}
Audience Age: ${ageLabel}
Quiz Frequency: ${ctx.quizFrequency}
${buildHeadstartPromptBlock(ctx, runtimeState)}
Current phase: ${runtimeState.builderPhase}
Visible panels so far: ${runtimeState.panels.length}
${panelSummary || 'No visible panels yet.'}
${stagedSummary}
${quizSummary}
Current score: ${runtimeState.score}
Resume from the exact current state. If a scene was still being prepared, recreate it smoothly.
Speak only child-facing narration or dialogue, never runtime guidance.`;
}

function storyBuilderReducer(
    state: StoryBuilderRuntimeState,
    action: StoryBuilderAction
): StoryBuilderRuntimeState {
    switch (action.type) {
        case 'RESET_SESSION':
            return INITIAL_RUNTIME_STATE;
        case 'GUIDE_TEXT_RECEIVED':
            return {
                ...state,
                bridgeMessage: action.text,
            };
        case 'SCENE_STAGE_STARTED': {
            const nextPanel: ComicPanelState = {
                id: action.panelId,
                panelIndex: state.panels.length,
                narration: action.narration,
                speechBubble: action.speechBubble,
                learningObjective: action.learningObjective,
                imageStatus: 'loading',
            };
            return {
                ...state,
                stagedPanel: nextPanel,
                builderPhase: state.panels.length === 0 ? 'intro_live' : state.builderPhase,
                bridgeMessage: state.panels.length === 0
                    ? 'Your guide is opening the very first scene.'
                    : 'Your guide is sketching the next scene in the background.',
            };
        }
        case 'SCENE_READY':
            if (!state.stagedPanel || state.stagedPanel.id !== action.panelId) {
                return state;
            }
            return {
                ...state,
                stagedPanel: {
                    ...state.stagedPanel,
                    imageUrl: action.imageUrl,
                    imageStatus: action.imageStatus,
                },
                builderPhase: 'scene_transition',
                bridgeMessage: state.panels.length === 0
                    ? 'The opening scene is ready.'
                    : 'The next scene is ready to take over.',
            };
        case 'SCENE_REVEALED':
            if (!state.stagedPanel) {
                return state;
            }
            return {
                ...state,
                panels: [...state.panels, state.stagedPanel],
                stagedPanel: null,
                builderPhase: 'scene_live',
                bridgeMessage: 'The scene is live. Your guide can continue from what is on screen.',
            };
        case 'QUIZ_QUEUED':
            return {
                ...state,
                queuedQuiz: action.quiz,
                builderPhase: 'quiz_queued',
                bridgeMessage: 'Your guide is wrapping up before quiz time.',
            };
        case 'QUIZ_ACTIVATED':
            if (!state.queuedQuiz) {
                return state;
            }
            return {
                ...state,
                queuedQuiz: null,
                activeQuiz: state.queuedQuiz,
                builderPhase: 'quiz_active',
                bridgeMessage: 'Quiz time. Waiting for the child to answer.',
            };
        case 'QUIZ_SUBMITTED':
            return {
                ...state,
                queuedQuiz: null,
                activeQuiz: null,
                score: action.isCorrect ? state.score + action.pointValue : state.score,
                builderPhase: 'quiz_feedback',
                bridgeMessage: 'Your guide is reacting to the quiz result and setting up the next beat.',
            };
        case 'STORY_COMPLETE':
            return {
                ...state,
                stagedPanel: null,
                queuedQuiz: null,
                closingNarration: action.closingNarration,
                builderPhase: 'complete',
                bridgeMessage: 'The story has reached its ending.',
            };
        case 'RESTORE_PANELS':
            return {
                ...state,
                panels: action.panels,
                stagedPanel: null,
                builderPhase: 'scene_live',
                bridgeMessage: 'Welcome back! Your guide is picking up the story where you left off.',
            };
        default:
            return state;
    }
}

export function useStoryBuilder(sessionId: string) {
    const [status, setStatus] = useState<BuilderStatus>('disconnected');
    const [isThinking, setIsThinking] = useState(false);
    const [guideTurnComplete, setGuideTurnComplete] = useState(true);
    const [runtimeState, dispatch] = useReducer(storyBuilderReducer, INITIAL_RUNTIME_STATE);

    // WebSocket & audio refs
    const wsRef = useRef<WebSocket | null>(null);
    const micCtxRef = useRef<AudioContext | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const processorNodeRef = useRef<AudioWorkletNode | null>(null);
    const playbackAnalyserRef = useRef<AnalyserNode | null>(null);
    const micAnalyserRef = useRef<AnalyserNode | null>(null);
    const isThinkingRef = useRef(false);
    const statusRef = useRef<BuilderStatus>('disconnected');
    const nextPlayTimeRef = useRef<number>(0);
    const activePlaybackSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
    const suppressAudioUntilRef = useRef(0);
    const micStreamingEnabledRef = useRef(false);

    // Reconnection refs
    const intentionalDisconnectRef = useRef(false);
    const reconnectAttemptRef = useRef(0);
    const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const sessionContextRef = useRef<StorySessionContext | null>(null);
    const isConnectingRef = useRef(false);
    const runtimeStateRef = useRef(runtimeState);
    const pendingRevealRef = useRef<string | null>(null);
    const doReconnectRef = useRef<() => void>(() => {});
    const canAcceptChildInput = canAcceptChildInputForState(
        status,
        runtimeState.builderPhase,
        guideTurnComplete,
        isThinking
    );

    useEffect(() => {
        isThinkingRef.current = isThinking;
        statusRef.current = status;
    }, [isThinking, status]);

    useEffect(() => {
        runtimeStateRef.current = runtimeState;
    }, [runtimeState]);

    const sendClientEvent = useCallback((clientEvent: Record<string, unknown>) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ clientEvent }));
        }
    }, []);

    const flushGuideAudio = useCallback((holdMs = 350) => {
        suppressAudioUntilRef.current = performance.now() + holdMs;
        for (const source of activePlaybackSourcesRef.current) {
            try {
                source.onended = null;
                source.stop();
            } catch {
                // Ignore double-stop races on drained sources.
            }
        }
        activePlaybackSourcesRef.current.clear();
        if (audioContextRef.current) {
            nextPlayTimeRef.current = audioContextRef.current.currentTime;
        }
        setIsThinking(false);
    }, []);

    const handleBackendEvent = useCallback((event: Record<string, unknown>) => {
        const type = event.type as string;

        if (type === 'restore_panels') {
            const panelsPayload = event.panels as Array<Record<string, unknown>>;
            const mappedPanels: ComicPanelState[] = panelsPayload.map(p => ({
                id: p.panelId as string,
                panelIndex: p.panelIndex as number,
                narration: p.narration as string,
                speechBubble: p.speechBubble as string | undefined,
                learningObjective: p.learningObjective as string | undefined,
                imageUrl: p.imageUrl as string | undefined,
                imageStatus: (p.imageStatus as 'ready' | 'loading' | 'error') || 'ready',
            }));

            dispatch({
                type: 'RESTORE_PANELS',
                panels: mappedPanels,
            });
            return;
        }

        if (type === 'scene_stage_started' || type === 'panel_added') {
            dispatch({
                type: 'SCENE_STAGE_STARTED',
                panelId: event.panelId as string,
                narration: event.narration as string,
                speechBubble: event.speechBubble as string | undefined,
                learningObjective: event.learningObjective as string | undefined,
            });
            return;
        }

        if (type === 'scene_ready' || type === 'panel_image_ready') {
            dispatch({
                type: 'SCENE_READY',
                panelId: event.panelId as string,
                imageUrl: event.imageUrl as string | undefined,
                imageStatus: (event.imageStatus as 'ready' | 'error') ?? 'error',
            });
            return;
        }

        if (type === 'quiz_presented' || type === 'quiz_started') {
            const quizId = (event.quizId as string) ?? `quiz_${Date.now()}`;
            dispatch({
                type: 'QUIZ_QUEUED',
                quiz: {
                    quizId,
                    question: event.question as string,
                    options: event.options as string[],
                    correctIndex: event.correctIndex as number,
                    explanation: event.explanation as string,
                    pointValue: (event.pointValue as number) ?? 100,
                },
            });
            return;
        }

        if (type === 'story_complete') {
            dispatch({
                type: 'STORY_COMPLETE',
                closingNarration: event.closingNarration as string,
            });
        }
    }, []);

    const playAudioChunk = useCallback(async (base64Data: string) => {
        if (!audioContextRef.current) return;
        if (performance.now() < suppressAudioUntilRef.current) return;

        try {
            const ctx = audioContextRef.current;
            const binaryString = atob(base64Data);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            const pcm16 = new Int16Array(bytes.buffer);
            const audioBuffer = ctx.createBuffer(1, pcm16.length, 24000);
            const channelData = audioBuffer.getChannelData(0);
            for (let i = 0; i < pcm16.length; i++) {
                channelData[i] = pcm16[i] / 32768.0;
            }

            if (ctx.state === 'suspended') {
                await ctx.resume();
            }

            const source = ctx.createBufferSource();
            source.buffer = audioBuffer;
            activePlaybackSourcesRef.current.add(source);

            if (playbackAnalyserRef.current) {
                source.connect(playbackAnalyserRef.current);
            } else {
                source.connect(ctx.destination);
            }

            const currentTime = ctx.currentTime;
            const playTime = Math.max(currentTime, nextPlayTimeRef.current);
            source.start(playTime);
            nextPlayTimeRef.current = playTime + audioBuffer.duration;

            setIsThinking(true);
            source.onended = () => {
                activePlaybackSourcesRef.current.delete(source);
                if (
                    activePlaybackSourcesRef.current.size === 0 &&
                    ctx.currentTime >= nextPlayTimeRef.current - 0.05
                ) {
                    setIsThinking(false);
                }
            };
        } catch (err) {
            console.error('[Builder] Error playing audio chunk', err);
        }
    }, []);

    const startMicrophone = useCallback(async (ws: WebSocket) => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    sampleRate: 16000,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                }
            });
            mediaStreamRef.current = stream;

            // Reuse contexts pre-created in connect() during user gesture
            const micCtx = micCtxRef.current ?? new window.AudioContext({ sampleRate: 16000 });
            micCtxRef.current = micCtx;
            if (micCtx.state === 'suspended') await micCtx.resume();

            const playbackCtx = audioContextRef.current ?? new window.AudioContext({ sampleRate: 24000 });
            audioContextRef.current = playbackCtx;
            if (playbackCtx.state === 'suspended') await playbackCtx.resume();
            if (!playbackAnalyserRef.current) {
                const analyser = playbackCtx.createAnalyser();
                analyser.fftSize = 256;
                analyser.connect(playbackCtx.destination);
                playbackAnalyserRef.current = analyser;
            }
            nextPlayTimeRef.current = playbackCtx.currentTime;

            await micCtx.audioWorklet.addModule('/audio-processor.js');

            const source = micCtx.createMediaStreamSource(stream);

            const micAnalyser = micCtx.createAnalyser();
            micAnalyser.fftSize = 256;
            source.connect(micAnalyser);
            micAnalyserRef.current = micAnalyser;

            const processor = new AudioWorkletNode(micCtx, 'audio-processor');

            let chunkCount = 0;
            processor.port.onmessage = (e) => {
                const pcm16Data = e.data as Int16Array;
                const base64Str = btoa(String.fromCharCode(...new Uint8Array(pcm16Data.buffer)));
                chunkCount++;
                if (chunkCount % 50 === 1) {
                    console.log(`[Builder] Audio chunk #${chunkCount}`);
                }
                if (ws.readyState === WebSocket.OPEN && micStreamingEnabledRef.current) {
                    ws.send(JSON.stringify({
                        realtimeInput: {
                            mediaChunks: [{
                                mimeType: 'audio/pcm;rate=16000',
                                data: base64Str
                            }]
                        }
                    }));
                }
            };

            source.connect(processor);
            processorNodeRef.current = processor;
        } catch (e) {
            console.error('[Builder] Error starting microphone:', e);
        }
    }, []);

    const stopMicrophone = useCallback(() => {
        micStreamingEnabledRef.current = false;
        mediaStreamRef.current?.getTracks().forEach(track => track.stop());
        mediaStreamRef.current = null;

        processorNodeRef.current?.disconnect();
        processorNodeRef.current = null;

        for (const source of activePlaybackSourcesRef.current) {
            try {
                source.onended = null;
                source.stop();
            } catch {
                // Ignore stop races during teardown.
            }
        }
        activePlaybackSourcesRef.current.clear();

        micCtxRef.current?.close().catch(console.error);
        micCtxRef.current = null;

        audioContextRef.current?.close().catch(console.error);
        audioContextRef.current = null;

        playbackAnalyserRef.current = null;
        micAnalyserRef.current = null;
        nextPlayTimeRef.current = 0;
        setGuideTurnComplete(true);
        setIsThinking(false);
    }, []);

    const sendText = useCallback((text: string) => {
        if (!canAcceptChildInput || !text.trim()) {
            return;
        }

        if (wsRef.current?.readyState === WebSocket.OPEN) {
            setGuideTurnComplete(false);
            wsRef.current.send(JSON.stringify({
                clientContent: {
                    turns: [{ role: 'user', parts: [{ text }] }],
                    turnComplete: true
                }
            }));
        }
    }, [canAcceptChildInput]);

    const forceSendText = useCallback((text: string) => {
        if (!text.trim()) {
            return;
        }

        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
                clientContent: {
                    turns: [{ role: 'user', parts: [{ text }] }],
                    turnComplete: true
                }
            }));
        }
    }, []);

    const setupWsHandlers = useCallback((ws: WebSocket) => {
        ws.onmessage = async (event) => {
            let data: Record<string, unknown>;
            if (event.data instanceof Blob) {
                const text = await event.data.text();
                data = JSON.parse(text);
            } else {
                data = JSON.parse(event.data as string);
            }

            if (data.backendEvent) {
                handleBackendEvent(data.backendEvent as Record<string, unknown>);
                return;
            }

            if (data.serverContent) {
                const sc = data.serverContent as Record<string, unknown>;
                const modelTurn = sc.modelTurn as Record<string, unknown> | undefined;
                if (modelTurn?.parts) {
                    for (const part of modelTurn.parts as Record<string, unknown>[]) {
                        if (part.text) {
                            setGuideTurnComplete(false);
                            dispatch({
                                type: 'GUIDE_TEXT_RECEIVED',
                                text: normalizeGuideTextForUi(String(part.text)),
                            });
                        }
                        if (part.inlineData) {
                            setGuideTurnComplete(false);
                            const inlineData = part.inlineData as Record<string, unknown>;
                            if (inlineData.data) {
                                await playAudioChunk(inlineData.data as string);
                            }
                        }
                    }
                }

                if (sc.turnComplete) {
                    setGuideTurnComplete(true);
                }

                if (sc.interrupted) {
                    setGuideTurnComplete(true);
                    flushGuideAudio(0);
                }
            }
        };

        ws.onerror = (e) => {
            console.error('[Builder] WebSocket error', e);
            isConnectingRef.current = false;
            stopMicrophone();
        };

        ws.onclose = () => {
            isConnectingRef.current = false;
            stopMicrophone();
            if (intentionalDisconnectRef.current) {
                setStatus('disconnected');
                return;
            }
            if (reconnectAttemptRef.current < MAX_RECONNECT_ATTEMPTS) {
                const delay = BACKOFF_BASE_MS * Math.pow(2, reconnectAttemptRef.current);
                reconnectAttemptRef.current += 1;
                console.log(`[Builder] Reconnecting in ${delay}ms (attempt ${reconnectAttemptRef.current}/${MAX_RECONNECT_ATTEMPTS})`);
                setStatus('reconnecting');
                reconnectTimerRef.current = setTimeout(() => {
                    doReconnectRef.current();
                }, delay);
            } else {
                console.log('[Builder] Max reconnect attempts reached');
                setStatus('error');
            }
        };
    }, [flushGuideAudio, handleBackendEvent, playAudioChunk, stopMicrophone]);

    const doReconnect = useCallback(() => {
        const ctx = sessionContextRef.current;
        if (!ctx) {
            setStatus('error');
            return;
        }

        try {
            setStatus('reconnecting');
            setGuideTurnComplete(true);
            const newSessionId = Math.random().toString(36).substring(7);
            const url = `${WS_URL}/api/build/${newSessionId}`;
            const ws = new WebSocket(url);
            wsRef.current = ws;

            ws.onopen = async () => {
                isConnectingRef.current = false;
                console.log('[Builder] Reconnected successfully');
                setStatus('connected');
                await startMicrophone(ws);

                const hasVisiblePanels = runtimeStateRef.current.panels.length > 0;
                const reconnectPrompt = hasVisiblePanels
                    ? buildResumePrompt(ctx, runtimeStateRef.current)
                    : buildRecoveryOpeningPrompt(ctx);
                ws.send(JSON.stringify({
                    clientContent: {
                        turns: [{ role: 'user', parts: [{ text: reconnectPrompt }] }],
                        turnComplete: true
                    }
                }));
            };

            setupWsHandlers(ws);
        } catch (error) {
            isConnectingRef.current = false;
            console.error('[Builder] Reconnect error:', error);
            setStatus('error');
        }
    }, [startMicrophone, setupWsHandlers]);

    useEffect(() => {
        doReconnectRef.current = doReconnect;
    }, [doReconnect]);

    const connect = useCallback(async (ctx: StorySessionContext) => {
        if (isConnectingRef.current || wsRef.current?.readyState === WebSocket.OPEN) {
            console.log('[Builder] connect() called while already connected/connecting — ignoring.');
            return;
        }
        isConnectingRef.current = true;

        try {
            intentionalDisconnectRef.current = false;
            reconnectAttemptRef.current = 0;
            sessionContextRef.current = ctx;
            pendingRevealRef.current = null;
            micStreamingEnabledRef.current = false;

            setStatus('connecting');
            setGuideTurnComplete(true);
            dispatch({ type: 'RESET_SESSION' });

            // Pre-create AudioContexts HERE (inside user gesture call stack) so they
            // start in running state. ws.onopen fires async and loses the gesture context.
            if (!micCtxRef.current) {
                const micCtx = new window.AudioContext({ sampleRate: 16000 });
                micCtxRef.current = micCtx;
                await micCtx.resume();
                await micCtx.audioWorklet.addModule('/audio-processor.js');
            }
            if (!audioContextRef.current) {
                const playbackCtx = new window.AudioContext({ sampleRate: 24000 });
                await playbackCtx.resume();
                audioContextRef.current = playbackCtx;
                nextPlayTimeRef.current = playbackCtx.currentTime;
                const analyser = playbackCtx.createAnalyser();
                analyser.fftSize = 256;
                analyser.connect(playbackCtx.destination);
                playbackAnalyserRef.current = analyser;
            }

            const url = `${WS_URL}/api/build/${sessionId}`;
            const ws = new WebSocket(url);
            wsRef.current = ws;

            ws.onopen = async () => {
                isConnectingRef.current = false;
                setStatus('connected');
                await startMicrophone(ws);

                ws.send(JSON.stringify({
                    clientContent: {
                        turns: [{
                            role: 'user',
                            parts: [{ text: buildInitialPrompt(ctx) }]
                        }],
                        turnComplete: true
                    }
                }));
            };

            setupWsHandlers(ws);
        } catch (error) {
            isConnectingRef.current = false;
            console.error('[Builder] Connect error:', error);
            setStatus('error');
        }
    }, [sessionId, startMicrophone, setupWsHandlers]);

    const disconnect = useCallback(() => {
        isConnectingRef.current = false;
        intentionalDisconnectRef.current = true;
        if (reconnectTimerRef.current) {
            clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = null;
        }
        wsRef.current?.close();
        wsRef.current = null;
        stopMicrophone();
        setStatus('disconnected');
    }, [stopMicrophone]);

    const manualReconnect = useCallback(() => {
        reconnectAttemptRef.current = 0;
        intentionalDisconnectRef.current = false;
        doReconnect();
    }, [doReconnect]);

    useEffect(() => {
        micStreamingEnabledRef.current = canAcceptChildInput;
    }, [canAcceptChildInput]);

    useEffect(() => {
        const queuedQuiz = runtimeState.queuedQuiz;
        if (!queuedQuiz || runtimeState.activeQuiz) {
            return;
        }
        if (!guideTurnComplete || isThinking) {
            return;
        }

        dispatch({ type: 'QUIZ_ACTIVATED' });
        sendClientEvent({
            type: 'quiz_presented_ack',
            quizId: queuedQuiz.quizId,
        });
    }, [guideTurnComplete, isThinking, runtimeState.activeQuiz, runtimeState.queuedQuiz, sendClientEvent]);

    useEffect(() => {
        return () => {
            intentionalDisconnectRef.current = true;
            if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
            disconnect();
        };
    }, [disconnect]);

    useEffect(() => {
        const stagedPanel = runtimeState.stagedPanel;
        if (!stagedPanel || stagedPanel.imageStatus === 'loading') {
            return;
        }
        if (!guideTurnComplete || isThinking) {
            return;
        }
        if (pendingRevealRef.current === stagedPanel.id) {
            return;
        }

        pendingRevealRef.current = stagedPanel.id;
        flushGuideAudio(runtimeState.panels.length === 0 ? 650 : 350);

        const revealDelay = runtimeState.panels.length === 0 ? 320 : 180;
        const timeoutId = window.setTimeout(() => {
            dispatch({ type: 'SCENE_REVEALED' });
            sendClientEvent({
                type: 'scene_visible_ack',
                panelId: stagedPanel.id,
                panelIndex: stagedPanel.panelIndex,
                imageStatus: stagedPanel.imageStatus,
                totalVisiblePanels: runtimeState.panels.length + 1,
            });
            pendingRevealRef.current = null;
        }, revealDelay);

        return () => {
            clearTimeout(timeoutId);
            if (pendingRevealRef.current === stagedPanel.id) {
                pendingRevealRef.current = null;
            }
        };
    }, [flushGuideAudio, guideTurnComplete, isThinking, runtimeState.panels.length, runtimeState.stagedPanel, sendClientEvent]);

    const submitQuizAnswer = useCallback((selectedIndex: number) => {
        const quiz = runtimeStateRef.current.activeQuiz;
        if (!quiz) return;

        const isCorrect = selectedIndex === quiz.correctIndex;
        dispatch({
            type: 'QUIZ_SUBMITTED',
            isCorrect,
            pointValue: quiz.pointValue,
        });

        sendClientEvent({
            type: 'quiz_answer_ack',
            quizId: quiz.quizId,
            selectedIndex,
            selectedOption: quiz.options[selectedIndex],
            correctIndex: quiz.correctIndex,
            correctOption: quiz.options[quiz.correctIndex],
            isCorrect,
        });
    }, [sendClientEvent]);

    const getVolume = useCallback(() => {
        let maxVolume = 0;
        if (isThinkingRef.current && playbackAnalyserRef.current) {
            const dataArray = new Uint8Array(playbackAnalyserRef.current.frequencyBinCount);
            playbackAnalyserRef.current.getByteFrequencyData(dataArray);
            const sum = dataArray.reduce((acc, val) => acc + val, 0);
            maxVolume = sum / dataArray.length / 128;
        } else if (!isThinkingRef.current && statusRef.current === 'connected' && micAnalyserRef.current) {
            const dataArray = new Uint8Array(micAnalyserRef.current.frequencyBinCount);
            micAnalyserRef.current.getByteFrequencyData(dataArray);
            const sum = dataArray.reduce((acc, val) => acc + val, 0);
            maxVolume = (sum / dataArray.length / 128) * 1.5;
        }
        return Math.min(maxVolume, 1.0);
    }, []);

    return {
        panels: runtimeState.panels,
        stagedPanel: runtimeState.stagedPanel,
        activeQuiz: runtimeState.activeQuiz,
        builderPhase: runtimeState.builderPhase,
        score: runtimeState.score,
        isThinking,
        status,
        closingNarration: runtimeState.closingNarration,
        bridgeMessage: runtimeState.bridgeMessage,
        canAcceptChildInput,
        connect,
        disconnect,
        sendText,
        forceSendText,
        submitQuizAnswer,
        getVolume,
        manualReconnect,
    };
}
