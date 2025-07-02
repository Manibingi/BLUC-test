import React, { useEffect, useRef, useState } from 'react';
import { useChat } from '../../context/ChatContext';
import { useAuth } from '../../context/AuthContext';
import { Video, Mic, SkipForward, VideoOff, MicOff, Flag } from 'lucide-react';
import { useNavigate } from "react-router-dom";
import TextChat from './TextChat';
import ReportModal from '../moderation/ReportModal';

const VideoChat = ({ mode }) => {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const streamInitializedRef = useRef(false);
  const cleanupRef = useRef(false);
  const localVideoStreamMobileRef = useRef(null);
  const connectionAttemptRef = useRef(0);
  const maxConnectionAttempts = 3;
  const retryTimeoutRef = useRef(null);

  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [connectionState, setConnectionState] = useState('new');
  const [iceConnectionState, setIceConnectionState] = useState('new');
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);

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
    isConnecting, 
    setIsConnecting, 
    isMatched, 
    matchDetails,
    peerConnection,
    setPeerConnection
  } = useChat();

  const { user, isPremium } = useAuth();
  const navigate = useNavigate();
  const [isCallActive, setIsCallActive] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);

  // Initialize local stream with better error handling
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
          localStream.getTracks().forEach(track => {
            track.stop();
            console.log(`[VideoChat] Stopped ${track.kind} track`);
          });
        }

        if (remoteStream) {
          remoteStream.getTracks().forEach(track => {
            track.stop();
            console.log(`[VideoChat] Stopped remote ${track.kind} track`);
          });
        }

        if (isMatched && matchDetails?.partnerId) {
          await endVideoCall();
          await disconnectFromMatch(mode);
        }
      } catch (error) {
        console.error('[VideoChat] Error during cleanup:', error);
      }
    };

    window.addEventListener('beforeunload', handleUnload);
    window.addEventListener('pagehide', handleUnload);

    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      window.removeEventListener('pagehide', handleUnload);
      if (!cleanupRef.current) {
        handleUnload();
      }
    };
  }, [localStream, remoteStream, isMatched, matchDetails, endVideoCall, disconnectFromMatch, mode]);

  // Monitor peer connection state
  useEffect(() => {
    if (peerConnection) {
      const handleConnectionStateChange = () => {
        const state = peerConnection.connectionState;
        console.log(`[VideoChat] Connection state changed to: ${state}`);
        setConnectionState(state);

        if (state === 'failed' || state === 'disconnected') {
          console.log('[VideoChat] Connection failed, attempting to restart');
          handleConnectionFailure();
        } else if (state === 'connected') {
          console.log('[VideoChat] Peer connection established successfully');
          connectionAttemptRef.current = 0;
        }
      };

      const handleIceConnectionStateChange = () => {
        const state = peerConnection.iceConnectionState;
        console.log(`[VideoChat] ICE connection state changed to: ${state}`);
        setIceConnectionState(state);

        if (state === 'failed') {
          console.log('[VideoChat] ICE connection failed, restarting ICE');
          if (peerConnection.connectionState !== 'closed') {
            peerConnection.restartIce();
          }
        }
      };

      const handleTrack = (event) => {
        console.log('[VideoChat] Received remote track:', event.track.kind);
        if (event.streams && event.streams[0]) {
          const stream = event.streams[0];
          console.log('[VideoChat] Setting remote stream with tracks:', stream.getTracks().map(t => t.kind));
          setRemoteStream(stream);
          setHasRemoteVideo(true);

          // Set stream to video elements
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = stream;
            remoteVideoRef.current.onloadedmetadata = () => {
              console.log('[VideoChat] Remote video metadata loaded');
              remoteVideoRef.current.play().catch(e => 
                console.error('[VideoChat] Remote video play failed:', e)
              );
            };
          }
        }
      };

      peerConnection.addEventListener('connectionstatechange', handleConnectionStateChange);
      peerConnection.addEventListener('iceconnectionstatechange', handleIceConnectionStateChange);
      peerConnection.addEventListener('track', handleTrack);

      return () => {
        peerConnection.removeEventListener('connectionstatechange', handleConnectionStateChange);
        peerConnection.removeEventListener('iceconnectionstatechange', handleIceConnectionStateChange);
        peerConnection.removeEventListener('track', handleTrack);
      };
    }
  }, [peerConnection]);

  // Handle video call initialization when matched
  useEffect(() => {
    if (localStream && matchDetails?.partnerId && !isCallActive && isMatched) {
      console.log("[VideoChat] Starting video call with partner:", matchDetails.partnerId);

      // Clear remote stream state
      setRemoteStream(null);
      setHasRemoteVideo(false);

      // Clear remote video element but don't interrupt local video
      if (remoteVideoRef.current) {
        const currentSrc = remoteVideoRef.current.srcObject;
        if (currentSrc && currentSrc !== localStream) {
          remoteVideoRef.current.srcObject = null;
        }
      }

      // Start the video call with a delay to ensure socket is ready
      const timer = setTimeout(() => {
        if (localStream && matchDetails?.partnerId && !isCallActive && isMatched) {
          startVideoCall(matchDetails.partnerId, localStream, remoteVideoRef.current);
          setIsCallActive(true);
        }
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [localStream, matchDetails, isMatched, isCallActive, startVideoCall]);

  // Reset call state when match changes
  useEffect(() => {
    if (!isMatched) {
      setIsCallActive(false);
      setConnectionState('new');
      setIceConnectionState('new');
      setRemoteStream(null);
      setHasRemoteVideo(false);
      connectionAttemptRef.current = 0;

      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = null;
      }

      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    }
  }, [isMatched]);

  const initLocalStream = async () => {
    try {
      console.log("[VideoChat] Requesting media permissions...");

      const constraints = {
        video: { 
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          frameRate: { ideal: 30, max: 60 },
          facingMode: 'user'
        }, 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log("[VideoChat] Local stream obtained successfully");
      console.log("[VideoChat] Stream tracks:", stream.getTracks().map(t => `${t.kind}: ${t.label}`));

      // Set local video streams with proper error handling
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.muted = true;
        localVideoRef.current.playsInline = true;
        localVideoRef.current.autoplay = true;

        localVideoRef.current.onloadedmetadata = () => {
          console.log("[VideoChat] Local video metadata loaded");
          localVideoRef.current.play().catch(e => 
            console.error("[VideoChat] Local video play failed:", e)
          );
        };
      }

      if (localVideoStreamMobileRef.current) {
        localVideoStreamMobileRef.current.srcObject = stream;
        localVideoStreamMobileRef.current.muted = true;
        localVideoStreamMobileRef.current.playsInline = true;
        localVideoStreamMobileRef.current.autoplay = true;

        localVideoStreamMobileRef.current.onloadedmetadata = () => {
          console.log("[VideoChat] Local mobile video metadata loaded");
          localVideoStreamMobileRef.current.play().catch(e => 
            console.error("[VideoChat] Local mobile video play failed:", e)
          );
        };
      }

      setLocalStream(stream);
      console.log("[VideoChat] Local stream set successfully");
    } catch (error) {
      console.error('[VideoChat] Error accessing media devices:', error);

      let errorMessage = 'Camera/microphone access is required for video chat.';
      if (error.name === 'NotAllowedError') {
        errorMessage = 'Please allow camera and microphone permissions and refresh the page.';
      } else if (error.name === 'NotFoundError') {
        errorMessage = 'No camera or microphone found. Please connect a device and try again.';
      } else if (error.name === 'NotReadableError') {
        errorMessage = 'Camera or microphone is already in use by another application.';
      }

      alert(errorMessage);
      navigate('/');
    }
  };

  const handleConnectionFailure = async () => {
    if (connectionAttemptRef.current >= maxConnectionAttempts) {
      console.log('[VideoChat] Max connection attempts reached, skipping to next');
      handleSkipMatch();
      return;
    }

    connectionAttemptRef.current++;
    console.log(`[VideoChat] Connection attempt ${connectionAttemptRef.current}/${maxConnectionAttempts}`);

    try {
      // Clear any existing retry timeout
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }

      // Wait before retrying
      retryTimeoutRef.current = setTimeout(async () => {
        if (localStream && matchDetails?.partnerId && isMatched) {
          console.log('[VideoChat] Retrying video call...');
          setIsCallActive(false);
          setRemoteStream(null);
          setHasRemoteVideo(false);

          // Clean up remote video
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = null;
          }

          // Restart the call
          setTimeout(() => {
            if (localStream && matchDetails?.partnerId && !isCallActive && isMatched) {
              startVideoCall(matchDetails.partnerId, localStream, remoteVideoRef.current);
              setIsCallActive(true);
            }
          }, 1000);
        }
      }, 2000);
    } catch (error) {
      console.error('[VideoChat] Error during connection retry:', error);
    }
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
    console.log("[VideoChat] Skipping to next match...");
    try {
      setIsCallActive(false);
      setConnectionState('new');
      setIceConnectionState('new');
      setRemoteStream(null);
      setHasRemoteVideo(false);
      connectionAttemptRef.current = 0;

      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }

      // Clear remote video but preserve local stream
      if (remoteVideoRef.current) {
        const currentSrc = remoteVideoRef.current.srcObject;
        if (currentSrc && currentSrc !== localStream) {
          remoteVideoRef.current.srcObject = null;
          console.log("[VideoChat] Remote video cleared, local stream preserved");
        }
      }

      await next(mode);
    } catch (error) {
      console.error('[VideoChat] Error during skip:', error);
    }
  };

  const selectGender = (gender) => {
    if (isPremium || (!trialUsed && trialTimer > 0)) {
      console.log("[VideoChat] Gender selected:", gender);
      setSelectedGender(gender);
    }
  };

  const getConnectionStatusText = () => {
    if (!isMatched) {
      return isConnecting ? "Finding someone to chat with..." : "Waiting for match...";
    }

    if (connectionState === 'connecting' || iceConnectionState === 'checking') {
      return "Connecting to video...";
    }

    if (connectionState === 'connected' && iceConnectionState === 'connected') {
      return hasRemoteVideo ? "Connected" : "Connected - Waiting for video...";
    }

    if (connectionState === 'failed' || iceConnectionState === 'failed') {
      return `Connection failed (attempt ${connectionAttemptRef.current}/${maxConnectionAttempts})`;
    }

    return "Establishing connection...";
  };

  const handleReportSubmit = async (reportData) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/reports/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          ...reportData,
          reportedUserId: matchDetails?.partnerUserId || reportData.reportedUserId,
          chatMode: 'video'
        })
      });

      if (response.ok) {
        alert('Report submitted successfully');
        setShowReportModal(false);
      } else {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to submit report');
      }
    } catch (error) {
      console.error('Error submitting report:', error);
      alert('Failed to submit report. Please try again.');
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
            {/* Connection Status Overlay */}
            {(!hasRemoteVideo || connectionState !== 'connected') && (
              <div className="absolute z-10 text-white text-center left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 px-4">
                <div className="text-lg mb-2">{getConnectionStatusText()}</div>
                {(connectionState === 'connecting' || iceConnectionState === 'checking' || isConnecting) && (
                  <div className="flex justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                  </div>
                )}
              </div>
            )}

            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              muted={false}
              preload="metadata"
              className={`w-full h-full object-cover max-w-full max-h-full ${!hasRemoteVideo ? 'opacity-0' : 'opacity-100'}`}
              onLoadedMetadata={() => {
                console.log("[VideoChat] Remote video metadata loaded");
                setHasRemoteVideo(true);
                if (remoteVideoRef.current && remoteVideoRef.current.paused) {
                  const playPromise = remoteVideoRef.current.play();
                  if (playPromise) {
                    playPromise.catch(e => 
                      console.error("[VideoChat] Remote video play failed:", e)
                    );
                  }
                }
              }}
              onError={(e) => {
                console.error("[VideoChat] Remote video error:", e);
                setHasRemoteVideo(false);
              }}
              onCanPlay={() => {
                console.log("[VideoChat] Remote video can play");
                setHasRemoteVideo(true);
                if (remoteVideoRef.current && remoteVideoRef.current.paused) {
                  remoteVideoRef.current.play().catch(e => 
                    console.error("[VideoChat] Remote video auto-play failed:", e)
                  );
                }
              }}
              onPlaying={() => {
                console.log("[VideoChat] Remote video is playing");
                setHasRemoteVideo(true);
              }}
              onPause={() => {
                console.log("[VideoChat] Remote video paused - attempting to resume");
                if (remoteVideoRef.current && remoteVideoRef.current.srcObject) {
                  setTimeout(() => {
                    if (remoteVideoRef.current && remoteVideoRef.current.paused) {
                      remoteVideoRef.current.play().catch(e => 
                        console.error("[VideoChat] Remote video resume failed:", e)
                      );
                    }
                  }, 100);
                }
              }}
              onWaiting={() => {
                console.log("[VideoChat] Remote video is waiting");
              }}
              onStalled={() => {
                console.log("[VideoChat] Remote video stalled");
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
                preload="metadata"
                onError={(e) => console.error("[VideoChat] Local mobile video error:", e)}
                onLoadedMetadata={() => {
                  console.log("[VideoChat] Local mobile video metadata loaded");
                  if (localVideoStreamMobileRef.current && localVideoStreamMobileRef.current.paused) {
                    localVideoStreamMobileRef.current.play().catch(e => 
                      console.error("[VideoChat] Local mobile video play failed:", e)
                    );
                  }
                }}
              />
              {!isVideoEnabled && (
                <div className="absolute inset-0 bg-gray-800 flex items-center justify-center">
                  <VideoOff size={16} className="text-white" />
                </div>
              )}
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
              preload="metadata"
              onError={(e) => console.error("[VideoChat] Local desktop video error:", e)}
              onLoadedMetadata={() => {
                console.log("[VideoChat] Local desktop video metadata loaded");
                if (localVideoRef.current && localVideoRef.current.paused) {
                  localVideoRef.current.play().catch(e => 
                    console.error("[VideoChat] Local desktop video play failed:", e)
                  );
                }
              }}
            />
            {!isVideoEnabled && (
              <div className="absolute inset-0 bg-gray-800 flex items-center justify-center">
                <VideoOff size={48} className="text-white" />
              </div>
            )}
          </div>

          {/* Controls - Mobile version */}
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
              className="bg-blue-600 hover:bg-blue-700 p-2 rounded-full text-white shadow-lg transition-colors"
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

          {/* Chat area */}
          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            {isMatched && matchDetails?.partnerId ? (
              <TextChat partnerId={matchDetails.partnerId} embedded={true} mode={mode} />
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-500 text-center px-4">
                <div>
                  <div className="text-lg mb-2">Waiting for a match to start chatting...</div>
                  {isConnecting && (
                    <div className="flex justify-center">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-500"></div>
                    </div>
                  )}
                </div>
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
              className="bg-blue-600 hover:bg-blue-700 p-3 rounded-full text-white transition-colors"
              onClick={handleSkipMatch}
              title="Skip to next person"
            >
              <SkipForward size={24} />
            </button>
            {matchDetails?.partnerId && (
              <button
                onClick={() => setShowReportModal(true)}
                className="bg-red-600 hover:bg-red-700 text-white p-3 rounded-full transition-colors"
                title="Report user"
              >
                <Flag size={24} />
              </button>
            )}
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
      <ReportModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        onSubmit={handleReportSubmit}
        reportedUserId={matchDetails?.partnerUserId}
      />
    </div>
  );
};

export default VideoChat;