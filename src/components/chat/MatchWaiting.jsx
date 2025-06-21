import React from 'react';
import { Loader2 } from 'lucide-react';

const MatchWaiting = ({ onCancel }) => {
  return (
    <div className="h-full flex flex-col items-center justify-center bg-gray-50 p-4">
      <div className="text-center max-w-md">
        <Loader2 className="mx-auto animate-spin text-blue-600" size={48} />
        <h2 className="text-2xl font-bold mt-6 mb-2">Looking for someone to chat with...</h2>
        <p className="text-gray-600 mb-8">
          We're finding the perfect match for you. This usually takes less than 30 seconds.
        </p>
        <button
          onClick={onCancel}
          className="bluc-btn-secondary"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

export default MatchWaiting;