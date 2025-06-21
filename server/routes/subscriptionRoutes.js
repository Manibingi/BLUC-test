import express from 'express';
import Subscription from '../models/Subscription.js';
import User from '../models/User.js';
import { getSubscriptionDetails } from '../controller/productController.js';

const router = express.Router();

// Get subscription details
router.get('/details', getSubscriptionDetails);

// Get user subscription status
router.get('/status', async (req, res) => {
  try {
    // Find the latest active subscription for the user

    const subscription = await Subscription.findOne({
      user: req.user.id,
      status: 'active',
      endDate: { $gt: new Date() }
    }).sort({ endDate: -1 });
    console.log("subscription")
    if (!subscription) {
      // Update user's premium status to false if no active subscription
      await User.findByIdAndUpdate(req.user.id, { isPremium: false });
      return res.json({ 
        isPremium: false,
        subscription: null
      });
    }
    
    // Update user's premium status to true
    await User.findByIdAndUpdate(req.user.id, { isPremium: true });
    
    res.json({
      isPremium: true,
      subscription: {
        endDate: subscription.endDate,
        status: subscription.status
      }
    });
  } catch (error) {
    console.error('Subscription status error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create new subscription
router.post('/create', async (req, res) => {
  try {
    const { plan } = req.body;
    
    // Calculate end date based on plan
    let endDate = new Date();
    
    switch (plan) {
      case 'daily':
        endDate.setDate(endDate.getDate() + 1);
        break;
      case 'weekly':
        endDate.setDate(endDate.getDate() + 7);
        break;
      case 'monthly':
        endDate.setMonth(endDate.getMonth() + 1);
        break;
      case 'yearly':
        endDate.setFullYear(endDate.getFullYear() + 1);
        break;
      default:
        return res.status(400).json({ message: 'Invalid plan' });
    }
    
    // Create new subscription
    const subscription = new Subscription({
      user: req.user.id,
      plan,
      endDate,
      paymentId: 'demo-payment-' + Date.now() // In production, this would be from payment provider
    });
    
    await subscription.save();
    
    res.status(201).json({
      message: 'Subscription created successfully',
      subscription
    });
  } catch (error) {
    console.error('Subscription creation error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Cancel subscription
router.post('/cancel', async (req, res) => {
  try {
    // Find active subscription
    const subscription = await Subscription.findOne({
      user: req.user.id,
      status: 'active'
    });
    
    if (!subscription) {
      return res.status(404).json({ message: 'No active subscription found' });
    }
    
    // Update subscription status
    subscription.status = 'canceled';
    subscription.autoRenew = false;
    await subscription.save();
    
    res.json({
      message: 'Subscription canceled successfully',
      subscription
    });
  } catch (error) {
    console.error('Subscription cancellation error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;