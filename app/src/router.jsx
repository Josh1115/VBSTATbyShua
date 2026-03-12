import { createBrowserRouter } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { HomePage } from './pages/HomePage';
import { TeamsPage } from './pages/TeamsPage';
import { TeamDetailPage } from './pages/TeamDetailPage';
import { MatchSetupPage } from './pages/MatchSetupPage';
import { LiveMatchPage } from './pages/LiveMatchPage';
import { SetLineupPage } from './pages/SetLineupPage';
import { MatchSummaryPage } from './pages/MatchSummaryPage';
import { SeasonsPage } from './pages/SeasonsPage';
import { SeasonDetailPage } from './pages/SeasonDetailPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';
import { ToolsPage } from './pages/ToolsPage';
import { ServeReceivePage } from './pages/tools/ServeReceivePage';
import { ServeTrackerPage } from './pages/tools/ServeTrackerPage';
import { NotFoundPage } from './pages/NotFoundPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true,                         element: <HomePage /> },
      { path: 'teams',                       element: <TeamsPage /> },
      { path: 'teams/:teamId',               element: <TeamDetailPage /> },
      { path: 'seasons',                     element: <SeasonsPage /> },
      { path: 'seasons/:seasonId',           element: <SeasonDetailPage /> },
      { path: 'matches/new',                 element: <MatchSetupPage /> },
      { path: 'matches/:matchId/live',        element: <LiveMatchPage /> },
      { path: 'matches/:matchId/set-lineup', element: <SetLineupPage /> },
      { path: 'matches/:matchId/summary',    element: <MatchSummaryPage /> },
      { path: 'reports',                     element: <ReportsPage /> },
      { path: 'settings',                    element: <SettingsPage /> },
      { path: 'tools',                       element: <ToolsPage /> },
      { path: 'tools/serve-receive',         element: <ServeReceivePage /> },
      { path: 'tools/serve-tracker',         element: <ServeTrackerPage /> },
      { path: '*',                           element: <NotFoundPage /> },
    ],
  },
]);
