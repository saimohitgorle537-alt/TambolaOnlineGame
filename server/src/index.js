/**
 * Tambola Game Server
 * 
 * Express + Socket.IO server handling all game logic.
 * All game state is server-authoritative.
 */

require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { RoomManager, GAME_STATUS } = require('./gameRoom');
const { CLAIM_TYPES, formatClaimName } = require('./claimValidator');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3001;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const allowedOrigins = CLIENT_URL.split(',').map(s => s.trim());

const isOriginAllowed = (origin) => {
  if (!origin) return true; // Allow non-browser requests
  if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) return true;
  if (origin.endsWith('.vercel.app')) return true; // Automatically allow all Vercel deployments
  if (origin.includes('localhost') || origin.includes('127.0.0.1')) return true;
  return true; // Fallback to allow game clients to connect seamlessly
};

app.use(cors({
  origin: (origin, callback) => callback(null, isOriginAllowed(origin)),
  credentials: true,
}));
app.use(express.json());

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => callback(null, isOriginAllowed(origin)),
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

const roomManager = new RoomManager();

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    rooms: roomManager.getRoomCount(),
    uptime: process.uptime(),
  });
});

// Socket.IO connection handler
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // ==================== HOST EVENTS ====================

  /**
   * Host creates a new game room
   */
  socket.on('host:create-room', (maybeSettings, maybeCallback) => {
    try {
      const callback = typeof maybeSettings === 'function' ? maybeSettings : maybeCallback;
      const initialSettings = typeof maybeSettings === 'object' ? maybeSettings : {};

      const room = roomManager.createRoom(socket.id, initialSettings);
      socket.join(room.code);
      console.log(`Room created: ${room.code} by ${socket.id}`);
      
      if (typeof callback === 'function') {
        callback({
          success: true,
          roomCode: room.code,
          state: room.getState(),
        });
      }
    } catch (error) {
      console.error('Error creating room:', error);
      const callback = typeof maybeSettings === 'function' ? maybeSettings : maybeCallback;
      if (typeof callback === 'function') {
        callback({ success: false, error: 'Failed to create room.' });
      }
    }
  });

  /**
   * Host updates game settings
   */
  socket.on('host:update-settings', (settings, callback) => {
    try {
      const room = roomManager.getRoomForSocket(socket.id);
      if (!room || room.hostSocketId !== socket.id) {
        return callback?.({ success: false, error: 'You are not the host.' });
      }

      const result = room.updateSettings(settings);
      if (result.success) {
        io.to(room.code).emit('game:settings-updated', {
          settings: room.settings,
          autoCalling: room.getAutoCallingState(),
        });
        io.to(room.code).emit('game:state-update', room.getState());
      }
      callback?.(result);
    } catch (error) {
      console.error('Error updating settings:', error);
      callback?.({ success: false, error: 'Failed to update settings.' });
    }
  });

  /**
   * Host switches calling mode
   */
  socket.on('host:switch-mode', ({ mode, interval }, callback) => {
    try {
      const room = roomManager.getRoomForSocket(socket.id);
      if (!room || room.hostSocketId !== socket.id) {
        return callback?.({ success: false, error: 'You are not the host.' });
      }

      const result = room.setCallingMode(mode, interval);
      if (result.success) {
        io.to(room.code).emit('game:mode-changed', {
          settings: room.settings,
          autoCalling: room.getAutoCallingState(),
        });
        io.to(room.code).emit('game:state-update', room.getState());
      }
      callback?.(result);
    } catch (error) {
      console.error('Error switching mode:', error);
      callback?.({ success: false, error: 'Failed to switch mode.' });
    }
  });

  /**
   * Host starts the game
   */
  socket.on('host:start-game', (callback) => {
    try {
      const room = roomManager.getRoomForSocket(socket.id);
      if (!room || room.hostSocketId !== socket.id) {
        return callback({ success: false, error: 'You are not the host.' });
      }

      const result = room.startGame();
      if (!result.success) {
        return callback(result);
      }

      io.to(room.code).emit('game:started', room.getState());
      callback({ success: true, state: room.getState() });
    } catch (error) {
      console.error('Error starting game:', error);
      callback({ success: false, error: 'Failed to start game.' });
    }
  });

  /**
   * Host pauses the game
   */
  socket.on('host:pause-game', (callback) => {
    try {
      const room = roomManager.getRoomForSocket(socket.id);
      if (!room || room.hostSocketId !== socket.id) {
        return callback({ success: false, error: 'You are not the host.' });
      }

      const result = room.pauseGame();
      if (result.success) {
        io.to(room.code).emit('game:paused', room.getState());
        io.to(room.code).emit('game:auto-calling-paused', {
          autoCalling: room.getAutoCallingState(),
        });
      }
      callback(result);
    } catch (error) {
      callback({ success: false, error: 'Failed to pause game.' });
    }
  });

  /**
   * Host resumes the game
   */
  socket.on('host:resume-game', (callback) => {
    try {
      const room = roomManager.getRoomForSocket(socket.id);
      if (!room || room.hostSocketId !== socket.id) {
        return callback({ success: false, error: 'You are not the host.' });
      }

      const result = room.resumeGame();
      if (result.success) {
        io.to(room.code).emit('game:resumed', room.getState());
      }
      callback(result);
    } catch (error) {
      callback({ success: false, error: 'Failed to resume game.' });
    }
  });

  /**
   * Host starts automatic calling
   */
  socket.on('host:start-auto-calling', (callback) => {
    try {
      const room = roomManager.getRoomForSocket(socket.id);
      if (!room || room.hostSocketId !== socket.id) {
        return callback?.({ success: false, error: 'You are not the host.' });
      }

      const result = room.startAutoCalling(
        (callResult) => {
          io.to(room.code).emit('game:number-called', {
            number: callResult.number,
            calledNumbers: room.numberCaller.getCalledNumbers(),
            remaining: callResult.remaining,
            totalCalled: callResult.totalCalled,
            autoCalling: room.getAutoCallingState(),
          });
        },
        (tickData) => {
          io.to(room.code).emit('game:timer-tick', tickData);
        },
        (finishData) => {
          io.to(room.code).emit('game:all-numbers-called', finishData);
          io.to(room.code).emit('game:state-update', room.getState());
        }
      );

      if (result.success) {
        io.to(room.code).emit('game:auto-calling-started', {
          autoCalling: room.getAutoCallingState(),
        });
      }
      callback?.(result);
    } catch (error) {
      console.error('Error starting auto calling:', error);
      callback?.({ success: false, error: 'Failed to start automatic calling.' });
    }
  });

  /**
   * Host pauses automatic calling
   */
  socket.on('host:pause-auto-calling', (callback) => {
    try {
      const room = roomManager.getRoomForSocket(socket.id);
      if (!room || room.hostSocketId !== socket.id) {
        return callback?.({ success: false, error: 'You are not the host.' });
      }

      const result = room.pauseAutoCalling();
      if (result.success) {
        io.to(room.code).emit('game:auto-calling-paused', {
          autoCalling: room.getAutoCallingState(),
        });
      }
      callback?.(result);
    } catch (error) {
      callback?.({ success: false, error: 'Failed to pause automatic calling.' });
    }
  });

  /**
   * Host resumes automatic calling
   */
  socket.on('host:resume-auto-calling', (callback) => {
    try {
      const room = roomManager.getRoomForSocket(socket.id);
      if (!room || room.hostSocketId !== socket.id) {
        return callback?.({ success: false, error: 'You are not the host.' });
      }

      const result = room.resumeAutoCalling();
      if (result.success) {
        io.to(room.code).emit('game:auto-calling-resumed', {
          autoCalling: room.getAutoCallingState(),
        });
      }
      callback?.(result);
    } catch (error) {
      callback?.({ success: false, error: 'Failed to resume automatic calling.' });
    }
  });

  /**
   * Host stops automatic calling
   */
  socket.on('host:stop-auto-calling', (callback) => {
    try {
      const room = roomManager.getRoomForSocket(socket.id);
      if (!room || room.hostSocketId !== socket.id) {
        return callback?.({ success: false, error: 'You are not the host.' });
      }

      const result = room.stopAutoCalling();
      if (result.success) {
        io.to(room.code).emit('game:auto-calling-stopped', {
          autoCalling: room.getAutoCallingState(),
        });
      }
      callback?.(result);
    } catch (error) {
      callback?.({ success: false, error: 'Failed to stop automatic calling.' });
    }
  });

  /**
   * Host calls the next number manually
   */
  socket.on('host:call-number', (callback) => {
    try {
      const room = roomManager.getRoomForSocket(socket.id);
      if (!room || room.hostSocketId !== socket.id) {
        return callback({ success: false, error: 'You are not the host.' });
      }

      const result = room.callNextNumber(true); // isManual = true
      if (!result.success) {
        return callback(result);
      }

      // Broadcast to all players in the room
      io.to(room.code).emit('game:number-called', {
        number: result.result.number,
        calledNumbers: room.numberCaller.getCalledNumbers(),
        remaining: result.result.remaining,
        totalCalled: result.result.totalCalled,
        autoCalling: room.getAutoCallingState(),
      });

      callback({ success: true, ...result.result });
    } catch (error) {
      console.error('Error calling number:', error);
      callback({ success: false, error: 'Failed to call number.' });
    }
  });

  /**
   * Host approves a claim
   */
  socket.on('host:approve-claim', ({ claimId }, callback) => {
    try {
      const room = roomManager.getRoomForSocket(socket.id);
      if (!room || room.hostSocketId !== socket.id) {
        return callback({ success: false, error: 'You are not the host.' });
      }

      const result = room.approveClaim(claimId);
      if (result.success) {
        // Announce winner to all players
        io.to(room.code).emit('game:winner-announced', {
          claim: result.claim,
          wonCategories: room.wonCategories,
          gameStatus: room.status,
        });
        // Update all clients about the state change
        io.to(room.code).emit('game:state-update', room.getState());
      }

      callback(result);
    } catch (error) {
      callback({ success: false, error: 'Failed to approve claim.' });
    }
  });

  /**
   * Host rejects a claim
   */
  socket.on('host:reject-claim', ({ claimId }, callback) => {
    try {
      const room = roomManager.getRoomForSocket(socket.id);
      if (!room || room.hostSocketId !== socket.id) {
        return callback({ success: false, error: 'You are not the host.' });
      }

      const result = room.rejectClaim(claimId);
      if (result.success) {
        // Notify the player
        io.to(result.claim.playerId).emit('game:claim-rejected', result.claim);
        // Update all clients
        io.to(room.code).emit('game:state-update', room.getState());
      }

      callback(result);
    } catch (error) {
      callback({ success: false, error: 'Failed to reject claim.' });
    }
  });

  /**
   * Host resolves the claim review and resumes game
   */
  socket.on('host:resolve-claims', (callback) => {
    try {
      const room = roomManager.getRoomForSocket(socket.id);
      if (!room || room.hostSocketId !== socket.id) {
        return callback({ success: false, error: 'You are not the host.' });
      }

      const result = room.resolveClaims();
      if (result.success) {
        io.to(room.code).emit('game:resumed', room.getState());
        io.to(room.code).emit('game:state-update', room.getState());
      }
      callback(result);
    } catch (error) {
      callback({ success: false, error: 'Failed to resolve claims.' });
    }
  });

  /**
   * Host resets the game
   */
  socket.on('host:reset-game', (callback) => {
    try {
      const room = roomManager.getRoomForSocket(socket.id);
      if (!room || room.hostSocketId !== socket.id) {
        return callback({ success: false, error: 'You are not the host.' });
      }

      room.resetGame();
      
      // Send each player their new ticket
      for (const [playerId, player] of room.players) {
        io.to(playerId).emit('game:reset', room.getState(playerId));
      }

      callback({ success: true, state: room.getState() });
    } catch (error) {
      callback({ success: false, error: 'Failed to reset game.' });
    }
  });

  /**
   * Host ends the game
   */
  socket.on('host:end-game', (callback) => {
    try {
      const room = roomManager.getRoomForSocket(socket.id);
      if (!room || room.hostSocketId !== socket.id) {
        return callback({ success: false, error: 'You are not the host.' });
      }

      room.status = GAME_STATUS.FINISHED;
      io.to(room.code).emit('game:ended', room.getState());
      callback({ success: true });
    } catch (error) {
      callback({ success: false, error: 'Failed to end game.' });
    }
  });

  /**
   * Host requests current state
   */
  socket.on('host:get-state', (callback) => {
    try {
      const room = roomManager.getRoomForSocket(socket.id);
      if (!room || room.hostSocketId !== socket.id) {
        return callback({ success: false, error: 'Room not found.' });
      }
      callback({ success: true, state: room.getState() });
    } catch (error) {
      callback({ success: false, error: 'Failed to get state.' });
    }
  });

  // ==================== PLAYER EVENTS ====================

  /**
   * Player joins a room
   */
  socket.on('player:join-room', ({ roomCode, playerName }, callback) => {
    try {
      if (!roomCode || !playerName || playerName.trim().length === 0) {
        return callback({ success: false, error: 'Room code and player name are required.' });
      }

      if (playerName.trim().length > 20) {
        return callback({ success: false, error: 'Player name must be 20 characters or less.' });
      }

      const result = roomManager.joinRoom(socket.id, roomCode.toUpperCase(), playerName.trim());
      
      if (!result.success) {
        return callback({ success: false, error: result.error });
      }

      socket.join(result.room.code);

      // Notify host and other players
      io.to(result.room.code).emit('game:player-joined', {
        playerName: playerName.trim(),
        playerCount: result.room.players.size,
        players: Array.from(result.room.players.values()).map(p => ({
          id: p.id,
          name: p.name,
        })),
      });

      callback({
        success: true,
        state: result.room.getState(socket.id),
      });
    } catch (error) {
      console.error('Error joining room:', error);
      callback({ success: false, error: 'Failed to join room.' });
    }
  });

  /**
   * Player marks a number on their ticket
   */
  socket.on('player:mark-number', ({ number }, callback) => {
    try {
      const room = roomManager.getRoomForSocket(socket.id);
      if (!room) {
        return callback({ success: false, error: 'Room not found.' });
      }

      const result = room.markNumber(socket.id, number);
      if (result.success) {
        // Notify host of the mark
        io.to(room.hostSocketId).emit('game:player-marked', {
          playerId: socket.id,
          playerName: room.players.get(socket.id).name,
          number,
          markedCount: room.players.get(socket.id).markedNumbers.length,
        });
      }

      callback(result);
    } catch (error) {
      callback({ success: false, error: 'Failed to mark number.' });
    }
  });

  /**
   * Player unmarks a number on their ticket
   */
  socket.on('player:unmark-number', ({ number }, callback) => {
    try {
      const room = roomManager.getRoomForSocket(socket.id);
      if (!room) {
        return callback({ success: false, error: 'Room not found.' });
      }

      const result = room.unmarkNumber(socket.id, number);
      callback(result);
    } catch (error) {
      callback({ success: false, error: 'Failed to unmark number.' });
    }
  });

  /**
   * Player submits a winning claim
   */
  socket.on('player:submit-claim', ({ claimType }, callback) => {
    try {
      const room = roomManager.getRoomForSocket(socket.id);
      if (!room) {
        return callback({ success: false, error: 'Room not found.' });
      }

      if (!Object.values(CLAIM_TYPES).includes(claimType)) {
        return callback({ success: false, error: 'Invalid claim type.' });
      }

      const result = room.submitClaim(socket.id, claimType);

      if (result.success) {
        // Notify host of the pending claim
        io.to(room.hostSocketId).emit('game:claim-submitted', {
          claim: result.claim,
          pendingClaims: room.pendingClaims,
          status: room.status,
        });

        // Notify all players that a claim was made
        io.to(room.code).emit('game:claim-notification', {
          playerName: result.claim.playerName,
          claimName: result.claim.claimName,
          status: 'pending',
          gameStatus: room.status,
        });
      }

      callback(result);
    } catch (error) {
      console.error('Error submitting claim:', error);
      callback({ success: false, error: 'Failed to submit claim.' });
    }
  });

  /**
   * Player requests current state
   */
  socket.on('player:get-state', (callback) => {
    try {
      const room = roomManager.getRoomForSocket(socket.id);
      if (!room) {
        return callback({ success: false, error: 'Room not found.' });
      }
      callback({ success: true, state: room.getState(socket.id) });
    } catch (error) {
      callback({ success: false, error: 'Failed to get state.' });
    }
  });

  // ==================== DISCONNECT ====================

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    
    const result = roomManager.handleDisconnect(socket.id);
    
    if (result.roomCode) {
      if (result.wasHost) {
        io.to(result.roomCode).emit('game:host-disconnected', {
          message: 'The host has disconnected. The game has ended.',
        });
      } else if (result.playerName) {
        const room = roomManager.getRoom(result.roomCode);
        if (room) {
          io.to(result.roomCode).emit('game:player-left', {
            playerName: result.playerName,
            playerCount: room.players.size,
          });
        }
      }
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🎲 Tambola Server running on port ${PORT}`);
  console.log(`   Accepting connections from: ${CLIENT_URL}\n`);
});

module.exports = { app, server, io };
