import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { Float, Sparkles } from '@react-three/drei';
import * as THREE from 'three';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Loader2, FileUp, Link as LinkIcon, Shield, Rocket, Search, User, Play, Send } from 'lucide-react';
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
    const [character, setCharacter] = useState('Brave Knight');
    const [artStyle, setArtStyle] = useState('Vibrant 3D (Default)');
    const [voice, setVoice] = useState('Friendly Guide (Default)');
    const [ageRange, setAgeRange] = useState([2]);
    const [quizFreq, setQuizFreq] = useState('medium');

    const [isSubmitting, setIsSubmitting] = useState(false);

    // AI hook integration
    const { status, gamePhase, setGamePhase, connect, disconnect, isThinking, sendText, getVolume } = useGeminiLive({
        onFunctionCall: (name, args) => {
            if (name === 'setTopic' && args.topic) setTopic(args.topic);
            if (name === 'setStyle') {
                if (args.character) setCharacter(args.character);
                if (args.artStyle) setArtStyle(args.artStyle);
            }
            if (name === 'setSettings') {
                if (args.ageRange !== undefined) setAgeRange([args.ageRange]);
                if (args.quizFrequency) setQuizFreq(args.quizFrequency);
            }
        },
        onHeroesProposed: (concept, proposedHeroes) => {
            setStoryConcept(concept);
            setHeroes(proposedHeroes);
            setGamePhase('heroes');
        },
        onHeroImageGenerated: (heroId, imageUrl) => {
            setHeroes(prev => {
                const existing = prev.find(h => h.id === heroId);
                if (existing) {
                    return prev.map(h => h.id === heroId ? { ...h, imageUrl } : h);
                } else {
                    // It's a custom hero that wasn't in the initial list
                    return [...prev, { id: heroId, name: 'Custom Hero', description: 'Your unique creation!', imageUrl }];
                }
            });
        },
        onCustomHeroGenerating: (heroId, name) => {
            // Add a placeholder for the custom hero while it generates
            setHeroes(prev => [...prev, { id: heroId, name, description: 'Generating your custom hero...' }]);
        }
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

    // Auto-connect on mount if we want to kickstart the interaction, or let user click mic.
    const toggleVoice = () => {
        if (isConnected) {
            disconnect();
        } else {
            connect("You are the Questory Game Master. You are helping a child set up their interactive learning adventure. Start by enthusiastically asking what they want to learn about today. Wait for their answer, then call setTopic with their answer. Keep responses under 2 sentences. Next, ask what character and art style they want, then call setStyle with their choices. Finally, ask how difficult the puzzles should be, then call setSettings.");
        }
    };

    const handleTopicSubmit = (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!topic.trim()) return;
        if (isConnected) {
            sendText(`I want the topic to be: ${topic}. What's next?`);
        } else {
            setGamePhase('style');
        }
    };

    const handleCharacterSelect = (char: string) => {
        setCharacter(char);
        if (isConnected) {
            sendText(`I pick the ${char} character!`);
        }
    };

    const handleStyleSubmit = () => {
        if (isConnected) {
            sendText(`I want a ${artStyle} look with the ${voice} voice. Please proceed.`);
        } else {
            setGamePhase('settings');
        }
    };

    const handleSettingsSubmit = async () => {
        if (isConnected) {
            sendText(`I'm ready to play! Generate my story.`);
        }
        setIsSubmitting(true);
        try {
            const sessionId = Math.random().toString(36).substring(7);
            navigate(`/play/${sessionId}`);
        } catch (error) {
            console.error(error);
            setIsSubmitting(false);
        }
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
                                onChange={(e) => setTopic(e.target.value)}
                                placeholder="e.g. Exploring the deep ocean..."
                                className="w-full h-20 text-2xl px-8 rounded-full bg-white/10 backdrop-blur-xl border-2 border-white/20 text-white placeholder:text-white/50 focus-visible:ring-4 focus-visible:ring-indigo-500 focus-visible:border-white transition-all shadow-[0_8px_32px_rgba(0,0,0,0.3)] group-hover:bg-white/15"
                            />
                            <Button
                                type="submit"
                                size="icon"
                                className="absolute right-3 top-3 h-14 w-14 rounded-full bg-white text-indigo-900 hover:bg-indigo-50 hover:scale-105 transition-all shadow-lg"
                                disabled={!topic.trim()}
                            >
                                <Send className="w-6 h-6 ml-1" />
                            </Button>
                        </form>

                        <div className="flex gap-4 w-full max-w-lg justify-center mt-6">
                            <Button variant="outline" className="flex-1 h-14 bg-white/10 backdrop-blur-xl border-2 border-white/20 text-white hover:bg-white/20 hover:text-white rounded-full text-lg font-bold shadow-[0_8px_32px_rgba(0,0,0,0.3)] hover:shadow-[0_8px_32px_rgba(255,255,255,0.2)] transition-all duration-300 transform hover:-translate-y-1">
                                <FileUp className="w-5 h-5 mr-3" /> Upload Book
                            </Button>
                            <Button variant="outline" className="flex-1 h-14 bg-white/10 backdrop-blur-xl border-2 border-white/20 text-white hover:bg-white/20 hover:text-white rounded-full text-lg font-bold shadow-[0_8px_32px_rgba(0,0,0,0.3)] hover:shadow-[0_8px_32px_rgba(255,255,255,0.2)] transition-all duration-300 transform hover:-translate-y-1">
                                <LinkIcon className="w-5 h-5 mr-3" /> Paste Video
                            </Button>
                        </div>

                        {!isConnected && (
                            <div className="pt-8">
                                <Button onClick={() => setGamePhase('style')} variant="ghost" className="text-white/40 hover:text-white/80 hover:bg-white/5 rounded-full px-6 font-medium tracking-wider text-sm uppercase">Skip to next (debug) →</Button>
                            </div>
                        )}
                    </div>
                )}

                {gamePhase === 'heroes' && (
                    <div className="animate-in slide-in-from-right-10 fade-in duration-500 w-full max-w-5xl mx-auto flex flex-col space-y-8">
                        <div className="text-center space-y-4">
                            <h2 className="text-4xl md:text-5xl font-black text-white tracking-tight drop-shadow-lg">Choose Your Hero</h2>
                            {storyConcept && (
                                <p className="text-xl text-indigo-100 font-medium max-w-3xl mx-auto leading-relaxed bg-slate-900/40 p-4 rounded-2xl backdrop-blur-md border border-white/10">
                                    {storyConcept}
                                </p>
                            )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {heroes.map((hero) => (
                                <Card
                                    key={hero.id}
                                    onClick={() => handleCharacterSelect(hero.name)}
                                    className="group cursor-pointer bg-slate-900/60 backdrop-blur-xl border-white/10 hover:border-indigo-400 overflow-hidden transition-all duration-300 hover:scale-[1.03] hover:shadow-[0_0_30px_rgba(99,102,241,0.3)] min-h-[400px] flex flex-col"
                                >
                                    <div className="relative h-64 w-full bg-slate-950 flex items-center justify-center overflow-hidden">
                                        {hero.imageUrl ? (
                                            <img
                                                src={hero.imageUrl}
                                                alt={hero.name}
                                                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                                            />
                                        ) : (
                                            <div className="flex flex-col items-center justify-center space-y-4 text-indigo-300/60 p-6 text-center">
                                                <Loader2 className="w-10 h-10 animate-spin" />
                                                <p className="text-sm font-medium animate-pulse pb-1 bg-gradient-to-r from-indigo-300 to-purple-300 bg-clip-text text-transparent">Conjuring visual...</p>
                                            </div>
                                        )}
                                        <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/20 to-transparent pointer-events-none" />
                                    </div>
                                    <div className="p-6 relative z-10 flex-1 flex flex-col">
                                        <h3 className="text-2xl font-bold text-white mb-2 group-hover:text-indigo-300 transition-colors">{hero.name}</h3>
                                        <p className="text-slate-300 leading-relaxed text-sm flex-1">{hero.description}</p>
                                        <div className="mt-6 pt-4 border-t border-white/10 flex justify-between items-center text-xs font-bold text-indigo-400 uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity transform translate-y-2 group-hover:translate-y-0">
                                            <span>Select Hero</span>
                                            <span>→</span>
                                        </div>
                                    </div>
                                </Card>
                            ))}
                        </div>
                    </div>
                )}

                {gamePhase === 'style' && (
                    <div className="animate-in slide-in-from-bottom-12 fade-in duration-500 w-full flex flex-col items-center space-y-12">
                        <div className="text-center space-y-2">
                            <h1 className="text-4xl md:text-5xl font-black text-white drop-shadow-xl tracking-tight">Pick Your Hero</h1>
                        </div>

                        {/* Immersive Character Selection Cards */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 w-full">
                            {[
                                { name: 'Brave Knight', icon: Shield, color: 'from-blue-500 to-indigo-600' },
                                { name: 'Curious Astronaut', icon: Rocket, color: 'from-orange-500 to-red-600' },
                                { name: 'Clever Detective', icon: Search, color: 'from-emerald-500 to-teal-600' },
                                { name: 'Custom Hero', icon: User, color: 'from-purple-500 to-fuchsia-600' }
                            ].map((char) => {
                                const Icon = char.icon;
                                const isSelected = character === char.name;
                                return (
                                    <div
                                        key={char.name}
                                        onClick={() => handleCharacterSelect(char.name)}
                                        className={`relative group cursor-pointer transition-all duration-300 transform ${isSelected ? 'scale-110 z-10' : 'hover:scale-105 hover:-translate-y-2'}`}
                                    >
                                        <div className={`absolute inset-0 bg-gradient-to-br ${char.color} rounded-3xl blur-xl opacity-0 transition-opacity duration-300 ${isSelected ? 'opacity-60' : 'group-hover:opacity-40'}`} />
                                        <Card className={`relative h-56 rounded-3xl overflow-hidden border-2 flex flex-col items-center justify-center gap-4 transition-all duration-300 ${isSelected
                                            ? 'bg-gradient-to-br from-slate-900 to-slate-800 border-indigo-500 shadow-[0_0_30px_rgba(99,102,241,0.5)]'
                                            : 'bg-slate-900/60 backdrop-blur-xl border-white/10 hover:border-white/30'
                                            }`}>
                                            <div className={`p-4 rounded-full ${isSelected ? 'bg-indigo-500/20' : 'bg-white/5 group-hover:bg-white/10'}`}>
                                                <Icon className={`w-12 h-12 ${isSelected ? 'text-indigo-400' : 'text-slate-300'}`} />
                                            </div>
                                            <span className={`font-bold text-center px-4 ${isSelected ? 'text-white text-lg' : 'text-slate-300'}`}>{char.name}</span>
                                        </Card>

                                        {isSelected && (
                                            <div className="absolute -top-3 -right-3 bg-indigo-500 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold border-2 border-slate-900 shadow-lg animate-bounce">
                                                ✓
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>

                        <div className="w-full max-w-2xl bg-slate-900/60 backdrop-blur-xl border border-white/10 p-6 rounded-3xl grid grid-cols-1 md:grid-cols-2 gap-6 shadow-2xl">
                            <div className="space-y-2">
                                <label className="text-white/70 font-bold uppercase text-xs tracking-wider pl-1">Visual Sandbox</label>
                                <select
                                    value={artStyle}
                                    onChange={(e) => setArtStyle(e.target.value)}
                                    className="w-full h-12 bg-white/10 border-white/20 text-white rounded-xl px-4 focus:ring-2 focus:ring-indigo-500 outline-none font-semibold cursor-pointer appearance-none"
                                >
                                    <option className="bg-slate-800 text-white">Vibrant 3D (Default)</option>
                                    <option className="bg-slate-800 text-white">Anime / Manga</option>
                                    <option className="bg-slate-800 text-white">Watercolor Book</option>
                                    <option className="bg-slate-800 text-white">Realistic</option>
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-white/70 font-bold uppercase text-xs tracking-wider pl-1">Storyteller Voice</label>
                                <select
                                    value={voice}
                                    onChange={(e) => setVoice(e.target.value)}
                                    className="w-full h-12 bg-white/10 border-white/20 text-white rounded-xl px-4 focus:ring-2 focus:ring-indigo-500 outline-none font-semibold cursor-pointer appearance-none"
                                >
                                    <option className="bg-slate-800 text-white">Friendly Guide (Default)</option>
                                    <option className="bg-slate-800 text-white">Wise Owl</option>
                                    <option className="bg-slate-800 text-white">Excited Explorer</option>
                                </select>
                            </div>
                        </div>

                        <Button onClick={handleStyleSubmit} className="h-14 px-12 bg-white text-slate-900 hover:bg-indigo-50 rounded-full font-bold text-lg shadow-[0_0_40px_-5px_rgba(255,255,255,0.3)] hover:scale-105 transition-all">
                            Confirm Style
                        </Button>
                    </div>
                )}

                {gamePhase === 'settings' && (
                    <div className="animate-in slide-in-from-right-12 fade-in duration-500 w-full flex flex-col items-center space-y-10">
                        <div className="text-center space-y-2">
                            <h1 className="text-4xl md:text-5xl font-black text-white drop-shadow-xl tracking-tight">Tune the Challenge</h1>
                        </div>

                        <div className="w-full max-w-3xl bg-slate-900/60 backdrop-blur-xl border border-white/10 p-8 md:p-12 rounded-[2.5rem] space-y-12 shadow-2xl">

                            {/* Tactile Slider */}
                            <div className="space-y-8">
                                <div className="flex justify-between items-end">
                                    <h3 className="text-2xl font-bold text-white">Player Age Level</h3>
                                    <span className="text-lg font-black text-indigo-400 bg-indigo-900/50 px-4 py-1.5 rounded-full border border-indigo-500/30">
                                        {ageRange[0] === 0 ? 'Pre-K' : ageRange[0] === 1 ? '5 - 7 years' : ageRange[0] === 2 ? '8 - 10 years' : ageRange[0] === 3 ? '11 - 13 years' : '14+ years'}
                                    </span>
                                </div>

                                <Slider
                                    value={ageRange}
                                    onValueChange={setAgeRange}
                                    max={4} step={1}
                                    className="cursor-grab active:cursor-grabbing w-full scale-y-150"
                                />

                                <div className="flex justify-between text-sm font-bold text-white/40 px-2 mt-4">
                                    <span className={ageRange[0] === 0 ? 'text-white drop-shadow-md' : ''}>Pre-K</span>
                                    <span className={ageRange[0] === 1 ? 'text-white drop-shadow-md' : ''}>5-7</span>
                                    <span className={ageRange[0] === 2 ? 'text-white drop-shadow-md' : ''}>8-10</span>
                                    <span className={ageRange[0] === 3 ? 'text-white drop-shadow-md' : ''}>11-13</span>
                                    <span className={ageRange[0] === 4 ? 'text-white drop-shadow-md' : ''}>14+</span>
                                </div>
                            </div>

                            <div className="h-px w-full bg-gradient-to-r from-transparent via-white/20 to-transparent" />

                            {/* Tactile Toggles */}
                            <div className="space-y-6">
                                <h3 className="text-2xl font-bold text-white">Puzzle Frequency</h3>
                                <div className="grid grid-cols-3 gap-4 bg-white/5 p-2 rounded-3xl">
                                    {['Low', 'Medium', 'High'].map((level) => {
                                        const isSelected = quizFreq === level.toLowerCase();
                                        return (
                                            <button
                                                key={level}
                                                onClick={() => {
                                                    setQuizFreq(level.toLowerCase());
                                                    if (isConnected) sendText(`Set puzzle frequency to ${level}.`);
                                                }}
                                                className={`h-16 rounded-2xl font-bold text-lg transition-all duration-300 ${isSelected
                                                    ? 'bg-indigo-500 text-white shadow-lg scale-100 border border-indigo-400'
                                                    : 'bg-transparent text-white/50 hover:bg-white/5 hover:text-white/80'
                                                    }`}
                                            >
                                                {level}
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>
                        </div>

                        <Button
                            onClick={handleSettingsSubmit}
                            disabled={isSubmitting}
                            className="h-16 px-16 bg-gradient-to-r from-pink-500 to-indigo-600 hover:from-pink-400 hover:to-indigo-500 text-white rounded-full font-black text-xl shadow-[0_0_50px_-10px_rgba(236,72,153,0.5)] hover:scale-110 transition-all duration-300 border-2 border-white/20"
                        >
                            {isSubmitting ? <Loader2 className="w-8 h-8 animate-spin" /> : <><Play className="w-6 h-6 mr-3 fill-current" /> START QUEST</>}
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
