import { useState, useRef, useCallback, useEffect } from 'react';

export type BuilderStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
export type BuilderPhase = 'connecting' | 'building' | 'quiz_active' | 'complete';

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
    question: string;
    options: string[];
    correctIndex: number;
    explanation: string;
    pointValue: number;
}

export interface StorySessionContext {
    topic: string;
    heroName: string;
    artStyle: string;
    ageRange: number;
    quizFrequency: string;
}

const AGE_LABELS: Record<number, string> = {
    0: 'Pre-K (ages 3-4)',
    1: 'Early Elementary (ages 5-7)',
    2: 'Elementary (ages 8-10)',
    3: 'Middle School (ages 11-13)',
    4: 'Teen (ages 14+)',
};

function buildInitialPrompt(ctx: StorySessionContext): string {
    const ageLabel = AGE_LABELS[ctx.ageRange] ?? 'Elementary (ages 8-10)';
    return `Let's build our comic story!
Topic: ${ctx.topic}
Hero: ${ctx.heroName}
Art Style: ${ctx.artStyle}
Audience Age: ${ageLabel}
Quiz Frequency: ${ctx.quizFrequency}

Please start narrating and building panels right away! Begin with an exciting opening scene that introduces our hero and world!`;
}

export function useStoryBuilder(sessionId: string) {
    const [status, setStatus] = useState<BuilderStatus>('disconnected');
    const [builderPhase, setBuilderPhase] = useState<BuilderPhase>('connecting');
    const [panels, setPanels] = useState<ComicPanelState[]>([]);
    const [activeQuiz, setActiveQuiz] = useState<ActiveQuiz | null>(null);
    const [score, setScore] = useState(0);
    const [isThinking, setIsThinking] = useState(false);
    const [closingNarration, setClosingNarration] = useState<string | null>(null);

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

    useEffect(() => {
        isThinkingRef.current = isThinking;
        statusRef.current = status;
    }, [isThinking, status]);

    const handleBackendEvent = useCallback((event: Record<string, unknown>) => {
        const type = event.type as string;

        if (type === 'panel_added') {
            setPanels(prev => [
                ...prev,
                {
                    id: event.panelId as string,
                    panelIndex: prev.length,
                    narration: event.narration as string,
                    speechBubble: event.speechBubble as string | undefined,
                    learningObjective: event.learningObjective as string | undefined,
                    imageStatus: 'loading',
                }
            ]);
        } else if (type === 'panel_image_ready') {
            setPanels(prev =>
                prev.map(p =>
                    p.id === event.panelId
                        ? {
                            ...p,
                            imageUrl: event.imageUrl as string | undefined,
                            imageStatus: event.imageStatus as 'ready' | 'error',
                        }
                        : p
                )
            );
        } else if (type === 'quiz_started') {
            setActiveQuiz({
                question: event.question as string,
                options: event.options as string[],
                correctIndex: event.correctIndex as number,
                explanation: event.explanation as string,
                pointValue: (event.pointValue as number) ?? 100,
            });
            setBuilderPhase('quiz_active');
        } else if (type === 'story_complete') {
            setClosingNarration(event.closingNarration as string);
            setBuilderPhase('complete');
        }
    }, []);

    const playAudioChunk = useCallback(async (base64Data: string) => {
        if (!audioContextRef.current) return;
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
                if (ctx.currentTime >= nextPlayTimeRef.current - 0.05) {
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

            const micCtx = new window.AudioContext({ sampleRate: 16000 });
            micCtxRef.current = micCtx;

            const playbackCtx = new window.AudioContext({ sampleRate: 24000 });
            audioContextRef.current = playbackCtx;
            nextPlayTimeRef.current = playbackCtx.currentTime;

            const playbackAnalyser = playbackCtx.createAnalyser();
            playbackAnalyser.fftSize = 256;
            playbackAnalyser.connect(playbackCtx.destination);
            playbackAnalyserRef.current = playbackAnalyser;

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
                if (ws.readyState === WebSocket.OPEN) {
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
        mediaStreamRef.current?.getTracks().forEach(t => t.stop());
        mediaStreamRef.current = null;
        processorNodeRef.current?.disconnect();
        processorNodeRef.current = null;
        micCtxRef.current?.close().catch(console.error);
        micCtxRef.current = null;
        audioContextRef.current?.close().catch(console.error);
        audioContextRef.current = null;
    }, []);

    const sendText = useCallback((text: string) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
                clientContent: {
                    turns: [{ role: 'user', parts: [{ text }] }],
                    turnComplete: true
                }
            }));
        }
    }, []);

    const connect = useCallback(async (ctx: StorySessionContext) => {
        try {
            setStatus('connecting');
            setBuilderPhase('connecting');
            setPanels([]);
            setScore(0);
            setActiveQuiz(null);
            setClosingNarration(null);

            const url = `ws://localhost:8000/api/build/${sessionId}`;
            const ws = new WebSocket(url);
            wsRef.current = ws;

            ws.onopen = async () => {
                setStatus('connected');
                setBuilderPhase('building');
                await startMicrophone(ws);

                // Send initial story context so Gemini can start building immediately
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
                            if (part.inlineData) {
                                const inlineData = part.inlineData as Record<string, unknown>;
                                if (inlineData.data) {
                                    await playAudioChunk(inlineData.data as string);
                                }
                            }
                        }
                    }
                }
            };

            ws.onerror = (e) => {
                console.error('[Builder] WebSocket error', e);
                setStatus('error');
            };

            ws.onclose = () => {
                setStatus('disconnected');
                stopMicrophone();
            };
        } catch (error) {
            console.error('[Builder] Connect error:', error);
            setStatus('error');
        }
    }, [sessionId, handleBackendEvent, playAudioChunk, startMicrophone, stopMicrophone]);

    const disconnect = useCallback(() => {
        wsRef.current?.close();
        wsRef.current = null;
        stopMicrophone();
        setStatus('disconnected');
    }, [stopMicrophone]);

    useEffect(() => {
        return () => disconnect();
    }, [disconnect]);

    const submitQuizAnswer = useCallback((selectedIndex: number) => {
        if (!activeQuiz) return;
        const isCorrect = selectedIndex === activeQuiz.correctIndex;
        if (isCorrect) {
            setScore(prev => prev + activeQuiz.pointValue);
        }
        const resultText = isCorrect
            ? `I got it right! The answer is "${activeQuiz.options[selectedIndex]}". Let's continue the story!`
            : `I got it wrong. The correct answer was "${activeQuiz.options[activeQuiz.correctIndex]}". I learned something new! Let's keep going!`;
        sendText(resultText);
        setActiveQuiz(null);
        setBuilderPhase('building');
    }, [activeQuiz, sendText]);

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
    };
}
