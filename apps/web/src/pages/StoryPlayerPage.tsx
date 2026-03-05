import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { HelpCircle, Lightbulb, BookOpen, Search } from 'lucide-react';

// Mock Session Data
const MOCK_SCENE = {
    id: 'scene_1',
    progressPercent: 25,
    narration: "You step out of your time machine and find yourself in a dense, humid jungle. Huge ferns tower over you, and the air is filled with strange buzzing and roars in the distance. Suddenly, you spot an enormous footprint in the mud!",
    choices: [
        { id: 'c1', label: 'Follow the huge footprint deeper into the jungle.' },
        { id: 'c2', label: 'Climb a tall tree to get a better view.' },
        { id: 'c3', label: 'Hide behind a bush and wait to see what made it.' }
    ],
    hotspots: [
        {
            id: 'h1',
            x: 35, // percentage
            y: 60, // percentage
            title: 'Dinosaur Footprint',
            shortInfo: 'This footprint is over 3 feet long and has three massive toes, suggesting a large theropod.',
            expandedInfo: 'Theropods were a group of bipedal saurischian dinosaurs. Although they were largely carnivorous, a number of theropod families evolved to be herbivores or omnivores. T-Rex and Velociraptors are famous examples of theropods!'
        },
        {
            id: 'h2',
            x: 75,
            y: 30,
            title: 'Giant Ferns',
            shortInfo: 'These plants have been around for hundreds of millions of years, long before dinosaurs.',
            expandedInfo: 'Ferns are vascular plants that reproduce via spores and have neither seeds nor flowers. They first appear in the fossil record about 360 million years ago. During the Mesozoic era, they were a dominant part of the vegetation.'
        }
    ],
    notes: "We have arrived in the Mesozoic Era, often called the Age of Reptiles. Dinosaurs rule this world, and the plant life is completely different from what we see at home!"
};

export function StoryPlayerPage() {
    const { sessionId } = useParams();

    // Sheet state for expanded hotspot info
    const [selectedHotspot, setSelectedHotspot] = useState<typeof MOCK_SCENE.hotspots[0] | null>(null);

    return (
        <div className="flex-1 container mx-auto p-4 md:p-6 lg:max-w-7xl flex flex-col h-[calc(100vh-3.5rem)]">
            {/* Header */}
            <div className="flex justify-between items-center mb-4 shrink-0">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">The Dinosaur Mystery</h1>
                    <p className="text-sm text-slate-500">Session: {sessionId}</p>
                </div>
                <div className="hidden md:flex items-center gap-4 w-1/3 justify-end">
                    <span className="text-sm font-medium text-slate-600">Scene 1 / 4</span>
                    <Progress value={MOCK_SCENE.progressPercent} className="w-32 h-2" />
                </div>
            </div>

            {/* Main Layout Grid */}
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0">

                {/* Left Panel: Scene Graphics & Hotspots */}
                <div className="lg:col-span-7 xl:col-span-8 flex flex-col min-h-0 bg-slate-100 rounded-2xl border-2 border-slate-200 overflow-hidden relative shadow-inner">
                    {/* Placeholder for actual 3D/2D visual canvas */}
                    <div className="absolute inset-0 bg-gradient-to-b from-emerald-900/10 to-emerald-900/30">
                        {/* Using a placeholder visual pattern */}
                        <div className="w-full h-full flex items-center justify-center opacity-40">
                            <span className="text-9xl">🌴 🦕 🌿</span>
                        </div>
                    </div>

                    {/* Hotspots Overlay System */}
                    <div className="absolute inset-0 z-10 w-full h-full">
                        {MOCK_SCENE.hotspots.map((hotspot) => (
                            <Popover key={hotspot.id}>
                                <PopoverTrigger asChild>
                                    {/* Absolute positioning based on x/y coordinates */}
                                    <button
                                        className="absolute w-12 h-12 -ml-6 -mt-6 rounded-full bg-white/20 hover:bg-white/40 border-2 border-dashed border-white/60 hover:border-white shadow-[0_0_15px_rgba(255,255,255,0.5)] transition-all flex items-center justify-center group animate-pulse hover:animate-none group"
                                        style={{ left: `${hotspot.x}%`, top: `${hotspot.y}%` }}
                                        aria-label={`Inspect ${hotspot.title}`}
                                    >
                                        <Search className="w-5 h-5 text-white/80 group-hover:text-white group-hover:scale-110 transition-transform" />
                                    </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-80 p-4 shadow-xl border-slate-200" side="top" align="center">
                                    <div className="space-y-3">
                                        <h4 className="font-bold text-slate-900 flex items-center gap-2">
                                            <Search className="w-4 h-4 text-indigo-600" />
                                            {hotspot.title}
                                        </h4>
                                        <p className="text-sm text-slate-600">
                                            {hotspot.shortInfo}
                                        </p>
                                        <Button
                                            size="sm"
                                            className="w-full bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 shadow-none"
                                            onClick={() => setSelectedHotspot(hotspot)}
                                        >
                                            <BookOpen className="w-4 h-4 mr-2" />
                                            Read More
                                        </Button>
                                    </div>
                                </PopoverContent>
                            </Popover>
                        ))}
                    </div>

                    {/* Scene Tag */}
                    <div className="absolute top-4 left-4 bg-white/90 backdrop-blur px-3 py-1.5 rounded-lg shadow font-medium text-sm text-slate-700 border border-slate-200 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                        Living Scene
                    </div>
                </div>

                {/* Right Panel: Story & Choices */}
                <div className="lg:col-span-5 xl:col-span-4 flex flex-col min-h-0 bg-white rounded-2xl border border-slate-200 shadow-md">
                    {/* Scrollable Narration Area */}
                    <ScrollArea className="flex-1 p-6 border-b border-slate-100">
                        <div className="space-y-4">
                            <h2 className="text-lg font-bold text-slate-800 uppercase tracking-wider text-xs">
                                The Story Continues...
                            </h2>
                            <p className="text-slate-700 text-lg leading-relaxed">
                                {MOCK_SCENE.narration}
                            </p>
                        </div>
                    </ScrollArea>

                    {/* Choices and Actions Area */}
                    <div className="p-6 shrink-0 bg-slate-50/50 rounded-b-2xl">
                        <div className="space-y-3 mb-6">
                            <h3 className="text-sm font-semibold text-slate-500 uppercase">What do you do?</h3>
                            {MOCK_SCENE.choices.map((choice) => (
                                <Button
                                    key={choice.id}
                                    variant="outline"
                                    className="w-full justify-start h-auto py-3 px-4 text-left whitespace-normal border-slate-300 hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-900 transition-colors shadow-sm"
                                >
                                    <span className="font-medium">{choice.label}</span>
                                </Button>
                            ))}
                        </div>

                        <div className="flex gap-3">
                            <Button variant="secondary" className="flex-1 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-200 shadow-sm">
                                <Lightbulb className="w-4 h-4 mr-2" />
                                Ask for Hint
                            </Button>
                            <Button variant="secondary" className="flex-1 bg-sky-100 hover:bg-sky-200 text-sky-900 border border-sky-200 shadow-sm">
                                <HelpCircle className="w-4 h-4 mr-2" />
                                Explain Why
                            </Button>
                        </div>
                    </div>
                </div>

            </div>

            {/* Bottom Panel: Kid-Friendly Notes Summary */}
            <div className="mt-6 shrink-0">
                <Card className="border-emerald-200 bg-emerald-50/50 shadow-sm">
                    <CardContent className="p-4 flex gap-4 items-start md:items-center flex-col md:flex-row">
                        <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center shrink-0 border border-emerald-200">
                            <span className="text-2xl">📝</span>
                        </div>
                        <div className="flex-1">
                            <h4 className="font-bold text-emerald-900 text-sm mb-1 uppercase tracking-wider">Adventure Notes</h4>
                            <p className="text-emerald-800 font-medium">
                                {MOCK_SCENE.notes}
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Drawer for Expanded Hotspot Info */}
            <Sheet open={!!selectedHotspot} onOpenChange={(open) => !open && setSelectedHotspot(null)}>
                <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
                    {selectedHotspot && (
                        <>
                            <SheetHeader className="mb-6">
                                <div className="w-12 h-12 bg-indigo-100 text-indigo-600 flex items-center justify-center rounded-xl mb-4">
                                    <Search className="w-6 h-6" />
                                </div>
                                <SheetTitle className="text-2xl font-bold text-slate-900">
                                    {selectedHotspot.title}
                                </SheetTitle>
                                <SheetDescription className="text-lg">
                                    Learn more about what you discovered!
                                </SheetDescription>
                            </SheetHeader>

                            <div className="prose prose-slate">
                                <p className="text-slate-600 leading-relaxed font-medium mb-4">
                                    {selectedHotspot.shortInfo}
                                </p>
                                <div className="h-px bg-slate-200 w-full my-6"></div>
                                <h3 className="text-lg font-bold text-slate-800 mb-3">Deeper Dive</h3>
                                <p className="text-slate-700 leading-relaxed">
                                    {selectedHotspot.expandedInfo}
                                </p>

                                {/* Mock image placeholder for learn more drawer */}
                                <div className="mt-8 rounded-xl bg-slate-100 flex items-center justify-center h-48 border-2 border-dashed border-slate-300">
                                    <span className="text-slate-400 font-medium">Educational Image</span>
                                </div>
                            </div>
                        </>
                    )}
                </SheetContent>
            </Sheet>

        </div>
    );
}
