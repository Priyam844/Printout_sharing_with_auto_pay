import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { UploadPage } from './pages/UploadPage';
import { SharePage } from './pages/SharePage';
import { SuccessPage } from './pages/SuccessPage';
import { DocumentsPage } from './pages/DocumentsPage';
import { LoginPage } from './pages/LoginPage';
import { AdminPortalPage } from './pages/AdminPortalPage';
import { AuthProvider } from './context/AuthContext';
import { Layout } from './components/Layout';
import './App.css';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<UploadPage />} />
            <Route path="documents" element={<DocumentsPage />} />
            <Route path="share/:token" element={<SharePage />} />
            <Route path="share/batch/:batchId" element={<SharePage />} />
            <Route path="success/:id" element={<SuccessPage />} />
            <Route path="login" element={<LoginPage />} />
            <Route path="admin-portal" element={<AdminPortalPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;