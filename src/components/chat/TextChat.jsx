import React, { useState, useRef, useEffect } from 'react';
import { useChat } from '../../context/ChatContext';
import { Send, X, SkipForward } from 'lucide-react';

const TextChat = ({ partnerId, embedded = false, mode="text",onClose}) => {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const messagesEndRef = useRef(null);
  const { sendMessage, disconnectFromMatch,next,isMatched} = useChat();
  
  // Listen for incoming messages 
  useEffect(() => {
    const handleUnload = () => {
      if(isMatched){ 
        disconnectFromMatch(mode); 
        print("hello")
      }
    };
  
    window.addEventListener('beforeunload', handleUnload);
  
    return () => {
      window.removeEventListener('beforeunload', handleUnload);
    ; 
    };
  }, [isMatched]);
  
  useEffect(() => {
  const handleReceiveMessage = (msg) => { 
    console.log(msg);
    setMessages(prev => [...prev, { text: msg, sender: 'partner' }]);
  };

  if (window.socket) {
    window.socket.on('receive-message', handleReceiveMessage);
  }

  // ✅ Correct cleanup on unmount
  return () => {
    if (window.socket) {
      window.socket.off('receive-message', handleReceiveMessage);
    }
  };
}, []);
  // Auto scroll to bottom when new messages arrive
  useEffect(() => {
    scrollToBottom();
  }, [messages]);
  
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  
  const handleSendMessage = () => {
    if (message.trim() && partnerId) {
      // Send the message
      sendMessage(message.trim(), partnerId);
      
      // Add to local messages
      setMessages(prev => [...prev, { text: message, sender: 'self' }]);
      console.log("he")
      // Clear input
      setMessage('');
    }
  };
  
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };
  
  const handleSkip = () => {
    next(mode);
  };
  
  return (
    <div className={`flex flex-col ${embedded ? 'h-full' : 'h-[calc(100vh-64px)]'}`}>
      {/* Header */}
      <div className="bg-white shadow-sm p-4 flex justify-between items-center">
        <div className="flex items-center">
          <div className="w-3 h-3 bg-green-500 rounded-full mr-2"></div>
          <span className="font-medium">Stranger</span>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={handleSkip}
            className="text-gray-500 hover:text-gray-800 p-2"
            title="Skip to next stranger"
          >
            <SkipForward size={18} />
          </button>
          
          {embedded && (
            <button 
              onClick={onClose}
              className="text-gray-500 hover:text-gray-800 p-2"
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
          messages.map((msg, index) => (
            <div
              key={index}
              className={`mb-3 ${
                msg.sender === 'self'
                  ? 'flex justify-end'
                  : 'flex justify-start'
              }`}
            >
              <div
                className={`px-4 py-2 rounded-lg max-w-[80%] ${
                  msg.sender === 'self'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-800'
                }`}
              >
                {msg.text}
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
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type a message..."
            className="flex-1 py-2 px-3 border border-gray-300 rounded-l-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleSendMessage}
            className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-r-lg transition-colors"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default TextChat;