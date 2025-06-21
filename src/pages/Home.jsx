import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, Video, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useMyContext } from '../context/MyContext'; 
import { useChat } from '../context/ChatContext';
import ProfileModal from '../components/profile/ProfileModal';

const Home = () => {
  const navigate = useNavigate();
  const { user, setShowAuthModal, showProfileModal, setShowProfileModal } = useAuth();
  const { interest, setMyInterest } = useChat();
  const [selectedMode, setSelectedMode] = useState(null);

  const handleChatStart = (mode) => {
    setSelectedMode(mode);

    if (!user) {
      setShowAuthModal(true);
      return;
    }

    if (!user.fullName || !user.dateOfBirth || !user.gender) {
      setShowProfileModal(true);
    } else {
      navigate(`/chat/${mode}`);
    }
  };

  const handleProfileSubmit = () => {
    setShowProfileModal(false);
    if (selectedMode) {
      navigate(`/chat/${selectedMode}`);
    }
  };

  return (
    <div className="container mx-auto px-4 py-4 sm:py-6 md:py-8 max-w-4xl">
      <div className="text-center mb-6 sm:mb-8 md:mb-10">
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-3 sm:mb-4 text-blue-600">
          Talk to Strangers!
        </h1>
        <p className="text-lg sm:text-xl text-gray-600 mb-6 sm:mb-8 px-2">
          Connect with random people worldwide through video or text chat
        </p>

        <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6 md:p-8 max-w-3xl mx-auto">
          <div className="bg-blue-50 rounded-lg p-3 sm:p-4 mb-4 sm:mb-6 flex items-center text-left">
            <AlertTriangle className="text-yellow-500 mr-3 flex-shrink-0" size={20} />
            <div>
              <h3 className="font-semibold text-red-600 mb-1 text-sm sm:text-base">WARNING!</h3>
              <p className="text-gray-700 text-xs sm:text-sm">
                Video is monitored. Keep your conversations clean and appropriate.
              </p>
            </div>
          </div>

          <div>
            <h2 className="text-lg sm:text-xl font-semibold mb-3 sm:mb-4">What do you wanna talk about?</h2>
            <input
              type="text"
              value={interest}
              onChange={(e) => setMyInterest(e.target.value)}
              placeholder="Add your interests"
              className="bluc-input mb-6 sm:mb-8 w-full"
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <button
                onClick={() => handleChatStart("text")}
                className="bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl p-4 sm:p-6 flex flex-col items-center transition-all hover:shadow-md"
              >
                <MessageSquare size={32} className="mb-2 sm:mb-3 text-blue-600" />
                <span className="text-lg sm:text-xl font-medium">Text</span>
              </button>

              <button
                onClick={() => handleChatStart('video')}
                className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl p-4 sm:p-6 flex flex-col items-center transition-all hover:shadow-md"
              >
                <Video size={32} className="mb-2 sm:mb-3" />
                <span className="text-lg sm:text-xl font-medium">Video</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {showProfileModal && (
        <ProfileModal
          onClose={() => setShowProfileModal(false)}
          onSubmit={handleProfileSubmit}
          initialUserData={user}
        />
      )}
    </div>
  );
};

export default Home;
