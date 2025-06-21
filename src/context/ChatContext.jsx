// ChatContext.jsx

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
   const [interest, setMyInterest ]=useState(null);
  const [trialTimer, setTrialTimer] = useState(180); // 3 minutes in seconds
  const [genderSelectionFrozen, setGenderSelectionFrozen] = useState(false);
  const [trialUsed, setTrialUsed] = useState(false);
  const [isPremium, setIsPremium] = useState(false);

  const iceServers = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      {
        urls: 'turn:relay1.expressturn.com:3480',
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
    if (socketRef.current) return socketRef.current;

    console.log("[Socket] Initializing socket connection...");
    const socketInstance = window.socket || io(
      process.env.NODE_ENV === 'production'
        ? 'https://buzzy-server-nu.vercel.app'
        : 'http://localhost:3000',
      {
        transports: ['websocket'],
        withCredentials: true,
      }
    );

    if (!window.socket) {
      window.socket = socketInstance;
    }

    socketRef.current = socketInstance;

    socketInstance.on('connect', () => {
      console.log("[Socket] Connected:", socketInstance.id);
      const genderToSend = (user?.isPremium || (!trialUsed && trialTimer > 0)) ? selectedGender : "random";
      socketInstance.emit('user-details', { gender, interest, name, mode, selectedGender: genderToSend });
      setIsConnecting(true);
    });

    socketInstance.on('find other', () => {
      console.log("7. In find other event");
      console.log("[Socket] Received 'find other' event. Cleaning up and reconnecting...");
      cleanupMatch().then(() => {
        setIsConnecting(true);
        console.log("11. In find other event after cleanupMatch");
        if (user) {
          console.log("12. In find other event calling user-details with selectedGender", selectedGender);
          console.log("13. In find other event calling user-details with mode", mode);
          console.log("14. In find other event calling user-details with trialUsed", trialUsed);
          console.log("15. In find other event calling user-details with trialTimer", trialTimer);
          console.log("16. In find other event calling user-details with isPremium", user.isPremium);
          console.log("17. In find other event calling user-details with interest", interest);
          console.log("18. In find other event calling user-details with name", user.name);
          console.log("19. In find other event calling user-details")
          const genderToSend = (user.isPremium || (!trialUsed && trialTimer > 0)) ? selectedGender : "random";
          socketInstance.emit('user-details', {
            gender: user.gender,
            interest: user.interest,
            name: user.name,
            mode,
            selectedGender: genderToSend
          });
        }
      });
    });


    // REPLACE the existing 'find other' handler with:
    // socketInstance.on('find other', async () => {
    //   console.log("7. In find other event");
    //   console.log("[Socket] Received 'find other' event. Cleaning up and reconnecting...");

    //   // Ensure complete cleanup before reconnecting
    //   await cleanupMatch();

    //   // Add small delay before reconnecting
    //   setTimeout(() => {
    //     setIsConnecting(true);
    //     console.log("11. In find other event after cleanupMatch");
    //     if (user) {
    //       console.log("12. In find other event calling user-details with selectedGender", selectedGender);
    //       const genderToSend = (user.isPremium || (!trialUsed && trialTimer > 0)) ? selectedGender : "random";
    //       socketInstance.emit('user-details', {
    //         gender: user.gender,
    //         interest: user.interest,
    //         name: user.name,
    //         mode,
    //         selectedGender: genderToSend
    //       });
    //     }
    //   }, 200);
    // });

    socketInstance.on('match-found', async (data) => {
      console.log("[Socket] Match found:", data);
      if (data.matched) {
        await cleanupMatch();
        setIsMatched(true);
        console.log("hello");
        setIsConnecting(false);
        setMatchDetails({ partnerId: data.socketId });
      }
    });

    socketInstance.on('start-call', () => {
      setTimeout(() => {
      console.log("[Socket] Received 'start-call'");
      const remoteVideo = document.getElementById("remoteVideo");
      
      const localVideo = document.getElementById("localVideo");
      const localStream = localVideo?.srcObject;

      if (matchDetails?.partnerId && localStream) {
        console.log("[Call] Starting video call with:", matchDetails.partnerId);
        startVideoCall(matchDetails.partnerId, localStream, remoteVideo);
      } else {
        console.warn("[Call] Cannot start call — missing partnerId or localStream");
      }
    },200);
    });

    socketInstance.on("cleanup", () => {
      console.log("[Socket] Received 'cleanup' event");
      setIsConnecting(true);
      cleanupMatch();
    });

    return socketInstance;
  };

  const disconnectSocket = () => {
    console.log("[Socket] Disconnecting...");
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
      window.socket = null;
    }
    cleanupMatch();
  };

  const cleanupMatch = async () => {
    console.log("8. In cleanupMatch function ");
    console.log("[Call] Cleaning up match and peer connection...");
    setIsMatched(false);
    setMatchDetails(null);

    if (peerConnection) {
      console.log("9. in cleanupMatch function peerConnection is not null", peerConnection);
      console.log("[Call] Closing peer connection...");
      peerConnection.getReceivers().forEach(receiver => {
        if (receiver.track) {
          receiver.track.stop();
        }
      });
      peerConnection.close();
      console.log("10. in cleanupMatch function peerConnection is set to null",peerConnection);
      setPeerConnection(null);
    }

    const remoteVideo = document.getElementById("remoteVideo");
    if (remoteVideo && remoteVideo.srcObject) {
      remoteVideo.srcObject.getTracks().forEach(track => track.stop());
      remoteVideo.srcObject = null;
    }

    callStartedRef.current = false;
    pendingCandidates.current = [];
  };

  // REPLACE the existing cleanupMatch function with:
  // const cleanupMatch = async () => {
  //   console.log("8. In cleanupMatch function ");
  //   console.log("[Call] Cleaning up match and peer connection...");

  //   // Remove all socket event listeners first
  //   const socket = socketRef.current;
  //   if (socket) {
  //     socket.off("video-offer");
  //     socket.off("video-answer");
  //     socket.off("ice-candidate");
  //     socket.off("end-video");
  //   }

  //   setIsMatched(false);
  //   setMatchDetails(null);

  //   if (peerConnection) {
  //     console.log("9. in cleanupMatch function peerConnection is not null", peerConnection);
  //     console.log("[Call] Closing peer connection...");

  //     // Stop all tracks properly
  //     peerConnection.getReceivers().forEach(receiver => {
  //       if (receiver.track) {
  //         receiver.track.stop();
  //       }
  //     });

  //     peerConnection.getSenders().forEach(sender => {
  //       if (sender.track) {
  //         sender.track.stop();
  //       }
  //     });

  //     peerConnection.close();
  //     console.log("10. in cleanupMatch function peerConnection is set to null");
  //     setPeerConnection(null);
  //   }

  //   // Clean up remote video
  //   const remoteVideo = document.getElementById("remoteVideo");
  //   if (remoteVideo) {
  //     if (remoteVideo.srcObject) {
  //       remoteVideo.srcObject.getTracks().forEach(track => track.stop());
  //     }
  //     remoteVideo.srcObject = null;
  //   }

  //   callStartedRef.current = false;
  //   pendingCandidates.current = [];
  // };

  const disconnectFromMatch = (mode) => {
    const socket = socketRef.current;
    if (socket && matchDetails) {
      console.log("[Match] Disconnecting from partner:", matchDetails.partnerId);
      cleanupMatch();
      socket.emit('disconnect-chat', matchDetails.partnerId, mode);
    }
  };

  const next = (mode) => {
    console.log("2 . At start of next function");
    const socket = socketRef.current;
    console.log("In next func socket", socket);
    console.log("In next func match details", matchDetails);
    if (socket && matchDetails) {
      console.log("In next func [Match] Skipping to next partner...");
      console.log("3. In next func calling next-emit with partnerId", matchDetails.partnerId, "and mode", mode);
      socket.emit('next', matchDetails.partnerId, mode);
    }
  };

  const sendMessage = (message, partnerId) => {
    const socket = socketRef.current;
    if (socket && partnerId) {
      console.log("[Chat] Sending message to", partnerId, ":", message);
      window.socket.emit('send-message', message, partnerId);
    }
  };

  const startVideoCall = async (partnerId, localStream, remoteVideoElement) => {
    if (!partnerId || !localStream) return;
    const socket = socketRef.current;
    if (!socket) return;

    console.log("[Call] Creating new RTCPeerConnection...");
    try {
      if (peerConnection) {
        console.log("[Call] Closing existing connection before starting new one...");
        peerConnection.getReceivers().forEach(receiver => {
          if (receiver.track) receiver.track.stop();
        });
        peerConnection.close();
        setPeerConnection(null);
      }

      const pc = new RTCPeerConnection(iceServers);
      setPeerConnection(pc);

      localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log("[ICE] Sending ICE candidate...");
          socket.emit("ice-candidate", event.candidate, partnerId);
        }
      };

      pc.ontrack = (event) => {
        console.log("[Call] Received remote track.");
        if (remoteVideoElement && event.streams[0]) {
          remoteVideoElement.srcObject = event.streams[0];
        }
      };

      // pc.ontrack = (event) => {
      //   console.log("[Call] Received remote track.", event.streams.length);
      //   if (remoteVideoElement && event.streams[0]) {
      //     // Ensure the video element is ready
      //     setTimeout(() => {
      //       remoteVideoElement.srcObject = event.streams[0];
      //       remoteVideoElement.play().catch(e => console.error("[Video] Play failed:", e));
      //     }, 50);
      //   }
      // };

      socket.off("video-offer");
      socket.off("video-answer");
      socket.off("ice-candidate");
      socket.off("end-video");


      // WITH this enhanced cleanup:
      // Remove existing listeners completely
      // socket.removeAllListeners("video-offer");
      // socket.removeAllListeners("video-answer");
      // socket.removeAllListeners("ice-candidate");
      // socket.removeAllListeners("end-video");

      socket.on("video-offer", async (offer, fromSocketId) => {
        try {
          console.log("[Call] PeerConnection signaling state:", pc.signalingState);

          if (pc.signalingState !== "stable") {
            console.log("[Call] Rolling back and setting remote description...");
            await Promise.all([
              pc.setLocalDescription({ type: "rollback" }).catch(e => console.error("[Call] Rollback failed:", e)),
              pc.setRemoteDescription(new RTCSessionDescription(offer)).catch(e => console.error("[Call] setRemoteDescription (rollback) failed:", e))
            ]);
          } else {
            console.log("[Call] Setting remote description...");
            await pc.setRemoteDescription(new RTCSessionDescription(offer));
          }

          console.log("[Call] Creating answer...");
          const answer = await pc.createAnswer();

          console.log("[Call] Setting local description with answer...");
          await pc.setLocalDescription(answer);

          console.log("[Call] Emitting video-answer...");
          socket.emit("video-answer", answer, fromSocketId);
          console.log("[Call] Sent video-answer.");
        } catch (error) {
          console.error("[Call] Error handling offer:", error);
        }
      });

      socket.on("video-answer", async (answer) => {
        console.log("[Socket] Received video-answer");
        try {
          if (pc.signalingState === "have-local-offer") {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
            for (const candidate of pendingCandidates.current) {
              await pc.addIceCandidate(candidate);
            }
            pendingCandidates.current = [];
          }
        } catch (error) {
          console.error("[Call] Error applying answer:", error);
        }
      });

      socket.on("ice-candidate", async (candidate) => {
        console.log("[Socket] Received ICE candidate");
        try {
          const iceCandidate = new RTCIceCandidate(candidate);
          if (pc.remoteDescription && pc.remoteDescription.type) {
            await pc.addIceCandidate(iceCandidate);
          } else {
            pendingCandidates.current.push(iceCandidate);
          }
        } catch (error) {
          console.error("[ICE] Error adding candidate:", error);
        }
      });

      socket.on("end-video", () => {
        console.log("[Socket] Received end-video signal.");

        setPeerConnection(null);
        pendingCandidates.current = [];
        if (remoteVideoElement) {
          remoteVideoElement.srcObject = null;
        }
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("video-offer", offer, partnerId);
      console.log("[Call] Sent video-offer.");
    } catch (error) {
      console.error('[Call] Error starting video call:', error);
      if (peerConnection) {
        peerConnection.getReceivers().forEach(receiver => {
          if (receiver.track) {
            receiver.track.stop();
          }
        });
        peerConnection.close();
        setPeerConnection(null);
      }
    }
  };

  const endVideoCall = () => {
    const socket = socketRef.current;
    if (isMatched) {
      console.log("[Call] Ending video call.");
      socket.emit("end-call", matchDetails.partnerId);
    }
    cleanupMatch();
  };

  const togglePremium = () => {
    if (user) {
      const newPremiumStatus = !user.isPremium;
      setIsPremium(newPremiumStatus);
      if (!newPremiumStatus) {
        setGenderSelectionFrozen(false);
        setTrialTimer(180);
        setTrialUsed(false);
        if (user) {
          api.user.updateProfile({ trialUsed: false }).catch(console.error);
        }
      }
    }
  };

  const handleGenderSelection = (gender) => {
    if (user?.isPremium || (!trialUsed && trialTimer > 0)) {
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
    togglePremium,
    trialTimer,
    trialUsed,
    genderSelectionFrozen,
    isPremium
  };

  return (
    <ChatContext.Provider value={value}>
      {children}
      {user && !isPremium && !trialUsed && trialTimer > 0 && (
        <div className="text-sm text-gray-500">
          Free trial: {trialTimer}s remaining
        </div>
      )}
    </ChatContext.Provider>
  );
};
