/**
 * Game Room Manager
 * 
 * Manages game rooms, players, and game state.
 * All game logic is server-authoritative.
 */

const { v4: uuidv4 } = require('uuid');
const { generateTicket } = require('./ticketGenerator');
const { NumberCaller } = require('./numberCaller');
const { validateClaim, CLAIM_TYPES, CLAIM_ORDER, formatClaimName } = require('./claimValidator');

/**
 * Generate a short, human-friendly room code
 * @returns {string}
 */
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I, O, 0, 1 to avoid confusion
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/**
 * Game states
 */
const GAME_STATUS = {
  WAITING: 'waiting',     // Waiting for players to join
  PLAYING: 'playing',     // Game in progress
  PAUSED: 'paused',       // Game paused by host
  FINISHED: 'finished',   // Game completed
};

class GameRoom {
  constructor(hostSocketId, initialSettings = {}) {
    this.id = uuidv4();
    this.code = generateRoomCode();
    this.hostSocketId = hostSocketId;
    this.status = GAME_STATUS.WAITING;
    this.numberCaller = new NumberCaller();
    this.players = new Map(); // socketId -> player info
    this.wonCategories = {}; // claimType -> { playerName, playerId, timestamp } (for backward compatibility)
    this.categoryWinners = {
      [CLAIM_TYPES.EARLY_FIVE]: [],
      [CLAIM_TYPES.TOP_LINE]: [],
      [CLAIM_TYPES.MIDDLE_LINE]: [],
      [CLAIM_TYPES.BOTTOM_LINE]: [],
      [CLAIM_TYPES.FULL_HOUSE]: [],
    };
    this.claims = []; // History of all claims (approved & rejected)
    this.createdAt = Date.now();
    this.pendingClaims = []; // Claims waiting for host approval

    // Game Settings
    this.settings = {
      callingMode: initialSettings.callingMode || 'manual', // 'manual' | 'automatic'
      callingInterval: Number(initialSettings.callingInterval) || 10, // in seconds (3, 5, 10, 15, 20, 30, 60)
      maxTicketsPerPlayer: Math.max(1, Math.min(3, Number(initialSettings.maxTicketsPerPlayer) || 1)), // 1 to 3
      categorySettings: {
        [CLAIM_TYPES.EARLY_FIVE]: { enabled: true, maxWinners: 1 },
        [CLAIM_TYPES.TOP_LINE]: { enabled: true, maxWinners: 1 },
        [CLAIM_TYPES.MIDDLE_LINE]: { enabled: true, maxWinners: 1 },
        [CLAIM_TYPES.BOTTOM_LINE]: { enabled: true, maxWinners: 1 },
        [CLAIM_TYPES.FULL_HOUSE]: { enabled: true, maxWinners: 1 },
        ...(initialSettings.categorySettings || {}),
      },
    };

    // Auto-calling state & timer
    this.autoCallingState = 'stopped'; // 'stopped' | 'running' | 'paused'
    this.timerRemaining = this.settings.callingInterval;
    this.timerInterval = null;
    this.onAutoCallCallback = null;
    this.onTimerTickCallback = null;
    this.onAutoCallFinishedCallback = null;
  }

  /**
   * Update room settings
   * @param {object} newSettings 
   * @returns {{ success: boolean, settings?: object, autoCalling?: object, error?: string }}
   */
  updateSettings(newSettings) {
    if (!newSettings || typeof newSettings !== 'object') {
      return { success: false, error: 'Invalid settings object.' };
    }

    if (newSettings.callingMode) {
      if (newSettings.callingMode !== 'manual' && newSettings.callingMode !== 'automatic') {
        return { success: false, error: 'Invalid calling mode. Must be "manual" or "automatic".' };
      }
      this.settings.callingMode = newSettings.callingMode;
      if (this.settings.callingMode === 'manual' && this.autoCallingState === 'running') {
        this.stopAutoCalling();
      }
    }

    if (newSettings.callingInterval !== undefined) {
      const interval = Number(newSettings.callingInterval);
      if (interval >= 1 && interval <= 300) {
        this.settings.callingInterval = interval;
        if (this.autoCallingState === 'stopped') {
          this.timerRemaining = interval;
        }
      }
    }

    if (newSettings.maxTicketsPerPlayer !== undefined && this.status === GAME_STATUS.WAITING) {
      const tickets = Math.max(1, Math.min(3, Number(newSettings.maxTicketsPerPlayer) || 1));
      this.settings.maxTicketsPerPlayer = tickets;
      // Adjust any already-joined players in waiting room
      for (const [, player] of this.players) {
        if (player.tickets.length < tickets) {
          while (player.tickets.length < tickets) {
            player.tickets.push(generateTicket());
          }
        } else if (player.tickets.length > tickets) {
          player.tickets = player.tickets.slice(0, tickets);
        }
        player.ticket = player.tickets[0];
      }
    }

    if (newSettings.categorySettings && typeof newSettings.categorySettings === 'object') {
      for (const [type, cfg] of Object.entries(newSettings.categorySettings)) {
        if (this.settings.categorySettings[type]) {
          if (cfg.enabled !== undefined) {
            this.settings.categorySettings[type].enabled = Boolean(cfg.enabled);
          }
          if (cfg.maxWinners !== undefined) {
            const mw = Math.max(1, Math.min(10, Number(cfg.maxWinners) || 1));
            this.settings.categorySettings[type].maxWinners = mw;
          }
        }
      }
    }

    return {
      success: true,
      settings: this.settings,
      autoCalling: this.getAutoCallingState(),
    };
  }

  /**
   * Safely set the calling mode (and optionally interval)
   * Preserves all called numbers and game state
   * @param {'manual' | 'automatic'} mode 
   * @param {number} [interval] 
   * @returns {{ success: boolean, settings?: object, autoCalling?: object, error?: string }}
   */
  setCallingMode(mode, interval) {
    if (mode !== 'manual' && mode !== 'automatic') {
      return { success: false, error: 'Calling mode must be "manual" or "automatic".' };
    }

    // Safe mode switching
    if (this.autoCallingState === 'running') {
      this.stopAutoCalling();
    }

    this.settings.callingMode = mode;
    if (interval && Number(interval) >= 1) {
      this.settings.callingInterval = Number(interval);
    }
    this.timerRemaining = this.settings.callingInterval;

    return {
      success: true,
      settings: this.settings,
      autoCalling: this.getAutoCallingState(),
    };
  }

  /**
   * Start automatic calling
   * @param {Function} [onNumberCalled] 
   * @param {Function} [onTick] 
   * @param {Function} [onFinished] 
   * @returns {{ success: boolean, autoCallingState?: string, timerRemaining?: number, error?: string }}
   */
  startAutoCalling(onNumberCalled, onTick, onFinished) {
    if (this.status !== GAME_STATUS.PLAYING) {
      return { success: false, error: 'Game is not currently playing.' };
    }

    if (this.settings.callingMode !== 'automatic') {
      return { success: false, error: 'Calling mode is not set to automatic.' };
    }

    if (this.numberCaller.isComplete()) {
      return { success: false, error: 'All numbers have already been called.' };
    }

    if (onNumberCalled) this.onAutoCallCallback = onNumberCalled;
    if (onTick) this.onTimerTickCallback = onTick;
    if (onFinished) this.onAutoCallFinishedCallback = onFinished;

    this.autoCallingState = 'running';
    this.timerRemaining = this.settings.callingInterval;

    this._startTimer();

    return {
      success: true,
      autoCallingState: this.autoCallingState,
      timerRemaining: this.timerRemaining,
    };
  }

  /**
   * Pause automatic calling
   * @returns {{ success: boolean, autoCallingState?: string, timerRemaining?: number, error?: string }}
   */
  pauseAutoCalling() {
    if (this.autoCallingState !== 'running') {
      return { success: false, error: 'Automatic calling is not currently running.' };
    }

    this.autoCallingState = 'paused';
    this._clearTimer();

    return {
      success: true,
      autoCallingState: this.autoCallingState,
      timerRemaining: this.timerRemaining,
    };
  }

  /**
   * Resume automatic calling
   * @returns {{ success: boolean, autoCallingState?: string, timerRemaining?: number, error?: string }}
   */
  resumeAutoCalling() {
    if (this.autoCallingState !== 'paused') {
      return { success: false, error: 'Automatic calling is not paused.' };
    }

    if (this.status !== GAME_STATUS.PLAYING) {
      return { success: false, error: 'Game is not playing.' };
    }

    this.autoCallingState = 'running';
    this._startTimer();

    return {
      success: true,
      autoCallingState: this.autoCallingState,
      timerRemaining: this.timerRemaining,
    };
  }

  /**
   * Stop automatic calling
   * @returns {{ success: boolean, autoCallingState?: string, timerRemaining?: number }}
   */
  stopAutoCalling() {
    this.autoCallingState = 'stopped';
    this.timerRemaining = this.settings.callingInterval;
    this._clearTimer();

    return {
      success: true,
      autoCallingState: this.autoCallingState,
      timerRemaining: this.timerRemaining,
    };
  }

  _clearTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  _startTimer() {
    this._clearTimer();

    this.timerInterval = setInterval(() => {
      if (this.autoCallingState !== 'running' || this.status !== GAME_STATUS.PLAYING) {
        return;
      }

      this.timerRemaining -= 1;

      if (this.onTimerTickCallback) {
        this.onTimerTickCallback({
          timerRemaining: Math.max(0, this.timerRemaining),
          interval: this.settings.callingInterval,
          autoCallingState: this.autoCallingState,
        });
      }

      if (this.timerRemaining <= 0) {
        const result = this.callNextNumber(false);

        if (result.success) {
          this.timerRemaining = this.settings.callingInterval;

          if (this.onAutoCallCallback) {
            this.onAutoCallCallback(result.result);
          }

          if (this.numberCaller.isComplete()) {
            this.stopAutoCalling();
            if (this.onAutoCallFinishedCallback) {
              this.onAutoCallFinishedCallback({
                message: 'All numbers have been called.',
                remaining: 0,
              });
            }
          }
        } else {
          this.stopAutoCalling();
          if (this.onAutoCallFinishedCallback) {
            this.onAutoCallFinishedCallback({
              message: result.error || 'All numbers have been called.',
              remaining: 0,
            });
          }
        }
      }
    }, 1000);
  }

  getAutoCallingState() {
    return {
      state: this.autoCallingState,
      timerRemaining: this.timerRemaining,
      interval: this.settings.callingInterval,
      callingMode: this.settings.callingMode,
    };
  }

  /**
   * Add a player to the room
   * @param {string} socketId 
   * @param {string} name 
   * @returns {{ success: boolean, player?: object, error?: string }}
   */
  addPlayer(socketId, name) {
    if (this.status !== GAME_STATUS.WAITING && this.status !== GAME_STATUS.PAUSED) {
      return { success: false, error: 'Game is already in progress. Cannot join now.' };
    }

    if (this.players.has(socketId)) {
      return { success: false, error: 'You are already in this room.' };
    }

    // Check for duplicate names
    for (const [, player] of this.players) {
      if (player.name.toLowerCase() === name.toLowerCase()) {
        return { success: false, error: 'A player with this name already exists.' };
      }
    }

    const ticketCount = this.settings.maxTicketsPerPlayer || 1;
    const tickets = Array.from({ length: ticketCount }, () => generateTicket());

    const player = {
      id: socketId,
      name: name.trim(),
      ticket: tickets[0], // primary ticket
      tickets,            // all player tickets
      markedNumbers: [],
      claims: [],
      joinedAt: Date.now(),
    };

    this.players.set(socketId, player);
    return { success: true, player };
  }

  /**
   * Remove a player from the room
   * @param {string} socketId 
   */
  removePlayer(socketId) {
    this.players.delete(socketId);
  }

  /**
   * Start the game
   * @returns {{ success: boolean, error?: string }}
   */
  startGame() {
    if (this.players.size === 0) {
      return { success: false, error: 'Need at least 1 player to start.' };
    }
    this.status = GAME_STATUS.PLAYING;
    return { success: true };
  }

  /**
   * Pause the game
   */
  pauseGame() {
    if (this.status === GAME_STATUS.PLAYING) {
      this.status = GAME_STATUS.PAUSED;
      if (this.autoCallingState === 'running') {
        this.pauseAutoCalling();
      }
      return { success: true };
    }
    return { success: false, error: 'Game is not currently playing.' };
  }

  /**
   * Resume the game
   */
  resumeGame() {
    if (this.status === GAME_STATUS.PAUSED) {
      this.status = GAME_STATUS.PLAYING;
      return { success: true };
    }
    return { success: false, error: 'Game is not paused.' };
  }

  /**
   * Call the next number
   * @param {boolean} [isManual=false] - Whether this was triggered manually by the host button
   * @returns {{ success: boolean, result?: object, error?: string }}
   */
  callNextNumber(isManual = false) {
    if (this.status !== GAME_STATUS.PLAYING) {
      return { success: false, error: 'Game is not currently playing.' };
    }

    // Safety: Prevent conflicting manual call when auto-calling is running
    if (isManual && this.settings.callingMode === 'automatic' && this.autoCallingState === 'running') {
      return {
        success: false,
        error: 'Cannot call number manually while automatic calling is active. Please pause or stop auto-calling first.',
      };
    }

    const result = this.numberCaller.callNext();
    if (!result) {
      this.status = GAME_STATUS.FINISHED;
      this.stopAutoCalling();
      return { success: false, error: 'All numbers have been called!' };
    }

    return { success: true, result };
  }

  /**
   * Mark a number on a player's ticket
   * @param {string} socketId 
   * @param {number} number 
   * @returns {{ success: boolean, error?: string }}
   */
  markNumber(socketId, number) {
    const player = this.players.get(socketId);
    if (!player) {
      return { success: false, error: 'Player not found.' };
    }

    // Verify the number has been called
    if (!this.numberCaller.isNumberCalled(number)) {
      return { success: false, error: 'This number has not been called yet.' };
    }

    // Verify the number is on at least one of the player's tickets
    const allPlayerNumbers = (player.tickets || [player.ticket])
      .flatMap(t => t.flat().filter(n => n !== null));

    if (!allPlayerNumbers.includes(number)) {
      return { success: false, error: 'This number is not on your ticket.' };
    }

    // Check if already marked
    if (player.markedNumbers.includes(number)) {
      return { success: false, error: 'This number is already marked.' };
    }

    player.markedNumbers.push(number);
    return { success: true };
  }

  /**
   * Unmark a number on a player's ticket
   * @param {string} socketId 
   * @param {number} number 
   * @returns {{ success: boolean, error?: string }}
   */
  unmarkNumber(socketId, number) {
    const player = this.players.get(socketId);
    if (!player) {
      return { success: false, error: 'Player not found.' };
    }

    const index = player.markedNumbers.indexOf(number);
    if (index === -1) {
      return { success: false, error: 'This number is not marked.' };
    }

    player.markedNumbers.splice(index, 1);
    return { success: true };
  }

  /**
   * Submit a claim for validation
   * @param {string} socketId 
   * @param {string} claimType 
   * @returns {{ success: boolean, claim?: object, error?: string }}
   */
  submitClaim(socketId, claimType) {
    const player = this.players.get(socketId);
    if (!player) {
      return { success: false, error: 'Player not found.' };
    }

    if (this.status !== GAME_STATUS.PLAYING && this.status !== GAME_STATUS.PAUSED) {
      return { success: false, error: 'Game is not active.' };
    }

    const catConfig = this.settings.categorySettings[claimType];
    if (catConfig && !catConfig.enabled) {
      return { success: false, error: `${formatClaimName(claimType)} is disabled for this game.` };
    }

    const maxWinners = catConfig?.maxWinners || 1;
    const currentWinners = this.categoryWinners[claimType] || [];
    if (currentWinners.length >= maxWinners) {
      return { success: false, error: `${formatClaimName(claimType)} has already been won (maximum winners: ${maxWinners}).` };
    }

    if (currentWinners.some(w => w.playerId === socketId)) {
      return { success: false, error: `You have already won ${formatClaimName(claimType)}.` };
    }

    // Validate across all of the player's tickets
    const tickets = player.tickets && player.tickets.length > 0 ? player.tickets : [player.ticket];
    let validation = null;
    let qualifyingTicketIndex = 0;

    for (let i = 0; i < tickets.length; i++) {
      const res = validateClaim(
        claimType,
        tickets[i],
        this.numberCaller.getCalledNumbers(),
        player.markedNumbers,
        this.categoryWinners,
        this.settings.categorySettings
      );
      if (res.valid) {
        validation = res;
        qualifyingTicketIndex = i;
        break;
      } else {
        if (!validation) validation = res;
      }
    }

    const claim = {
      id: uuidv4(),
      playerId: socketId,
      playerName: player.name,
      claimType,
      claimName: formatClaimName(claimType),
      ticketIndex: qualifyingTicketIndex,
      timestamp: Date.now(),
      valid: validation.valid,
      error: validation.error || null,
      status: validation.valid ? 'pending' : 'rejected',
      markedNumbers: [...player.markedNumbers],
    };

    this.claims.push(claim);

    if (!validation.valid) {
      return { success: false, error: validation.error, claim };
    }

    // Add to pending claims for host approval
    this.pendingClaims.push(claim);
    
    return { success: true, claim };
  }

  /**
   * Host approves a claim
   * @param {string} claimId 
   * @returns {{ success: boolean, claim?: object, error?: string }}
   */
  approveClaim(claimId) {
    const claimIndex = this.pendingClaims.findIndex(c => c.id === claimId);
    if (claimIndex === -1) {
      return { success: false, error: 'Claim not found in pending list.' };
    }

    const claim = this.pendingClaims[claimIndex];
    const catConfig = this.settings.categorySettings[claim.claimType] || { enabled: true, maxWinners: 1 };
    const maxWinners = catConfig.maxWinners || 1;
    const currentWinners = this.categoryWinners[claim.claimType] || [];

    // Double-check that the category hasn't reached max winners while pending
    if (currentWinners.length >= maxWinners) {
      claim.status = 'rejected';
      claim.error = `${claim.claimName} has already been won (maximum winners: ${maxWinners}).`;
      this.pendingClaims.splice(claimIndex, 1);
      return { success: false, error: claim.error, claim };
    }

    // Approve the claim
    claim.status = 'approved';
    const winnerInfo = {
      playerName: claim.playerName,
      playerId: claim.playerId,
      timestamp: claim.timestamp,
      ticketIndex: claim.ticketIndex,
    };

    currentWinners.push(winnerInfo);
    this.categoryWinners[claim.claimType] = currentWinners;
    // Keep wonCategories for backward compatibility
    this.wonCategories[claim.claimType] = winnerInfo;

    this.pendingClaims.splice(claimIndex, 1);

    // If reached max winners, reject any other pending claims for the same category
    if (currentWinners.length >= maxWinners) {
      this.pendingClaims = this.pendingClaims.filter(c => {
        if (c.claimType === claim.claimType) {
          c.status = 'rejected';
          c.error = `${claim.claimName} has already been won (maximum winners reached: ${maxWinners}).`;
          return false;
        }
        return true;
      });
    }

    // Check if all enabled categories have reached maximum winners
    const allCompleted = Object.entries(this.settings.categorySettings)
      .filter(([_, cfg]) => cfg.enabled)
      .every(([type, cfg]) => (this.categoryWinners[type] || []).length >= cfg.maxWinners);

    if (allCompleted) {
      this.status = GAME_STATUS.FINISHED;
      this.stopAutoCalling();
    }

    return { success: true, claim };
  }

  /**
   * Host rejects a claim
   * @param {string} claimId 
   * @returns {{ success: boolean, claim?: object, error?: string }}
   */
  rejectClaim(claimId) {
    const claimIndex = this.pendingClaims.findIndex(c => c.id === claimId);
    if (claimIndex === -1) {
      return { success: false, error: 'Claim not found in pending list.' };
    }

    const claim = this.pendingClaims[claimIndex];
    claim.status = 'rejected';
    claim.error = 'Rejected by host.';
    this.pendingClaims.splice(claimIndex, 1);

    return { success: true, claim };
  }

  /**
   * Reset game for a new round
   */
  resetGame() {
    this.stopAutoCalling();
    this.numberCaller.reset();
    this.wonCategories = {};
    this.categoryWinners = {
      [CLAIM_TYPES.EARLY_FIVE]: [],
      [CLAIM_TYPES.TOP_LINE]: [],
      [CLAIM_TYPES.MIDDLE_LINE]: [],
      [CLAIM_TYPES.BOTTOM_LINE]: [],
      [CLAIM_TYPES.FULL_HOUSE]: [],
    };
    this.claims = [];
    this.pendingClaims = [];
    this.status = GAME_STATUS.WAITING;

    // Generate new tickets for all players according to settings
    const ticketCount = this.settings.maxTicketsPerPlayer || 1;
    for (const [, player] of this.players) {
      player.tickets = Array.from({ length: ticketCount }, () => generateTicket());
      player.ticket = player.tickets[0];
      player.markedNumbers = [];
      player.claims = [];
    }
  }

  /**
   * Get game state for transmission to clients
   * @param {string} [forSocketId] - If provided, include player-specific data
   * @returns {object}
   */
  getState(forSocketId) {
    const state = {
      roomCode: this.code,
      status: this.status,
      numberCaller: this.numberCaller.toJSON(),
      players: Array.from(this.players.values()).map(p => ({
        id: p.id,
        name: p.name,
        markedCount: p.markedNumbers.length,
        joinedAt: p.joinedAt,
        ticketCount: p.tickets ? p.tickets.length : 1,
      })),
      wonCategories: this.wonCategories,
      categoryWinners: this.categoryWinners,
      claims: this.claims.slice(-20), // Last 20 claims
      pendingClaims: this.pendingClaims,
      playerCount: this.players.size,
      settings: {
        callingMode: this.settings.callingMode,
        callingInterval: this.settings.callingInterval,
        maxTicketsPerPlayer: this.settings.maxTicketsPerPlayer,
        categorySettings: this.settings.categorySettings,
      },
      autoCalling: this.getAutoCallingState(),
    };

    // Include player-specific data
    if (forSocketId && this.players.has(forSocketId)) {
      const player = this.players.get(forSocketId);
      state.myTicket = player.ticket;
      state.myTickets = player.tickets || [player.ticket];
      state.myMarkedNumbers = player.markedNumbers;
      state.myName = player.name;
    }

    return state;
  }
}

/**
 * Room Manager - manages all active game rooms
 */
class RoomManager {
  constructor() {
    this.rooms = new Map(); // roomCode -> GameRoom
    this.socketToRoom = new Map(); // socketId -> roomCode
  }

  /**
   * Create a new room
   * @param {string} hostSocketId 
   * @param {object} [initialSettings]
   * @returns {GameRoom}
   */
  createRoom(hostSocketId, initialSettings) {
    const room = new GameRoom(hostSocketId, initialSettings);
    
    // Ensure unique room code
    while (this.rooms.has(room.code)) {
      room.code = generateRoomCode();
    }
    
    this.rooms.set(room.code, room);
    this.socketToRoom.set(hostSocketId, room.code);
    return room;
  }

  /**
   * Get a room by code
   * @param {string} code 
   * @returns {GameRoom | undefined}
   */
  getRoom(code) {
    return this.rooms.get(code.toUpperCase());
  }

  /**
   * Get room for a socket
   * @param {string} socketId 
   * @returns {GameRoom | undefined}
   */
  getRoomForSocket(socketId) {
    const code = this.socketToRoom.get(socketId);
    return code ? this.rooms.get(code) : undefined;
  }

  /**
   * Join a player to a room
   * @param {string} socketId 
   * @param {string} roomCode 
   * @param {string} playerName 
   * @returns {{ success: boolean, room?: GameRoom, player?: object, error?: string }}
   */
  joinRoom(socketId, roomCode, playerName) {
    const room = this.getRoom(roomCode);
    if (!room) {
      return { success: false, error: 'Room not found. Please check the room code.' };
    }

    const result = room.addPlayer(socketId, playerName);
    if (result.success) {
      this.socketToRoom.set(socketId, room.code);
    }

    return { ...result, room };
  }

  /**
   * Handle socket disconnection
   * @param {string} socketId 
   * @returns {{ roomCode?: string, wasHost: boolean, playerName?: string }}
   */
  handleDisconnect(socketId) {
    const roomCode = this.socketToRoom.get(socketId);
    if (!roomCode) return { wasHost: false };

    const room = this.rooms.get(roomCode);
    if (!room) {
      this.socketToRoom.delete(socketId);
      return { wasHost: false };
    }

    const wasHost = room.hostSocketId === socketId;
    const player = room.players.get(socketId);
    const playerName = player ? player.name : undefined;

    if (wasHost) {
      room.status = GAME_STATUS.FINISHED;
      room.stopAutoCalling();
    } else {
      room.removePlayer(socketId);
    }

    this.socketToRoom.delete(socketId);

    return { roomCode, wasHost, playerName };
  }

  /**
   * Delete a room
   * @param {string} roomCode 
   */
  deleteRoom(roomCode) {
    const room = this.rooms.get(roomCode);
    if (room) {
      room.stopAutoCalling();
      // Clean up socket mappings
      for (const [socketId] of room.players) {
        this.socketToRoom.delete(socketId);
      }
      this.socketToRoom.delete(room.hostSocketId);
      this.rooms.delete(roomCode);
    }
  }

  /**
   * Get room count
   * @returns {number}
   */
  getRoomCount() {
    return this.rooms.size;
  }
}

module.exports = { GameRoom, RoomManager, GAME_STATUS, generateRoomCode };
