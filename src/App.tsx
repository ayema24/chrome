import { lazy, Suspense } from 'react';
import { useRoute, navigate, type Page } from './lib/router';
import { useAnalyzer } from './lib/analyzer';
import Home from './pages/Home';

const Play = lazy(() => import('./pages/Play'));
const Puzzles = lazy(() => import('./pages/Puzzles'));
const Openings = lazy(() => import('./pages/Openings'));
const Analysis = lazy(() => import('./pages/Analysis'));
const Games = lazy(() => import('./pages/Games'));
const Scan = lazy(() => import('./pages/Scan'));
const Progress = lazy(() => import('./pages/Progress'));
const Settings = lazy(() => import('./pages/Settings'));

const NAV: { page: Page; label: string; icon: string; mobile?: boolean }[] = [
  { page: 'home', label: 'Coach', icon: '🏠', mobile: true },
  { page: 'play', label: 'Play', icon: '♟', mobile: true },
  { page: 'puzzles', label: 'Puzzles', icon: '🧩', mobile: true },
  { page: 'openings', label: 'Openings', icon: '📖', mobile: true },
  { page: 'analysis', label: 'Analysis', icon: '🔍' },
  { page: 'games', label: 'Games', icon: '🗂' },
  { page: 'scan', label: 'Scan board', icon: '📷' },
  { page: 'progress', label: 'Progress', icon: '📈', mobile: true },
  { page: 'settings', label: 'Settings', icon: '⚙️' },
];

export default function App() {
  const route = useRoute();
  const analyzer = useAnalyzer();
  const pageEl = (() => {
    switch (route.page) {
      case 'play':
        return <Play params={route.params} />;
      case 'puzzles':
        return <Puzzles params={route.params} />;
      case 'openings':
        return <Openings params={route.params} />;
      case 'analysis':
        return <Analysis params={route.params} />;
      case 'games':
        return <Games params={route.params} />;
      case 'scan':
        return <Scan />;
      case 'progress':
        return <Progress />;
      case 'settings':
        return <Settings />;
      default:
        return <Home />;
    }
  })();
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand" onClick={() => navigate('home')}>
          <img src="./icon.svg" alt="" /> Chess Coach
        </div>
        <nav>
          {NAV.map((n) => (
            <button key={n.page} className={route.page === n.page ? 'active' : ''} onClick={() => navigate(n.page)}>
              <span className="icon">{n.icon}</span> {n.label}
            </button>
          ))}
        </nav>
        {analyzer.running && (
          <div className="analyzer-status">
            Analysing games… {Math.round(analyzer.progress * 100)}%{analyzer.queued ? ` (+${analyzer.queued} queued)` : ''}
          </div>
        )}
      </aside>
      <main className="content">
        <Suspense fallback={<div className="loading">Loading…</div>}>{pageEl}</Suspense>
      </main>
      <nav className="tabbar">
        {NAV.filter((n) => n.mobile).map((n) => (
          <button key={n.page} className={route.page === n.page ? 'active' : ''} onClick={() => navigate(n.page)}>
            <span className="icon">{n.icon}</span>
            <span>{n.label}</span>
          </button>
        ))}
        <button className={['analysis', 'games', 'scan', 'settings'].includes(route.page) ? 'active' : ''} onClick={() => navigate('games')}>
          <span className="icon">☰</span>
          <span>More</span>
        </button>
      </nav>
    </div>
  );
}
