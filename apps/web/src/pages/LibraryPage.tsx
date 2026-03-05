import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

const MOCK_STORIES = [
    { id: '1', title: 'The Dinosaur Mystery', date: '2023-10-24', progress: 100 },
    { id: '2', title: 'Journey to Mars', date: '2023-10-25', progress: 40 },
    { id: '3', title: 'Ancient Egypt Secrets', date: '2023-11-01', progress: 0 },
];

export function LibraryPage() {
    return (
        <div className="flex-1 container mx-auto p-4 md:p-6 lg:p-8">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Your Library</h1>
                    <p className="text-slate-500 mt-1">Saved stories and progress</p>
                </div>
                <Link to="/create">
                    <Button className="bg-indigo-600 hover:bg-indigo-700">New Story</Button>
                </Link>
            </div>

            {MOCK_STORIES.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {MOCK_STORIES.map((story) => (
                        <Card key={story.id} className="overflow-hidden hover:shadow-lg transition-shadow bg-white pb-2 border-slate-200">
                            <div className="h-32 bg-indigo-100 flex items-center justify-center">
                                <span className="text-4xl">📚</span>
                            </div>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-xl">{story.title}</CardTitle>
                                <CardDescription>Created: {story.date}</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="w-full bg-slate-100 rounded-full h-2.5 mb-4">
                                    <div
                                        className="bg-indigo-600 h-2.5 rounded-full"
                                        style={{ width: `${story.progress}%` }}
                                    ></div>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-slate-500">{story.progress}% Complete</span>
                                    <Link to={`/play/${story.id}`}>
                                        <Button variant={story.progress === 100 ? "outline" : "default"} size="sm">
                                            {story.progress === 100 ? "Replay" : "Continue"}
                                        </Button>
                                    </Link>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            ) : (
                <div className="text-center py-20 bg-white rounded-xl shadow-sm border border-slate-100">
                    <div className="text-6xl mb-4">📭</div>
                    <h2 className="text-xl font-medium text-slate-600">No stories yet</h2>
                    <p className="text-slate-400 mt-2 mb-6">Start your first learning adventure today!</p>
                    <Link to="/create">
                        <Button>Create a Story</Button>
                    </Link>
                </div>
            )}
        </div>
    );
}
