import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Layout } from '@/components/Layout';
import { CookieBanner } from '@/components/CookieBanner';

import Login from '@/pages/Login';
import Register from '@/pages/Register';
import Gallery from '@/pages/Gallery';
import Upload from '@/pages/Upload';
import FileView from '@/pages/FileView';
import AdminDashboard from '@/pages/admin/Dashboard';
import AdminUsers from '@/pages/admin/Users';
import AdminFiles from '@/pages/admin/Files';
import AdminImport from '@/pages/admin/Import';
import AdminSiteSettings from '@/pages/admin/SiteSettings';
import AdminAuditLog from '@/pages/admin/AuditLog';
import Settings from '@/pages/Settings';
import PrivacyPolicy from '@/pages/PrivacyPolicy';
import TermsOfService from '@/pages/TermsOfService';
import Install from '@/pages/Install';

const PAGE_TITLES = {
  '/gallery': 'Gallery',
  '/upload': 'Upload',
  '/settings': 'Settings',
  '/admin': 'Dashboard',
  '/admin/users': 'Users',
  '/admin/files': 'Files',
  '/admin/import': 'Import',
  '/auth/login': 'Login',
  '/auth/register': 'Register',
  '/install': 'Setup',
};

function TitleUpdater() {
  const { pathname } = useLocation();
  useEffect(() => {
    const page = PAGE_TITLES[pathname];
    document.title = page ? `Sharely | ${page}` : 'Sharely';
  }, [pathname]);
  return null;
}

// Redirect to /install when not yet installed; redirect /install away when already installed.
function SetupGuard({ children }) {
  const { installed, loading } = useAuth();
  const { pathname } = useLocation();

  if (loading) {
    return (
      <div className="flex h-svh items-center justify-center">
        <div className="text-muted-foreground text-sm animate-pulse">Loading…</div>
      </div>
    );
  }

  if (!installed && pathname !== '/install') {
    return <Navigate to="/install" replace />;
  }

  if (installed && pathname === '/install') {
    return <Navigate to="/auth/login" replace />;
  }

  return children;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <TooltipProvider>
        <TitleUpdater />
        <SetupGuard>
          <Routes>
            {/* Install wizard — only accessible before first setup */}
            <Route path="/install" element={<Install />} />

            {/* Public */}
            <Route path="/auth/login" element={<Login />} />
            <Route path="/auth/register" element={<Register />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/terms" element={<TermsOfService />} />
            <Route path="/f/:shortId" element={<FileView />} />

            {/* Protected */}
            <Route path="/gallery" element={<ProtectedRoute><Layout><Gallery /></Layout></ProtectedRoute>} />
            <Route path="/upload" element={<ProtectedRoute><Layout><Upload /></Layout></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><Layout><Settings /></Layout></ProtectedRoute>} />

            {/* Admin */}
            <Route path="/admin" element={<ProtectedRoute adminOnly><Layout><AdminDashboard /></Layout></ProtectedRoute>} />
            <Route path="/admin/users" element={<ProtectedRoute adminOnly><Layout><AdminUsers /></Layout></ProtectedRoute>} />
            <Route path="/admin/files" element={<ProtectedRoute adminOnly><Layout><AdminFiles /></Layout></ProtectedRoute>} />
            <Route path="/admin/import" element={<ProtectedRoute adminOnly><Layout><AdminImport /></Layout></ProtectedRoute>} />
            <Route path="/admin/settings" element={<ProtectedRoute adminOnly><Layout><AdminSiteSettings /></Layout></ProtectedRoute>} />
            <Route path="/admin/audit-log" element={<ProtectedRoute adminOnly><Layout><AdminAuditLog /></Layout></ProtectedRoute>} />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/gallery" replace />} />
          </Routes>
        </SetupGuard>
        <CookieBanner />
        <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
