import React, { createContext, useContext, useRef, useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';
import api from '../services/api';

const ChatContext = createContext();
export const useChat = () => useContext(ChatContext);

export const ChatProvider = ({ children }) => {
  const { user } = useAuth();
  const socketRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const pendingCandidatesRef = useRef([]);
  const isInitiatorRef = useRef(false);
  const connectionTimeoutRef = useRef(null);
  const isCleaningUpRef = useRef(false);
  const reconnectTimeoutRef = useRef(null);

  const [isConnecting, setIsConnecting] = useState(false);
  const [isMatched, setIsMatched] = useState(false);
  const [matchDetails, setMatchDetails] = useState(null);
  const [selectedGender, setSelectedGender] = useState("random");
  const [peerConnection, setPeerConnection] = useState(null);
  const [interest, setMyInterest] = useState(null);
  const [trialTimer, setTrialTimer] = useState(180);
  const [genderSelectionFrozen, setGenderSelectionFrozen] = useState(false);
  const [trialUsed, setTrialUsed] = useState(false);
  const [isPremium, setIsPremium] = useState(false);

  // Enhanced ICE servers configuration
  const iceServers = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },
      { urls: "stun:stun3.l.google.com:19302" },
      { urls: "stun:stun4.l.google.com:19302" },
      {
        urls: 'turn:relay1.expressturn.com:3480',
        username: '174672462322246224',
        credential: 'wPWy5/Q8xaF3LVOKZOdExrhnZ+4='
      },
      {
        urls: 'turn:relay1.expressturn.com:3480?transport=tcp',
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
      console.log("[ChatContext] Socket already connected, reusing");
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
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      maxReconnectionAttempts: 5,
      randomizationFactor: 0.5
    });

    socketRef.current = socketInstance;
    window.socket = socketInstance;

    // Socket event handlers
    socketInstance.on('connect', () => {
      console.log("[ChatContext] Socket connected:", socketInstance.id);
      const genderToSend = (user?.isPremium || (!trialUsed && trialTimer > 0)) ? selectedGender : "random";
      console.log("[ChatContext] Emitting user-details:", { gender, interest, name, mode, selectedGender: genderToSend });
      socketInstance.emit('user-details', { gender, interest, name, mode, selectedGender: genderToSend });
      setIsConnecting(true);
    });

    socketInstance.on('connect_error', (error) => {
      console.error("[ChatContext] Socket connection error:", error);
      setIsConnecting(false);
    });

    socketInstance.on('disconnect', (reason) => {
      console.log("[ChatContext] Socket disconnected:", reason);
      setIsConnecting(false);
      if (reason === 'io server disconnect') {
        // Server disconnected, try to reconnect
        socketInstance.connect();
      }
    });

    socketInstance.on('reconnect', (attemptNumber) => {
      console.log("[ChatContext] Socket reconnected after", attemptNumber, "attempts");
      if (user && mode) {
        const genderToSend = (user.isPremium || (!trialUsed && trialTimer > 0)) ? selectedGender : "random";
        socketInstance.emit('user-details', {
          gender: user.gender,
          interest: interest,
          name: user.fullName,
          mode,
          selectedGender: genderToSend
        });
        setIsConnecting(true);
      }
    });

    socketInstance.on('find other', async () => {
      console.log("[ChatContext] Received 'find other' event");
      if (isCleaningUpRef.current) return;
      
      await cleanupMatch();
      
      // Clear any existing reconnect timeout
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      
      reconnectTimeoutRef.current = setTimeout(() => {
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
      }, 1000);
    });

    socketInstance.on('match-found', async (data) => {
      console.log("[ChatContext] Match found:", data);
      if (data.matched && data.socketId) {
        await cleanupMatch();
        setIsMatched(true);
        setIsConnecting(false);
        setMatchDetails({ partnerId: data.socketId });
        console.log("[ChatContext] Match details set:", { partnerId: data.socketId });
      }
    });

    socketInstance.on('disconect', (message) => {
      console.log("[ChatContext] Partner disconnected:", message);
      cleanupMatch();
    });

    return socketInstance;
  };

  const createPeerConnection = () => {
    console.log("[ChatContext] Creating new peer connection");
    
    if (peerConnectionRef.current) {
      console.log("[ChatContext] Closing existing peer connection");
      peerConnectionRef.current.close();
    }

    const pc = new RTCPeerConnection(iceServers);
    peerConnectionRef.current = pc;
    setPeerConnection(pc);

    // Clear pending candidates
    pendingCandidatesRef.current = [];

    // Set up connection timeout
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
    }
    
    connectionTimeoutRef.current = setTimeout(() => {
      if (pc.connectionState !== 'connected') {
        console.log("[ChatContext] Connection timeout, closing peer connection");
        pc.close();
      }
    }, 30000); // 30 second timeout

    // Event handlers
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log("[ChatContext] Sending ICE candidate:", event.candidate.type);
        if (socketRef.current && matchDetails?.partnerId) {
          socketRef.current.emit("ice-candidate", event.candidate, matchDetails.partnerId);
        }
      } else {
        console.log("[ChatContext] All ICE candidates sent");
      }
    };

    pc.ontrack = (event) => {
      console.log("[ChatContext] Received remote track:", event.track.kind);
      console.log("[ChatContext] Remote streams:", event.streams.length);
      
      if (event.streams && event.streams[0]) {
        const remoteStream = event.streams[0];
        remoteStreamRef.current = remoteStream;
        console.log("[ChatContext] Remote stream tracks:", remoteStream.getTracks().map(t => t.kind));
        
        // Find remote video element and set stream
        const remoteVideo = document.querySelector('video[autoplay]:not([muted])');
        if (remoteVideo) {
          console.log("[ChatContext] Setting remote stream to video element");
          remoteVideo.srcObject = remoteStream;
          
          remoteVideo.onloadedmetadata = () => {
            console.log("[ChatContext] Remote video metadata loaded");
            remoteVideo.play().catch(e => {
              console.error("[ChatContext] Remote video play failed:", e);
            });
          };
        } else {
          console.warn("[ChatContext] Remote video element not found");
        }
      }
    };

    pc.onconnectionstatechange = () => {
      console.log("[ChatContext] Connection state:", pc.connectionState);
      
      if (pc.connectionState === 'connected') {
        console.log("[ChatContext] Peer connection established successfully");
        if (connectionTimeoutRef.current) {
          clearTimeout(connectionTimeoutRef.current);
        }
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        console.log("[ChatContext] Peer connection failed/disconnected");
        if (connectionTimeoutRef.current) {
          clearTimeout(connectionTimeoutRef.current);
        }
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log("[ChatContext] ICE connection state:", pc.iceConnectionState);
      
      if (pc.iceConnectionState === 'failed') {
        console.log("[ChatContext] ICE connection failed, restarting ICE");
        pc.restartIce();
      }
    };

    pc.onicegatheringstatechange = () => {
      console.log("[ChatContext] ICE gathering state:", pc.iceGatheringState);
    };

    pc.onsignalingstatechange = () => {
      console.log("[ChatContext] Signaling state:", pc.signalingState);
    };

    return pc;
  };

  const startVideoCall = async (partnerId, localStream, remoteVideoElement) => {
    if (!partnerId || !localStream) {
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
      // Create new peer connection
      const pc = createPeerConnection();

      // Add local stream tracks
      localStream.getTracks().forEach(track => {
        console.log("[ChatContext] Adding local track:", track.kind, track.label);
        pc.addTrack(track, localStream);
      });

      // Set up socket event handlers for this call
      setupVideoCallHandlers(socket, pc, partnerId);

      // Determine who initiates the call (lower socket ID initiates)
      const shouldInitiate = socket.id < partnerId;
      isInitiatorRef.current = shouldInitiate;
      
      console.log("[ChatContext] Should initiate call:", shouldInitiate, "My ID:", socket.id, "Partner ID:", partnerId);

      if (shouldInitiate) {
        // Create and send offer
        console.log("[ChatContext] Creating offer...");
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true
        });
        
        await pc.setLocalDescription(offer);
        console.log("[ChatContext] Local description set, sending offer");
        
        socket.emit("video-offer", offer, partnerId);
      }

    } catch (error) {
      console.error('[ChatContext] Error starting video call:', error);
      cleanupMatch();
    }
  };

  const setupVideoCallHandlers = (socket, pc, partnerId) => {
    // Remove existing listeners to prevent duplicates
    socket.off("video-offer");
    socket.off("video-answer");
    socket.off("ice-candidate");
    socket.off("end-video");

    // Handle video offer
    socket.on("video-offer", async (offer, fromSocketId) => {
      try {
        console.log("[ChatContext] Received video offer from:", fromSocketId);
        console.log("[ChatContext] Current signaling state:", pc.signalingState);

        if (pc.signalingState !== "stable") {
          console.log("[ChatContext] Not in stable state, performing rollback");
          await pc.setLocalDescription({ type: "rollback" });
        }

        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        console.log("[ChatContext] Remote description set from offer");

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        console.log("[ChatContext] Local description set, sending answer");

        socket.emit("video-answer", answer, fromSocketId);

        // Process pending ICE candidates
        await processPendingCandidates(pc);

      } catch (error) {
        console.error("[ChatContext] Error handling video offer:", error);
      }
    });

    // Handle video answer
    socket.on("video-answer", async (answer) => {
      try {
        console.log("[ChatContext] Received video answer");
        console.log("[ChatContext] Current signaling state:", pc.signalingState);

        if (pc.signalingState === "have-local-offer") {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
          console.log("[ChatContext] Remote description set from answer");

          // Process pending ICE candidates
          await processPendingCandidates(pc);
        } else {
          console.warn("[ChatContext] Received answer in wrong state:", pc.signalingState);
        }
      } catch (error) {
        console.error("[ChatContext] Error handling video answer:", error);
      }
    });

    // Handle ICE candidates
    socket.on("ice-candidate", async (candidate) => {
      try {
        console.log("[ChatContext] Received ICE candidate:", candidate.type);
        const iceCandidate = new RTCIceCandidate(candidate);
        
        if (pc.remoteDescription && pc.remoteDescription.type) {
          await pc.addIceCandidate(iceCandidate);
          console.log("[ChatContext] ICE candidate added successfully");
        } else {
          console.log("[ChatContext] Queuing ICE candidate (no remote description yet)");
          pendingCandidatesRef.current.push(iceCandidate);
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
  };

  const processPendingCandidates = async (pc) => {
    console.log("[ChatContext] Processing", pendingCandidatesRef.current.length, "pending ICE candidates");
    
    for (const candidate of pendingCandidatesRef.current) {
      try {
        await pc.addIceCandidate(candidate);
        console.log("[ChatContext] Added pending ICE candidate");
      } catch (error) {
        console.error("[ChatContext] Error adding pending ICE candidate:", error);
      }
    }
    
    pendingCandidatesRef.current = [];
  };

  const disconnectSocket = () => {
    console.log("[ChatContext] Disconnecting socket...");
    isCleaningUpRef.current = true;
    
    // Clear timeouts
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
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

    // Clear timeouts
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
    }

    // Clean up peer connection
    if (peerConnectionRef.current) {
      console.log("[ChatContext] Closing peer connection...");
      
      // Remove event listeners
      peerConnectionRef.current.onicecandidate = null;
      peerConnectionRef.current.ontrack = null;
      peerConnectionRef.current.onconnectionstatechange = null;
      peerConnectionRef.current.oniceconnectionstatechange = null;
      
      // Stop all tracks
      peerConnectionRef.current.getReceivers().forEach(receiver => {
        if (receiver.track) {
          receiver.track.stop();
        }
      });
      
      peerConnectionRef.current.getSenders().forEach(sender => {
        if (sender.track) {
          sender.track.stop();
        }
      });
      
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
      setPeerConnection(null);
    }

    // Clean up streams
    if (remoteStreamRef.current) {
      remoteStreamRef.current.getTracks().forEach(track => track.stop());
      remoteStreamRef.current = null;
    }

    // Clear pending candidates
    pendingCandidatesRef.current = [];
    isInitiatorRef.current = false;
    
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

  const next = (mode) => {
    console.log("[ChatContext] Skipping to next partner...");
    const socket = socketRef.current;
    if (socket && matchDetails) {
      console.log("[ChatContext] Emitting next with partnerId:", matchDetails.partnerId);
      socket.emit('next', matchDetails.partnerId, mode);
    }
  };

  const sendMessage = (message, partnerId) => {
    const socket = socketRef.current;
    if (socket && partnerId) {
      console.log("[ChatContext] Sending message to", partnerId, ":", message);
      socket.emit('send-message', message, partnerId);
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
      console.log("[ChatContext] Gender selected:", gender);
      setSelectedGender(gender);
    }
  };

  const value = {
    socket: socketRef.current,
    isConnecting,
    isMatched,
    matchDetails,
    selectedGender,
    peerConnection,
    setPeerConnection,
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
    isPremium
  };

  return (
    <ChatContext.Provider value={value}>
      {children}
    </ChatContext.Provider>
  );
};