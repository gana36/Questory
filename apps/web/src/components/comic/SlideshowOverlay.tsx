import { useEffect, useState, useRef } from 'react';
import { API_URL } from '@/config';
import { Loader2, X } from 'lucide-react';
import { getMediaUrl } from '@/lib/utils';

export function SlideshowOverlay({ panels, onClose }: { panels: any[], onClose: () => void }) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isLoadingAudio, setIsLoadingAudio] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // Fetch TTS audio when current index changes
    useEffect(() => {
        let isStale = false;
        
        // Cleanup previous audio blob
        if (audioUrl && audioUrl.startsWith('blob:')) {
            URL.revokeObjectURL(audioUrl);
        }
        
        setAudioUrl(null);
        setIsPlaying(false);
        setIsLoadingAudio(true);
        const currentPanel = panels[currentIndex];
        
        const fetchAudio = async () => {
            try {
                const response = await fetch(`${API_URL}/api/tts`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: currentPanel.narration })
                });
                if (!response.ok) throw new Error('TTS failed');
                const blob = await response.blob();
                if (!isStale) {
                    setAudioUrl(URL.createObjectURL(blob));
                }
            } catch (err) {
                console.error(err);
                if (!isStale) {
                    // Start next panel after a short delay if audio fails
                    setTimeout(handleAudioEnded, 5000);
                }
            } finally {
                if (!isStale) setIsLoadingAudio(false);
            }
        };
        fetchAudio();
        
        return () => { isStale = true; };
    }, [currentIndex, panels]);

    // Autoplay when audio URL is ready
    useEffect(() => {
        if (audioUrl && audioRef.current) {
            audioRef.current.play().then(() => setIsPlaying(true)).catch(console.error);
        }
    }, [audioUrl]);

    const handleAudioEnded = () => {
        if (currentIndex < panels.length - 1) {
            setCurrentIndex(prev => prev + 1);
        } else {
            onClose();
        }
    };

    const currentPanel = panels[currentIndex];
    const imageUrl = getMediaUrl(currentPanel.imageUrl);

    return (
        <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4">
            <button
                onClick={onClose}
                className="absolute top-6 right-6 z-50 bg-white/10 hover:bg-white/20 p-2 rounded-full text-white backdrop-blur transition-colors"
                title="Close Slideshow"
            >
                <X className="w-6 h-6" />
            </button>
            
            {audioUrl && (
                <audio 
                    ref={audioRef}
                    src={audioUrl}
                    onEnded={handleAudioEnded}
                    className="hidden"
                />
            )}
            
            <div className="relative w-full max-w-5xl" style={{ perspective: '1200px' }}>
                <div 
                    key={currentIndex} 
                    className="relative w-full aspect-video rounded-xl border-4 border-black overflow-hidden shadow-[0_0_80px_rgba(99,102,241,0.5)] bg-slate-900"
                    style={{
                        transformOrigin: 'center bottom',
                        animation: 'cinematicTilt 1.5s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards'
                    }}
                >
                    {imageUrl ? (
                        <div className="absolute inset-0 overflow-hidden">
                            <img 
                                src={imageUrl} 
                                alt={`Panel ${currentIndex + 1}`}
                                className="w-full h-full object-cover"
                                style={{
                                    animation: 'kenBurnsZoom 15s ease-in-out infinite alternate',
                                    transform: 'scale(1.05)'
                                }}
                            />
                        </div>
                    ) : (
                        <div className="absolute inset-0 bg-slate-800 flex items-center justify-center">
                            <Loader2 className="w-12 h-12 text-slate-500 animate-spin" />
                        </div>
                    )}

                    {isLoadingAudio && (
                        <div className="absolute top-4 right-4 z-20 flex items-center gap-2 bg-indigo-600 border-2 border-white/50 text-white font-comic text-xs px-3 py-1.5 rounded-full shadow-lg">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            GEMINI THINKING...
                        </div>
                    )}
                    
                    {isPlaying && (
                        <div className="absolute top-4 right-4 z-20 flex items-center gap-1.5 bg-red-600 border-2 border-white/30 text-white font-comic text-xs px-3 py-1 rounded-full shadow-lg">
                            <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                            NARRATING
                        </div>
                    )}

                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent pointer-events-none" />

                    {currentPanel.speechBubble && (
                        <div 
                            className="absolute top-16 right-6 max-w-[50%] z-20"
                            style={{ animation: 'fadeInUp 0.7s ease-out 0.5s both' }}
                        >
                            <div className="relative bg-white border-2 border-black rounded-2xl px-4 py-3 text-black font-bold text-sm leading-tight shadow-xl">
                                {currentPanel.speechBubble}
                                <div className="absolute -bottom-2 left-4 w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[10px] border-t-black" />
                                <div className="absolute -bottom-1.5 left-4 w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[10px] border-t-white" />
                            </div>
                        </div>
                    )}

                    <div 
                        className="absolute bottom-4 md:bottom-8 left-0 right-0 z-20 px-8"
                        style={{ animation: 'fadeInUp 1s ease-out 0.2s both' }}
                    >
                        <p className="font-comic text-white text-xl md:text-2xl leading-relaxed drop-shadow-[0_4px_4px_rgba(0,0,0,0.8)] max-w-4xl">
                            {currentPanel.narration}
                        </p>
                    </div>
                    
                    {/* Floating Panel Badge */}
                    <div className="absolute top-4 left-4 z-20 text-white/50 font-comic font-black text-6xl tracking-tighter opacity-30 select-none">
                        #{currentIndex + 1}
                    </div>
                </div>
                
                {/* Progress Indicators */}
                <div className="absolute -bottom-12 left-0 right-0 flex justify-center gap-2">
                    {panels.map((_, idx) => (
                        <div 
                            key={idx}
                            className={`h-2 rounded-full transition-all duration-300 ${
                                idx === currentIndex ? 'w-8 bg-indigo-400' : 
                                idx < currentIndex ? 'w-2 bg-indigo-400/50' : 'w-2 bg-white/20'
                            }`}
                        />
                    ))}
                </div>
            </div>
            
            <style>{`
                @keyframes kenBurnsZoom {
                    0% { transform: scale(1.05); }
                    100% { transform: scale(1.15); }
                }
                @keyframes cinematicTilt {
                    0% { transform: rotateX(8deg) scale(0.95); opacity: 0; filter: blur(4px); }
                    100% { transform: rotateX(0deg) scale(1); opacity: 1; filter: blur(0px); }
                }
                @keyframes fadeInUp {
                    0% { transform: translateY(16px); opacity: 0; }
                    100% { transform: translateY(0); opacity: 1; }
                }
            `}</style>
        </div>
    );
}
