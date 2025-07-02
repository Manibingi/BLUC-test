
import express from 'express';
import Report from '../models/Report.js';
import User from '../models/User.js';
import authMiddleware from '../middleware/auth.middleware.js';

const router = express.Router();

// Create a report
router.post('/create', authMiddleware, async (req, res) => {
  try {
    const { reportedUserId, reportType, description, chatMode } = req.body;
    
    // Validate input
    if (!reportedUserId || !reportType || !description) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    
    // Check if reported user exists
    const reportedUser = await User.findById(reportedUserId);
    if (!reportedUser) {
      return res.status(404).json({ message: 'Reported user not found' });
    }
    
    // Prevent self-reporting
    if (req.user.id === reportedUserId) {
      return res.status(400).json({ message: 'Cannot report yourself' });
    }
    
    // Check for duplicate reports (same user reporting same user within 24 hours)
    const existingReport = await Report.findOne({
      reportedBy: req.user.id,
      reportedUser: reportedUserId,
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    });
    
    if (existingReport) {
      return res.status(400).json({ message: 'You have already reported this user recently' });
    }
    
    const report = new Report({
      reportedBy: req.user.id,
      reportedUser: reportedUserId,
      reportType,
      description,
      chatMode
    });
    
    await report.save();
    
    res.status(201).json({ 
      message: 'Report submitted successfully',
      reportId: report._id
    });
  } catch (error) {
    console.error('Error creating report:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all reports (admin only)
router.get('/all', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user.isAdmin) {
      return res.status(403).json({ message: 'Access denied. Admin only.' });
    }
    
    const { status = 'all', page = 1, limit = 20 } = req.query;
    const query = status !== 'all' ? { status } : {};
    
    const reports = await Report.find(query)
      .populate('reportedBy', 'fullName email')
      .populate('reportedUser', 'fullName email isBlocked')
      .populate('reviewedBy', 'fullName')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const totalReports = await Report.countDocuments(query);
    
    res.json({
      reports,
      totalPages: Math.ceil(totalReports / limit),
      currentPage: page,
      totalReports
    });
  } catch (error) {
    console.error('Error fetching reports:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update report status (admin only)
router.put('/update/:reportId', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user.isAdmin) {
      return res.status(403).json({ message: 'Access denied. Admin only.' });
    }
    
    const { status, adminNotes, severity } = req.body;
    const report = await Report.findById(req.params.reportId);
    
    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }
    
    report.status = status || report.status;
    report.adminNotes = adminNotes || report.adminNotes;
    report.severity = severity || report.severity;
    report.reviewedBy = req.user.id;
    report.reviewedAt = new Date();
    
    await report.save();
    
    res.json({ message: 'Report updated successfully', report });
  } catch (error) {
    console.error('Error updating report:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Block user (admin only)
router.post('/block-user/:userId', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user.isAdmin) {
      return res.status(403).json({ message: 'Access denied. Admin only.' });
    }
    
    const { reason } = req.body;
    const userToBlock = await User.findById(req.params.userId);
    
    if (!userToBlock) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    if (userToBlock.isAdmin) {
      return res.status(400).json({ message: 'Cannot block admin users' });
    }
    
    userToBlock.isBlocked = true;
    userToBlock.blockedReason = reason || 'Violation of community guidelines';
    userToBlock.blockedAt = new Date();
    userToBlock.blockedBy = req.user.id;
    
    await userToBlock.save();
    
    // Update related reports
    await Report.updateMany(
      { reportedUser: req.params.userId, status: 'pending' },
      { status: 'resolved', reviewedBy: req.user.id, reviewedAt: new Date() }
    );
    
    res.json({ message: 'User blocked successfully' });
  } catch (error) {
    console.error('Error blocking user:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Unblock user (admin only)
router.post('/unblock-user/:userId', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user.isAdmin) {
      return res.status(403).json({ message: 'Access denied. Admin only.' });
    }
    
    const userToUnblock = await User.findById(req.params.userId);
    
    if (!userToUnblock) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    userToUnblock.isBlocked = false;
    userToUnblock.blockedReason = undefined;
    userToUnblock.blockedAt = undefined;
    userToUnblock.blockedBy = undefined;
    
    await userToUnblock.save();
    
    res.json({ message: 'User unblocked successfully' });
  } catch (error) {
    console.error('Error unblocking user:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
