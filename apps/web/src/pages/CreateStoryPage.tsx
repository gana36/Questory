import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
// import { API_BASE_URL } from '@questory/shared';

// For now we'll just suppress this eslint rule for the unused mock import 
// until we actually hook it up to the API.


export function CreateStoryPage() {
    const navigate = useNavigate();
    const [step, setStep] = useState(1);
    const [topic, setTopic] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const nextStep = () => setStep((s) => Math.min(s + 1, 3));
    const prevStep = () => setStep((s) => Math.max(s - 1, 1));

    const handleSubmit = async () => {
        setIsSubmitting(true);
        try {
            // Create session via actual API
            const sessionId = Math.random().toString(36).substring(7); // Temporary until API is linked properly
            // We will uncomment this once the backend handles POST /sessions:
            /*
            const res = await fetch(`${API_BASE_URL}/sessions`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ topic })
            });
            if (!res.ok) throw new Error('Failed to create session');
            const data = await res.json();
            */

            navigate(`/play/${sessionId}`);
        } catch (error) {
            console.error(error);
            setIsSubmitting(false);
        }
    };

    return (
        <div className="flex-1 flex flex-col items-center justify-center p-4 py-12 md:p-6 bg-slate-50">
            <div className="w-full max-w-2xl">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-center text-slate-900 mb-2">Create New Story</h1>
                    <p className="text-center text-slate-500">Configure your interactive learning adventure</p>

                    {/* Enhanced Progress Bar */}
                    <div className="flex items-center justify-between mt-8 relative px-4">
                        {/* Connecting line */}
                        <div className="absolute left-8 right-8 top-1/2 h-1 bg-slate-200 -translate-y-1/2 z-0 rounded-full"></div>

                        {/* Active connecting line */}
                        <div
                            className="absolute left-8 top-1/2 h-1 bg-indigo-600 -translate-y-1/2 z-0 rounded-full transition-all duration-300"
                            style={{ width: `calc(${(step - 1) * 50}% - 2rem)` }}
                        ></div>

                        {[1, 2, 3].map((num) => (
                            <div key={num} className="relative z-10 flex flex-col items-center gap-2">
                                <div
                                    className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm transition-colors duration-300 shadow-sm ${step >= num
                                        ? 'bg-indigo-600 text-white ring-4 ring-indigo-100'
                                        : 'bg-white text-slate-400 border-2 border-slate-200'
                                        }`}
                                >
                                    {num}
                                </div>
                                <span className={`text-xs font-medium ${step >= num ? 'text-indigo-600' : 'text-slate-400'}`}>
                                    {num === 1 ? 'Topic' : num === 2 ? 'Style' : 'Settings'}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                <Card className="w-full shadow-lg border-slate-200 overflow-hidden">
                    {step === 1 && (
                        <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                            <CardHeader className="bg-white pb-4 border-b">
                                <CardTitle className="text-2xl">Step 1: Pick a Learning Topic</CardTitle>
                                <CardDescription className="text-base text-slate-500">What should this storyworld be about?</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-8 pt-8 px-6 md:px-8">

                                {/* Free Text Topic Input */}
                                <div className="space-y-3">
                                    <Label htmlFor="topic" className="text-base font-semibold text-slate-700">Topic Idea</Label>
                                    <Input
                                        id="topic"
                                        placeholder="e.g., Space Exploration, The Water Cycle, Ancient Rome..."
                                        value={topic}
                                        onChange={(e) => setTopic(e.target.value)}
                                        className="text-lg py-6 focus-visible:ring-indigo-500 border-slate-300"
                                    />
                                    <p className="text-sm text-slate-500">Describe the subject matter in a few words.</p>
                                </div>

                                <div className="relative py-4">
                                    <div className="absolute inset-0 flex items-center">
                                        <span className="w-full border-t border-slate-200" />
                                    </div>
                                    <div className="relative flex justify-center text-xs uppercase">
                                        <span className="bg-white px-3 text-slate-400 font-medium">Or Import Materials</span>
                                    </div>
                                </div>

                                {/* Optional Material Stubs */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <Card className="border-dashed border-2 bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer group">
                                        <CardContent className="flex flex-col items-center justify-center py-6 text-center space-y-3">
                                            <div className="h-12 w-12 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 group-hover:text-indigo-600 group-hover:bg-indigo-100 transition-colors">
                                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                                </svg>
                                            </div>
                                            <div>
                                                <p className="font-medium text-slate-700">Upload PDF</p>
                                                <p className="text-xs text-slate-500">(Coming soon)</p>
                                            </div>
                                        </CardContent>
                                    </Card>

                                    <Card className="border-dashed border-2 bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer group">
                                        <CardContent className="flex flex-col items-center justify-center py-6 text-center space-y-3">
                                            <div className="h-12 w-12 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 group-hover:text-red-600 group-hover:bg-red-100 transition-colors">
                                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                                </svg>
                                            </div>
                                            <div>
                                                <p className="font-medium text-slate-700">Paste YouTube URL</p>
                                                <p className="text-xs text-slate-500">(Coming soon)</p>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </div>

                            </CardContent>
                            <CardFooter className="bg-slate-50 mt-4 px-6 py-4 flex justify-end border-t border-slate-100">
                                <Button onClick={nextStep} disabled={!topic.trim()} className="bg-indigo-600 hover:bg-indigo-700 px-8">
                                    Next Step
                                </Button>
                            </CardFooter>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                            <CardHeader className="bg-white pb-4 border-b">
                                <CardTitle className="text-2xl">Step 2: Choose Story Style</CardTitle>
                                <CardDescription className="text-base text-slate-500">Pick characters and visuals</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-8 pt-8 px-6 md:px-8">

                                {/* Character Selection */}
                                <div className="space-y-4">
                                    <Label className="text-base font-semibold text-slate-700">Main Character</Label>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        {['Brave Knight', 'Curious Astronaut', 'Clever Detective', 'Custom...'].map((char, i) => (
                                            <div
                                                key={char}
                                                className={`rounded-xl border-2 p-4 text-center cursor-pointer transition-all ${i === 0 ? 'border-indigo-600 bg-indigo-50 ring-2 ring-indigo-100' : 'border-slate-200 hover:border-indigo-300'
                                                    }`}
                                            >
                                                <div className="text-3xl mb-2">
                                                    {['🛡️', '🚀', '🔍', '✨'][i]}
                                                </div>
                                                <div className={`text-sm font-medium ${i === 0 ? 'text-indigo-900' : 'text-slate-600'}`}>
                                                    {char}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    {/* Voice Selection Stub */}
                                    <div className="space-y-3">
                                        <Label htmlFor="voice" className="text-base font-semibold text-slate-700">Narrator Voice</Label>
                                        <select
                                            id="voice"
                                            className="flex h-12 w-full items-center justify-between rounded-md border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            <option>Friendly Guide (Default)</option>
                                            <option>Wise Owl</option>
                                            <option>Excited Explorer</option>
                                        </select>
                                    </div>

                                    {/* Art Style Selection */}
                                    <div className="space-y-3">
                                        <Label htmlFor="art" className="text-base font-semibold text-slate-700">Art Style</Label>
                                        <select
                                            id="art"
                                            className="flex h-12 w-full items-center justify-between rounded-md border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            <option>Vibrant 3D (Default)</option>
                                            <option>Anime / Manga</option>
                                            <option>Watercolor Book</option>
                                            <option>Realistic</option>
                                        </select>
                                    </div>
                                </div>

                            </CardContent>
                            <CardFooter className="bg-slate-50 mt-4 px-6 py-4 flex justify-between border-t border-slate-100">
                                <Button variant="outline" onClick={prevStep} className="px-6 border-slate-300">Back</Button>
                                <Button onClick={nextStep} className="bg-indigo-600 hover:bg-indigo-700 px-8">Next Step</Button>
                            </CardFooter>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                            <CardHeader className="bg-white pb-4 border-b">
                                <CardTitle className="text-2xl">Step 3: Difficulty & Goals</CardTitle>
                                <CardDescription className="text-base text-slate-500">Customize the learning experience</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-8 pt-8 px-6 md:px-8">

                                {/* Age Range Slider */}
                                <div className="space-y-6">
                                    <div className="flex justify-between items-center">
                                        <Label className="text-base font-semibold text-slate-700">Reading / Age Level</Label>
                                        <span className="text-indigo-600 font-bold px-3 py-1 bg-indigo-50 rounded-full text-sm border border-indigo-100">8 - 10 years</span>
                                    </div>
                                    <div className="px-2">
                                        <Slider defaultValue={[2]} max={4} step={1} className="w-full" />
                                    </div>
                                    <div className="flex justify-between text-xs text-slate-400 px-2 font-medium">
                                        <span>Pre-K</span>
                                        <span>Early (5-7)</span>
                                        <span className="text-indigo-600">Mid (8-10)</span>
                                        <span>Late (11-13)</span>
                                        <span>Teen (14+)</span>
                                    </div>
                                </div>

                                <div className="border-t border-slate-100 pt-8" />

                                {/* Quiz Frequency Radio Group */}
                                <div className="space-y-4">
                                    <Label className="text-base font-semibold text-slate-700">Quiz Frequency</Label>
                                    <p className="text-sm text-slate-500 mb-4">How frequently should educational checkpoints appear?</p>

                                    <RadioGroup defaultValue="medium" className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div>
                                            <RadioGroupItem value="low" id="low" className="peer sr-only" />
                                            <Label
                                                htmlFor="low"
                                                className="flex flex-col items-center justify-between rounded-xl border-2 border-slate-200 bg-white p-4 hover:bg-slate-50 hover:border-slate-300 peer-data-[state=checked]:border-indigo-600 peer-data-[state=checked]:ring-2 peer-data-[state=checked]:ring-indigo-100 cursor-pointer"
                                            >
                                                <span className="text-2xl mb-2">🐢</span>
                                                <span className="font-semibold text-slate-700">Low</span>
                                                <span className="text-xs text-slate-500 mt-1">Focus on story</span>
                                            </Label>
                                        </div>
                                        <div>
                                            <RadioGroupItem value="medium" id="medium" className="peer sr-only" />
                                            <Label
                                                htmlFor="medium"
                                                className="flex flex-col items-center justify-between rounded-xl border-2 border-slate-200 bg-white p-4 hover:bg-slate-50 hover:border-slate-300 peer-data-[state=checked]:border-indigo-600 peer-data-[state=checked]:ring-2 peer-data-[state=checked]:ring-indigo-100 cursor-pointer"
                                            >
                                                <span className="text-2xl mb-2">⚖️</span>
                                                <span className="font-semibold text-slate-700">Medium</span>
                                                <span className="text-xs text-slate-500 mt-1">Balanced</span>
                                            </Label>
                                        </div>
                                        <div>
                                            <RadioGroupItem value="high" id="high" className="peer sr-only" />
                                            <Label
                                                htmlFor="high"
                                                className="flex flex-col items-center justify-between rounded-xl border-2 border-slate-200 bg-white p-4 hover:bg-slate-50 hover:border-slate-300 peer-data-[state=checked]:border-indigo-600 peer-data-[state=checked]:ring-2 peer-data-[state=checked]:ring-indigo-100 cursor-pointer"
                                            >
                                                <span className="text-2xl mb-2">🧠</span>
                                                <span className="font-semibold text-slate-700">High</span>
                                                <span className="text-xs text-slate-500 mt-1">Test knowledge</span>
                                            </Label>
                                        </div>
                                    </RadioGroup>
                                </div>

                            </CardContent>
                            <CardFooter className="bg-slate-50 mt-4 px-6 py-4 flex justify-between border-t border-slate-100">
                                <Button variant="outline" onClick={prevStep} className="px-6 border-slate-300">Back</Button>
                                <Button
                                    onClick={handleSubmit}
                                    className="bg-emerald-600 hover:bg-emerald-700 px-8 flex items-center gap-2 transition-all"
                                    disabled={isSubmitting}
                                >
                                    {isSubmitting ? (
                                        <>
                                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            Creating...
                                        </>
                                    ) : (
                                        <>
                                            <span>✨</span> Generate Story
                                        </>
                                    )}
                                </Button>
                            </CardFooter>
                        </div>
                    )}
                </Card>
            </div>
        </div>
    );
}
