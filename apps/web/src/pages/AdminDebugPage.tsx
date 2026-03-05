import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function AdminDebugPage() {
    // Mock data for dev only
    const sessionData = {
        id: "demo-session-123",
        status: "active",
        topic: "Dinosaurs",
        currentNode: "start_node",
        history: ["start_node"],
        state: {
            inventory: ["flashlight"],
            score: 10
        },
        lastUpdated: new Date().toISOString()
    };

    return (
        <div className="flex-1 p-6 bg-slate-900 text-slate-200 min-h-screen">
            <div className="max-w-4xl mx-auto">
                <h1 className="text-2xl font-mono font-bold text-emerald-400 mb-6">⚙️ Admin Dev Debug</h1>

                <div className="grid gap-6">
                    <Card className="bg-slate-800 border-slate-700 text-slate-200">
                        <CardHeader>
                            <CardTitle className="font-mono text-emerald-400">Raw Session JSON</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <pre className="p-4 bg-slate-950 rounded-lg overflow-auto border border-slate-800 max-h-[600px] text-emerald-300 font-mono text-sm leading-relaxed">
                                {JSON.stringify(sessionData, null, 2)}
                            </pre>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
