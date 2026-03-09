import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { Float, Sparkles } from '@react-three/drei';
import * as THREE from 'three';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, FileUp, Link as LinkIcon, Send } from 'lucide-react';
import { useGeminiLive } from '@/hooks/useGeminiLive';
import { cn } from '@/lib/utils';

const BACKGROUND_IMAGES = [
    '/bg_enchanted_forest.png',
    '/bg_underwater_city.png',
    '/bg_magical_castle.png',
    '/bg_space_station.png'
];

/**
 * 3D Dora Avatar with real-time audio-reactive animations.
 * Uses Dora's actual PNG images as Three.js textures on a circular plane.
 * Lip-sync is achieved by swapping between the listening and speaking textures
 * based on the real-time audio volume from the Web Audio API AnalyserNode.
 * 
 * Audio Routing (handled by useGeminiLive):
 *   MediaStream -> AnalyserNode -> AudioContext.destination
 *   getVolume() reads frequencyData from the AnalyserNode each frame.
 *
 * Animation Loop (useFrame @ 60fps):
 *   1. Read volume (0.0 - 1.0) from getVolume()
 *   2. If volume > threshold -> swap to speaking texture (mouth open)
 *   3. Scale body proportional to volume (breathing/pulse effect)
 *   4. Apply gentle sine-wave hover for idle floating
 *   5. Tilt slightly on X-axis when speaking for a "leaning in" feel
 */
function DoraAvatar({ volume, isThinking }: { volume: () => number; isThinking: boolean }) {
    const groupRef = useRef<THREE.Group>(null);
    const meshRef = useRef<THREE.Mesh>(null);

    // Load Dora's textures
    const listeningTex = useLoader(THREE.TextureLoader, '/game_master_avatar.png');
    const speakingTex = useLoader(THREE.TextureLoader, '/game_master_speaking.png');

    // Create a circular geometry (plane with enough segments to clip as circle via alpha)
    const circleGeo = useRef(new THREE.CircleGeometry(1.8, 64)).current;

    useFrame((state) => {
        if (!groupRef.current || !meshRef.current) return;

        const vol = volume();
        const mat = meshRef.current.material as THREE.MeshBasicMaterial;

        // --- 1. Lip Sync: Swap texture based on volume threshold ---
        if (isThinking && vol > 0.05) {
            mat.map = speakingTex;
        } else {
            mat.map = listeningTex;
        }
        mat.needsUpdate = true;

        // --- 2. Audio-reactive scale pulse ---
        const targetScale = 1 + vol * 0.2;
        const currentScale = meshRef.current.scale.x;
        const newScale = THREE.MathUtils.lerp(currentScale, targetScale, 0.15);
        meshRef.current.scale.setScalar(newScale);

        // --- 3. Gentle floating hover ---
        groupRef.current.position.y = Math.sin(state.clock.elapsedTime * 1.5) * 0.08;

        // --- 4. Subtle "lean in" tilt when speaking ---
        const targetRotX = isThinking ? Math.sin(state.clock.elapsedTime * 3) * 0.06 : 0;
        groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, targetRotX, 0.1);

        // --- 5. Gentle side wobble ---
        groupRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 1.2) * 0.03;
    });

    return (
        <group ref={groupRef}>
            <Float speed={1.5} rotationIntensity={0.15} floatIntensity={0.3}>
                {/* Dora's face as a textured circular plane */}
                <mesh ref={meshRef} geometry={circleGeo}>
                    <meshBasicMaterial map={listeningTex} transparent side={THREE.DoubleSide} />
                </mesh>

                {/* Magical sparkles emanating around Dora */}
                <Sparkles
                    count={40}
                    scale={5}
                    size={3}
                    speed={isThinking ? 3 : 0.8}
                    opacity={0.6}
                    color={isThinking ? '#f9b7c8' : '#a1cfff'}
                />

                {/* Secondary sparkle layer for depth */}
                <Sparkles
                    count={20}
                    scale={3}
                    size={5}
                    speed={isThinking ? 2 : 0.4}
                    opacity={0.3}
                    color="#ffffff"
                />
            </Float>
        </group>
    );
}

export function CreateStoryPage() {
    const navigate = useNavigate();
    const avatarRef = useRef<HTMLDivElement>(null);

    // Core state
    const [topic, setTopic] = useState('');
    const [storyConcept, setStoryConcept] = useState('');
    const [heroes, setHeroes] = useState<Array<{ id: string, name: string, description: string, imageUrl?: string }>>([]);
    const [character, setCharacter] = useState('');
    const [inputType, setInputType] = useState<'text' | 'youtube' | 'pdf'>('text');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSubmittingTopic, setIsSubmittingTopic] = useState(false);

    // AI hook integration
    const { status, gamePhase, setGamePhase, connect, disconnect, isThinking, sendText, getVolume, manualReconnect } = useGeminiLive({
        onMessage: () => {
            setIsSubmittingTopic(false);
        },
        onHeroesProposed: (concept, proposedHeroes) => {
            setStoryConcept(concept);
            setHeroes(proposedHeroes);
            setIsSubmittingTopic(false);
            setGamePhase('heroes');
        },
        onHeroImageGenerated: (heroId, imageUrl) => {
            setHeroes(prev => {
                const existing = prev.find(h => h.id === heroId);
                if (existing) {
                    return prev.map(h => h.id === heroId ? { ...h, imageUrl } : h);
                } else {
                    return [...prev, { id: heroId, name: 'Custom Hero', description: 'Your unique creation!', imageUrl }];
                }
            });
        },
        onCustomHeroGenerating: (heroId, name) => {
            setHeroes(prev => {
                if (prev.find(h => h.id === heroId)) return prev;
                return [...prev, { id: heroId, name, description: 'Generating your custom hero...' }];
            });
        },
        onReconnected: () => {
            const heroNames = heroes.map(h => h.name).join(', ');
            sendText(`[CONTEXT RESUME] Setting up a story adventure.
Topic: ${topic}
Story Concept: ${storyConcept}
Heroes proposed: ${heroNames}
Selected hero: ${character}
Current phase: ${gamePhase}
Please continue from the ${gamePhase} phase.`);
        },
    });

    const isConnected = status === 'connected';

    // Background Carousel Logic
    const [currentBgIndex, setCurrentBgIndex] = useState(0);

    // Audio reactive animation loop for the Avatar (similar to Fairy)
    useEffect(() => {
        let animationId: number;
        const animate = () => {
            if (avatarRef.current && isConnected) {
                const vol = getVolume();
                // Base scale is 1, peaks up to 1.3 based on volume
                const targetScale = 1 + (vol * 0.3);
                // Glow spread correlates with volume
                const glow = isThinking ? 30 + (vol * 60) : 10 + (vol * 30);

                // We use Tailwind CSS variables to plug into the transform safely
                avatarRef.current.style.setProperty('--tw-scale-x', targetScale.toString());
                avatarRef.current.style.setProperty('--tw-scale-y', targetScale.toString());

                // Provide a custom var for the blob glow behind the avatar
                avatarRef.current.style.setProperty('--avatar-glow', `${glow}px`);
            }
            animationId = requestAnimationFrame(animate);
        };

        if (isConnected) {
            animate();
        }

        return () => cancelAnimationFrame(animationId);
    }, [isConnected, isThinking, getVolume]);

    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentBgIndex((prev) => (prev + 1) % BACKGROUND_IMAGES.length);
        }, 8000); // 8 seconds per image
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (status === 'error' || status === 'disconnected') {
            setIsSubmittingTopic(false);
        }
    }, [status]);

    // Auto-connect on mount if we want to kickstart the interaction, or let user click mic.
    const toggleVoice = () => {
        if (isConnected) {
            disconnect();
        } else {
            connect("You are the Questory Game Master. You are helping a child set up their interactive learning adventure. Start by enthusiastically asking what they want to learn about today. Keep responses under 2 sentences.");
        }
    };

    const handleTopicSubmit = (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!topic.trim() || isSubmittingTopic) return;

        setIsSubmittingTopic(true);

        let prompt = `I want the topic to be: ${topic}.`;
        if (inputType === 'youtube') prompt = `I have a YouTube video link: ${topic}. Please use this to create the concept for our story.`;
        if (inputType === 'pdf') prompt = `I have uploaded a PDF document named "${topic}". Please use this to create the concept for our story.`;

        if (isConnected) {
            sendText(`${prompt} Please propose 3 heroes using the propose_heroes tool now.`);
        } else {
            connect(`I want to start a new adventure! ${prompt} Please propose 3 heroes using the propose_heroes tool now.`);
        }
    };

    const handleCharacterSelect = (char: string) => {
        if (isSubmitting) return;
        setCharacter(char);
        if (isConnected) {
            sendText(`I pick the ${char} character. I'm ready to play!`);
        }
        setIsSubmitting(true);
        setTimeout(() => {
            const sessionId = Math.random().toString(36).substring(7);
            navigate(`/build/${sessionId}`, {
                state: {
                    topic,
                    heroName: character
                }
            });
        }, 1500);
    };

    return (
        <div className="flex-1 w-full h-screen relative overflow-hidden bg-slate-900 flex justify-center items-center">
            {/* Base dark layer */}
            <div className="absolute inset-0 bg-slate-950 z-0" />

            {/* Immersive Game Background Carousel */}
            {BACKGROUND_IMAGES.map((bg, index) => (
                <div
                    key={bg}
                    className={cn(
                        "absolute inset-0 bg-cover bg-center transition-all duration-[3000ms] ease-in-out scale-105 z-0",
                        index === currentBgIndex ? "opacity-100" : "opacity-0 scale-100"
                    )}
                    style={{ backgroundImage: `url('${bg}')` }}
                />
            ))}

            {/* Cinematic Overlay for Readability */}
            <div className="absolute inset-0 bg-slate-900/10 mix-blend-overlay pointer-events-none z-0" />
            <div className="absolute inset-0 bg-gradient-to-b from-slate-950/40 via-transparent to-slate-950/80 pointer-events-none z-0" />

            {/* Dynamic ambient glow based on thinking state */}
            <div className={`absolute inset-0 transition-opacity duration-1000 radial-gradient ${isThinking ? 'bg-indigo-900/40 opacity-100' : 'opacity-0'}`} />

            {/* Central Voice Avatar - Floating at bottom right */}
            <div className="absolute bottom-8 right-8 z-50 flex flex-col items-end gap-2 group">
                {/* Reconnecting badge */}
                {status === 'reconnecting' && (
                    <div className="flex items-center gap-1.5 bg-amber-500 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg animate-pulse">
                        <Loader2 className="w-3 h-3 animate-spin" /> Reconnecting...
                    </div>
                )}

                {/* Error retry indicator */}
                {status === 'error' && (
                    <div
                        onClick={manualReconnect}
                        className="flex items-center gap-1.5 bg-red-500 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg cursor-pointer hover:bg-red-600 transition-colors"
                    >
                        Connection lost — Tap to retry
                    </div>
                )}
                {isConnected ? (
                    <div
                        ref={avatarRef}
                        onClick={disconnect}
                        className={cn(
                            "relative cursor-pointer w-32 h-32 md:w-40 md:h-40 hover:scale-105 transition-transform duration-[50ms] rounded-full z-50 border-cherry-flow shadow-2xl transform",
                            isThinking ? "border-[8px] animate-flow-fast" : "border-[4px] animate-flow-slow"
                        )}
                    >
                        <div
                            className={cn(
                                "absolute inset-0 rounded-full blur-2xl animate-pulse pointer-events-none transition-all duration-300 ease-in-out -z-10",
                                isThinking ? "bg-pink-500/70" : "bg-sky-500/70"
                            )}
                            style={{
                                boxShadow: `0 0 var(--avatar-glow, 20px) var(--avatar-glow-color, ${isThinking ? '#f48fb1' : '#a1cfff'})`
                            }}
                        />
                        {/* 3D Real-time LipSync Avatar */}
                        <div className="relative z-10 w-full h-full rounded-full overflow-hidden bg-transparent pointer-events-none">
                            <Canvas camera={{ position: [0, 0, 5], fov: 45 }} style={{ background: 'transparent' }}>
                                <ambientLight intensity={1.2} />
                                <DoraAvatar volume={getVolume} isThinking={isThinking} />
                            </Canvas>
                        </div>
                    </div>
                ) : (
                    <div
                        onClick={toggleVoice}
                        className="relative cursor-pointer w-24 h-24 md:w-32 md:h-32 hover:scale-105 transition-transform duration-500 animate-sleep-breathe group z-50 rounded-full"
                    >
                        {/* Sleeping state - no border effects to resolve woofer bug */}
                        <div className="absolute inset-0 rounded-full blur-xl bg-slate-700/50 animate-pulse pointer-events-none -z-10" />
                        <img
                            src="/game_master_sleeping.png"
                            alt="Game Master Sleeping"
                            className="relative z-10 w-full h-full rounded-full object-cover border-[4px] border-slate-600/50 shadow-2xl opacity-80 group-hover:opacity-100 transition-opacity"
                        />
                        <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-slate-800/90 backdrop-blur-md text-white text-xs font-bold px-4 py-2 rounded-full shadow-xl border border-slate-600 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-20">
                            Tap to Wake
                        </div>
                    </div>
                )}
            </div>

            {/* Interactive Stage Area */}
            <div className="w-full max-w-4xl px-6 relative z-20 mt-[-5rem]">
                {gamePhase === 'topic' && (
                    <div className="animate-in zoom-in-95 fade-in duration-500 flex flex-col items-center space-y-10">
                        <div className="text-center space-y-2">
                            <h1 className="text-4xl md:text-6xl font-black text-white drop-shadow-xl tracking-tight">Choose Your Quest</h1>
                            <p className="text-xl text-slate-200 font-medium">What world shall we build today?</p>
                        </div>

                        <form onSubmit={handleTopicSubmit} className="w-full max-w-2xl relative shadow-2xl group">
                            <Input
                                value={topic}
                                onChange={(e) => {
                                    setTopic(e.target.value);
                                    if (inputType !== 'text' && !e.target.value.includes('http') && !e.target.value.includes('PDF')) {
                                        setInputType('text');
                                    }
                                }}
                                placeholder={inputType === 'youtube' ? "Paste YouTube URL..." : "e.g. Exploring the deep ocean..."}
                                className="w-full h-20 text-2xl px-8 rounded-full bg-white/10 backdrop-blur-xl border-2 border-white/20 text-white placeholder:text-white/50 focus-visible:ring-4 focus-visible:ring-indigo-500 focus-visible:border-white transition-all shadow-[0_8px_32px_rgba(0,0,0,0.3)] group-hover:bg-white/15"
                            />
                            <Button
                                type="submit"
                                size="icon"
                                className="absolute right-3 top-3 h-14 w-14 rounded-full bg-white text-indigo-900 hover:bg-indigo-50 hover:scale-105 transition-all shadow-lg flex justify-center items-center"
                                disabled={!topic.trim() || isSubmittingTopic}
                            >
                                {isSubmittingTopic ? <Loader2 className="w-6 h-6 animate-spin text-indigo-500" /> : <Send className="w-6 h-6 ml-1" />}
                            </Button>
                        </form>

                        <div className="flex gap-4 w-full max-w-lg justify-center mt-6">
                            <input
                                type="file"
                                id="pdf-upload"
                                className="hidden"
                                accept=".pdf"
                                onChange={(e) => {
                                    if (e.target.files?.[0]) {
                                        setTopic(`PDF Document: ${e.target.files[0].name}`);
                                        setInputType('pdf');
                                    }
                                }}
                            />
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => document.getElementById('pdf-upload')?.click()}
                                className={cn(
                                    "flex-1 h-14 backdrop-blur-xl border-2 rounded-full text-lg font-bold shadow-[0_8px_32px_rgba(0,0,0,0.3)] hover:shadow-[0_8px_32px_rgba(255,255,255,0.2)] transition-all duration-300 transform hover:-translate-y-1",
                                    inputType === 'pdf' ? "bg-indigo-500/80 border-indigo-400 text-white" : "bg-white/10 border-white/20 text-white hover:bg-white/20"
                                )}>
                                <FileUp className="w-5 h-5 mr-3" /> Upload Book
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                    setInputType('youtube');
                                    setTopic('');
                                    document.querySelector('input')?.focus();
                                }}
                                className={cn(
                                    "flex-1 h-14 backdrop-blur-xl border-2 rounded-full text-lg font-bold shadow-[0_8px_32px_rgba(0,0,0,0.3)] hover:shadow-[0_8px_32px_rgba(255,255,255,0.2)] transition-all duration-300 transform hover:-translate-y-1",
                                    inputType === 'youtube' ? "bg-red-500/80 border-red-400 text-white" : "bg-white/10 border-white/20 text-white hover:bg-white/20"
                                )}>
                                <LinkIcon className="w-5 h-5 mr-3" /> Paste Video
                            </Button>
                        </div>

                        {!isConnected && (
                            <div className="pt-8">
                                <Button onClick={() => {
                                    setHeroes([
                                        { id: 'debug1', name: 'Debug Knight', description: 'A valiant knight to test the flow.', imageUrl: '' },
                                        { id: 'debug2', name: 'Debug Mage', description: 'A wise mage to test the flow.', imageUrl: '' },
                                        { id: 'debug3', name: 'Debug Rogue', description: 'A sneaky rogue to test the flow.', imageUrl: '' }
                                    ]);
                                    setGamePhase('heroes');
                                }} variant="ghost" className="text-white/40 hover:text-white/80 hover:bg-white/5 rounded-full px-6 font-medium tracking-wider text-sm uppercase">Skip to next (debug) →</Button>
                            </div>
                        )}
                    </div>
                )}

                {gamePhase === 'heroes' && (
                    <div className="animate-in slide-in-from-right-10 fade-in duration-500 w-full max-w-5xl mx-auto flex flex-col space-y-8">
                        <div className="text-center space-y-6">
                            <h2 className="text-5xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-br from-white via-indigo-100 to-indigo-300 tracking-tight drop-shadow-2xl animate-pulse">Choose Your Hero</h2>
                            {storyConcept && (
                                <p className="text-xl text-indigo-100 font-medium max-w-3xl mx-auto leading-relaxed bg-slate-900/30 p-5 rounded-3xl backdrop-blur-xl border border-white/10 shadow-[0_0_30px_rgba(0,0,0,0.5)]">
                                    {storyConcept}
                                </p>
                            )}
                        </div>

                        <div className="w-full max-w-6xl mx-auto mt-12 flex flex-col md:flex-row items-center justify-around gap-8 md:gap-4 px-4 h-[50vh]">
                            {heroes.map((hero, index) => {
                                return (
                                    <div
                                        key={hero.id}
                                        style={{
                                            animationDelay: `${index * 0.4}s`
                                        }}
                                        className="animate-float z-30 group relative flex-1 flex justify-center w-full md:w-auto"
                                    >
                                        <div
                                            onClick={() => handleCharacterSelect(hero.name)}
                                            className="relative cursor-pointer transition-all duration-500 hover:scale-[1.05] flex flex-col items-center"
                                        >
                                            {/* Character Visual / 3D Orb State */}
                                            <div className="relative w-40 h-40 md:w-48 md:h-48 rounded-full flex items-center justify-center mb-3 transition-all duration-700 group-hover:-translate-y-2 group-hover:shadow-[0_20px_40px_rgba(99,102,241,0.4)] shadow-[0_10px_30px_rgba(0,0,0,0.6)]">
                                                <div className="absolute inset-0 rounded-full overflow-hidden">
                                                    {hero.imageUrl ? (
                                                        <img
                                                            src={hero.imageUrl}
                                                            alt={hero.name}
                                                            className="w-full h-full object-cover"
                                                        />
                                                    ) : (
                                                        <div className="flex flex-col items-center justify-center space-y-3 p-4 text-center bg-slate-900/60 backdrop-blur-md w-full h-full">
                                                            <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
                                                            <p className="text-[10px] font-semibold tracking-wide uppercase text-slate-400">Loading...</p>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* 3D Glass / Sphere Overlay */}
                                                <div className="absolute inset-0 rounded-full pointer-events-none shadow-[inset_0_4px_12px_rgba(255,255,255,0.4),inset_0_-8px_20px_rgba(0,0,0,0.8)]" />
                                                <div className="absolute inset-0 rounded-full pointer-events-none border-[1.5px] border-white/30 bg-gradient-to-tr from-black/40 via-transparent to-white/40" />
                                            </div>

                                            {/* Hero Name Badge (Always visible, clean) */}
                                            <div className="px-5 py-2 bg-slate-950/90 backdrop-blur-md rounded-full shadow-2xl group-hover:bg-slate-900 transition-all duration-300">
                                                <h3 className="text-base md:text-lg font-bold text-white tracking-wide">{hero.name}</h3>
                                            </div>

                                            {/* Hover Professional Container (Tooltip) */}
                                            <div className="absolute opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-400 bottom-[105%] left-1/2 -translate-x-1/2 w-[320px] bg-slate-800/30 backdrop-blur-3xl rounded-3xl border-[1.5px] border-white/20 shadow-[0_30px_60px_rgba(0,0,0,0.6),inset_0_2px_15px_rgba(255,255,255,0.2)] p-6 z-50 transform translate-y-4 group-hover:translate-y-0 hidden md:block">
                                                <div className="flex items-center gap-3 mb-4">
                                                    <h4 className="text-white font-black text-xs tracking-[0.2em] uppercase drop-shadow-md">Character Profile</h4>
                                                </div>
                                                <p className="text-slate-100/90 leading-relaxed text-sm font-medium drop-shadow-sm">{hero.description}</p>

                                                <div className="mt-5 pt-4 border-t border-white/20 flex justify-between items-center text-xs font-black text-white/90 uppercase tracking-widest">
                                                    {isSubmitting && character === hero.name ? (
                                                        <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Finalizing...</span>
                                                    ) : (
                                                        <><span>Click to Select</span><span className="text-lg leading-none animate-bounce-right">→</span></>
                                                    )}
                                                </div>
                                            </div>

                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}
