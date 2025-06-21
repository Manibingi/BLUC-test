import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useChat } from '../context/ChatContext';
import { useAuth } from '../context/AuthContext';
import VideoChat from '../components/chat/VideoChat';
import TextChat from '../components/chat/TextChat';
import MatchWaiting from '../components/chat/MatchWaiting';
import PremiumModal from '../components/premium/PremiumModal';
import TimerNotification from '../components/premium/TimerNotification';
import { useMyContext } from '../context/MyContext';

const Chat = () => {
  const { mode } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    initializeSocket,
    disconnectSocket,
    isConnecting,
    isMatched, 
    interest,
    matchDetails,
    selectedGender
  } = useChat();

  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [showTimer, setShowTimer] = useState(false);
 
  const [timeRemaining, setTimeRemaining] = useState(180);
  const [countdownInterval, setCountdownInterval] = useState(null);
  const [isNavigating, setIsNavigating] = useState(false);

  const cleanup = useCallback(async () => {
    if (countdownInterval) {
      clearInterval(countdownInterval);
    }
    await disconnectSocket();
  }, [countdownInterval, disconnectSocket]);

  useEffect(() => {
    const initialize = async () => {
      try {
        await initializeSocket(user.gender, interest, user.fullName, mode, selectedGender);
      } catch (error) {
        console.error('Error initializing socket:', error);
      }
    };

    initialize();

    return () => {
      cleanup();
    };
  }, [user.gender, interest, user.fullName, mode, selectedGender]);

  useEffect(() => {
    if (isMatched && mode === 'video' && !user.isPremium) {
      setShowTimer(true);

      const interval = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev <= 1) {
            clearInterval(interval);
            setShowPremiumModal(true);
            setShowTimer(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      setCountdownInterval(interval);

      return () => clearInterval(interval);
    }
  }, [isMatched, mode, user.isPremium]);

  const handleGoHome = async () => {
    if (isNavigating) return;
    setIsNavigating(true);

    try {
      await cleanup();
      navigate('/');
    } catch (error) {
      console.error('Error during navigation:', error);
    } finally {
      setIsNavigating(false);
    }
  };

  const handlePremiumModalClose = () => {
    setShowPremiumModal(false);
  };

  return (
    <div className="h-[calc(100vh-64px)]">
      {<>
        {mode === 'video' ? (
          <VideoChat mode={mode} />
        ) :
          (
            isMatched && matchDetails?.partnerId ? (
              <TextChat partnerId={matchDetails.partnerId} />
            ) : (
              isConnecting && <MatchWaiting onCancel={handleGoHome} />
            )
          )}

        {showTimer && (
          <TimerNotification
            timeRemaining={timeRemaining}
          />
        )}
      </>
      }

      {showPremiumModal && (
        <PremiumModal onClose={handlePremiumModalClose} />
      )}
    </div>
  );
};

export default Chat;