import React from 'react';
import { Link } from 'react-router-dom';
import { Home } from 'lucide-react';

const NotFound = () => {
  return (
    <div className="h-[calc(100vh-64px)] flex flex-col items-center justify-center px-4">
      <h1 className="text-5xl font-bold text-blue-600 mb-4">404</h1>
      <p className="text-xl text-gray-600 mb-8">Page not found</p>
      <Link to="/" className="bluc-btn-primary flex items-center">
        <Home size={18} className="mr-2" />
        Back to Home
      </Link>
    </div>
  );
};

export default NotFound;