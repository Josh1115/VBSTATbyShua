import { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { Spinner } from './components/ui/Spinner';

// Eagerly loaded — tiny pages or always needed on first paint
import { HomePage } from './pages/HomePage';
import { NotFoundPage } from './pages/NotFoundPage';

// Lazily loaded — heavy pages only fetched when navigated to
const TeamsPage        = lazy(() => import('./pages/TeamsPage').then(m => ({ default: m.TeamsPage })));
const TeamDetailPage   = lazy(() => import('./pages/TeamDetailPage').then(m => ({ default: m.TeamDetailPage })));
const MatchSetupPage   = lazy(() => import('./pages/MatchSetupPage').then(m => ({ default: m.MatchSetupPage })));
const LiveMatchPage    = lazy(() => import('./pages/LiveMatchPage').then(m => ({ default: m.LiveMatchPage })));
const SetLineupPage    = lazy(() => import('./pages/SetLineupPage').then(m => ({ default: m.SetLineupPage })));
const MatchSummaryPage = lazy(() => import('./pages/MatchSummaryPage').then(m => ({ default: m.MatchSummaryPage })));
const SeasonsPage      = lazy(() => import('./pages/SeasonsPage').then(m => ({ default: m.SeasonsPage })));
const SeasonDetailPage = lazy(() => import('./pages/SeasonDetailPage').then(m => ({ default: m.SeasonDetailPage })));
const ReportsPage      = lazy(() => import('./pages/ReportsPage').then(m => ({ default: m.ReportsPage })));
const SettingsPage     = lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })));
const ToolsPage        = lazy(() => import('./pages/ToolsPage').then(m => ({ default: m.ToolsPage })));
const ServeReceivePage = lazy(() => import('./pages/tools/ServeReceivePage').then(m => ({ default: m.ServeReceivePage })));
const ServeTrackerPage = lazy(() => import('./pages/tools/ServeTrackerPage').then(m => ({ default: m.ServeTrackerPage })));
const PracticeGamePage = lazy(() => import('./pages/tools/PracticeGamePage').then(m => ({ default: m.PracticeGamePage })));

function PageFallback() {
  return (
    <div className="flex items-center justify-center h-48">
      <Spinner />
    </div>
  );
}

function S({ children }) {
  return <Suspense fallback={<PageFallback />}>{children}</Suspense>;
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true,                         element: <HomePage /> },
      { path: 'teams',                       element: <S><TeamsPage /></S> },
      { path: 'teams/:teamId',               element: <S><TeamDetailPage /></S> },
      { path: 'seasons',                     element: <S><SeasonsPage /></S> },
      { path: 'seasons/:seasonId',           element: <S><SeasonDetailPage /></S> },
      { path: 'matches/new',                 element: <S><MatchSetupPage /></S> },
      { path: 'matches/:matchId/live',        element: <S><LiveMatchPage /></S> },
      { path: 'matches/:matchId/set-lineup', element: <S><SetLineupPage /></S> },
      { path: 'matches/:matchId/summary',    element: <S><MatchSummaryPage /></S> },
      { path: 'reports',                     element: <S><ReportsPage /></S> },
      { path: 'settings',                    element: <S><SettingsPage /></S> },
      { path: 'tools',                       element: <S><ToolsPage /></S> },
      { path: 'tools/serve-receive',         element: <S><ServeReceivePage /></S> },
      { path: 'tools/serve-tracker',         element: <S><ServeTrackerPage /></S> },
      { path: 'tools/practice-game',         element: <S><PracticeGamePage /></S> },
      { path: '*',                           element: <NotFoundPage /> },
    ],
  },
]);
