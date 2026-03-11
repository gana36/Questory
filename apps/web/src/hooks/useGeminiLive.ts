import { useState, useRef, useCallback, useEffect } from 'react';

type GeminiLiveStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';
type GamePhase = 'topic' | 'heroes' | 'style' | 'settings' | 'ready';

interface UseGeminiLiveProps {
    onMessage?: (text: string, isFinal: boolean) => void;
    onFunctionCall?: (name: string, args: any) => void;
    onSceneUpdate?: (imageUrl: string) => void;
    onHeroesProposed?: (concept: string, heroes: any[]) => void;
    onHeroImageGenerated?: (heroId: string, imageUrl: string) => void;
    onCustomHeroGenerating?: (heroId: string, name: string) => void;
    onComicBuilderRequested?: (heroName: string, concept: string, buildSessionId: string) => void;
    onReconnected?: () => void;
}

const MAX_RECONNECT_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 1000;

export function useGeminiLive({ onMessage, onFunctionCall, onSceneUpdate, onHeroesProposed, onHeroImageGenerated, onCustomHeroGenerating, onComicBuilderRequested, onReconnected }: UseGeminiLiveProps = {}) {
    const [status, setStatus] = useState<GeminiLiveStatus>('disconnected');
    const [gamePhase, setGamePhase] = useState<GamePhase>('topic');
    const [isThinking, setIsThinking] = useState(false);
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

    const wsRef = useRef<WebSocket | null>(null);
    const micCtxRef = useRef<AudioContext | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const processorNodeRef = useRef<AudioWorkletNode | null>(null);
    const playbackAnalyserRef = useRef<AnalyserNode | null>(null);
    const micAnalyserRef = useRef<AnalyserNode | null>(null);
    const isThinkingRef = useRef(false);
    const statusRef = useRef(status);

    // Reconnection refs
    const intentionalDisconnectRef = useRef(false);
    const reconnectAttemptRef = useRef(0);
    const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastSystemInstructionRef = useRef<string | undefined>(undefined);
    // Guard against React StrictMode double-mount creating two sessions
    const isConnectingRef = useRef(false);

    // Store callbacks in refs so ws handlers always see the latest
    const onMessageRef = useRef(onMessage);
    const onFunctionCallRef = useRef(onFunctionCall);
    const onSceneUpdateRef = useRef(onSceneUpdate);
    const onHeroesProposedRef = useRef(onHeroesProposed);
    const onHeroImageGeneratedRef = useRef(onHeroImageGenerated);
    const onCustomHeroGeneratingRef = useRef(onCustomHeroGenerating);
    const onComicBuilderRequestedRef = useRef(onComicBuilderRequested);
    const onReconnectedRef = useRef(onReconnected);

    useEffect(() => {
        onMessageRef.current = onMessage;
        onFunctionCallRef.current = onFunctionCall;
        onSceneUpdateRef.current = onSceneUpdate;
        onHeroesProposedRef.current = onHeroesProposed;
        onHeroImageGeneratedRef.current = onHeroImageGenerated;
        onCustomHeroGeneratingRef.current = onCustomHeroGenerating;
        onComicBuilderRequestedRef.current = onComicBuilderRequested;
        onReconnectedRef.current = onReconnected;
    }, [onMessage, onFunctionCall, onSceneUpdate, onHeroesProposed, onHeroImageGenerated, onCustomHeroGenerating, onComicBuilderRequested, onReconnected]);

    useEffect(() => {
        isThinkingRef.current = isThinking;
        statusRef.current = status;
    }, [isThinking, status]);

    const nextPlayTimeRef = useRef<number>(0);

    // --- Audio helpers ---

    const playAudioChunk = async (base64Data: string) => {
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
                console.warn('[Audio] AudioContext was suspended, resuming...');
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
            console.error("Error playing audio chunk", err);
        }
    };

    const startMicrophone = async (ws: WebSocket) => {
        try {
            console.log('[Mic] Requesting microphone access...');
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
            console.log('[Mic] Got media stream:', stream.getAudioTracks()[0]?.getSettings());

            const micCtx = new window.AudioContext({ sampleRate: 16000 });
            micCtxRef.current = micCtx;
            console.log('[Mic] Mic AudioContext created. Actual sample rate:', micCtx.sampleRate);

            const playbackCtx = new window.AudioContext({ sampleRate: 24000 });
            audioContextRef.current = playbackCtx;
            nextPlayTimeRef.current = playbackCtx.currentTime;

            const playbackAnalyser = playbackCtx.createAnalyser();
            playbackAnalyser.fftSize = 256;
            playbackAnalyser.connect(playbackCtx.destination);
            playbackAnalyserRef.current = playbackAnalyser;

            await micCtx.audioWorklet.addModule('/audio-processor.js');
            console.log('[Mic] AudioWorklet module loaded.');

            const source = micCtx.createMediaStreamSource(stream);

            const micAnalyser = micCtx.createAnalyser();
            micAnalyser.fftSize = 256;
            source.connect(micAnalyser);
            micAnalyserRef.current = micAnalyser;

            const processor = new AudioWorkletNode(micCtx, 'audio-processor');

            let chunkCount = 0;
            processor.port.onmessage = (e) => {
                const pcm16Data = e.data;
                const base64Str = btoa(String.fromCharCode(...new Uint8Array(pcm16Data.buffer)));

                chunkCount++;
                if (chunkCount % 50 === 1) {
                    console.log(`[Mic] Sending audio chunk #${chunkCount} (${pcm16Data.length} samples)`);
                }

                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        realtimeInput: {
                            mediaChunks: [{
                                mimeType: "audio/pcm;rate=16000",
                                data: base64Str
                            }]
                        }
                    }));
                }
            };

            source.connect(processor);
            processorNodeRef.current = processor;
            console.log('[Mic] Audio pipeline connected. Listening for audio data...');

        } catch (e) {
            console.error("[Mic] Error starting microphone:", e);
        }
    };

    const stopMicrophone = useCallback(() => {
        if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach(track => track.stop());
            mediaStreamRef.current = null;
        }
        if (processorNodeRef.current) {
            processorNodeRef.current.disconnect();
            processorNodeRef.current = null;
        }
        if (micCtxRef.current) {
            micCtxRef.current.close().catch(console.error);
            micCtxRef.current = null;
        }
        if (audioContextRef.current) {
            audioContextRef.current.close().catch(console.error);
            audioContextRef.current = null;
        }
        playbackAnalyserRef.current = null;
        micAnalyserRef.current = null;
    }, []);

    // --- WebSocket handler setup (shared between connect and reconnect) ---

    const setupWsHandlers = useCallback((ws: WebSocket, isReconnect: boolean) => {
        ws.onopen = async () => {
            console.log(`[GeminiLive] WebSocket opened (${isReconnect ? 'reconnect' : 'fresh'})`);
            setStatus('connected');
            reconnectAttemptRef.current = 0;
            await startMicrophone(ws);

            if (isReconnect) {
                onReconnectedRef.current?.();
            }
        };

        ws.onmessage = async (event) => {
            let data;
            if (event.data instanceof Blob) {
                const text = await event.data.text();
                data = JSON.parse(text);
            } else {
                data = JSON.parse(event.data);
            }

            // Handle backend events
            if (data.backendEvent) {
                const eventType = data.backendEvent.type;

                if (eventType === 'scene_update' && data.backendEvent.imageUrl) {
                    onSceneUpdateRef.current?.(data.backendEvent.imageUrl);
                } else if (eventType === 'image_generation_started') {
                    setIsThinking(true);
                } else if (eventType === 'heroes_proposed') {
                    onHeroesProposedRef.current?.(data.backendEvent.concept, data.backendEvent.heroes);
                } else if (eventType === 'hero_image_generated') {
                    onHeroImageGeneratedRef.current?.(data.backendEvent.id, data.backendEvent.imageUrl);
                } else if (eventType === 'custom_hero_generating') {
                    onCustomHeroGeneratingRef.current?.(data.backendEvent.id, data.backendEvent.name);
                } else if (eventType === 'comic_builder_requested') {
                    onComicBuilderRequestedRef.current?.(
                        data.backendEvent.heroName,
                        data.backendEvent.concept,
                        data.backendEvent.buildSessionId
                    );
                }
                return;
            }

            // Handle standard Gemini format
            if (data.serverContent) {
                const modelTurn = data.serverContent.modelTurn;
                if (modelTurn) {
                    for (const part of modelTurn.parts) {
                        if (part.text) {
                            onMessageRef.current?.(part.text, false);
                        }
                        if (part.inlineData && part.inlineData.data) {
                            await playAudioChunk(part.inlineData.data);
                        }
                    }
                }
            }

            if (data.toolCall) {
                for (const call of data.toolCall.functionCalls) {
                    onFunctionCallRef.current?.(call.name, call.args);
                }

                ws.send(JSON.stringify({
                    toolResponse: {
                        functionResponses: data.toolCall.functionCalls.map((c: any) => ({
                            id: c.id,
                            name: c.name,
                            response: { result: "ok" }
                        }))
                    }
                }));
            }
        };

        ws.onerror = (e) => {
            console.error('[GeminiLive] WebSocket error', e);
            stopMicrophone();
        };

        ws.onclose = () => {
            console.log('[GeminiLive] WebSocket closed');
            stopMicrophone();

            if (intentionalDisconnectRef.current) {
                setStatus('disconnected');
                return;
            }

            // Unexpected disconnect — auto-reconnect with backoff
            if (reconnectAttemptRef.current < MAX_RECONNECT_ATTEMPTS) {
                const delay = BACKOFF_BASE_MS * Math.pow(2, reconnectAttemptRef.current);
                reconnectAttemptRef.current += 1;
                setStatus('reconnecting');
                console.log(`[GeminiLive] Reconnecting in ${delay}ms (attempt ${reconnectAttemptRef.current}/${MAX_RECONNECT_ATTEMPTS})`);
                reconnectTimerRef.current = setTimeout(() => doReconnect(), delay);
            } else {
                setStatus('error');
            }
        };
    }, [stopMicrophone]);

    // --- Connect (fresh start) ---

    const connect = useCallback(async (systemInstruction?: string) => {
        // Guard: prevent React StrictMode double-mount from creating 2 sessions
        if (isConnectingRef.current || wsRef.current?.readyState === WebSocket.OPEN) {
            console.log('[GeminiLive] connect() called while already connected/connecting — ignoring.');
            return;
        }
        isConnectingRef.current = true;
        try {
            setStatus('connecting');
            intentionalDisconnectRef.current = false;
            reconnectAttemptRef.current = 0;
            lastSystemInstructionRef.current = systemInstruction;

            const sessionId = Math.random().toString(36).substring(7);
            setCurrentSessionId(sessionId);
            const url = `ws://localhost:8000/api/live/${sessionId}`;

            const ws = new WebSocket(url);
            wsRef.current = ws;

            // Override onopen to also send the initial system instruction
            setupWsHandlers(ws, false);
            const originalOnOpen = ws.onopen;
            ws.onopen = async (event) => {
                await (originalOnOpen as any)?.call(ws, event);
                if (systemInstruction && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        clientContent: {
                            turns: [{
                                role: "user",
                                parts: [{ text: systemInstruction }]
                            }],
                            turnComplete: true
                        }
                    }));
                }
            };

        } catch (error) {
            console.error(error);
            setStatus('error');
        }
    }, [setupWsHandlers]);

    // --- Reconnect (preserves external state, page sends context resume via onReconnected) ---

    const doReconnect = useCallback(() => {
        try {
            setStatus('reconnecting');

            // Close old WS cleanly if still lingering
            if (wsRef.current) {
                try { wsRef.current.close(); } catch { /* ignore */ }
                wsRef.current = null;
            }

            const sessionId = Math.random().toString(36).substring(7);
            setCurrentSessionId(sessionId);
            const url = `ws://localhost:8000/api/live/${sessionId}`;

            const ws = new WebSocket(url);
            wsRef.current = ws;

            // setupWsHandlers with isReconnect=true will call onReconnected on open
            setupWsHandlers(ws, true);

        } catch (error) {
            console.error('[GeminiLive] Reconnect failed:', error);
            setStatus('error');
        }
    }, [setupWsHandlers]);

    // --- Disconnect (intentional) ---

    const disconnect = useCallback(() => {
        isConnectingRef.current = false;
        intentionalDisconnectRef.current = true;
        if (reconnectTimerRef.current) {
            clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = null;
        }
        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }
        stopMicrophone();
        setCurrentSessionId(null);
        setStatus('disconnected');
    }, [stopMicrophone]);

    // --- Manual reconnect (exposed for retry button) ---

    const manualReconnect = useCallback(() => {
        reconnectAttemptRef.current = 0;
        intentionalDisconnectRef.current = false;
        doReconnect();
    }, [doReconnect]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            intentionalDisconnectRef.current = true;
            if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
            disconnect();
        };
    }, [disconnect]);

    // Send a client text turn
    const sendText = useCallback((text: string) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
                clientContent: {
                    turns: [{
                        role: "user",
                        parts: [{ text }]
                    }],
                    turnComplete: true
                }
            }));
        }
    }, []);

    // Get current audio volume (0.0 to 1.0) for UI visualization
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

    return { status, gamePhase, setGamePhase, connect, disconnect, sendText, isThinking, getVolume, manualReconnect, currentSessionId };
}
