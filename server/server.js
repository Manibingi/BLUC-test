import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import cors from 'cors'; 
import dotenv from 'dotenv';
import path from 'path';
import socketHandler from './socketHandler.js';
import Razorpay from 'razorpay';
import authRoutes from './routes/authRoutes.js';
import subscriptionRoutes from './routes/subscriptionRoutes.js';
import payment from './routes/paymentRoutes.js';
import authMiddleware from './middleware/auth.middleware.js';

// Load environment variables
dotenv.config();
import passport from './config/passport.js';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*" || process.env.CLIENT_URL, 
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Middleware
app.use(cors({
  origin: "*" || process.env.CLIENT_URL,
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({extended: true}));
app.use(passport.initialize());

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected...'))
  .catch(err => console.error('MongoDB connection error:', err));

// Razorpay Integration
export var instance = new Razorpay({
  key_id: process.env.RAZORPAY_API_KEY,
  key_secret: process.env.RAZORPAY_API_SECRET,
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/subscription', authMiddleware, subscriptionRoutes);
app.use('/api/razorpay', payment);

// Socket.io setup
io.on('connection', socket => {
  console.log(`User connected: ${socket.id}`);
  socketHandler(io, socket);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

