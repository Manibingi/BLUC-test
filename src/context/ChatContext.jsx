import React, { createContext, useContext, useRef, useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';
import api from '../services/api';

const ChatContext = createContext();
export const useChat = () => useContext(ChatContext);

export const ChatProvider = ({ children }) => {
  const { user } = useAuth();
  const socketRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMatched, setIsMatched] = useState(false);
  const [matchDetails, setMatchDetails] = useState(null);
  const [selectedGender, setSelectedGender] = useState("random");
  const [peerConnection, setPeerConnection] = useState(null);
  const callStartedRef = useRef(false);
  const pendingCandidates = useRef([]);
  const [interest, setMyInterest] = useState(null);
  const [trialTimer, setTrialTimer] = useState(180);
  const [genderSelectionFrozen, setGenderSelectionFrozen] = useState(false);
  const [trialUsed, setTrialUsed] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const isCleaningUpRef = useRef(false);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const connectionTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 3;

  const iceServers = {
    iceServers: [
      { urls: ["stun:stun.l.google.com:19302"] },
      { urls: ["stun:stun1.l.google.com:19302"] },
      { urls: ["stun:stun2.l.google.com:19302"] },
      { urls: ["stun:stun3.l.google.com:19302"] },
      { urls: ["stun:stun4.l.google.com:19302"] },
      {
        urls: ['turn:relay1.expressturn.com:3480'],
        username: '174672462322246224',
        credential: 'wPWy5/Q8xaF3LVOKZOdExrhnZ+4='
      },
      {
        urls: ['turn:relay1.expressturn.com:3481'],
        username: '174672462322246224',
        credential: 'wPWy5/Q8xaF3LVOKZOdExrhnZ+4='
      }
    ],
    iceCandidatePoolSize: 10
  };

  useEffect(() => {
    if (user) {
      setIsPremium(user.isPremium || false);
      setTrialUsed(user.trialUsed || false);
    }
  }, [user]);

  useEffect(() => {
    let timerInterval;
    if (user && !user.isPremium && isMatched && !trialUsed) {
      timerInterval = setInterval(() => {
        setTrialTimer(prev => {
          if (prev <= 1) {
            clearInterval(timerInterval);
            setGenderSelectionFrozen(true);
            setTrialUsed(true);
            if (user) {
              api.user.updateProfile({ trialUsed: true }).catch(console.error);
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timerInterval) clearInterval(timerInterval);
    };
  }, [user, isMatched, trialUsed]);

  const initializeSocket = (gender, interest, name, mode) => {
    if (socketRef.current?.connected) {
      console.log("[ChatContext] Already connected, reusing existing connection");
      return socketRef.current;
    }

    console.log("[ChatContext] Initializing new socket connection...");
    const socketInstance = io(import.meta.env.VITE_BACKEND_URL, {
      transports: ['websocket'],
      withCredentials: true,
      forceNew: true,
      timeout: 20000,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });

    socketRef.current = socketInstance;
    window.socket = socketInstance;

    socketInstance.on('connect', () => {
      console.log("[ChatContext] Connected with ID:", socketInstance.id);
      const genderToSend = (user?.isPremium || (!trialUsed && trialTimer > 0)) ? selectedGender : "random";
      console.log("[ChatContext] Emitting user-details:", { gender, interest, name, mode, selectedGender: genderToSend });
      socketInstance.emit('user-details', { gender, interest, name, mode, selectedGender: genderToSend });
      setIsConnecting(true);
      reconnectAttemptsRef.current = 0; // Reset reconnect attempts on successful connection
    });

    socketInstance.on('connect_error', (error) => {
      console.error("[ChatContext] Connection error:", error);
      setIsConnecting(false);
    });

    socketInstance.on('disconnect', (reason) => {
      console.log("[ChatContext] Disconnected:", reason);
      setIsConnecting(false);
      cleanupMatch();
    });

    socketInstance.on('find other', async () => {
      console.log("[ChatContext] Received 'find other' event");
      if (isCleaningUpRef.current) return;
      
      await cleanupMatch();
      
      setTimeout(() => {
        if (socketInstance.connected && user) {
          setIsConnecting(true);
          const genderToSend = (user.isPremium || (!trialUsed && trialTimer > 0)) ? selectedGender : "random";
          console.log("[ChatContext] Re-emitting user-details after find other");
          socketInstance.emit('user-details', {
            gender: user.gender,
            interest: interest,
            name: user.fullName,
            mode,
            selectedGender: genderToSend
          });
        }
      }, 500);
    });

    socketInstance.on('match-found', async (data) => {
      console.log("[ChatContext] Match found:", data);
      if (data.matched && data.socketId) {
        await cleanupMatch();
        setIsMatched(true);
        setIsConnecting(false);
        setMatchDetails({ partnerId: data.socketId });
        console.log("[ChatContext] Set match details:", { partnerId: data.socketId });
      }
    });

    socketInstance.on('disconect', (message) => {
      console.log("[ChatContext] Partner disconnected:", message);
      cleanupMatch();
    });

    return socketInstance;
  };

  const disconnectSocket = () => {
    console.log("[ChatContext] Disconnecting...");
    isCleaningUpRef.current = true;
    
    // Clear any pending timeouts
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
    }
    
    if (socketRef.current) {
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
      socketRef.current = null;
      window.socket = null;
    }
    
    cleanupMatch();
    isCleaningUpRef.current = false;
  };

  const cleanupMatch = async () => {
    if (isCleaningUpRef.current) return;
    isCleaningUpRef.current = true;
    
    console.log("[ChatContext] Cleaning up match and peer connection...");
    
    setIsMatched(false);
    setMatchDetails(null);

    // Clear connection timeout
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }

    // Clean up peer connection
    if (peerConnection) {
      console.log("[ChatContext] Closing peer connection...");
      
      try {
        // Remove all event listeners
        peerConnection.onicecandidate = null;
        peerConnection.ontrack = null;
        peerConnection.onconnectionstatechange = null;
        peerConnection.oniceconnectionstatechange = null;
        peerConnection.onsignalingstatechange = null;
        
        // Stop all tracks
        peerConnection.getReceivers().forEach(receiver => {
          if (receiver.track) {
            receiver.track.stop();
            console.log("[ChatContext] Stopped receiver track:", receiver.track.kind);
          }
        });
        
        peerConnection.getSenders().forEach(sender => {
          if (sender.track) {
            sender.track.stop();
            console.log("[ChatContext] Stopped sender track:", sender.track.kind);
          }
        });
        
        peerConnection.close();
      } catch (error) {
        console.error("[ChatContext] Error during peer connection cleanup:", error);
      }
      
      setPeerConnection(null);
    }

    // Clean up remote stream reference
    if (remoteStreamRef.current) {
      remoteStreamRef.current.getTracks().forEach(track => {
        track.stop();
        console.log("[ChatContext] Stopped remote stream track:", track.kind);
      });
      remoteStreamRef.current = null;
    }

    callStartedRef.current = false;
    pendingCandidates.current = [];
    
    // Remove socket event listeners for video calls
    const socket = socketRef.current;
    if (socket) {
      socket.off("video-offer");
      socket.off("video-answer");
      socket.off("ice-candidate");
      socket.off("end-video");
    }
    
    isCleaningUpRef.current = false;
  };

  const disconnectFromMatch = (mode) => {
    const socket = socketRef.current;
    if (socket && matchDetails) {
      console.log("[ChatContext] Disconnecting from partner:", matchDetails.partnerId);
      socket.emit('disconnect-chat', matchDetails.partnerId, mode);
      cleanupMatch();
    }
  };

  const next = async (mode) => {
    console.log("[ChatContext] Skipping to next partner...");
    const socket = socketRef.current;
    if (socket && matchDetails) {
      console.log("[ChatContext] Emitting next with partnerId:", matchDetails.partnerId);
      
      // Clean up current connection first
      await cleanupMatch();
      
      // Emit next event
      socket.emit('next', matchDetails.partnerId, mode);
      
      // Reset connection state
      setIsConnecting(true);
    } else if (socket) {
      // If no current match, just try to find a new one
      console.log("[ChatContext] No current match, finding new partner");
      setIsConnecting(true);
      const genderToSend = (user?.isPremium || (!trialUsed && trialTimer > 0)) ? selectedGender : "random";
      socket.emit('user-details', {
        gender: user?.gender,
        interest: interest,
        name: user?.fullName,
        mode,
        selectedGender: genderToSend
      });
    }
  };

  const sendMessage = (message, partnerId) => {
    const socket = socketRef.current;
    if (socket && partnerId) {
      console.log("[ChatContext] Sending message to", partnerId, ":", message);
      socket.emit('send-message', message, partnerId);
    }
  };

  const startVideoCall = async (partnerId, localStream, remoteVideoElement) => {
    if (!partnerId || !localStream || !remoteVideoElement) {
      console.error("[ChatContext] Missing required parameters for video call");
      return;
    }

    const socket = socketRef.current;
    if (!socket || !socket.connected) {
      console.error("[ChatContext] Socket not connected");
      return;
    }

    console.log("[ChatContext] Starting video call with partner:", partnerId);
    localStreamRef.current = localStream;

    try {
      // Clean up existing connection
      if (peerConnection) {
        console.log("[ChatContext] Cleaning up existing peer connection");
        peerConnection.close();
        setPeerConnection(null);
      }

      // Create new peer connection with better configuration
      const pc = new RTCPeerConnection(iceServers);
      setPeerConnection(pc);

      // Set connection timeout
      connectionTimeoutRef.current = setTimeout(() => {
        if (pc.connectionState !== 'connected' && reconnectAttemptsRef.current < maxReconnectAttempts) {
          console.log("[ChatContext] Connection timeout, attempting reconnect");
          reconnectAttemptsRef.current++;
          startVideoCall(partnerId, localStream, remoteVideoElement);
        }
      }, 15000);

      // Add local stream tracks with better error handling
      localStream.getTracks().forEach(track => {
        console.log("[ChatContext] Adding local track:", track.kind, track.readyState);
        try {
          const sender = pc.addTrack(track, localStream);
          console.log("[ChatContext] Track added successfully:", sender);
        } catch (error) {
          console.error("[ChatContext] Error adding track:", error);
        }
      });

      // Handle ICE candidates with better error handling
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log("[ChatContext] Sending ICE candidate:", event.candidate.type);
          socket.emit("ice-candidate", event.candidate, partnerId);
        } else {
          console.log("[ChatContext] All ICE candidates sent");
        }
      };

      // Handle remote stream with improved logic
      pc.ontrack = (event) => {
        console.log("[ChatContext] Received remote track:", event.track.kind, event.track.readyState);
        console.log("[ChatContext] Remote streams count:", event.streams.length);
        
        if (event.streams && event.streams[0]) {
          const remoteStream = event.streams[0];
          remoteStreamRef.current = remoteStream;
          
          console.log("[ChatContext] Setting remote stream to video element");
          console.log("[ChatContext] Remote stream tracks:", remoteStream.getTracks().map(t => `${t.kind}: ${t.readyState}`));
          
          // Clear connection timeout on successful stream
          if (connectionTimeoutRef.current) {
            clearTimeout(connectionTimeoutRef.current);
            connectionTimeoutRef.current = null;
          }
          
          // Ensure video element is ready and set stream
          if (remoteVideoElement) {
            remoteVideoElement.srcObject = remoteStream;
            
            // Force video to load and play
            remoteVideoElement.onloadedmetadata = () => {
              console.log("[ChatContext] Remote video metadata loaded, attempting to play");
              remoteVideoElement.play().then(() => {
                console.log("[ChatContext] Remote video playing successfully");
              }).catch(e => {
                console.error("[ChatContext] Remote video play failed:", e);
                // Try to play again after a short delay
                setTimeout(() => {
                  remoteVideoElement.play().catch(console.error);
                }, 1000);
              });
            };

            // Additional event listeners for debugging
            remoteVideoElement.oncanplay = () => {
              console.log("[ChatContext] Remote video can play");
            };

            remoteVideoElement.onplaying = () => {
              console.log("[ChatContext] Remote video is playing");
            };

            remoteVideoElement.onerror = (e) => {
              console.error("[ChatContext] Remote video error:", e);
            };
          }
        }
      };

      // Monitor connection state with detailed logging
      pc.onconnectionstatechange = () => {
        console.log("[ChatContext] Connection state:", pc.connectionState);
        if (pc.connectionState === 'connected') {
          console.log("[ChatContext] Peer connection established successfully");
          reconnectAttemptsRef.current = 0; // Reset on successful connection
          if (connectionTimeoutRef.current) {
            clearTimeout(connectionTimeoutRef.current);
            connectionTimeoutRef.current = null;
          }
        } else if (pc.connectionState === 'failed') {
          console.log("[ChatContext] Connection failed");
          if (reconnectAttemptsRef.current < maxReconnectAttempts) {
            console.log("[ChatContext] Attempting to reconnect...");
            reconnectAttemptsRef.current++;
            setTimeout(() => {
              startVideoCall(partnerId, localStream, remoteVideoElement);
            }, 2000);
          } else {
            console.log("[ChatContext] Max reconnection attempts reached, cleaning up");
            cleanupMatch();
          }
        } else if (pc.connectionState === 'disconnected') {
          console.log("[ChatContext] Connection disconnected");
          // Don't immediately cleanup on disconnect, wait for reconnection
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log("[ChatContext] ICE connection state:", pc.iceConnectionState);
        if (pc.iceConnectionState === 'failed' && reconnectAttemptsRef.current < maxReconnectAttempts) {
          console.log("[ChatContext] ICE connection failed, attempting restart");
          pc.restartIce();
        }
      };

      pc.onsignalingstatechange = () => {
        console.log("[ChatContext] Signaling state:", pc.signalingState);
      };

      // Remove existing listeners to prevent duplicates
      socket.off("video-offer");
      socket.off("video-answer");
      socket.off("ice-candidate");
      socket.off("end-video");

      // Handle video offer with improved error handling
      socket.on("video-offer", async (offer, fromSocketId) => {
        try {
          console.log("[ChatContext] Received video offer from:", fromSocketId);
          console.log("[ChatContext] Current signaling state:", pc.signalingState);

          if (pc.signalingState !== "stable") {
            console.log("[ChatContext] Not in stable state, performing rollback");
            await pc.setLocalDescription({ type: "rollback" });
          }

          await pc.setRemoteDescription(new RTCSessionDescription(offer));
          console.log("[ChatContext] Set remote description successfully");

          const answer = await pc.createAnswer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
          });
          
          await pc.setLocalDescription(answer);
          console.log("[ChatContext] Created and set local answer");

          socket.emit("video-answer", answer, fromSocketId);
          console.log("[ChatContext] Sent video answer");

          // Process pending ICE candidates
          for (const candidate of pendingCandidates.current) {
            try {
              await pc.addIceCandidate(candidate);
              console.log("[ChatContext] Added pending candidate");
            } catch (e) {
              console.error("[ChatContext] Error adding pending candidate:", e);
            }
          }
          pendingCandidates.current = [];

        } catch (error) {
          console.error("[ChatContext] Error handling video offer:", error);
        }
      });

      // Handle video answer with improved error handling
      socket.on("video-answer", async (answer) => {
        try {
          console.log("[ChatContext] Received video answer");
          console.log("[ChatContext] Current signaling state:", pc.signalingState);

          if (pc.signalingState === "have-local-offer") {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
            console.log("[ChatContext] Set remote description from answer");

            // Process pending ICE candidates
            for (const candidate of pendingCandidates.current) {
              try {
                await pc.addIceCandidate(candidate);
                console.log("[ChatContext] Added pending candidate after answer");
              } catch (e) {
                console.error("[ChatContext] Error adding pending candidate:", e);
              }
            }
            pendingCandidates.current = [];
          }
        } catch (error) {
          console.error("[ChatContext] Error handling video answer:", error);
        }
      });

      // Handle ICE candidates with improved error handling
      socket.on("ice-candidate", async (candidate) => {
        try {
          console.log("[ChatContext] Received ICE candidate:", candidate.type);
          const iceCandidate = new RTCIceCandidate(candidate);
          
          if (pc.remoteDescription && pc.remoteDescription.type) {
            await pc.addIceCandidate(iceCandidate);
            console.log("[ChatContext] Added ICE candidate successfully");
          } else {
            console.log("[ChatContext] Queuing ICE candidate (no remote description yet)");
            pendingCandidates.current.push(iceCandidate);
          }
        } catch (error) {
          console.error("[ChatContext] Error adding ICE candidate:", error);
        }
      });

      // Handle call end
      socket.on("end-video", () => {
        console.log("[ChatContext] Received end-video signal");
        cleanupMatch();
      });

      // Create and send offer with better configuration
      console.log("[ChatContext] Creating offer...");
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
        iceRestart: false
      });
      
      await pc.setLocalDescription(offer);
      console.log("[ChatContext] Set local description, sending offer");
      
      socket.emit("video-offer", offer, partnerId);
      console.log("[ChatContext] Video offer sent to:", partnerId);

    } catch (error) {
      console.error('[ChatContext] Error starting video call:', error);
      cleanupMatch();
    }
  };

  const endVideoCall = () => {
    const socket = socketRef.current;
    if (socket && matchDetails) {
      console.log("[ChatContext] Ending video call with:", matchDetails.partnerId);
      socket.emit("end-call", matchDetails.partnerId);
    }
    cleanupMatch();
  };

  const handleGenderSelection = (gender) => {
    if (user?.isPremium || (!trialUsed && trialTimer > 0)) {
      console.log("[ChatContext] Selected:", gender);
      setSelectedGender(gender);
    }
  };

  const resetConnection = () => {
    reconnectAttemptsRef.current = 0;
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }
  };

  const cleanupVideoCall = () => {
    cleanupMatch();
  };

  const value = {
    socket: socketRef.current,
    isConnecting,
    isMatched,
    matchDetails,
    selectedGender,
    initializeSocket,
    interest,
    disconnectSocket,
    disconnectFromMatch,
    next,
    setSelectedGender: handleGenderSelection,
    setIsConnecting,
    sendMessage,
    startVideoCall,
    setMyInterest,
    endVideoCall,
    trialTimer,
    trialUsed,
    genderSelectionFrozen,
    isPremium,
    cleanupVideoCall,
    resetConnection
  };

  return (
    <ChatContext.Provider value={value}>
      {children}
    </ChatContext.Provider>
  );
};