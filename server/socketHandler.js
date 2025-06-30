// socketHandler.js

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

  socket.on('user-details', ({ gender, interest, name, mode, selectedGender }) => {
    socket.data = { gender, interest, selectedGender };
    console.log("20. In user-details-on, with socket.data: ", socket.data);
    // console.log(socket.data);
    console.log(`User ${socket.id} joined with gender: ${gender}, interest: ${interest} for ${mode}`);

    cleanupUserConnections(socket.id);

    const waitingUsers = waitingUsersMap[mode];
    const matchedSocket = findBestMatch(socket, waitingUsers);

    if (matchedSocket) {
      console.log("24. In user-details-on ready to call connectUsers func, matchedSocket: ", matchedSocket.id);
      connectUsers(socket, matchedSocket, mode);
    } else {
      waitingUsers.set(socket.id, socket);
      console.log(`User ${socket.id} added to ${mode} waiting list.`);
    }
  });

  socket.on('send-message', (message, toSocketId) => {
    const target = io.sockets.sockets.get(toSocketId);
    if (target) {
      target.emit('receive-message', message);
    }
  });

  socket.on('disconnect-chat', (partnerSocketId, mode) => {
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
  });

  socket.on('next', (partnerSocketId, mode) => {
    const partnerSocket = io.sockets.sockets.get(partnerSocketId);
    console.log("4. In next-on ,with partnerSocketId: ", partnerSocketId);
    if (mode === "video") {
      handleVideoCallEnd(socket.id, partnerSocketId);
    }
    if (partnerSocket) {
      console.log("5. In next-on , calling to find other on partnerSocket :",partnerSocket.id);
      partnerSocket.emit("find other");
    }
    console.log("6. In next-on , calling to find other on CurrentSocket :", socket.id);
    socket.emit("find other");
  });

  socket.on('disconnect', () => {
    cleanupUserConnections(socket.id);
  });

  socket.on("video-offer", (offer, toSocketId) => {
    const target = io.sockets.sockets.get(toSocketId);
    if (target) {
      target.emit("video-offer", offer, socket.id);
      activeVideoCalls.add(`${socket.id}-${toSocketId}`);
    }
  });

  socket.on("video-answer", (answer, toSocketId) => {
    const target = io.sockets.sockets.get(toSocketId);
    if (target) {
      target.emit("video-answer", answer);
    }
  });

  socket.on("ice-candidate", (candidate, toSocketId) => {
    console.log("Received ICE candidate from socket:", socket.id, "to:", toSocketId);
    console.log("Candidate details:", candidate);
    const target = io.sockets.sockets.get(toSocketId);
    console.log("Target socket for ICE candidate:", target ? target.id : "not found");
    if (target) {
      target.emit("ice-candidate", candidate);
    }
  });

  socket.on("end-call", (partnerId) => {
    videowaitingUsers.delete(socket.id);
    const partnerSocket = io.sockets.sockets.get(partnerId);
    if (partnerSocket) {
      partnerSocket.emit("end-video");
      partnerSocket.emit("find other");
    }
    handleVideoCallEnd(socket.id, partnerId);
  });

  // ------------------ Helper Functions ------------------

  function findBestMatch(socket, waitingUsers) {
    console.log("23. In findBestMatch, with socket.data: ", socket.data);
    let fallbackSocket = null;

    for (let [id, otherSocket] of waitingUsers) {
      if (id === socket.id) continue;

      const interestsMatch = otherSocket.data?.interest === socket.data.interest;
      const genderMatches =
        socket.data.selectedGender === "random" ||
        otherSocket.data?.gender === socket.data.selectedGender;

      if (interestsMatch && genderMatches) {
        return otherSocket;
      }

      if (interestsMatch || !fallbackSocket) {
        fallbackSocket = otherSocket;
      }
    }

    return fallbackSocket;
  }

  function connectUsers(socketA, socketB, mode) {
    const waitingUsers = waitingUsersMap[mode];
    waitingUsers.delete(socketB.id);

    socketA.emit("match-found", { matched: true, socketId: socketB.id });
    socketB.emit("match-found", { matched: true, socketId: socketA.id });

    activePairs.set(socketA.id, socketB.id);
    activePairs.set(socketB.id, socketA.id);

    if (mode === "video") {
      activeVideoCalls.add(socketA.id);
      activeVideoCalls.add(socketB.id);
    }
  }

  function cleanupUserConnections(userId) {
    console.log(`21 . Cleaning up connections for user: ${userId}`);
    videowaitingUsers.delete(userId);
    textwaitingUsers.delete(userId);

    const partnerId = activePairs.get(userId);
    if (partnerId) {
      const partnerSocket = io.sockets.sockets.get(partnerId);
      if (partnerSocket) {
        console.log(`22. Disconnecting partner: ${partnerId} for user: ${userId}`);
        partnerSocket.emit("disconect", "Partner disconnected unexpectedly.");
      }
    }

    for (const callId of activeVideoCalls) {
      if (callId.includes(userId)) {
        activeVideoCalls.delete(callId);
      }
    }

    activePairs.delete(userId);
  }

  function handleVideoCallEnd(userId, partnerId) {
    activeVideoCalls.delete(`${userId}-${partnerId}`);
    activeVideoCalls.delete(`${partnerId}-${userId}`);
    activePairs.delete(userId);
    activePairs.delete(partnerId);
  }
};
