import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';

export function LandingPage() {
    const navigate = useNavigate();

    return (
        <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-12">
            <Card className="max-w-2xl w-full border-none shadow-xl bg-white/80 backdrop-blur">
                <CardHeader className="text-center space-y-4 pt-12">
                    <div className="mx-auto bg-indigo-100 w-16 h-16 rounded-2xl flex items-center justify-center mb-4">
                        <span className="text-3xl">🧭</span>
                    </div>
                    <CardTitle className="text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight">
                        Welcome to Questory
                    </CardTitle>
                    <CardDescription className="text-lg text-slate-500 mt-4 max-w-xl mx-auto">
                        Interactive branching learning stories for kids. Explore, learn, and test your knowledge through exciting storyworlds.
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex justify-center pb-12 pt-8">
                    <Button
                        size="lg"
                        className="text-lg px-8 h-14 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-lg hover:shadow-xl transition-all hover:-translate-y-1"
                        onClick={() => navigate('/create')}
                    >
                        Start Your Journey
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}
