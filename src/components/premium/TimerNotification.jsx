import React from 'react';
import { Clock, AlertTriangle } from 'lucide-react';

const TimerNotification = ({ timeRemaining }) => {
  // Format seconds to MM:SS
  const formatTime = (totalSeconds) => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };
  
  const getColorClass = () => {
    if (timeRemaining <= 30) return 'bg-red-100 text-red-800';
    if (timeRemaining <= 60) return 'bg-yellow-100 text-yellow-800';
    return 'bg-blue-100 text-blue-800';
  };
  
  return (
    <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-20">
      <div className={`px-4 py-2 rounded-full ${getColorClass()} flex items-center shadow-md animate-pulse`}>
        {timeRemaining <= 30 ? (
          <AlertTriangle size={16} className="mr-2" />
        ) : (
          <Clock size={16} className="mr-2" />
        )}
        <span className="font-medium">{formatTime(timeRemaining)} remaining</span>
      </div>
    </div>
  );
};

export default TimerNotification;