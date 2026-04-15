import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import { Toaster } from '@/components/ui/toaster';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Layout } from '@/components/Layout';

import Login from '@/pages/Login';
import Register from '@/pages/Register';
import Gallery from '@/pages/Gallery';
import Upload from '@/pages/Upload';
import FileView from '@/pages/FileView';
import AdminDashboard from '@/pages/admin/Dashboard';
import AdminUsers from '@/pages/admin/Users';
import AdminFiles from '@/pages/admin/Files';
import AdminImport from '@/pages/admin/Import';
import Settings from '@/pages/Settings';

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
};

function TitleUpdater() {
  const { pathname } = useLocation();
  useEffect(() => {
    const page = PAGE_TITLES[pathname];
    document.title = page ? `SHARELY | ${page}` : 'SHARELY';
  }, [pathname]);
  return null;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <TitleUpdater />
        <Routes>
          {/* Public */}
          <Route path="/auth/login" element={<Login />} />
          <Route path="/auth/register" element={<Register />} />
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

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/gallery" replace />} />
        </Routes>
        <Toaster />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
