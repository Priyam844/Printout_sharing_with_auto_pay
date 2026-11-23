import { Outlet, Link, useLocation } from 'react-router-dom';
import { Upload, FileText, CheckCircle2, Printer, ShieldCheck, Settings } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export function Layout() {
  const location = useLocation();
  const { user, isAuthenticated } = useAuth();

  const isUploadActive = location.pathname === '/';
  const isDocumentsActive = location.pathname.startsWith('/documents');
  const isAdminActive = location.pathname.startsWith('/admin-portal') || location.pathname.startsWith('/login');

  return (
    <div className="layout min-h-screen flex flex-col bg-slate-50 text-slate-900 font-sans antialiased">
      {/* Top Header - 64px height */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
          {/* Brand */}
          <Link to="/" className="flex items-center gap-3 shrink-0 group" aria-label="PrintShare Home">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/25 group-hover:bg-blue-700 transition-colors shrink-0">
              <Printer className="w-5 h-5 text-white" />
            </div>
            <div className="flex flex-col justify-center">
              <span className="font-extrabold text-lg text-slate-900 tracking-tight leading-tight group-hover:text-blue-600 transition-colors">
                PrintShare
              </span>
              <span className="hidden md:block text-[11px] font-medium text-slate-500 leading-none mt-0.5">
                Instant Document Printing & Store Automation
              </span>
            </div>
          </Link>

          {/* Right Header: Desktop Nav & System Status */}
          <div className="flex items-center gap-3 shrink-0">
            {/* Desktop Navigation Links */}
            <nav className="hidden md:flex items-center gap-1 bg-slate-100/90 p-1 rounded-xl border border-slate-200/80" aria-label="Main navigation">
              <Link
                to="/"
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                  isUploadActive
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                aria-current={isUploadActive ? 'page' : undefined}
              >
                <Upload className="w-4 h-4" />
                Upload Documents
              </Link>
              <Link
                to="/documents"
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                  isDocumentsActive
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                aria-current={isDocumentsActive ? 'page' : undefined}
              >
                <FileText className="w-4 h-4" />
                My Documents
              </Link>
              <Link
                to={isAuthenticated ? '/admin-portal' : '/login'}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold transition-all ${
                  isAdminActive
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                aria-current={isAdminActive ? 'page' : undefined}
              >
                <ShieldCheck className="w-4 h-4" />
                {isAuthenticated ? (
                  <span>Admin ({user?.username || 'Staff'})</span>
                ) : (
                  <span>Store Login</span>
                )}
              </Link>
            </nav>

            {/* Service Status Badge - Compact with tooltip */}
            <div className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 group relative" role="group" aria-label="Service status">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true" />
              <span>Service Ready</span>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 text-[10px] font-mono text-white bg-slate-900 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                Station: Auto-routing
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <Outlet />
      </main>

      {/* Desktop Footer */}
      <footer className="hidden md:block bg-white border-t border-slate-200 py-5 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2.5">
          <p>© {new Date().getFullYear()} PrintShare — High-Fidelity Auto Document Printing</p>
          <div className="flex items-center gap-3">
            <Link to={isAuthenticated ? '/admin-portal' : '/login'} className="text-blue-600 hover:underline flex items-center gap-1 text-sm font-medium transition-colors">
              <Settings className="w-3.5 h-3.5" />
              Store Owner Portal
            </Link>
            <span className="text-slate-300" aria-hidden="true">•</span>
            <p className="flex items-center gap-1.5 font-medium text-slate-600">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
              UPI Dynamic QR Payments & Instant Print Routing
            </p>
          </div>
        </div>
      </footer>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-lg border-t border-slate-200 px-4 py-2 shadow-lg flex items-center justify-around safe-bottom">
        <Link
          to="/"
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all ${
            isUploadActive
              ? 'text-blue-600 font-bold'
              : 'text-slate-500 hover:text-slate-800 font-medium'
          }`}
          aria-current={isUploadActive ? 'page' : undefined}
        >
          <div
            className={`w-10 h-7 rounded-full flex items-center justify-center transition-colors ${
              isUploadActive ? 'bg-blue-50 text-blue-600' : 'text-slate-500'
            }`}
            aria-hidden="true"
          >
            <Upload className="w-4 h-4" />
          </div>
          <span className="text-[11px] leading-tight">Upload</span>
        </Link>

        <Link
          to="/documents"
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all ${
            isDocumentsActive
              ? 'text-blue-600 font-bold'
              : 'text-slate-500 hover:text-slate-800 font-medium'
          }`}
          aria-current={isDocumentsActive ? 'page' : undefined}
        >
          <div
            className={`w-10 h-7 rounded-full flex items-center justify-center transition-colors ${
              isDocumentsActive ? 'bg-blue-50 text-blue-600' : 'text-slate-500'
            }`}
            aria-hidden="true"
          >
            <FileText className="w-4 h-4" />
          </div>
          <span className="text-[11px] leading-tight">Documents</span>
        </Link>

        <Link
          to={isAuthenticated ? '/admin-portal' : '/login'}
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all ${
            isAdminActive
              ? 'text-blue-600 font-bold'
              : 'text-slate-500 hover:text-slate-800 font-medium'
          }`}
          aria-current={isAdminActive ? 'page' : undefined}
        >
          <div
            className={`w-10 h-7 rounded-full flex items-center justify-center transition-colors ${
              isAdminActive ? 'bg-blue-50 text-blue-600' : 'text-slate-500'
            }`}
            aria-hidden="true"
          >
            <ShieldCheck className="w-4 h-4" />
          </div>
          <span className="text-[11px] leading-tight">{isAuthenticated ? 'Admin' : 'Store Login'}</span>
        </Link>
      </nav>
    </div>
  );
}