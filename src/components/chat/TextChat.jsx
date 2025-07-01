import React, { useState, useRef, useEffect } from 'react';
import { useChat } from '../../context/ChatContext';
import { Send, X, SkipForward } from 'lucide-react';

const TextChat = ({ partnerId, embedded = false, mode = "text", onClose }) => {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('connected');
  const messagesEndRef = useRef(null);
  const messageTimeoutRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  
  const { sendMessage, disconnectFromMatch, next, isMatched, socket } = useChat();
  
  // Handle cleanup on unmount or when match changes
  useEffect(() => {
    const handleUnload = () => {
      if (isMatched && partnerId) { 
        disconnectFromMatch(mode); 
      }
    };
  
    window.addEventListener('beforeunload', handleUnload);
  
    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      if (messageTimeoutRef.current) {
        clearTimeout(messageTimeoutRef.current);
      }
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [isMatched, disconnectFromMatch, mode, partnerId]);
  
  // Listen for incoming messages with improved error handling
  useEffect(() => {
    if (!socket) return;

    const handleReceiveMessage = (msg) => { 
      console.log("[TextChat] Received message:", msg);
      if (msg && typeof msg === 'string' && msg.trim().length > 0) {
        setMessages(prev => [...prev, { 
          text: msg.trim(), 
          sender: 'partner',
          timestamp: Date.now(),
          id: Math.random().toString(36).substr(2, 9)
        }]);
        setConnectionStatus('connected');
      }
    };

    const handlePartnerDisconnected = (message) => {
      console.log("[TextChat] Partner disconnected:", message);
      setMessages(prev => [...prev, { 
        text: message || "Partner disconnected", 
        sender: 'system',
        timestamp: Date.now(),
        id: Math.random().toString(36).substr(2, 9)
      }]);
      setConnectionStatus('disconnected');
    };

    const handleDisconnect = (message) => {
      console.log("[TextChat] Disconnect event:", message);
      handlePartnerDisconnected(message);
    };

    const handleError = (error) => {
      console.error("[TextChat] Socket error:", error);
      setMessages(prev => [...prev, { 
        text: "Connection error occurred", 
        sender: 'system',
        timestamp: Date.now(),
        id: Math.random().toString(36).substr(2, 9)
      }]);
      setConnectionStatus('error');
    };

    // Add event listeners
    socket.on('receive-message', handleReceiveMessage);
    socket.on('partner-disconnected', handlePartnerDisconnected);
    socket.on('disconect', handleDisconnect);
    socket.on('error', handleError);

    // Cleanup listeners
    return () => {
      socket.off('receive-message', handleReceiveMessage);
      socket.off('partner-disconnected', handlePartnerDisconnected);
      socket.off('disconect', handleDisconnect);
      socket.off('error', handleError);
    };
  }, [socket]);

  // Reset messages when partner changes
  useEffect(() => {
    if (partnerId) {
      setMessages([]);
      setConnectionStatus('connected');
      console.log("[TextChat] New partner connected:", partnerId);
    }
  }, [partnerId]);
  
  // Auto scroll to bottom when new messages arrive
  useEffect(() => {
    scrollToBottom();
  }, [messages]);
  
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  
  const handleSendMessage = () => {
    if (!message.trim() || !partnerId || connectionStatus !== 'connected') {
      return;
    }

    const messageText = message.trim();
    const messageId = Math.random().toString(36).substr(2, 9);
    
    // Add to local messages immediately
    setMessages(prev => [...prev, { 
      text: messageText, 
      sender: 'self',
      timestamp: Date.now(),
      id: messageId,
      status: 'sending'
    }]);
    
    // Send the message
    sendMessage(messageText, partnerId);
    console.log("[TextChat] Message sent:", messageText);
    
    // Clear input
    setMessage('');
    
    // Set timeout to mark message as failed if no response
    messageTimeoutRef.current = setTimeout(() => {
      setMessages(prev => prev.map(msg => 
        msg.id === messageId 
          ? { ...msg, status: 'sent' }
          : msg
      ));
    }, 1000);
  };
  
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };
  
  const handleSkip = () => {
    console.log("[TextChat] Skipping to next partner");
    setMessages([]); // Clear messages when skipping
    setConnectionStatus('connecting');
    next(mode);
  };

  const handleInputChange = (e) => {
    setMessage(e.target.value);
    
    // Show typing indicator (if you want to implement this feature)
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
    }, 1000);
  };

  const getConnectionStatusText = () => {
    switch (connectionStatus) {
      case 'connected':
        return 'Connected';
      case 'disconnected':
        return 'Partner disconnected';
      case 'error':
        return 'Connection error';
      case 'connecting':
        return 'Connecting...';
      default:
        return 'Unknown status';
    }
  };

  const getConnectionStatusColor = () => {
    switch (connectionStatus) {
      case 'connected':
        return 'bg-green-500';
      case 'disconnected':
        return 'bg-red-500';
      case 'error':
        return 'bg-red-500';
      case 'connecting':
        return 'bg-yellow-500';
      default:
        return 'bg-gray-500';
    }
  };
  
  return (
    <div className={`flex flex-col ${embedded ? 'h-full' : 'h-[calc(100vh-64px)]'}`}>
      {/* Header */}
      <div className="bg-white shadow-sm p-4 flex justify-between items-center">
        <div className="flex items-center">
          <div className={`w-3 h-3 rounded-full mr-2 ${getConnectionStatusColor()}`}></div>
          <span className="font-medium">Stranger</span>
          <span className="text-sm text-gray-500 ml-2">({getConnectionStatusText()})</span>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={handleSkip}
            className="text-gray-500 hover:text-gray-800 p-2 transition-colors"
            title="Skip to next stranger"
            disabled={connectionStatus === 'connecting'}
          >
            <SkipForward size={18} />
          </button>
          
          {embedded && onClose && (
            <button 
              onClick={onClose}
              className="text-gray-500 hover:text-gray-800 p-2 transition-colors"
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>
      
      {/* Messages */}
      <div className="flex-1 bg-gray-50 p-4 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            <p>No messages yet</p>
            <p className="text-sm">Say hi to start the conversation!</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`mb-3 ${
                msg.sender === 'self'
                  ? 'flex justify-end'
                  : msg.sender === 'system'
                  ? 'flex justify-center'
                  : 'flex justify-start'
              }`}
            >
              <div
                className={`px-4 py-2 rounded-lg max-w-[80%] relative ${
                  msg.sender === 'self'
                    ? 'bg-blue-600 text-white'
                    : msg.sender === 'system'
                    ? 'bg-yellow-100 text-yellow-800 text-sm'
                    : 'bg-gray-200 text-gray-800'
                }`}
              >
                {msg.text}
                {msg.sender === 'self' && msg.status === 'sending' && (
                  <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></div>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>
      
      {/* Input */}
      <div className="bg-white px-4 py-3 border-t">
        <div className="flex items-center">
          <input
            type="text"
            value={message}
            onChange={handleInputChange}
            onKeyPress={handleKeyPress}
            placeholder={
              connectionStatus === 'connected' 
                ? "Type a message..." 
                : connectionStatus === 'disconnected'
                ? "Partner disconnected"
                : "Connecting..."
            }
            className="flex-1 py-2 px-3 border border-gray-300 rounded-l-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
            disabled={!partnerId || connectionStatus !== 'connected'}
            maxLength={500}
          />
          <button
            onClick={handleSendMessage}
            disabled={!message.trim() || !partnerId || connectionStatus !== 'connected'}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white py-2 px-4 rounded-r-lg transition-colors disabled:cursor-not-allowed"
          >
            <Send size={18} />
          </button>
        </div>
        {message.length > 450 && (
          <div className="text-xs text-gray-500 mt-1">
            {500 - message.length} characters remaining
          </div>
        )}
      </div>
    </div>
  );
};

export default TextChat;