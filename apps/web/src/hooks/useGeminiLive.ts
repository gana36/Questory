import { useState, useRef, useCallback, useEffect } from 'react';

type GeminiLiveStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
type GamePhase = 'topic' | 'heroes' | 'style' | 'settings' | 'ready'; // Added phases for game UI

interface UseGeminiLiveProps {
    onMessage?: (text: string, isFinal: boolean) => void;
    onFunctionCall?: (name: string, args: any) => void;
    // New callback to receive image updates from the proxy backend
    onSceneUpdate?: (imageUrl: string) => void;
    onHeroesProposed?: (concept: string, heroes: any[]) => void;
    onHeroImageGenerated?: (heroId: string, imageUrl: string) => void;
    onCustomHeroGenerating?: (heroId: string, name: string) => void;
}

export function useGeminiLive({ onMessage, onFunctionCall, onSceneUpdate, onHeroesProposed, onHeroImageGenerated, onCustomHeroGenerating }: UseGeminiLiveProps = {}) {
    // ... [Status hooks mostly unchanged]
    const [status, setStatus] = useState<GeminiLiveStatus>('disconnected');
    const [gamePhase, setGamePhase] = useState<GamePhase>('topic');
    const [isThinking, setIsThinking] = useState(false);

    const wsRef = useRef<WebSocket | null>(null);
    const micCtxRef = useRef<AudioContext | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const processorNodeRef = useRef<AudioWorkletNode | null>(null);
    const playbackAnalyserRef = useRef<AnalyserNode | null>(null);
    const micAnalyserRef = useRef<AnalyserNode | null>(null);
    const isThinkingRef = useRef(false);
    const statusRef = useRef(status);

    useEffect(() => {
        isThinkingRef.current = isThinking;
        statusRef.current = status;
    }, [isThinking, status]);

    const nextPlayTimeRef = useRef<number>(0);

    const connect = useCallback(async (systemInstruction?: string) => {
        try {
            setStatus('connecting');

            // Hardcode a session ID for demo purposes, or pass it in later
            const sessionId = Math.random().toString(36).substring(7);
            const url = `ws://localhost:8000/api/live/${sessionId}`;

            const ws = new WebSocket(url);
            wsRef.current = ws;

            ws.onopen = async () => {
                setStatus('connected');
                // The backend handles sending the configuration setup message.
                // It automatically builds the Session config with instructions & tools.
                // We just start pushing Audio!
                await startMicrophone(ws);

                // If there's an initial instruction (like for the Create page), send it as a text turn
                if (systemInstruction) {
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

            ws.onmessage = async (event) => {
                let data;
                if (event.data instanceof Blob) {
                    const text = await event.data.text();
                    data = JSON.parse(text);
                } else {
                    data = JSON.parse(event.data);
                }

                // 1. Handle Custom Proxy Events (ex: Nano Banana images)
                if (data.backendEvent) {
                    const eventType = data.backendEvent.type;

                    if (eventType === 'scene_update' && data.backendEvent.imageUrl) {
                        onSceneUpdate?.(data.backendEvent.imageUrl);
                    } else if (eventType === 'image_generation_started') {
                        setIsThinking(true); // show the UI generating state
                    } else if (eventType === 'heroes_proposed') {
                        onHeroesProposed?.(data.backendEvent.concept, data.backendEvent.heroes);
                    } else if (eventType === 'hero_image_generated') {
                        onHeroImageGenerated?.(data.backendEvent.id, data.backendEvent.imageUrl);
                    } else if (eventType === 'custom_hero_generating') {
                        onCustomHeroGenerating?.(data.backendEvent.id, data.backendEvent.name);
                    }
                    return;
                }

                // 2. Handle standard Gemini format (relayed by proxy)
                if (data.serverContent) {
                    const modelTurn = data.serverContent.modelTurn;
                    if (modelTurn) {
                        for (const part of modelTurn.parts) {
                            if (part.text) {
                                onMessage?.(part.text, false);
                            }
                            if (part.inlineData && part.inlineData.data) {
                                await playAudioChunk(part.inlineData.data);
                            }
                        }
                    }
                    // isThinking clears via source.onended when playback finishes
                }

                if (data.toolCall) {
                    for (const call of data.toolCall.functionCalls) {
                        onFunctionCall?.(call.name, call.args);
                    }

                    // For frontend tools, we still reply via the proxy
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
                console.error('WebSocket Error', e);
                setStatus('error');
            };

            ws.onclose = () => {
                setStatus('disconnected');
                stopMicrophone();
            };

        } catch (error) {
            console.error(error);
            setStatus('error');
        }
    }, [onMessage, onFunctionCall, onSceneUpdate, onHeroesProposed, onHeroImageGenerated, onCustomHeroGenerating]);

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
            // Gemini Live return 24kHz PCM by default for Aoede
            const pcm16 = new Int16Array(bytes.buffer);
            const audioBuffer = ctx.createBuffer(1, pcm16.length, 24000);
            const channelData = audioBuffer.getChannelData(0);
            for (let i = 0; i < pcm16.length; i++) {
                channelData[i] = pcm16[i] / 32768.0;
            }

            // Resume the AudioContext if the browser suspended it (autoplay policy)
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

            // Show "Thinking/Speaking" state while audio is playing; clear when the last chunk finishes
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

            // Use a SEPARATE AudioContext for mic capture at 16kHz
            const micCtx = new window.AudioContext({ sampleRate: 16000 });
            micCtxRef.current = micCtx;
            console.log('[Mic] Mic AudioContext created. Actual sample rate:', micCtx.sampleRate);

            // Create the playback AudioContext at 24kHz (Gemini's output rate)
            const playbackCtx = new window.AudioContext({ sampleRate: 24000 });
            audioContextRef.current = playbackCtx;
            nextPlayTimeRef.current = playbackCtx.currentTime;

            // Setup Playback Analyser for AI Voice visualization
            const playbackAnalyser = playbackCtx.createAnalyser();
            playbackAnalyser.fftSize = 256;
            playbackAnalyser.connect(playbackCtx.destination);
            playbackAnalyserRef.current = playbackAnalyser;

            await micCtx.audioWorklet.addModule('/audio-processor.js');
            console.log('[Mic] AudioWorklet module loaded.');

            const source = micCtx.createMediaStreamSource(stream);

            // Setup Mic Analyser for User Voice visualization
            const micAnalyser = micCtx.createAnalyser();
            micAnalyser.fftSize = 256;
            source.connect(micAnalyser);
            micAnalyserRef.current = micAnalyser;

            const processor = new AudioWorkletNode(micCtx, 'audio-processor');

            let chunkCount = 0;
            processor.port.onmessage = (e) => {
                const pcm16Data = e.data; // Int16Array
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
            // Don't connect processor to destination — we don't want to hear our own mic
            // processor.connect(micCtx.destination);
            processorNodeRef.current = processor;
            console.log('[Mic] Audio pipeline connected. Listening for audio data...');

        } catch (e) {
            console.error("[Mic] Error starting microphone:", e);
        }
    };

    const stopMicrophone = () => {
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
    };

    const disconnect = useCallback(() => {
        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }
        stopMicrophone();
        setStatus('disconnected');
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => disconnect();
    }, [disconnect]);

    // Send a client text turn for interrupting or initial prompts
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
            maxVolume = (sum / dataArray.length / 128) * 1.5; // Boost mic visually
        }
        return Math.min(maxVolume, 1.0);
    }, []);

    return { status, gamePhase, setGamePhase, connect, disconnect, sendText, isThinking, getVolume };
}
