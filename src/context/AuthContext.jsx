import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

import { useMyContext } from './MyContext';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import BlockedModal from '../components/moderation/BlockedModal';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockInfo, setBlockInfo] = useState(null);
  const { interest } = useMyContext();
  const location = useLocation();
  const navigate = useNavigate();

  const fetchUserProfile = async () => {
    try {
      setLoading(true);
     const response = await axios.get(`${import.meta.env.VITE_BACKEND_URL}/api/auth/user/profile`, {
        headers: {  
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const userData = response.data;
      console.log('User profile fetched:', userData);

      if (!userData) {
        throw new Error('No user data received');
      }

      setUser(userData);
      console.log(userData.isPremium)
      setIsPremium(userData.isPremium);

      if (userData && !userData.fullName && !userData.dateOfBirth && !userData.gender) {
        setShowProfileModal(true);
      } else {
        setShowProfileModal(false);
      }

      return userData;
    } catch (error) {
      console.error('Failed to fetch user profile:', error);
      
      // Check if user is blocked
      if (error.response?.status === 403 && error.response?.data?.blocked) {
        setIsBlocked(true);
        setBlockInfo({
          reason: error.response.data.reason,
          blockedAt: error.response.data.blockedAt
        });
        return null;
      }
      
      setUser(null);
      setIsPremium(false);
      // Don't throw the error, just return null
      return null;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        const token = localStorage.getItem('token');
        const queryParams = new URLSearchParams(location.search);
        const newToken = queryParams.get('token');

        if (newToken) {
          localStorage.setItem('token', newToken);
          await fetchUserProfile();
          navigate('/');
        } else if (token) {
          await fetchUserProfile();
        }
      } catch (error) {
        console.error('Auth status check failed:', error);
        setUser(null);
        setIsPremium(false);
      } finally {
        setLoading(false);
      }
    };

    checkAuthStatus();
  }, [location, navigate]);

  const login = async (email, password) => {
    try {
      const response = await api.auth.login(email, password);
      const { token } = response.data;

      localStorage.setItem('token', token);
      const userData = await fetchUserProfile();
      
      if (!isBlocked && userData) {
        navigate('/');
      }
    } catch (error) {
      if (error.response?.status === 403 && error.response?.data?.blocked) {
        setIsBlocked(true);
        setBlockInfo({
          reason: error.response.data.reason,
          blockedAt: error.response.data.blockedAt
        });
      }
      throw error;
    }
  };

  const loginWithGoogle = () => {
    if (user) {
      return;
    }

    if (interest) {
      localStorage.setItem('interest', interest);
    }

    const backendUrl = import.meta.env.VITE_BACKEND_URL

    window.location.href = `${backendUrl}/api/auth/google`;
  };

  const signup = async (email, password) => {
    const response = await api.auth.signup({ email, password });
    const { token } = response.data;

    localStorage.setItem('token', token);
    await fetchUserProfile();
    navigate('/');
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
    setShowProfileModal(false);
    navigate('/');
  };

  const updateProfile = async (profileData) => {
    try {
     const response = await axios.put(`${import.meta.env.VITE_BACKEND_URL}/api/auth/profile`, profileData, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`

        }
      });
      const updatedUser = {
        ...user,
        ...response.data,
        isProfileComplete: true
      };
      
      setUser(updatedUser);
      setShowProfileModal(false);
      return response.data;
    } catch (error) {
      console.error('Profile update failed:', error);
      throw error;
    }
  };

  const value = {
    user,
    loading,
    isPremium,
    showAuthModal,
    setShowAuthModal,
    showProfileModal,
    setShowProfileModal,
    isBlocked,
    blockInfo,
    login,
    loginWithGoogle,
    signup,
    logout,
    updateProfile,
    fetchUserProfile
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
      <BlockedModal 
        isOpen={isBlocked} 
        reason={blockInfo?.reason} 
        blockedAt={blockInfo?.blockedAt} 
      />
    </AuthContext.Provider>
  );
};
