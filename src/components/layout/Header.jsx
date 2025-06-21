import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { MessageSquare, User, LogOut, Crown, Menu } from 'lucide-react';
import ProfileModal from '../profile/ProfileModal';
import axios from "axios";

const Header = () => {
  const { user, logout, setShowAuthModal,isPremium } = useAuth();
  const navigate = useNavigate();
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // const [isPremium, setIsPremium] = useState(false);
  const [premiumEndDate, setPremiumEndDate] = useState(null);
  // console.lo
  console.log("isPremium", isPremium);
  // useEffect(() => {
  //   fetchapi();
  // }, []);

  // const fetchapi = async () => {
  //   const response = await axios.get("http://localhost:3000/api/subscription/status", {
  //     headers: {
  //       authorization: `Bearer ${localStorage.getItem("token")}`
  //     }
  //   });
  //   if (response) {
  //     setIsPremium(response.data.isPremium);
  //     if (response.data.subscription && response.data.subscription.endDate) {
  //       setPremiumEndDate(response.data.subscription.endDate);
  //     }
  //   }
  // }

  const handleLoginClick = () => {
    navigate('/pricing');
  };

  const handleLogoutClick = () => {
    logout();
    navigate('/');
  };

  const handleProfileClick = () => {
    setShowProfileModal(true);
  };

  return (
    <header className="bg-white shadow-sm">
      <div className="container mx-auto px-4 py-3">
        <div className="flex justify-between items-center">
          <Link to="/" className="flex items-center">
            <MessageSquare className="text-blue-600 mr-2" size={28} />
            <span className="text-2xl font-bold text-blue-600">BLUC</span>
          </Link>

          {/* Mobile menu button */}
          <button 
            className="lg:hidden p-2"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            <Menu size={24} />
          </button>

          {/* Desktop menu */}
          <div className="hidden lg:flex items-center gap-3">
            <div className="text-right mr-4">
              <div className="text-md font-semibold">Talk to strangers!</div>
              <div className="text-sm text-green-500 flex items-center">
                <span className="inline-block w-2 h-2 bg-green-500 rounded-full mr-1"></span>
                <span className="font-medium">{Math.floor(30000 + Math.random() * 5000)}</span>
                <span className="text-gray-500 ml-1">online now</span>
              </div>
            </div>

            {user ? (
              <div className="flex items-center">
                <button
                  onClick={handleProfileClick}
                  className="bluc-btn-secondary mr-2 flex items-center"
                >
                  <User size={18} className="mr-1" />
                  <span>Profile</span>
                </button>

                {isPremium ? (
                  <button
                    className="relative bg-gradient-to-r from-yellow-400 via-yellow-500 to-yellow-600 text-white px-4 py-1.5 rounded-xl flex items-center mr-2 shadow-lg border-2 border-yellow-300 hover:from-yellow-500 hover:to-yellow-700 transition-all"
                    title="You have access to all premium features"
                    style={{
                      fontWeight: 700,
                      letterSpacing: '0.03em'
                    }}
                  >
                    <span className="animate-pulse mr-2">
                      <Crown size={22} className="text-yellow-200 drop-shadow-glow" />
                    </span>
                    <span className="text-lg">Premium</span>
                    {premiumEndDate && (
                      <span className="ml-3 bg-yellow-200 text-yellow-800 px-2 py-0.5 rounded-full text-xs font-bold shadow-inner border border-yellow-300">
                        Ends on: {new Date(premiumEndDate).toLocaleDateString()}
                      </span>
                    )}
                  </button>
                ) : (
                  <button
                    onClick={handleLoginClick}
                    className="bluc-btn-primary flex items-center mr-2"
                  >
                    <Crown size={18} className="mr-2" />
                    Get Premium
                  </button>
                )}

                <button
                  onClick={handleLogoutClick}
                  className="p-2 text-gray-600 hover:text-gray-900"
                >
                  <LogOut size={20} />
                </button>
              </div>
            ) : (
              <button
                onClick={handleLoginClick}
                className="bluc-btn-primary flex items-center"
              >
                <Crown size={18} className="mr-2" />
                Premium
              </button>
            )}
          </div>
        </div>

        {/* Mobile menu */}
        {isMobileMenuOpen && (
          <div className="lg:hidden mt-4 pb-4">
            <div className="text-center mb-4">
              <div className="text-md font-semibold">Talk to strangers!</div>
              <div className="text-sm text-green-500 flex items-center justify-center">
                <span className="inline-block w-2 h-2 bg-green-500 rounded-full mr-1"></span>
                <span className="font-medium">{Math.floor(30000 + Math.random() * 5000)}</span>
                <span className="text-gray-500 ml-1">online now</span>
              </div>
            </div>

            {user ? (
              <div className="flex flex-col gap-3">
                <button
                  onClick={handleProfileClick}
                  className="bluc-btn-secondary w-full flex items-center justify-center"
                >
                  <User size={18} className="mr-1" />
                  <span>Profile</span>
                </button>

                {isPremium ? (
                  <button
                    className="relative bg-gradient-to-r from-yellow-400 via-yellow-500 to-yellow-600 text-white px-4 py-2 rounded-xl flex items-center justify-center shadow-lg border-2 border-yellow-300 hover:from-yellow-500 hover:to-yellow-700 transition-all"
                  >
                    <span className="animate-pulse mr-2">
                      <Crown size={22} className="text-yellow-200 drop-shadow-glow" />
                    </span>
                    <span className="text-lg">Premium</span>
                  </button>
                ) : (
                  <button
                    onClick={handleLoginClick}
                    className="bluc-btn-primary w-full flex items-center justify-center"
                  >
                    <Crown size={18} className="mr-2" />
                    Get Premium
                  </button>
                )}

                <button
                  onClick={handleLogoutClick}
                  className="p-2 text-gray-600 hover:text-gray-900 w-full flex items-center justify-center"
                >
                  <LogOut size={20} className="mr-2" />
                  <span>Logout</span>
                </button>
              </div>
            ) : (
              <button
                onClick={handleLoginClick}
                className="bluc-btn-primary w-full flex items-center justify-center"
              >
                <Crown size={18} className="mr-2" />
                Premium
              </button>
            )}
          </div>
        )}
      </div>

      {showProfileModal && (
        <ProfileModal
          onClose={() => setShowProfileModal(false)}
          onSubmit={() => setShowProfileModal(false)}
          initialUserData={user}
        />
      )}
    </header>
  );
};

export default Header;
