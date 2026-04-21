import { Component } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { NavBar } from './NavBar';
import { UpdatePrompt } from './UpdatePrompt';
import { useUiStore, selectToast } from '../../store/uiStore';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-bg flex flex-col items-center justify-center gap-4 p-8 text-center">
          <p className="text-4xl">⚠️</p>
          <p className="text-white font-bold text-lg">Something went wrong</p>
          <p className="text-slate-400 text-sm">{this.state.error.message}</p>
          <button
            className="mt-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-semibold"
            onClick={() => { this.setState({ error: null }); window.location.reload(); }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Hide NavBar on live match screen (full-screen immersive)
const HIDE_NAV = ['/live', '/set-lineup'];

export function Layout() {
  const { pathname } = useLocation();
  const toast = useUiStore(selectToast);
  const hideNav = HIDE_NAV.some((p) => pathname.includes(p));

  return (
    <div className="min-h-screen bg-bg text-white">
      <UpdatePrompt />
      <main className={hideNav ? '' : 'pb-20'}>
        <div className={hideNav ? '' : 'max-w-2xl mx-auto'}>
          <ErrorBoundary key={pathname}>
            <div className="animate-page-enter">
              <Outlet />
            </div>
          </ErrorBoundary>
        </div>
      </main>

      {!hideNav && <NavBar />}

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg text-sm font-medium shadow-lg
          ${toast.variant === 'error' ? 'bg-red-600' : toast.variant === 'success' ? 'bg-green-600' : 'bg-slate-700'}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
