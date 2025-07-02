
import User from '../models/User.js';

const blockCheckMiddleware = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return next();
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    if (user.isBlocked) {
      return res.status(403).json({ 
        message: 'Account blocked',
        blocked: true,
        reason: user.blockedReason || 'Account has been blocked due to policy violations',
        blockedAt: user.blockedAt
      });
    }

    next();
  } catch (error) {
    console.error('Block check middleware error:', error);
    next();
  }
};

export default blockCheckMiddleware;
