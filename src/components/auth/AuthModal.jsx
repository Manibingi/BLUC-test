import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import LoginForm from './LoginForm';
import SignupForm from './SignupForm';

const AuthModal = () => {
  const { setShowAuthModal } = useAuth();
  const [activeTab, setActiveTab] = useState('login');
  
  const handleClose = () => {
    setShowAuthModal(false);
  };
  
  return (
    <div className="bluc-modal">
      <div className="bluc-modal-content slide-up max-w-md">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold">Sign in to continue</h2>
            <button 
              onClick={handleClose}
              className="text-gray-500 hover:text-gray-700"
            >
              <X size={20} />
            </button>
          </div>
          
          <div className="bg-gray-100 rounded-lg p-1 flex mb-6">
            <button
              className={`flex-1 py-2 rounded-md text-center font-medium transition-colors ${
                activeTab === 'login' ? 'bg-white shadow-sm' : 'text-gray-600'
              }`}
              onClick={() => setActiveTab('login')}
            >
              Login
            </button>
            <button
              className={`flex-1 py-2 rounded-md text-center font-medium transition-colors ${
                activeTab === 'signup' ? 'bg-white shadow-sm' : 'text-gray-600'
              }`}
              onClick={() => setActiveTab('signup')}
            >
              Sign Up
            </button>
          </div>
          
          {activeTab === 'login' ? (
            <LoginForm onSuccess={handleClose} />
          ) : (
            <SignupForm onSuccess={() => setActiveTab('login')} />
          )}
          
          <div className="mt-6 text-sm text-gray-600 text-center">
            <p>
              By continuing, you agree to our Terms of Service and Privacy Policy
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthModal;