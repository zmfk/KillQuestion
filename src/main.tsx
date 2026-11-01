import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { HomePage } from './pages/HomePage';
import { ImportPage } from './pages/ImportPage';
import { LibraryPage } from './pages/LibraryPage';
import { PracticePage } from './pages/PracticePage';
import { RecitePage } from './pages/RecitePage';
import { ResultPage } from './pages/ResultPage';
import { TopicsPage } from './pages/TopicsPage';
import { useQuiz } from './store/quiz';
import './styles/global.css';

function App() {
  const boot = useQuiz((s) => s.boot);

  useEffect(() => {
    boot();
  }, [boot]);

  return (
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/topics" element={<TopicsPage />} />
          <Route path="/practice" element={<PracticePage />} />
          <Route path="/result" element={<ResultPage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/recite" element={<RecitePage />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('缺少 #root 挂载点');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
