import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Check, X } from 'lucide-react';

const Profile = () => {
  const { user, updateProfile } = useAuth();
  const [formData, setFormData] = useState({
    fullName: '',
    gender: '',
    dateOfBirth: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    if (user) {
      setFormData({
        fullName: user.fullName || '',
        gender: user.gender || '',
        dateOfBirth: user.dateOfBirth || '',
      });
    }
  }, [user]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      await updateProfile(formData);
      setMessage({ type: 'success', text: 'Profile updated successfully!' });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'Failed to update profile' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container mx-auto py-4 sm:py-6 md:py-8 px-4 max-w-2xl">
      <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6 md:p-8">
        <h1 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6 text-gray-800">Your Profile</h1>
        
        {message.text && (
          <div className={`mb-4 p-2 sm:p-3 rounded-lg ${message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'} flex items-center text-sm sm:text-base`}>
            {message.type === 'success' ? <Check size={16} className="mr-2" /> : <X size={16} className="mr-2" />}
            {message.text}
          </div>
        )}
        
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-gray-700 font-medium mb-1 text-sm sm:text-base">Full Name</label>
            <input
              type="text"
              name="fullName"
              value={formData.fullName}
              onChange={handleChange}
              className="bluc-input text-sm sm:text-base"
              required
            />
          </div>
          
          <div className="mb-4">
            <label className="block text-gray-700 font-medium mb-1 text-sm sm:text-base">Date of Birth</label>
            <input
              type="date"
              name="dateOfBirth"
              value={formData.dateOfBirth}
              onChange={handleChange}
              className="bluc-input text-sm sm:text-base"
              required
            />
          </div>
          
          <div className="mb-6">
            <label className="block text-gray-700 font-medium mb-2 text-sm sm:text-base">Gender</label>
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <div 
                className={`gender-option ${formData.gender === 'male' ? 'selected' : ''} p-3 sm:p-4`}
                onClick={() => setFormData(prev => ({ ...prev, gender: 'male' }))}
              >
                <span className="text-yellow-500 text-2xl sm:text-3xl mb-1 sm:mb-2 block">👨</span>
                <span className="text-sm sm:text-base">Male</span>
              </div>
              <div 
                className={`gender-option ${formData.gender === 'female' ? 'selected' : ''} p-3 sm:p-4`}
                onClick={() => setFormData(prev => ({ ...prev, gender: 'female' }))}
              >
                <span className="text-pink-500 text-2xl sm:text-3xl mb-1 sm:mb-2 block">👩</span>
                <span className="text-sm sm:text-base">Female</span>
              </div>
            </div>
          </div>
          
          <div className="mt-6">
            <button 
              type="submit" 
              className="bluc-btn-primary w-full text-sm sm:text-base"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Updating...' : 'Save Profile'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Profile;