import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { RootLayout } from '@/components/layout/RootLayout';
import { LandingPage } from '@/pages/LandingPage';
import { CreateStoryPage } from '@/pages/CreateStoryPage';
import { StoryPlayerPage } from '@/pages/StoryPlayerPage';
import { StoryBuilderPage } from '@/pages/StoryBuilderPage';
import { StoryViewerPage } from '@/pages/StoryViewerPage';
import { LibraryPage } from '@/pages/LibraryPage';
import { AdminDebugPage } from '@/pages/AdminDebugPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RootLayout />}>
          <Route index element={<LandingPage />} />
          <Route path="create" element={<CreateStoryPage />} />
          <Route path="play/:sessionId" element={<StoryPlayerPage />} />
          <Route path="view/:sessionId" element={<StoryViewerPage />} />
          <Route path="build/:sessionId" element={<StoryBuilderPage />} />
          <Route path="library" element={<LibraryPage />} />
          <Route path="admin/debug" element={<AdminDebugPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
