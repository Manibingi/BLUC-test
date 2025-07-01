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
  console.log(`[Socket] User connected: ${socket.id}`);

  socket.on('user-details', ({ gender, interest, name, mode, selectedGender }) => {
    try {
      socket.data = { gender, interest, selectedGender, name, mode };
      console.log(`[Socket] User ${socket.id} joined with:`, {
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
        console.error(`[Socket] Invalid mode: ${mode}`);
        return;
      }

      const matchedSocket = findBestMatch(socket, waitingUsers);

      if (matchedSocket) {
        console.log(`[Socket] Match found: ${socket.id} <-> ${matchedSocket.id}`);
        connectUsers(socket, matchedSocket, mode);
      } else {
        waitingUsers.set(socket.id, socket);
        console.log(`[Socket] User ${socket.id} added to ${mode} waiting list. Total waiting: ${waitingUsers.size}`);
      }
    } catch (error) {
      console.error(`[Socket] Error in user-details for ${socket.id}:`, error);
    }
  });

  socket.on('send-message', (message, toSocketId) => {
    try {
      console.log(`[Message] From ${socket.id} to ${toSocketId}: ${message}`);
      const target = io.sockets.sockets.get(toSocketId);
      if (target) {
        target.emit('receive-message', message);
        console.log(`[Message] Delivered to ${toSocketId}`);
      } else {
        console.log(`[Message] Target ${toSocketId} not found`);
      }
    } catch (error) {
      console.error(`[Socket] Error in send-message:`, error);
    }
  });

  socket.on('disconnect-chat', (partnerSocketId, mode) => {
    try {
      console.log(`[Disconnect] ${socket.id} disconnecting from ${partnerSocketId} in ${mode} mode`);
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
      console.error(`[Socket] Error in disconnect-chat:`, error);
    }
  });

  socket.on('next', (partnerSocketId, mode) => {
    try {
      console.log(`[Next] ${socket.id} skipping partner ${partnerSocketId} in ${mode} mode`);
      
      const partnerSocket = io.sockets.sockets.get(partnerSocketId);
      
      if (mode === "video") {
        handleVideoCallEnd(socket.id, partnerSocketId);
      }
      
      // Clean up the pair
      activePairs.delete(socket.id);
      activePairs.delete(partnerSocketId);
      
      // Notify both users to find new partners
      if (partnerSocket) {
        console.log(`[Next] Notifying partner ${partnerSocketId} to find other`);
        partnerSocket.emit("find other");
      }
      
      console.log(`[Next] Notifying current user ${socket.id} to find other`);
      socket.emit("find other");
    } catch (error) {
      console.error(`[Socket] Error in next:`, error);
    }
  });

  socket.on('disconnect', (reason) => {
    try {
      console.log(`[Socket] User ${socket.id} disconnected: ${reason}`);
      cleanupUserConnections(socket.id);
    } catch (error) {
      console.error(`[Socket] Error in disconnect:`, error);
    }
  });

  // Video call signaling events
  socket.on("video-offer", (offer, toSocketId) => {
    try {
      console.log(`[Video] Offer from ${socket.id} to ${toSocketId}`);
      const target = io.sockets.sockets.get(toSocketId);
      if (target) {
        target.emit("video-offer", offer, socket.id);
        activeVideoCalls.add(`${socket.id}-${toSocketId}`);
        console.log(`[Video] Offer delivered to ${toSocketId}`);
      } else {
        console.log(`[Video] Target ${toSocketId} not found for offer`);
      }
    } catch (error) {
      console.error(`[Socket] Error in video-offer:`, error);
    }
  });

  socket.on("video-answer", (answer, toSocketId) => {
    try {
      console.log(`[Video] Answer from ${socket.id} to ${toSocketId}`);
      const target = io.sockets.sockets.get(toSocketId);
      if (target) {
        target.emit("video-answer", answer);
        console.log(`[Video] Answer delivered to ${toSocketId}`);
      } else {
        console.log(`[Video] Target ${toSocketId} not found for answer`);
      }
    } catch (error) {
      console.error(`[Socket] Error in video-answer:`, error);
    }
  });

  socket.on("ice-candidate", (candidate, toSocketId) => {
    try {
      console.log(`[ICE] Candidate from ${socket.id} to ${toSocketId}`);
      const target = io.sockets.sockets.get(toSocketId);
      if (target) {
        target.emit("ice-candidate", candidate);
        console.log(`[ICE] Candidate delivered to ${toSocketId}`);
      } else {
        console.log(`[ICE] Target ${toSocketId} not found for ICE candidate`);
      }
    } catch (error) {
      console.error(`[Socket] Error in ice-candidate:`, error);
    }
  });

  socket.on("end-call", (partnerId) => {
    try {
      console.log(`[Video] End call from ${socket.id} to ${partnerId}`);
      videowaitingUsers.delete(socket.id);
      const partnerSocket = io.sockets.sockets.get(partnerId);
      if (partnerSocket) {
        partnerSocket.emit("end-video");
        partnerSocket.emit("find other");
      }
      handleVideoCallEnd(socket.id, partnerId);
    } catch (error) {
      console.error(`[Socket] Error in end-call:`, error);
    }
  });

  // ------------------ Helper Functions ------------------

  function findBestMatch(socket, waitingUsers) {
    console.log(`[Match] Finding match for ${socket.id} with data:`, socket.data);
    let fallbackSocket = null;
    let bestMatch = null;

    for (let [id, otherSocket] of waitingUsers) {
      if (id === socket.id) continue;

      const interestsMatch = otherSocket.data?.interest === socket.data.interest;
      const genderMatches =
        socket.data.selectedGender === "random" ||
        otherSocket.data?.gender === socket.data.selectedGender;

      console.log(`[Match] Checking ${id}: interests=${interestsMatch}, gender=${genderMatches}`);

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
      console.log(`[Match] Selected match ${selectedMatch.id} for ${socket.id}`);
    } else {
      console.log(`[Match] No match found for ${socket.id}`);
    }

    return selectedMatch;
  }

  function connectUsers(socketA, socketB, mode) {
    try {
      const waitingUsers = waitingUsersMap[mode];
      waitingUsers.delete(socketB.id);

      console.log(`[Connect] Connecting ${socketA.id} and ${socketB.id} in ${mode} mode`);

      socketA.emit("match-found", { matched: true, socketId: socketB.id });
      socketB.emit("match-found", { matched: true, socketId: socketA.id });

      activePairs.set(socketA.id, socketB.id);
      activePairs.set(socketB.id, socketA.id);

      if (mode === "video") {
        activeVideoCalls.add(`${socketA.id}-${socketB.id}`);
        console.log(`[Video] Video call pair created: ${socketA.id}-${socketB.id}`);
      }

      console.log(`[Connect] Successfully connected ${socketA.id} <-> ${socketB.id}`);
    } catch (error) {
      console.error(`[Socket] Error in connectUsers:`, error);
    }
  }

  function cleanupUserConnections(userId) {
    try {
      console.log(`[Cleanup] Cleaning up connections for user: ${userId}`);
      
      // Remove from waiting lists
      videowaitingUsers.delete(userId);
      textwaitingUsers.delete(userId);

      // Handle active pair cleanup
      const partnerId = activePairs.get(userId);
      if (partnerId) {
        console.log(`[Cleanup] Found active partner ${partnerId} for ${userId}`);
        const partnerSocket = io.sockets.sockets.get(partnerId);
        if (partnerSocket) {
          console.log(`[Cleanup] Notifying partner ${partnerId} about disconnection`);
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
        console.log(`[Cleanup] Removed video call: ${callId}`);
      });

      console.log(`[Cleanup] Cleanup completed for ${userId}`);
    } catch (error) {
      console.error(`[Socket] Error in cleanupUserConnections:`, error);
    }
  }

  function handleVideoCallEnd(userId, partnerId) {
    try {
      console.log(`[Video] Ending video call between ${userId} and ${partnerId}`);
      
      // Remove all possible call combinations
      const callVariations = [
        `${userId}-${partnerId}`,
        `${partnerId}-${userId}`
      ];
      
      callVariations.forEach(callId => {
        if (activeVideoCalls.has(callId)) {
          activeVideoCalls.delete(callId);
          console.log(`[Video] Removed video call: ${callId}`);
        }
      });
      
      // Clean up active pairs
      activePairs.delete(userId);
      activePairs.delete(partnerId);
      
      console.log(`[Video] Video call cleanup completed`);
    } catch (error) {
      console.error(`[Socket] Error in handleVideoCallEnd:`, error);
    }
  }
};