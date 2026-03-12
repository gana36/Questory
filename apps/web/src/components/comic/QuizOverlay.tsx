import { useState } from 'react';
import { type ActiveQuiz } from '@/hooks/useStoryBuilder';
import { cn } from '@/lib/utils';
import { Star } from 'lucide-react';

interface QuizOverlayProps {
    quiz: ActiveQuiz;
    onAnswer: (selectedIndex: number) => void;
}

export function QuizOverlay({ quiz, onAnswer }: QuizOverlayProps) {
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
    const [showExplanation, setShowExplanation] = useState(false);
    const [showScore, setShowScore] = useState(false);

    const handleSelect = (idx: number) => {
        if (selectedIndex !== null) return;
        setSelectedIndex(idx);

        const isCorrect = idx === quiz.correctIndex;
        if (isCorrect) {
            setShowScore(true);
            setTimeout(() => setShowScore(false), 1800);
        }

        setTimeout(() => setShowExplanation(true), 400);
    };

    const handleContinue = () => {
        if (selectedIndex !== null) {
            onAnswer(selectedIndex);
        }
    };

    const getButtonStyle = (idx: number) => {
        if (selectedIndex === null) {
            return 'bg-white border-2 border-black hover:bg-indigo-50 hover:border-indigo-500 cursor-pointer';
        }
        if (idx === quiz.correctIndex) {
            return 'bg-emerald-100 border-2 border-emerald-500 text-emerald-900';
        }
        if (idx === selectedIndex) {
            return 'bg-red-100 border-2 border-red-500 text-red-900';
        }
        return 'bg-white border-2 border-slate-300 text-slate-400 opacity-60';
    };

    const optionLabels = ['A', 'B', 'C', 'D'];

    return (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            {/* Score flash */}
            {showScore && (
                <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 z-60 pointer-events-none animate-bounce">
                    <div className="font-comic text-4xl text-yellow-400 drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
                        +{quiz.pointValue} PTS!
                    </div>
                </div>
            )}

            <div className="bg-white border-4 border-black rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="bg-yellow-400 border-b-4 border-black px-6 py-4 flex items-center gap-3">
                    <div className="flex gap-1">
                        {[0, 1, 2].map(i => (
                            <Star key={i} className="w-5 h-5 text-black fill-black" />
                        ))}
                    </div>
                    <h2 className="font-comic text-2xl text-black tracking-wide">QUIZ TIME!</h2>
                    <div className="ml-auto bg-black text-yellow-400 font-comic text-sm px-3 py-1 rounded-full">
                        {quiz.pointValue} PTS
                    </div>
                </div>

                <div className="px-6 py-5">
                    {/* Question */}
                    <p className="font-bold text-slate-900 text-lg leading-snug mb-5">
                        {quiz.question}
                    </p>

                    {/* Options */}
                    <div className="flex flex-col gap-2.5 mb-4">
                        {quiz.options.map((option, idx) => (
                            <button
                                key={idx}
                                onClick={() => handleSelect(idx)}
                                className={cn(
                                    'w-full rounded-xl p-3 text-left font-bold text-sm transition-all duration-200 flex items-center gap-3',
                                    getButtonStyle(idx)
                                )}
                            >
                                <span className={cn(
                                    'w-7 h-7 rounded-full flex items-center justify-center text-xs font-comic flex-shrink-0 border-2 border-current',
                                    selectedIndex === null ? 'border-black' : 'border-current'
                                )}>
                                    {optionLabels[idx]}
                                </span>
                                <span>{option}</span>
                                {selectedIndex !== null && idx === quiz.correctIndex && (
                                    <span className="ml-auto text-emerald-600">✓</span>
                                )}
                                {selectedIndex === idx && idx !== quiz.correctIndex && (
                                    <span className="ml-auto text-red-600">✗</span>
                                )}
                            </button>
                        ))}
                    </div>

                    {/* Explanation */}
                    <div className={cn(
                        'overflow-hidden transition-all duration-500',
                        showExplanation ? 'max-h-40 opacity-100 mb-4' : 'max-h-0 opacity-0'
                    )}>
                        <div className={cn(
                            "border-4 border-black rounded-xl p-3 flex flex-col gap-1 shadow-[4px_4px_0px_rgba(0,0,0,1)]",
                            selectedIndex === quiz.correctIndex ? "bg-emerald-100" : "bg-orange-100"
                        )}>
                            <p className="font-comic font-black text-black uppercase tracking-wide">
                                {selectedIndex === quiz.correctIndex ? 'Correct!' : 'Good try!'}
                            </p>
                            <p className="text-sm text-slate-800 font-semibold leading-snug">
                                {quiz.explanation}
                            </p>
                        </div>
                    </div>

                    {/* Continue button */}
                    {showExplanation && (
                        <button
                            onClick={handleContinue}
                            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-comic text-lg py-3 rounded-xl border-2 border-black transition-colors"
                        >
                            Continue Story! →
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
