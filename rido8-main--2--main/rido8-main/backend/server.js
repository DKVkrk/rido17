import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import helmet from 'helmet';
import http from 'http';
import { Server } from 'socket.io';

import connectDB from './config/db.js';
import userRouter from './routes/user.route.js';

dotenv.config();

const app = express();

// Enhanced CORS configuration
const corsOptions = {
  origin: "http://localhost:3000",
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
app.use(morgan('dev'));
app.use(helmet({
  crossOriginResourcePolicy: false
}));

const server = http.createServer(app);

// Enhanced Socket.IO configuration
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  pingInterval: 10000,
  pingTimeout: 5000,
  cookie: false
});

// Store active connections
const activeUsers = new Map();
const driverLocations = new Map();

// Socket.IO authentication middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error('Authentication error'));
  }
  next();
});

io.on('connection', (socket) => {
  console.log(`✅ WebSocket Connected: ${socket.id}`);

  socket.on('registerUser', (userId) => {
    activeUsers.set(userId, socket.id);
    console.log(`User ${userId} connected with socket ${socket.id}`);
  });

  socket.on('driverOnline', (driverId) => {
    activeUsers.set(driverId, socket.id);
    socket.join('drivers');
    console.log(`Driver ${driverId} is online`);
  });

  socket.on('updateDriverLocation', ({ driverId, location }) => {
    driverLocations.set(driverId, location);
    console.log(`Driver ${driverId} location updated`);
  });

  socket.on('driverOffline', (driverId) => {
    socket.leave('drivers');
    driverLocations.delete(driverId);
    console.log(`Driver ${driverId} is offline`);
  });

  socket.on('newRideRequest', (rideData) => {
    console.log(`New ride request from ${rideData.userId}`);
    
    // Find nearby drivers (within 5km)
    const nearbyDrivers = [];
    for (const [driverId, location] of driverLocations.entries()) {
      const distance = calculateDistance(
        rideData.pickup_location.lat,
        rideData.pickup_location.lng,
        location.lat,
        location.lng
      );
      
      if (distance <= 5) {
        nearbyDrivers.push(driverId);
      }
    }
    
    // Notify nearby drivers
    nearbyDrivers.forEach(driverId => {
      const driverSocketId = activeUsers.get(driverId);
      if (driverSocketId) {
        io.to(driverSocketId).emit('newRideAvailable', rideData);
      }
    });
  });

  socket.on('driverAcceptsRide', async ({ rideId, driverId, userId }) => {
    const riderSocketId = activeUsers.get(userId);
    if (riderSocketId) {
      // Fetch driver details from DB
      let driverDetails = { driverId };
      try {
        const UserModel = (await import('./models/User.js')).default;
        const driver = await UserModel.findById(driverId);
        driverDetails.driverName = driver?.name || 'Driver';
        driverDetails.vehicleType = driver?.vehicle_type || driver?.vehicleType || 'Standard Car';
        driverDetails.driverProfilePhoto = driver?.avatar || 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png';
      } catch (err) {
        console.error('Error fetching driver details:', err);
        driverDetails.driverName = 'Driver';
        driverDetails.vehicleType = 'Standard Car';
        driverDetails.driverProfilePhoto = 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png';
      }
      console.log('Sending rideAccepted event:', {
        rideId,
        ...driverDetails,
        message: "Your ride has been accepted!"
      });
      io.to(riderSocketId).emit('rideAccepted', { 
        rideId, 
        ...driverDetails,
        message: "Your ride has been accepted!"
      });
      socket.to('drivers').emit('rideAcceptedByOther', { rideId });
    }
  });

  socket.on('driverRejectsRide', ({ rideId, userId }) => {
    const riderSocketId = activeUsers.get(userId);
    if (riderSocketId) {
      io.to(riderSocketId).emit('rideRejected', { 
        rideId,
        message: "Driver couldn't accept your ride. Searching for another driver..."
      });
    }
  });

  socket.on('shareDriverLocation', ({ userId, location }) => {
    const riderSocketId = activeUsers.get(userId);
    if (riderSocketId) {
      io.to(riderSocketId).emit('driverLocationUpdate', location);
    }
  });

  socket.on('shareRiderLocation', ({ driverId, location }) => {
    const driverSocketId = activeUsers.get(driverId);
    if (driverSocketId) {
      io.to(driverSocketId).emit('riderLocationUpdate', location);
    }
  });

  socket.on('rideCompleted', ({ userId, rideId }) => {
    const riderSocketId = activeUsers.get(userId);
    if (riderSocketId) {
      io.to(riderSocketId).emit('rideCompleted', { rideId });
    }
  });

  socket.on('disconnect', () => {
    console.log(`❌ WebSocket Disconnected: ${socket.id}`);
    for (const [userId, sockId] of activeUsers.entries()) {
      if (sockId === socket.id) {
        activeUsers.delete(userId);
        driverLocations.delete(userId);
        break;
      }
    }
  });
});

// Helper function to calculate distance
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Express routes
app.use('/api/user', userRouter);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ 
    message: err.message || 'Internal Server Error',
    error: true 
  });
});

const PORT = process.env.PORT || 8000;

connectDB().then(() => {
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`CORS enabled for: ${process.env.FRONTEND_URL}`);
  });
});