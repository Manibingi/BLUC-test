// VideoChat.jsx

import React, { useEffect, useRef, useState } from 'react';
import { useChat } from '../../context/ChatContext';
import { useAuth } from '../../context/AuthContext';
import { Video, Mic, SkipForward } from 'lucide-react';
import { useNavigate } from "react-router-dom";
import TextChat from './TextChat';

const VideoChat = ({ mode }) => {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const streamInitializedRef = useRef(false);
  const cleanupRef = useRef(false);
  const localVideoStreamMobileRef = useRef(null);

  const [localStream, setLocalStream] = useState(null);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [genderSelectionFrozen, setGenderSelectionFrozen] = useState(false);
  const [onlineCount, setOnlineCount] = useState(33642);
  const { socket, startVideoCall, endVideoCall, disconnectFromMatch, next, selectedGender, setSelectedGender, trialTimer, trialUsed } = useChat();
  const { user, isPremium } = useAuth();
  const { isConnecting, setIsConnecting, isMatched, matchDetails } = useChat();
  const navigate = useNavigate();
  const [isCallActive, setIsCallActive] = useState(false);

  // Initialize local stream only once

  useEffect(() => {
    if (!streamInitializedRef.current) {
      initLocalStream();
      streamInitializedRef.current = true;
    }

    const handleUnload = async () => {
      if (cleanupRef.current) return;
      cleanupRef.current = true;

      try {
        if (localStream) {
          localStream.getTracks().forEach(track => track.stop());
        }

        if (isMatched) {
          await endVideoCall();
          await disconnectFromMatch();
        }
      } catch (error) {
        console.error('Error during cleanup:', error);
      }
    };

    window.addEventListener('beforeunload', handleUnload);

    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      handleUnload();
    };
  }, [isMatched, localStream]);

  // Handle video call when matched
  useEffect(() => {
    if (localStream && matchDetails?.partnerId && !isCallActive) {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = null;
      }
      console.log("starting video call");
      startVideoCall(matchDetails.partnerId, localStream, remoteVideoRef.current);
      setIsCallActive(true);
    }
  }, [localStream, matchDetails, startVideoCall]);

  // useEffect(() => {
  //   if (localStream && matchDetails?.partnerId && !isCallActive) {
  //     // Add a small delay to ensure DOM is ready
  //     const timer = setTimeout(() => {
  //       if (remoteVideoRef.current) {
  //         remoteVideoRef.current.srcObject = null;
  //         console.log("starting video call");
  //         startVideoCall(matchDetails.partnerId, localStream, remoteVideoRef.current);
  //         setIsCallActive(true);
  //       }
  //     }, 100);

  //     return () => clearTimeout(timer);
  //   }
  // }, [localStream, matchDetails, startVideoCall, isCallActive]);

  const initLocalStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoStreamMobileRef.current.srcObject = stream;
      }
      setLocalStream(stream);
    } catch (error) {
      console.error('Error accessing media devices:', error);
    }
  };

  useEffect(() => {
    handleSkipMatch();
  }, [selectedGender]);

  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        // console.log("toggling video",videoTrack);
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoEnabled(videoTrack.enabled);
      }
    }
  };

  const toggleAudio = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioEnabled(audioTrack.enabled);
      }
    }
  };

  useEffect(() => {
    console.log("local stream", localStream);
    console.log("local video ref", localVideoRef.current.srcObject);
  }, [localStream]);

  const handleSkipMatch = async () => {
    console.log("1 .At start of handleSkipMatch");
    try {
      setIsCallActive(false);
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = null;
      }
      await next(mode);
    } catch (error) {
      console.error('Error during skip:', error);
    }
  };

  // REPLACE with:
  // const handleSkipMatch = async () => {
  //   console.log("1 .At start of handleSkipMatch");
  //   try {
  //     setIsCallActive(false);

  //     // Clean up remote video immediately
  //     if (remoteVideoRef.current) {
  //       if (remoteVideoRef.current.srcObject) {
  //         remoteVideoRef.current.srcObject.getTracks().forEach(track => track.stop());
  //       }
  //       remoteVideoRef.current.srcObject = null;
  //     }

  //     await next(mode);
  //   } catch (error) {
  //     console.error('Error during skip:', error);
  //   }
  // };

  const selectGender = (gender) => {
    if (isPremium || (!trialUsed && trialTimer > 0)) {
      setSelectedGender(gender);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 overflow-hidden">
      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden flex-col md:flex-row min-h-0">
        {/* Video area - 50% height on mobile, 2/5 width on desktop */}
        <div className="w-full h-1/2 md:w-2/5 md:h-full relative flex flex-col gap-2 p-2 overflow-hidden flex-shrink-0">
          {/* Remote Video */}
          <div className="flex-1 bg-black flex items-center justify-center relative rounded-md overflow-hidden min-h-0 max-h-full">
            {(!isMatched || !isCallActive) && (
              <div className="absolute z-10 text-white text-lg left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center px-4">
                {isConnecting ? "Finding someone to chat with..." : "Waiting for match..."}
              </div>
            )}
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              muted={false}
              className="w-full h-full object-cover max-w-full max-h-full"
            />
            {/* Local Video Overlay for mobile/tablet */}
            <div className="absolute top-2 right-2 w-20 h-20 md:hidden border-2 border-white rounded-md overflow-hidden shadow-lg bg-gray-800">
              <video
                ref={localVideoStreamMobileRef}
                className="w-full h-full object-cover max-w-full max-h-full"
                autoPlay
                muted
                playsInline
              />
            </div>
          </div>

          {/* Local Video for desktop only */}
          <div className="hidden md:flex flex-1 bg-gray-800 items-center justify-center relative rounded-md overflow-hidden min-h-0 max-h-full">
            <video
              ref={localVideoRef}
              className="w-full h-full object-cover max-w-full max-h-full"
              autoPlay
              muted
              playsInline
            />
          </div>

          {/* Controls - Mobile version (inside video area) */}
          <div className="flex md:hidden justify-center gap-3 py-2">
            <button
              className={`${isVideoEnabled ? 'bg-blue-600 hover:bg-blue-700' : 'bg-red-600 hover:bg-red-700'} p-2 rounded-full text-white shadow-lg`}
              onClick={toggleVideo}
              title={isVideoEnabled ? "Turn off camera" : "Turn on camera"}
            >
              <Video size={20} />
            </button>
            <button
              className={`${isAudioEnabled ? 'bg-blue-600 hover:bg-blue-700' : 'bg-red-600 hover:bg-red-700'} p-2 rounded-full text-white shadow-lg`}
              onClick={toggleAudio}
              title={isAudioEnabled ? "Mute microphone" : "Unmute microphone"}
            >
              <Mic size={20} />
            </button>
            <button
              className="bg-blue-600 hover:bg-blue-700 p-2 rounded-full text-white shadow-lg"
              onClick={handleSkipMatch}
              title="Skip to next person"
            >
              <SkipForward size={20} />
            </button>
          </div>
        </div>

        {/* Chat area - 50% height on mobile, 3/5 width on desktop */}
        <div className="w-full h-1/2 md:w-3/5 md:h-full flex flex-col border-t md:border-t-0 md:border-l border-gray-200 overflow-hidden min-h-0 flex-shrink-0">
          {/* Chat header */}
          <div className="flex-shrink-0 p-3 border-b border-gray-200 text-center text-gray-700 text-sm md:text-base">
            {isMatched ? "You're now chatting with a random stranger. Say hi!" : "Waiting for a match..."}
          </div>

          {/* Chat area - embedding the TextChat component */}
          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            {isMatched && matchDetails?.partnerId && (
              <TextChat partnerId={matchDetails.partnerId} embedded={true} />
            )}
            {!isMatched && (
              <div className="flex-1 flex items-center justify-center text-gray-500 text-center px-4">
                Waiting for a match to start chatting...
              </div>
            )}
          </div>

          {/* Controls - Desktop version */}
          <div className="hidden md:flex flex-shrink-0 justify-center gap-4 py-4 border-t border-gray-200 bg-white">
            <button
              className={`${isVideoEnabled ? 'bg-blue-600 hover:bg-blue-700' : 'bg-red-600 hover:bg-red-700'} p-3 rounded-full text-white`}
              onClick={toggleVideo}
              title={isVideoEnabled ? "Turn off camera" : "Turn on camera"}
            >
              <Video size={24} />
            </button>
            <button
              className={`${isAudioEnabled ? 'bg-blue-600 hover:bg-blue-700' : 'bg-red-600 hover:bg-red-700'} p-3 rounded-full text-white`}
              onClick={toggleAudio}
              title={isAudioEnabled ? "Mute microphone" : "Unmute microphone"}
            >
              <Mic size={24} />
            </button>
            <button
              className="bg-blue-600 hover:bg-blue-700 p-3 rounded-full text-white"
              onClick={handleSkipMatch}
              title="Skip to next person"
            >
              <SkipForward size={24} />
            </button>
          </div>

          {/* Gender Selection */}
          <div className="flex-shrink-0 p-2 flex flex-col md:flex-row justify-between items-center border-t border-gray-200 bg-white gap-2 md:gap-0">
            <div className="text-xs md:text-sm text-gray-500 text-center md:text-left">
              {!isPremium && !trialUsed && trialTimer > 0 && (
                <>Free trial: {trialTimer}s remaining</>
              )}
              {!isPremium && trialUsed && (
                <>Upgrade to Premium for gender selection</>
              )}
              {isPremium && (
                <>Premium gender selection active</>
              )}
            </div>
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => selectGender('female')}
                disabled={!isPremium && (trialUsed || trialTimer === 0)}
                className={`px-3 py-1 text-sm rounded-md ${!isPremium && (trialUsed || trialTimer === 0)
                  ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                  : selectedGender === 'female'
                    ? "bg-blue-100 text-blue-700"
                    : "bg-white text-gray-700 hover:bg-gray-100"
                  } border border-gray-300`}
              >
                Female
              </button>
              <button
                onClick={() => selectGender('male')}
                disabled={!isPremium && (trialUsed || trialTimer === 0)}
                className={`px-3 py-1 text-sm rounded-md ${!isPremium && (trialUsed || trialTimer === 0)
                  ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                  : selectedGender === 'male'
                    ? "bg-blue-100 text-blue-700"
                    : "bg-white text-gray-700 hover:bg-gray-100"
                  } border border-gray-300`}
              >
                Male
              </button>
              {isPremium && (
                <span className="ml-2 text-xs text-blue-500 font-medium">
                  Premium
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoChat;