import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Sparkles, Download, ImageIcon } from 'lucide-react';

export function ImageTestPage() {
    const [prompt, setPrompt] = useState('');
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleGenerate = async () => {
        if (!prompt.trim()) return;
        setIsLoading(true);
        setError(null);
        setImageUrl(null);

        try {
            const response = await fetch('http://localhost:8000/api/generate-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: prompt.trim() }),
            });

            if (!response.ok) {
                throw new Error(`Server error: ${response.status}`);
            }

            const data = await response.json();
            if (data.image_url && data.image_url.startsWith('data:')) {
                setImageUrl(data.image_url);
            } else {
                setError('Image generation failed. The model returned a fallback.');
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Something went wrong.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleDownload = () => {
        if (!imageUrl) return;
        const link = document.createElement('a');
        link.href = imageUrl;
        link.download = `nano_banana_${Date.now()}.png`;
        link.click();
    };

    return (
        <div className="relative flex-1 flex flex-col items-center min-h-[calc(100vh-3.5rem)] overflow-y-auto py-12 px-4">
            {/* Background gradient */}
            <div className="fixed inset-0 bg-gradient-to-br from-violet-950 via-slate-900 to-indigo-950 -z-10" />
            <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(120,80,255,0.15),transparent_60%)] -z-10" />

            <div className="w-full max-w-2xl space-y-8">
                {/* Header */}
                <div className="text-center space-y-3">
                    <div className="inline-flex items-center gap-2 bg-violet-500/10 border border-violet-500/20 text-violet-300 text-xs font-bold uppercase tracking-widest px-4 py-1.5 rounded-full">
                        <Sparkles className="w-3.5 h-3.5" />
                        Nano Banana Lab
                    </div>
                    <h1 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight">
                        Image Generator
                    </h1>
                    <p className="text-white/50 text-lg">
                        Type a prompt and watch the magic happen ✨
                    </p>
                </div>

                {/* Input Card */}
                <Card className="bg-white/5 backdrop-blur-xl border-white/10 rounded-2xl shadow-2xl">
                    <CardHeader className="pb-4">
                        <CardTitle className="text-white/90 text-lg font-bold flex items-center gap-2">
                            <ImageIcon className="w-5 h-5 text-violet-400" />
                            Enter Your Prompt
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Input
                            placeholder="A futuristic city floating in the clouds at sunset..."
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
                            className="h-14 bg-white/10 border-white/15 text-white placeholder:text-white/30 rounded-xl text-base focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50"
                            disabled={isLoading}
                        />
                        <Button
                            onClick={handleGenerate}
                            disabled={isLoading || !prompt.trim()}
                            className="w-full h-14 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-xl font-bold text-lg shadow-lg shadow-violet-500/25 transition-all hover:shadow-violet-500/40 hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
                        >
                            {isLoading ? (
                                <span className="flex items-center gap-3">
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    Generating...
                                </span>
                            ) : (
                                <span className="flex items-center gap-2">
                                    <Sparkles className="w-5 h-5" />
                                    Generate Image
                                </span>
                            )}
                        </Button>
                    </CardContent>
                </Card>

                {/* Error Display */}
                {error && (
                    <div className="bg-red-500/10 border border-red-500/20 text-red-300 px-5 py-4 rounded-xl text-sm font-medium">
                        ⚠️ {error}
                    </div>
                )}

                {/* Result Display */}
                {imageUrl && (
                    <Card className="bg-white/5 backdrop-blur-xl border-white/10 rounded-2xl shadow-2xl overflow-hidden">
                        <CardContent className="p-0">
                            <img
                                src={imageUrl}
                                alt="Generated image"
                                className="w-full rounded-t-2xl"
                            />
                            <div className="p-5 flex items-center justify-between">
                                <p className="text-white/50 text-sm truncate max-w-[70%]">
                                    "{prompt}"
                                </p>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleDownload}
                                    className="text-violet-300 hover:text-violet-100 hover:bg-violet-500/20 rounded-lg gap-2"
                                >
                                    <Download className="w-4 h-4" />
                                    Save
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Loading skeleton */}
                {isLoading && (
                    <Card className="bg-white/5 backdrop-blur-xl border-white/10 rounded-2xl shadow-2xl overflow-hidden">
                        <CardContent className="p-0">
                            <div className="w-full aspect-video bg-gradient-to-br from-violet-500/10 to-indigo-500/10 animate-pulse flex items-center justify-center">
                                <div className="text-center space-y-3">
                                    <Loader2 className="w-10 h-10 text-violet-400/50 animate-spin mx-auto" />
                                    <p className="text-white/30 text-sm font-medium">Creating your masterpiece...</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
}
