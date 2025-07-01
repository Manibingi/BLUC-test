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

  const iceServers = {
    iceServers: [
      { urls: ["stun:stun.l.google.com:19302"] },
      { urls: ["stun:stun1.l.google.com:19302"] },
      {
        urls: ['turn:relay1.expressturn.com:3480'],
        username: '174672462322246224',
        credential: 'wPWy5/Q8xaF3LVOKZOdExrhnZ+4='
      }
    ]
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
      console.log("[Socket] Already connected, reusing existing connection");
      return socketRef.current;
    }

    console.log("[Socket] Initializing new socket connection...");
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
      console.log("[Socket] Connected with ID:", socketInstance.id);
      const genderToSend = (user?.isPremium || (!trialUsed && trialTimer > 0)) ? selectedGender : "random";
      console.log("[Socket] Emitting user-details:", { gender, interest, name, mode, selectedGender: genderToSend });
      socketInstance.emit('user-details', { gender, interest, name, mode, selectedGender: genderToSend });
      setIsConnecting(true);
    });

    socketInstance.on('connect_error', (error) => {
      console.error("[Socket] Connection error:", error);
      setIsConnecting(false);
    });

    socketInstance.on('disconnect', (reason) => {
      console.log("[Socket] Disconnected:", reason);
      setIsConnecting(false);
      cleanupMatch();
    });

    socketInstance.on('find other', async () => {
      console.log("[Socket] Received 'find other' event");
      if (isCleaningUpRef.current) return;
      
      await cleanupMatch();
      
      setTimeout(() => {
        if (socketInstance.connected && user) {
          setIsConnecting(true);
          const genderToSend = (user.isPremium || (!trialUsed && trialTimer > 0)) ? selectedGender : "random";
          console.log("[Socket] Re-emitting user-details after find other");
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
      console.log("[Socket] Match found:", data);
      if (data.matched && data.socketId) {
        await cleanupMatch();
        setIsMatched(true);
        setIsConnecting(false);
        setMatchDetails({ partnerId: data.socketId });
        console.log("[Match] Set match details:", { partnerId: data.socketId });
      }
    });

    socketInstance.on('disconect', (message) => {
      console.log("[Socket] Partner disconnected:", message);
      cleanupMatch();
    });

    return socketInstance;
  };

  const disconnectSocket = () => {
    console.log("[Socket] Disconnecting...");
    isCleaningUpRef.current = true;
    
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
    
    console.log("[Call] Cleaning up match and peer connection...");
    
    setIsMatched(false);
    setMatchDetails(null);

    // Clean up peer connection
    if (peerConnection) {
      console.log("[Call] Closing peer connection...");
      
      // Remove all event listeners
      peerConnection.onicecandidate = null;
      peerConnection.ontrack = null;
      peerConnection.onconnectionstatechange = null;
      peerConnection.oniceconnectionstatechange = null;
      
      // Stop all tracks
      peerConnection.getReceivers().forEach(receiver => {
        if (receiver.track) {
          receiver.track.stop();
        }
      });
      
      peerConnection.getSenders().forEach(sender => {
        if (sender.track) {
          sender.track.stop();
        }
      });
      
      peerConnection.close();
      setPeerConnection(null);
    }

    // Clean up remote video
    const remoteVideo = document.querySelector('video[autoplay]:not([muted])');
    if (remoteVideo) {
      if (remoteVideo.srcObject) {
        const tracks = remoteVideo.srcObject.getTracks();
        tracks.forEach(track => track.stop());
      }
      remoteVideo.srcObject = null;
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
      console.log("[Match] Disconnecting from partner:", matchDetails.partnerId);
      socket.emit('disconnect-chat', matchDetails.partnerId, mode);
      cleanupMatch();
    }
  };

  const next = (mode) => {
    console.log("[Match] Skipping to next partner...");
    const socket = socketRef.current;
    if (socket && matchDetails) {
      console.log("[Match] Emitting next with partnerId:", matchDetails.partnerId);
      socket.emit('next', matchDetails.partnerId, mode);
    }
  };

  const sendMessage = (message, partnerId) => {
    const socket = socketRef.current;
    if (socket && partnerId) {
      console.log("[Chat] Sending message to", partnerId, ":", message);
      socket.emit('send-message', message, partnerId);
    }
  };

  const startVideoCall = async (partnerId, localStream, remoteVideoElement) => {
    if (!partnerId || !localStream || !remoteVideoElement) {
      console.error("[Call] Missing required parameters for video call");
      return;
    }

    const socket = socketRef.current;
    if (!socket || !socket.connected) {
      console.error("[Call] Socket not connected");
      return;
    }

    console.log("[Call] Starting video call with partner:", partnerId);

    try {
      // Clean up existing connection
      if (peerConnection) {
        console.log("[Call] Cleaning up existing peer connection");
        peerConnection.close();
        setPeerConnection(null);
      }

      // Create new peer connection
      const pc = new RTCPeerConnection(iceServers);
      setPeerConnection(pc);

      // Add local stream tracks
      localStream.getTracks().forEach(track => {
        console.log("[Call] Adding local track:", track.kind);
        pc.addTrack(track, localStream);
      });

      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log("[ICE] Sending ICE candidate");
          socket.emit("ice-candidate", event.candidate, partnerId);
        } else {
          console.log("[ICE] All ICE candidates sent");
        }
      };

      // Handle remote stream
      pc.ontrack = (event) => {
        console.log("[Call] Received remote track:", event.track.kind);
        console.log("[Call] Remote streams count:", event.streams.length);
        
        if (event.streams && event.streams[0]) {
          const remoteStream = event.streams[0];
          console.log("[Call] Setting remote stream to video element");
          
          // Ensure video element is ready
          if (remoteVideoElement) {
            remoteVideoElement.srcObject = remoteStream;
            remoteVideoElement.onloadedmetadata = () => {
              console.log("[Call] Remote video metadata loaded, attempting to play");
              remoteVideoElement.play().catch(e => {
                console.error("[Call] Remote video play failed:", e);
              });
            };
          }
        }
      };

      // Monitor connection state
      pc.onconnectionstatechange = () => {
        console.log("[Call] Connection state:", pc.connectionState);
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          console.log("[Call] Connection failed, cleaning up");
          cleanupMatch();
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log("[Call] ICE connection state:", pc.iceConnectionState);
      };

      // Remove existing listeners to prevent duplicates
      socket.off("video-offer");
      socket.off("video-answer");
      socket.off("ice-candidate");
      socket.off("end-video");

      // Handle video offer
      socket.on("video-offer", async (offer, fromSocketId) => {
        try {
          console.log("[Call] Received video offer from:", fromSocketId);
          console.log("[Call] Current signaling state:", pc.signalingState);

          if (pc.signalingState !== "stable") {
            console.log("[Call] Not in stable state, performing rollback");
            await pc.setLocalDescription({ type: "rollback" });
          }

          await pc.setRemoteDescription(new RTCSessionDescription(offer));
          console.log("[Call] Set remote description successfully");

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          console.log("[Call] Created and set local answer");

          socket.emit("video-answer", answer, fromSocketId);
          console.log("[Call] Sent video answer");

          // Process pending ICE candidates
          for (const candidate of pendingCandidates.current) {
            try {
              await pc.addIceCandidate(candidate);
              console.log("[ICE] Added pending candidate");
            } catch (e) {
              console.error("[ICE] Error adding pending candidate:", e);
            }
          }
          pendingCandidates.current = [];

        } catch (error) {
          console.error("[Call] Error handling video offer:", error);
        }
      });

      // Handle video answer
      socket.on("video-answer", async (answer) => {
        try {
          console.log("[Call] Received video answer");
          console.log("[Call] Current signaling state:", pc.signalingState);

          if (pc.signalingState === "have-local-offer") {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
            console.log("[Call] Set remote description from answer");

            // Process pending ICE candidates
            for (const candidate of pendingCandidates.current) {
              try {
                await pc.addIceCandidate(candidate);
                console.log("[ICE] Added pending candidate after answer");
              } catch (e) {
                console.error("[ICE] Error adding pending candidate:", e);
              }
            }
            pendingCandidates.current = [];
          }
        } catch (error) {
          console.error("[Call] Error handling video answer:", error);
        }
      });

      // Handle ICE candidates
      socket.on("ice-candidate", async (candidate) => {
        try {
          console.log("[ICE] Received ICE candidate");
          const iceCandidate = new RTCIceCandidate(candidate);
          
          if (pc.remoteDescription && pc.remoteDescription.type) {
            await pc.addIceCandidate(iceCandidate);
            console.log("[ICE] Added ICE candidate");
          } else {
            console.log("[ICE] Queuing ICE candidate (no remote description yet)");
            pendingCandidates.current.push(iceCandidate);
          }
        } catch (error) {
          console.error("[ICE] Error adding ICE candidate:", error);
        }
      });

      // Handle call end
      socket.on("end-video", () => {
        console.log("[Call] Received end-video signal");
        cleanupMatch();
      });

      // Create and send offer
      console.log("[Call] Creating offer...");
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      
      await pc.setLocalDescription(offer);
      console.log("[Call] Set local description, sending offer");
      
      socket.emit("video-offer", offer, partnerId);
      console.log("[Call] Video offer sent to:", partnerId);

    } catch (error) {
      console.error('[Call] Error starting video call:', error);
      cleanupMatch();
    }
  };

  const endVideoCall = () => {
    const socket = socketRef.current;
    if (socket && matchDetails) {
      console.log("[Call] Ending video call with:", matchDetails.partnerId);
      socket.emit("end-call", matchDetails.partnerId);
    }
    cleanupMatch();
  };

  const handleGenderSelection = (gender) => {
    if (user?.isPremium || (!trialUsed && trialTimer > 0)) {
      console.log("[Gender] Selected:", gender);
      setSelectedGender(gender);
    }
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
    isPremium
  };

  return (
    <ChatContext.Provider value={value}>
      {children}
    </ChatContext.Provider>
  );
};