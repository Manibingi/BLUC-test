import express from 'express';
import jwt from 'jsonwebtoken';
import passport from 'passport';
import User from '../models/User.js';
import authMiddleware from '../middleware/auth.middleware.js';
import subscriptionMiddleware from '../middleware/subscription.middleware.js';
import bcrypt from 'bcrypt';

const router = express.Router();

// Google OAuth routes
router.get('/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

router.get('/google/callback',
  passport.authenticate('google', { session: false }),
  (req, res) => {
    const token = jwt.sign(
      { user: { id: req.user.id } },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    const clientUrl = process.env.VITE_CLIENT_URL;
    console.log("clientUrl", clientUrl);
    res.redirect(`${clientUrl}?token=${token}&isProfileComplete=${req.user.isProfileComplete}`);
  }
);

// Register route
router.post('/register', async (req, res) => {
  try {
    const { email, password, fullName } = req.body;
    
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ message: 'User already exists' });
    }
    
    user = new User({
      email,
      password,
      fullName,
      isProfileComplete: false
    });
    
    await user.save();
    
    res.status(201).json({ message: 'User registered successfully' });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Login route
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1d' });
    res.json({ token, trialUsed: user.trialUsed });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Update profile
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { fullName, gender, dateOfBirth, interests, trialUsed } = req.body;
    
    const updateData = {
      ...(fullName && { fullName }),
      ...(gender && { gender }),
      ...(dateOfBirth && { dateOfBirth }),
      ...(interests && { interests }),
      ...(typeof trialUsed === 'boolean' && { trialUsed }),
      isProfileComplete: true
    };
    
    const user = await User.findByIdAndUpdate(
      req.user.id,
      updateData,
      { new: true }
    ).select('-password');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Add isPremium from subscription middleware
    const userData = user.toObject();
    userData.isPremium = req.user.isPremium || false;
    
    res.json(userData);
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user profile
router.get('/user/profile', authMiddleware, subscriptionMiddleware, async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: 'Unauthorized - Invalid user data' });
    }

    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    const userData = user.toObject();
    userData.isPremium = req.user.isPremium || false;
    
    // If user is premium, set trialUsed to true
    if (userData.isPremium) {
      userData.trialUsed = true;
      // Update the database to reflect this
      await User.findByIdAndUpdate(req.user.id, { trialUsed: true });
    }
    
    res.json(userData);
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ 
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;