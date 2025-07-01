const textwaitingUsers = new Map();
const videowaitingUsers = new Map();
const activePairs = new Map();
const activeVideoCalls = new Set();
const pastSocketsMap = new Map();

const SOCKET_RETENTION_TIME = 3 * 60 * 1000;

const waitingUsersMap = {
  video: videowaitingUsers,
  text: textwaitingUsers
};

export default (io, socket) => {
  console.log(`[SocketHandler] User connected: ${socket.id}`);

  socket.on('user-details', ({ gender, interest, name, mode, selectedGender }) => {
    try {
      socket.data = { gender, interest, selectedGender, name, mode };
      console.log(`[SocketHandler] User ${socket.id} joined with:`, {
        gender,
        interest,
        selectedGender,
        name,
        mode
      });

      // Clean up any existing connections for this socket
      cleanupUserConnections(socket.id);

      const waitingUsers = waitingUsersMap[mode];
      if (!waitingUsers) {
        console.error(`[SocketHandler] Invalid mode: ${mode}`);
        return;
      }

      const matchedSocket = findBestMatch(socket, waitingUsers);

      if (matchedSocket) {
        console.log(`[SocketHandler] Match found: ${socket.id} <-> ${matchedSocket.id}`);
        connectUsers(socket, matchedSocket, mode);
      } else {
        waitingUsers.set(socket.id, socket);
        console.log(`[SocketHandler] User ${socket.id} added to ${mode} waiting list. Total waiting: ${waitingUsers.size}`);
      }
    } catch (error) {
      console.error(`[SocketHandler] Error in user-details for ${socket.id}:`, error);
    }
  });

  socket.on('send-message', (message, toSocketId) => {
    try {
      console.log(`[SocketHandler] Message from ${socket.id} to ${toSocketId}: ${message}`);
      const target = io.sockets.sockets.get(toSocketId);
      if (target) {
        target.emit('receive-message', message);
        console.log(`[SocketHandler] Message delivered to ${toSocketId}`);
      } else {
        console.log(`[SocketHandler] Target ${toSocketId} not found`);
      }
    } catch (error) {
      console.error(`[SocketHandler] Error in send-message:`, error);
    }
  });

  socket.on('disconnect-chat', (partnerSocketId, mode) => {
    try {
      console.log(`[SocketHandler] ${socket.id} disconnecting from ${partnerSocketId} in ${mode} mode`);
      const partnerSocket = io.sockets.sockets.get(partnerSocketId);

      if (mode === "video") {
        handleVideoCallEnd(socket.id, partnerSocketId);
        socket.emit("end-video");
        if (partnerSocket) {
          partnerSocket.emit("end-video");
          partnerSocket.emit("find other");
        }
      } else {
        if (partnerSocket) {
          partnerSocket.emit("disconect", "Partner disconnected.");
          partnerSocket.emit("find other");
        }
      }

      activePairs.delete(socket.id);
      activePairs.delete(partnerSocketId);
    } catch (error) {
      console.error(`[SocketHandler] Error in disconnect-chat:`, error);
    }
  });

  socket.on('next', (partnerSocketId, mode) => {
    try {
      console.log(`[SocketHandler] ${socket.id} skipping partner ${partnerSocketId} in ${mode} mode`);
      
      const partnerSocket = io.sockets.sockets.get(partnerSocketId);
      
      if (mode === "video") {
        handleVideoCallEnd(socket.id, partnerSocketId);
      }
      
      // Clean up the pair
      activePairs.delete(socket.id);
      activePairs.delete(partnerSocketId);
      
      // Notify both users to find new partners
      if (partnerSocket) {
        console.log(`[SocketHandler] Notifying partner ${partnerSocketId} to find other`);
        partnerSocket.emit("find other");
      }
      
      console.log(`[SocketHandler] Notifying current user ${socket.id} to find other`);
      socket.emit("find other");
    } catch (error) {
      console.error(`[SocketHandler] Error in next:`, error);
    }
  });

  socket.on('disconnect', (reason) => {
    try {
      console.log(`[SocketHandler] User ${socket.id} disconnected: ${reason}`);
      cleanupUserConnections(socket.id);
    } catch (error) {
      console.error(`[SocketHandler] Error in disconnect:`, error);
    }
  });

  // Video call signaling events with improved error handling
  socket.on("video-offer", (offer, toSocketId) => {
    try {
      console.log(`[SocketHandler] Video offer from ${socket.id} to ${toSocketId}`);
      console.log(`[SocketHandler] Offer type: ${offer.type}, SDP length: ${offer.sdp ? offer.sdp.length : 'N/A'}`);
      
      const target = io.sockets.sockets.get(toSocketId);
      if (target) {
        target.emit("video-offer", offer, socket.id);
        activeVideoCalls.add(`${socket.id}-${toSocketId}`);
        console.log(`[SocketHandler] Video offer delivered to ${toSocketId}`);
      } else {
        console.log(`[SocketHandler] Target ${toSocketId} not found for offer`);
        socket.emit("error", { message: "Target user not found" });
      }
    } catch (error) {
      console.error(`[SocketHandler] Error in video-offer:`, error);
      socket.emit("error", { message: "Failed to process video offer" });
    }
  });

  socket.on("video-answer", (answer, toSocketId) => {
    try {
      console.log(`[SocketHandler] Video answer from ${socket.id} to ${toSocketId}`);
      console.log(`[SocketHandler] Answer type: ${answer.type}, SDP length: ${answer.sdp ? answer.sdp.length : 'N/A'}`);
      
      const target = io.sockets.sockets.get(toSocketId);
      if (target) {
        target.emit("video-answer", answer);
        console.log(`[SocketHandler] Video answer delivered to ${toSocketId}`);
      } else {
        console.log(`[SocketHandler] Target ${toSocketId} not found for answer`);
        socket.emit("error", { message: "Target user not found" });
      }
    } catch (error) {
      console.error(`[SocketHandler] Error in video-answer:`, error);
      socket.emit("error", { message: "Failed to process video answer" });
    }
  });

  socket.on("ice-candidate", (candidate, toSocketId) => {
    try {
      console.log(`[SocketHandler] ICE candidate from ${socket.id} to ${toSocketId}`);
      console.log(`[SocketHandler] Candidate type: ${candidate.type || 'unknown'}`);
      
      const target = io.sockets.sockets.get(toSocketId);
      if (target) {
        target.emit("ice-candidate", candidate);
        console.log(`[SocketHandler] ICE candidate delivered to ${toSocketId}`);
      } else {
        console.log(`[SocketHandler] Target ${toSocketId} not found for ICE candidate`);
      }
    } catch (error) {
      console.error(`[SocketHandler] Error in ice-candidate:`, error);
    }
  });

  socket.on("end-call", (partnerId) => {
    try {
      console.log(`[SocketHandler] End call from ${socket.id} to ${partnerId}`);
      videowaitingUsers.delete(socket.id);
      const partnerSocket = io.sockets.sockets.get(partnerId);
      if (partnerSocket) {
        partnerSocket.emit("end-video");
        partnerSocket.emit("find other");
      }
      handleVideoCallEnd(socket.id, partnerId);
    } catch (error) {
      console.error(`[SocketHandler] Error in end-call:`, error);
    }
  });

  // Error handling
  socket.on("error", (error) => {
    console.error(`[SocketHandler] Socket error for ${socket.id}:`, error);
  });

  // ------------------ Helper Functions ------------------

  function findBestMatch(socket, waitingUsers) {
    console.log(`[SocketHandler] Finding match for ${socket.id} with data:`, socket.data);
    let fallbackSocket = null;
    let bestMatch = null;

    for (let [id, otherSocket] of waitingUsers) {
      if (id === socket.id) continue;

      const interestsMatch = otherSocket.data?.interest === socket.data.interest;
      const genderMatches =
        socket.data.selectedGender === "random" ||
        otherSocket.data?.gender === socket.data.selectedGender;

      console.log(`[SocketHandler] Checking ${id}: interests=${interestsMatch}, gender=${genderMatches}`);

      // Perfect match: both interests and gender match
      if (interestsMatch && genderMatches) {
        bestMatch = otherSocket;
        break;
      }

      // Good match: either interests match or gender matches
      if (interestsMatch || genderMatches) {
        if (!fallbackSocket) {
          fallbackSocket = otherSocket;
        }
      }

      // Last resort: any available user
      if (!fallbackSocket) {
        fallbackSocket = otherSocket;
      }
    }

    const selectedMatch = bestMatch || fallbackSocket;
    if (selectedMatch) {
      console.log(`[SocketHandler] Selected match ${selectedMatch.id} for ${socket.id}`);
    } else {
      console.log(`[SocketHandler] No match found for ${socket.id}`);
    }

    return selectedMatch;
  }

  function connectUsers(socketA, socketB, mode) {
    try {
      const waitingUsers = waitingUsersMap[mode];
      waitingUsers.delete(socketB.id);

      console.log(`[SocketHandler] Connecting ${socketA.id} and ${socketB.id} in ${mode} mode`);

      socketA.emit("match-found", { matched: true, socketId: socketB.id });
      socketB.emit("match-found", { matched: true, socketId: socketA.id });

      activePairs.set(socketA.id, socketB.id);
      activePairs.set(socketB.id, socketA.id);

      if (mode === "video") {
        activeVideoCalls.add(`${socketA.id}-${socketB.id}`);
        console.log(`[SocketHandler] Video call pair created: ${socketA.id}-${socketB.id}`);
      }

      console.log(`[SocketHandler] Successfully connected ${socketA.id} <-> ${socketB.id}`);
    } catch (error) {
      console.error(`[SocketHandler] Error in connectUsers:`, error);
    }
  }

  function cleanupUserConnections(userId) {
    try {
      console.log(`[SocketHandler] Cleaning up connections for user: ${userId}`);
      
      // Remove from waiting lists
      videowaitingUsers.delete(userId);
      textwaitingUsers.delete(userId);

      // Handle active pair cleanup
      const partnerId = activePairs.get(userId);
      if (partnerId) {
        console.log(`[SocketHandler] Found active partner ${partnerId} for ${userId}`);
        const partnerSocket = io.sockets.sockets.get(partnerId);
        if (partnerSocket) {
          console.log(`[SocketHandler] Notifying partner ${partnerId} about disconnection`);
          partnerSocket.emit("disconect", "Partner disconnected unexpectedly.");
          partnerSocket.emit("find other");
        }
        
        // Clean up the pair
        activePairs.delete(userId);
        activePairs.delete(partnerId);
      }

      // Clean up video calls
      const callsToRemove = [];
      for (const callId of activeVideoCalls) {
        if (callId.includes(userId)) {
          callsToRemove.push(callId);
        }
      }
      
      callsToRemove.forEach(callId => {
        activeVideoCalls.delete(callId);
        console.log(`[SocketHandler] Removed video call: ${callId}`);
      });

      console.log(`[SocketHandler] Cleanup completed for ${userId}`);
    } catch (error) {
      console.error(`[SocketHandler] Error in cleanupUserConnections:`, error);
    }
  }

  function handleVideoCallEnd(userId, partnerId) {
    try {
      console.log(`[SocketHandler] Ending video call between ${userId} and ${partnerId}`);
      
      // Remove all possible call combinations
      const callVariations = [
        `${userId}-${partnerId}`,
        `${partnerId}-${userId}`
      ];
      
      callVariations.forEach(callId => {
        if (activeVideoCalls.has(callId)) {
          activeVideoCalls.delete(callId);
          console.log(`[SocketHandler] Removed video call: ${callId}`);
        }
      });
      
      // Clean up active pairs
      activePairs.delete(userId);
      activePairs.delete(partnerId);
      
      console.log(`[SocketHandler] Video call cleanup completed`);
    } catch (error) {
      console.error(`[SocketHandler] Error in handleVideoCallEnd:`, error);
    }
  }
};