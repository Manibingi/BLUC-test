import React, { useState, useEffect } from 'react';
import { X, Check, Crown } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import axios from 'axios';

const PremiumModal = ({ onClose }) => {
  const { user, upgradeSubscription } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState('monthly');
  const [isProcessing, setIsProcessing] = useState(false);
  const [subscriptionDetails, setSubscriptionDetails] = useState(null);
  const [error, setError] = useState(null);


  useEffect(() => {
    const fetchSubscriptionDetails = async () => {
      if (user?.isPremium) {
        try {
          const { data } = await axios.get('/api/subscription/details');
          if (data.success) {
            setSubscriptionDetails(data);
          } else {
            setError('Failed to fetch subscription details');
          }
        } catch (error) {
          console.error('Error fetching subscription details:', error);
          setError('Error fetching subscription details');
        }
      }
    };
    fetchSubscriptionDetails();
  }, [user]);

  const plans = {
    daily: {
      price: 9,
      label: 'Daily',
      save: '0%',
      features: [
        'Unlimited video chat',
        'No forced disconnections',
        'Premium badge'
      ]
    },
    weekly: {
      price: 49,
      label: 'Weekly',
      save: '22%',
      features: [
        'Unlimited video chat',
        'No forced disconnections',
        'Premium badge',
        'Priority matching'
      ]
    },
    monthly: {
      price: 149,
      label: 'Monthly',
      save: '45%',
      features: [
        'Unlimited video chat',
        'No forced disconnections',
        'Premium badge',
        'Priority matching',
        'Video filters and effects'
      ]
    },
    yearly: {
      price: 999,
      label: 'Yearly',
      save: '70%',
      features: [
        'Unlimited video chat',
        'No forced disconnections',
        'Premium badge',
        'Priority matching',
        'Video filters and effects',
        'Exclusive features'
      ]
    }
  };

  const handleSubscribe = async (price) => {
    if (!user) {
      setError('Please login to subscribe to premium');
      return;
    }

    if (user.isPremium) {
      onClose();
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const { data: keyData } = await axios.get('/api/razorpay/get-key');
      const { key } = keyData;

      const userId = user._id || user.id;
      if (!userId) {
        throw new Error('User ID not found');
      }

      const { data: subscriptionData } = await axios.post('/api/razorpay/payment/process', {
        amount: price,
        packageType: selectedPlan,
        userId: userId
      });

      if (!subscriptionData.order) {
        throw new Error('Failed to create order');
      }

      const { order } = subscriptionData;

      const options = {
        key: key,
        amount: price * 100,
        currency: 'INR',
        name: 'BLUC Premium',
        description: `${selectedPlan.charAt(0).toUpperCase() + selectedPlan.slice(1)} Premium Subscription`,
        order_id: order.id,
        callback_url: `${window.location.origin}/api/razorpay/paymentVerification`,
        prefill: {
          name: user.fullName || '',
          email: user.email || '',
        },
        theme: {
          color: '#F37254'
        },
        handler: function (response) {
          console.log('Payment successful:', response);
          const verificationData = {
            ...response,
            userId: userId,
            packageType: selectedPlan,
            amount: price
          };
          
          axios.post('/api/razorpay/paymentVerification', verificationData)
            .then(() => {
              window.location.href = `/paymentSuccess?reference=${response.razorpay_payment_id}`;
            })
            .catch((error) => {
              console.error('Payment verification failed:', error);
              setError('Payment verification failed. Please contact support.');
            });
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();

      onClose();
    } catch (error) {
      console.error('Subscription error:', error);
      setError(error.message || 'Failed to process payment. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClose = () => {
    if (typeof onClose === 'function') {
      onClose();
    }
  };

  if (user?.isPremium && subscriptionDetails) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-auto">
          <div className="p-4 sm:p-6">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center">
                <Crown className="text-yellow-500 mr-2 w-6 h-6 sm:w-8 sm:h-8" />
                <h2 className="text-xl sm:text-2xl font-bold">Premium Account</h2>
              </div>
              <button
                onClick={onClose}
                className="text-gray-500 hover:text-gray-700 p-1 rounded-full hover:bg-gray-100"
              >
                <X size={20} />
              </button>
            </div>

            <div className="bg-gradient-to-r from-yellow-50 to-yellow-100 rounded-lg p-4 sm:p-6 mb-4 text-center">
              <Crown className="text-yellow-500 mx-auto mb-3 sm:mb-4 w-12 h-12 sm:w-16 sm:h-16" />
              <h3 className="text-lg sm:text-xl font-bold text-gray-800 mb-2">You're a Premium Member!</h3>
              <p className="text-sm sm:text-base text-gray-600 mb-4">
                Enjoy all premium features until {new Date(subscriptionDetails.endDate).toLocaleDateString()}
              </p>
              <div className="bg-white rounded-lg p-3 sm:p-4 shadow-sm">
                <p className="text-sm sm:text-base text-gray-700 font-medium">
                  Your premium status is active and you have access to all premium features.
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-full py-2 text-gray-600 font-medium hover:text-gray-800 text-sm sm:text-base"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-auto">
          <div className="p-4 sm:p-6">
            <div className="text-center">
              <h2 className="text-lg sm:text-xl font-bold text-red-600 mb-3 sm:mb-4">Error</h2>
              <p className="text-sm sm:text-base text-gray-600 mb-4">{error}</p>
              <button
                onClick={onClose}
                className="w-full py-2 text-gray-600 font-medium hover:text-gray-800 text-sm sm:text-base"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-auto max-h-[90vh] overflow-y-auto">
        <div className="p-4">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center">
              <Crown className="text-yellow-500 mr-2 w-6 h-6 sm:w-8 sm:h-8" />
              <h2 className="text-xl sm:text-2xl font-bold">Upgrade to Premium</h2>
            </div>
            <button
              onClick={handleClose}
              className="text-gray-500 hover:text-gray-700 p-1 rounded-full hover:bg-gray-100"
            >
              <X size={20} />
            </button>
          </div>

          <p className="text-sm sm:text-base text-gray-600 text-center mb-4">
            Upgrade to continue using premium features or continue with free random chat!
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            {Object.entries(plans).map(([planId, plan]) => (
              <div
                key={planId}
                className={`border rounded-xl p-3 cursor-pointer transition-all ${selectedPlan === planId
                  ? 'border-blue-500 bg-blue-50 shadow-sm'
                  : 'border-gray-200 hover:border-gray-300'
                  }`}
                onClick={() => setSelectedPlan(planId)}
              >
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="font-bold text-base sm:text-lg">{plan.label}</h3>
                    <p className="text-xl sm:text-2xl font-bold text-blue-600">₹{plan.price}</p>
                  </div>
                  {plan.save !== '0%' && (
                    <span className="bg-green-100 text-green-800 text-xs font-medium px-2 py-1 rounded">
                      Save {plan.save}
                    </span>
                  )}
                </div>

                <ul className="text-xs sm:text-sm text-gray-600 mt-2 space-y-1">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-start">
                      <Check size={14} className="text-green-500 mr-1 flex-shrink-0 mt-0.5" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <button
            onClick={() => handleSubscribe(plans[selectedPlan].price)}
            className="bluc-btn-primary w-full mb-2 text-sm sm:text-base"
            disabled={isProcessing}
          >
            {isProcessing ? 'Processing...' : `Get ${plans[selectedPlan].label} Pass (₹${plans[selectedPlan].price})`}
          </button>

          <button
            onClick={onClose}
            className="w-full py-2 text-gray-600 font-medium hover:text-gray-800 text-sm sm:text-base"
          >
            Continue with Free Version
          </button>
        </div>
      </div>
    </div>
  );
};

export default PremiumModal;