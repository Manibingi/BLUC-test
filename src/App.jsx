import React from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import Header from './components/layout/Header';
import Home from './pages/Home';
import Chat from './pages/Chat';
import Profile from './pages/Profile';
import NotFound from './pages/NotFound';
import ProtectedRoute from './components/auth/ProtectedRoute';
import { useAuth } from './context/AuthContext';
import AuthModal from './components/auth/AuthModal';
import PremiumModal from './components/premium/PremiumModal';

function App() {
  const { showAuthModal } = useAuth();
  const navigate = useNavigate();

  const handlePremiumModalClose = () => {
    navigate('/');
  };

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/pricing" element={<PremiumModal onClose={handlePremiumModalClose} />} />
          <Route
            path="/chat/:mode"
            element={
              <ProtectedRoute>
                <Chat />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      {showAuthModal && <AuthModal />}
    </div>
  );
}

export default App;