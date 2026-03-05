import { Link, Outlet } from 'react-router-dom';

export function RootLayout() {
    return (
        <div className="min-h-screen bg-slate-50 flex flex-col">
            <header className="sticky top-0 z-50 w-full border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60">
                <div className="container flex h-14 items-center justify-between mx-auto px-4 md:px-8">
                    <div className="flex items-center gap-6">
                        <Link to="/" className="flex items-center space-x-2">
                            <span className="font-bold inline-block text-indigo-600">Questory</span>
                        </Link>
                        <nav className="flex items-center space-x-6 text-sm font-medium">
                            <Link to="/" className="transition-colors hover:text-indigo-600 text-slate-600">Home</Link>
                            <Link to="/create" className="transition-colors hover:text-indigo-600 text-slate-600">Create</Link>
                            <Link to="/library" className="transition-colors hover:text-indigo-600 text-slate-600">Library</Link>
                        </nav>
                    </div>
                </div>
            </header>
            <main className="flex-1 flex flex-col">
                <Outlet />
            </main>
        </div>
    );
}
