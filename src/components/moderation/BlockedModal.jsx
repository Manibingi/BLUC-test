
import React from 'react';
import { Shield, AlertTriangle } from 'lucide-react';

const BlockedModal = ({ isOpen, reason, blockedAt }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-md w-full">
        <div className="p-6 text-center">
          <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-4">
            <Shield className="h-8 w-8 text-red-600" />
          </div>
          
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            Account Blocked
          </h2>
          
          <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-4">
            <div className="flex items-start">
              <AlertTriangle className="h-5 w-5 text-red-400 mt-0.5 mr-2 flex-shrink-0" />
              <div className="text-left">
                <p className="text-sm text-red-800 font-medium mb-1">
                  Your account has been blocked
                </p>
                <p className="text-sm text-red-700">
                  {reason || 'Your account has been blocked due to policy violations.'}
                </p>
              </div>
            </div>
          </div>

          {blockedAt && (
            <p className="text-sm text-gray-600 mb-4">
              Blocked on: {new Date(blockedAt).toLocaleDateString()}
            </p>
          )}

          <div className="text-sm text-gray-600 mb-6">
            <p>
              If you believe this is a mistake, please contact our support team 
              at <strong>support@blucchat.com</strong>
            </p>
          </div>

          <button
            onClick={() => {
              localStorage.removeItem('token');
              window.location.reload();
            }}
            className="w-full bg-gray-600 text-white py-2 px-4 rounded-md hover:bg-gray-700 transition-colors"
          >
            Understood
          </button>
        </div>
      </div>
    </div>
  );
};

export default BlockedModal;
