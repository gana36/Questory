import { type ComicPanelState } from '@/hooks/useStoryBuilder';
import { cn } from '@/lib/utils';

interface ComicPanelProps {
    panel: ComicPanelState;
    isLatest: boolean;
    isSplash?: boolean; // first panel gets wider layout
}

export function ComicPanel({ panel, isLatest, isSplash = false }: ComicPanelProps) {
    const isLoading = panel.imageStatus === 'loading';

    return (
        <div
            className={cn(
                'relative overflow-hidden border-4 border-black rounded-sm flex flex-col bg-slate-100',
                isSplash ? 'col-span-2 aspect-video' : 'aspect-square',
                isLatest && 'border-yellow-400 shadow-[0_0_24px_rgba(234,179,8,0.7)]'
            )}
        >
            {/* Panel number badge */}
            <div className="absolute top-2 left-2 z-20 bg-black text-white font-bold text-xs w-6 h-6 rounded-full flex items-center justify-center">
                {panel.panelIndex + 1}
            </div>

            {/* "NEW" badge for the latest panel */}
            {isLatest && (
                <div className="absolute top-2 right-2 z-20 bg-yellow-400 border-2 border-black text-black font-comic text-xs px-2 py-0.5 rounded-full font-bold uppercase tracking-wide">
                    NOW
                </div>
            )}

            {/* Image area */}
            <div className="flex-1 relative overflow-hidden">
                {isLoading ? (
                    /* Shimmer loading state */
                    <div className="absolute inset-0 bg-gradient-to-r from-slate-200 via-slate-300 to-slate-200 animate-pulse flex flex-col items-center justify-center gap-2">
                        <div className="font-comic text-2xl text-slate-400 tracking-wider">GENERATING...</div>
                        <div className="flex gap-1">
                            <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:0ms]" />
                            <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:150ms]" />
                            <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:300ms]" />
                        </div>
                    </div>
                ) : panel.imageStatus === 'error' || !panel.imageUrl ? (
                    /* Error state */
                    <div className="absolute inset-0 bg-slate-200 flex items-center justify-center">
                        <span className="font-comic text-slate-400 text-xl">?</span>
                    </div>
                ) : (
                    /* Panel image */
                    <img
                        src={panel.imageUrl}
                        alt={`Panel ${panel.panelIndex + 1}`}
                        className="w-full h-full object-cover"
                    />
                )}

                {/* Speech bubble — shown when image is ready */}
                {panel.speechBubble && !isLoading && (
                    <div className="absolute top-2 right-2 max-w-[60%] z-10">
                        <div className="relative bg-white border-2 border-black rounded-2xl px-3 py-1.5 text-black font-bold text-xs leading-tight shadow-md">
                            {panel.speechBubble}
                            {/* Tail pointing down-left */}
                            <div className="absolute -bottom-2 left-4 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-black" />
                            <div className="absolute -bottom-1.5 left-4 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-white" />
                        </div>
                    </div>
                )}
            </div>

            {/* Caption strip */}
            <div className="border-t-4 border-black bg-amber-50 px-2 py-1.5">
                {panel.learningObjective && (
                    <div className="flex items-center gap-1 mb-1">
                        <span className="text-[10px] bg-indigo-100 border border-indigo-300 text-indigo-800 font-bold rounded-full px-2 py-0.5 leading-tight">
                            📚 {panel.learningObjective}
                        </span>
                    </div>
                )}
                <p className="font-comic text-black text-xs leading-snug line-clamp-3">
                    {panel.narration}
                </p>
            </div>
        </div>
    );
}
