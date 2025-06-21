import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import { AuthProvider } from './context/AuthContext';
import { ChatProvider } from './context/ChatContext';
import { MyProvider } from './context/MyContext';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter> 
    <MyProvider>
      <AuthProvider>
         {/* Must be outside of ChatProvider */}
          <ChatProvider>
            <App />
          </ChatProvider>
    
      </AuthProvider> 
      </MyProvider>
    </BrowserRouter>
  </React.StrictMode>
);

