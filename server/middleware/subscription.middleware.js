import Subscription from '../models/Subscription.js';
import User from '../models/User.js';

const subscriptionMiddleware = async (req, res, next) => {
  console.log("subscriptionMiddleware called");
  // console.log("User found in request:", req.user);
  try {
    if (!req.user) {
      return next();
    }
    const subscription = await Subscription.findOne({
      user: req.user.id,
      status: 'active'
    });
    // console.log("subscription", subscription);

    if (subscription) {
      // Check if subscription has expired
      if (subscription.endDate < new Date()) {
        // Update subscription status to expired
        await Subscription.findByIdAndUpdate(subscription._id, {
          status: 'expired'
        });

        // Update user's premium status
        await User.findByIdAndUpdate(req.user._id, {
          isPremium: false
        });

        req.user.isPremium = false;
      } else {
        // Ensure user's premium status is true if subscription is active
        if (!req.user.isPremium) {
          await User.findByIdAndUpdate(req.user._id, {
            isPremium: true
          });
          req.user.isPremium = true;
        }
      }
    } else {
      // No active subscription found, ensure user's premium status is false
      if (req.user.isPremium) {
        await User.findByIdAndUpdate(req.user._id, {
          isPremium: false
        });
        req.user.isPremium = false;
      }
    }

    next();
  } catch (error) {
    console.error('Subscription middleware error:', error);
    next();
  }
};

export default subscriptionMiddleware; 