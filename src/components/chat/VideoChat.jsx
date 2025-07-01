import React, { useEffect, useRef, useState } from 'react';
import { useChat } from '../../context/ChatContext';
import { useAuth } from '../../context/AuthContext';
import { Video, Mic, SkipForward, VideoOff, MicOff } from 'lucide-react';
import { useNavigate } from "react-router-dom";
import TextChat from './TextChat';

const VideoChat = ({ mode }) => {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const streamInitializedRef = useRef(false);
  const cleanupRef = useRef(false);
  const localVideoStreamMobileRef = useRef(null);
  const connectionTimeoutRef = useRef(null);
  const retryTimeoutRef = useRef(null);

  const [localStream, setLocalStream] = useState(null);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [retryCount, setRetryCount] = useState(0);
  const [isSkipping, setIsSkipping] = useState(false);
  
  const { 
    socket, 
    startVideoCall, 
    endVideoCall, 
    disconnectFromMatch, 
    next, 
    selectedGender, 
    setSelectedGender, 
    trialTimer, 
    trialUsed,
    cleanupVideoCall,
    resetConnection
  } = useChat();
  
  const { user, isPremium } = useAuth();
  const { isConnecting, setIsConnecting, isMatched, matchDetails } = useChat();
  const navigate = useNavigate();
  const [isCallActive, setIsCallActive] = useState(false);
  const [remoteStreamReceived, setRemoteStreamReceived] = useState(false);

  // Initialize local stream only once
  useEffect(() => {
    if (!streamInitializedRef.current) {
      initLocalStream();
      streamInitializedRef.current = true;
    }

    const handleUnload = async () => {
      if (cleanupRef.current) return;
      await performCleanup();
    };

    window.addEventListener('beforeunload', handleUnload);
    window.addEventListener('pagehide', handleUnload);

    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      window.removeEventListener('pagehide', handleUnload);
      performCleanup();
    };
  }, []);

  // Handle video call when matched with improved connection management
  useEffect(() => {
    if (localStream && matchDetails?.partnerId && !isCallActive && !isSkipping) {
      console.log("[VideoChat] Starting video call with partner:", matchDetails.partnerId);
      
      // Clear any existing timeouts
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
      }
      
      // Reset connection status
      setConnectionStatus('connecting');
      setRemoteStreamReceived(false);
      
      // Clean up any existing remote stream
      cleanupRemoteVideo();
      
      // Set connection timeout
      connectionTimeoutRef.current = setTimeout(() => {
        if (!remoteStreamReceived && retryCount < 3) {
          console.log("[VideoChat] Connection timeout, retrying...");
          handleConnectionRetry();
        } else if (retryCount >= 3) {
          console.log("[VideoChat] Max retries reached, skipping to next");
          handleSkipMatch();
        }
      }, 10000); // 10 second timeout
      
      // Start the video call
      const timer = setTimeout(() => {
        if (remoteVideoRef.current && localStream && matchDetails?.partnerId && !isSkipping) {
          console.log("[VideoChat] Calling startVideoCall");
          startVideoCall(matchDetails.partnerId, localStream, remoteVideoRef.current);
          setIsCallActive(true);
        }
      }, 1000);

      return () => {
        clearTimeout(timer);
        if (connectionTimeoutRef.current) {
          clearTimeout(connectionTimeoutRef.current);
        }
      };
    }
  }, [localStream, matchDetails, startVideoCall, isCallActive, isSkipping, retryCount]);

  // Monitor remote stream status
  useEffect(() => {
    const checkRemoteStream = () => {
      if (remoteVideoRef.current && remoteVideoRef.current.srcObject) {
        const stream = remoteVideoRef.current.srcObject;
        const videoTracks = stream.getVideoTracks();
        const audioTracks = stream.getAudioTracks();
        
        const hasActiveVideo = videoTracks.some(track => track.readyState === 'live');
        const hasActiveAudio = audioTracks.some(track => track.readyState === 'live');
        
        if ((hasActiveVideo || hasActiveAudio) && !remoteStreamReceived) {
          console.log("[VideoChat] Remote stream is now active");
          setRemoteStreamReceived(true);
          setConnectionStatus('connected');
          setRetryCount(0);
          
          // Clear connection timeout
          if (connectionTimeoutRef.current) {
            clearTimeout(connectionTimeoutRef.current);
            connectionTimeoutRef.current = null;
          }
        }
      }
    };

    const interval = setInterval(checkRemoteStream, 1000);
    return () => clearInterval(interval);
  }, [remoteStreamReceived]);

  // Reset states when match changes
  useEffect(() => {
    if (!isMatched) {
      setIsCallActive(false);
      setRemoteStreamReceived(false);
      setConnectionStatus('disconnected');
      setRetryCount(0);
      setIsSkipping(false);
      cleanupRemoteVideo();
    }
  }, [isMatched]);

  const initLocalStream = async () => {
    try {
      console.log("[VideoChat] Initializing local media stream...");
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          frameRate: { ideal: 30, max: 60 }
        }, 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100
        }
      });
      
      console.log("[VideoChat] Local stream obtained:", stream);
      
      // Set local video streams
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.muted = true;
        localVideoRef.current.playsInline = true;
        localVideoRef.current.autoplay = true;
        
        localVideoRef.current.onloadedmetadata = () => {
          localVideoRef.current.play().catch(e => {
            console.error("[VideoChat] Local video play failed:", e);
          });
        };
      }
      
      if (localVideoStreamMobileRef.current) {
        localVideoStreamMobileRef.current.srcObject = stream;
        localVideoStreamMobileRef.current.muted = true;
        localVideoStreamMobileRef.current.playsInline = true;
        localVideoStreamMobileRef.current.autoplay = true;
        
        localVideoStreamMobileRef.current.onloadedmetadata = () => {
          localVideoStreamMobileRef.current.play().catch(e => {
            console.error("[VideoChat] Local mobile video play failed:", e);
          });
        };
      }
      
      setLocalStream(stream);
      console.log("[VideoChat] Local stream set successfully");
    } catch (error) {
      console.error('[VideoChat] Error accessing media devices:', error);
      alert('Camera/microphone access is required for video chat. Please allow permissions and refresh the page.');
    }
  };

  const cleanupRemoteVideo = () => {
    if (remoteVideoRef.current) {
      if (remoteVideoRef.current.srcObject) {
        const tracks = remoteVideoRef.current.srcObject.getTracks();
        tracks.forEach(track => {
          track.stop();
          console.log("[VideoChat] Stopped remote track:", track.kind);
        });
      }
      remoteVideoRef.current.srcObject = null;
      console.log("[VideoChat] Remote video cleaned up");
    }
  };

  const performCleanup = async () => {
    if (cleanupRef.current) return;
    cleanupRef.current = true;

    console.log("[VideoChat] Performing cleanup...");

    // Clear all timeouts
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
    }
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
    }

    try {
      // Stop local stream
      if (localStream) {
        localStream.getTracks().forEach(track => {
          track.stop();
          console.log("[Cleanup] Stopped local track:", track.kind);
        });
      }

      // Clean up remote video
      cleanupRemoteVideo();

      // End video call and disconnect
      if (isMatched) {
        await endVideoCall();
        await disconnectFromMatch(mode);
      }
    } catch (error) {
      console.error('Error during cleanup:', error);
    }

    cleanupRef.current = false;
  };

  const handleConnectionRetry = async () => {
    if (retryCount >= 3) {
      console.log("[VideoChat] Max retries reached");
      return;
    }

    console.log("[VideoChat] Retrying connection...", retryCount + 1);
    setRetryCount(prev => prev + 1);
    setConnectionStatus('retrying');

    // Clean up current connection
    cleanupRemoteVideo();
    setIsCallActive(false);
    setRemoteStreamReceived(false);

    // Reset and retry after a short delay
    retryTimeoutRef.current = setTimeout(() => {
      if (matchDetails?.partnerId && localStream) {
        console.log("[VideoChat] Attempting reconnection...");
        startVideoCall(matchDetails.partnerId, localStream, remoteVideoRef.current);
        setIsCallActive(true);
      }
    }, 2000);
  };

  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoEnabled(videoTrack.enabled);
        console.log("[VideoChat] Video toggled:", videoTrack.enabled);
      }
    }
  };

  const toggleAudio = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioEnabled(audioTrack.enabled);
        console.log("[VideoChat] Audio toggled:", audioTrack.enabled);
      }
    }
  };

  const handleSkipMatch = async () => {
    if (isSkipping) {
      console.log("[VideoChat] Skip already in progress");
      return;
    }

    console.log("[VideoChat] Skipping to next match...");
    setIsSkipping(true);
    
    try {
      // Clear all timeouts
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }

      // Reset states
      setIsCallActive(false);
      setRemoteStreamReceived(false);
      setConnectionStatus('disconnected');
      setRetryCount(0);
      
      // Clean up remote video immediately
      cleanupRemoteVideo();
      
      // Use the chat context's next function
      await next(mode);
      
    } catch (error) {
      console.error('[VideoChat] Error during skip:', error);
    } finally {
      // Reset skipping state after a delay to prevent rapid clicks
      setTimeout(() => {
        setIsSkipping(false);
      }, 2000);
    }
  };

  const selectGender = (gender) => {
    if (isPremium || (!trialUsed && trialTimer > 0)) {
      console.log("[VideoChat] Gender selected:", gender);
      setSelectedGender(gender);
    }
  };

  const getConnectionStatusText = () => {
    switch (connectionStatus) {
      case 'connecting':
        return "Connecting to video...";
      case 'retrying':
        return `Retrying connection... (${retryCount}/3)`;
      case 'connected':
        return "Connected";
      default:
        return isConnecting ? "Finding someone to chat with..." : "Waiting for match...";
    }
  };

  const getConnectionStatusColor = () => {
    switch (connectionStatus) {
      case 'connecting':
      case 'retrying':
        return "text-yellow-400";
      case 'connected':
        return "text-green-400";
      default:
        return "text-white";
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
            {(!isMatched || !isCallActive || !remoteStreamReceived) && (
              <div className="absolute z-10 text-center px-4">
                <div className={`text-lg mb-2 ${getConnectionStatusColor()}`}>
                  {getConnectionStatusText()}
                </div>
                {connectionStatus === 'connecting' && (
                  <div className="flex justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                  </div>
                )}
                {connectionStatus === 'retrying' && (
                  <div className="text-sm text-gray-300">
                    Attempting to establish connection...
                  </div>
                )}
              </div>
            )}
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              muted={false}
              className="w-full h-full object-cover max-w-full max-h-full"
              onLoadedMetadata={() => {
                console.log("[VideoChat] Remote video metadata loaded");
                if (remoteVideoRef.current) {
                  remoteVideoRef.current.play().then(() => {
                    console.log("[VideoChat] Remote video playing successfully");
                    setRemoteStreamReceived(true);
                    setConnectionStatus('connected');
                  }).catch(e => {
                    console.error("[VideoChat] Remote video play failed:", e);
                  });
                }
              }}
              onLoadedData={() => {
                console.log("[VideoChat] Remote video data loaded");
                setRemoteStreamReceived(true);
                setConnectionStatus('connected');
              }}
              onCanPlay={() => {
                console.log("[VideoChat] Remote video can play");
                setRemoteStreamReceived(true);
                setConnectionStatus('connected');
              }}
              onError={(e) => {
                console.error("[VideoChat] Remote video error:", e);
                setRemoteStreamReceived(false);
                if (retryCount < 3) {
                  handleConnectionRetry();
                }
              }}
            />
            {/* Local Video Overlay for mobile/tablet */}
            <div className="absolute top-2 right-2 w-20 h-20 md:hidden border-2 border-white rounded-md overflow-hidden shadow-lg bg-gray-800">
              <video
                ref={localVideoStreamMobileRef}
                className="w-full h-full object-cover max-w-full max-h-full"
                autoPlay
                muted
                playsInline
                onError={(e) => console.error("[VideoChat] Local mobile video error:", e)}
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
              onError={(e) => console.error("[VideoChat] Local desktop video error:", e)}
            />
          </div>

          {/* Controls - Mobile version (inside video area) */}
          <div className="flex md:hidden justify-center gap-3 py-2">
            <button
              className={`${isVideoEnabled ? 'bg-blue-600 hover:bg-blue-700' : 'bg-red-600 hover:bg-red-700'} p-2 rounded-full text-white shadow-lg transition-colors`}
              onClick={toggleVideo}
              title={isVideoEnabled ? "Turn off camera" : "Turn on camera"}
            >
              {isVideoEnabled ? <Video size={20} /> : <VideoOff size={20} />}
            </button>
            <button
              className={`${isAudioEnabled ? 'bg-blue-600 hover:bg-blue-700' : 'bg-red-600 hover:bg-red-700'} p-2 rounded-full text-white shadow-lg transition-colors`}
              onClick={toggleAudio}
              title={isAudioEnabled ? "Mute microphone" : "Unmute microphone"}
            >
              {isAudioEnabled ? <Mic size={20} /> : <MicOff size={20} />}
            </button>
            <button
              className="bg-blue-600 hover:bg-blue-700 p-2 rounded-full text-white shadow-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleSkipMatch}
              disabled={isSkipping}
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
              <TextChat partnerId={matchDetails.partnerId} embedded={true} mode={mode} />
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
              className={`${isVideoEnabled ? 'bg-blue-600 hover:bg-blue-700' : 'bg-red-600 hover:bg-red-700'} p-3 rounded-full text-white transition-colors`}
              onClick={toggleVideo}
              title={isVideoEnabled ? "Turn off camera" : "Turn on camera"}
            >
              {isVideoEnabled ? <Video size={24} /> : <VideoOff size={24} />}
            </button>
            <button
              className={`${isAudioEnabled ? 'bg-blue-600 hover:bg-blue-700' : 'bg-red-600 hover:bg-red-700'} p-3 rounded-full text-white transition-colors`}
              onClick={toggleAudio}
              title={isAudioEnabled ? "Mute microphone" : "Unmute microphone"}
            >
              {isAudioEnabled ? <Mic size={24} /> : <MicOff size={24} />}
            </button>
            <button
              className="bg-blue-600 hover:bg-blue-700 p-3 rounded-full text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleSkipMatch}
              disabled={isSkipping}
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
                className={`px-3 py-1 text-sm rounded-md transition-colors ${!isPremium && (trialUsed || trialTimer === 0)
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
                className={`px-3 py-1 text-sm rounded-md transition-colors ${!isPremium && (trialUsed || trialTimer === 0)
                  ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                  : selectedGender === 'male'
                    ? "bg-blue-100 text-blue-700"
                    : "bg-white text-gray-700 hover:bg-gray-100"
                  } border border-gray-300`}
              >
                Male
              </button>
              <button
                onClick={() => selectGender('random')}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${selectedGender === 'random'
                  ? "bg-blue-100 text-blue-700"
                  : "bg-white text-gray-700 hover:bg-gray-100"
                  } border border-gray-300`}
              >
                Random
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