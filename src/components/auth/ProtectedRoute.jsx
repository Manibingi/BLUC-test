import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const ProtectedRoute = ({ children }) => {
  const { user, setShowAuthModal } = useAuth();
  
  if (!user) {
    setShowAuthModal(true);
    return <Navigate to="/" />;
  }
  
  return children;
};

export default ProtectedRoute;