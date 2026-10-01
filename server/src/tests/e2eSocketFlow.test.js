const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { io: ioClient } = require('socket.io-client');
const { RoomManager } = require('../gameRoom');

describe('E2E Socket.IO Real-Time Flow', () => {
  let app;
  let server;
  let io;
  let roomManager;
  let hostSocket;
  let playerSocket;
  let port;

  before(async () => {
    app = express();
    server = http.createServer(app);
    io = new Server(server, { cors: { origin: '*' } });
    roomManager = new RoomManager();

    io.on('connection', (socket) => {
      socket.on('host:create-room', (maybeSettings, maybeCallback) => {
        const callback = typeof maybeSettings === 'function' ? maybeSettings : maybeCallback;
        const initialSettings = typeof maybeSettings === 'object' ? maybeSettings : {};
        const room = roomManager.createRoom(socket.id, initialSettings);
        socket.join(room.code);
        callback?.({ success: true, roomCode: room.code, state: room.getState() });
      });

      socket.on('host:update-settings', (settings, callback) => {
        const room = roomManager.getRoomForSocket(socket.id);
        if (!room) return callback?.({ success: false, error: 'Room not found' });
        const result = room.updateSettings(settings);
        io.to(room.code).emit('game:settings-updated', { settings: room.settings });
        callback?.(result);
      });

      socket.on('host:switch-mode', ({ mode, interval }, callback) => {
        const room = roomManager.getRoomForSocket(socket.id);
        if (!room) return callback?.({ success: false, error: 'Room not found' });
        const result = room.setCallingMode(mode, interval);
        callback?.(result);
      });

      socket.on('host:start-game', (callback) => {
        const room = roomManager.getRoomForSocket(socket.id);
        if (!room) return callback?.({ success: false, error: 'Room not found' });
        const result = room.startGame();
        io.to(room.code).emit('game:started', room.getState());
        callback?.({ success: true, state: room.getState() });
      });

      socket.on('host:start-auto-calling', (callback) => {
        const room = roomManager.getRoomForSocket(socket.id);
        if (!room) return callback?.({ success: false, error: 'Room not found' });
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
          }
        );
        callback?.(result);
      });

      socket.on('host:pause-auto-calling', (callback) => {
        const room = roomManager.getRoomForSocket(socket.id);
        callback?.(room?.pauseAutoCalling());
      });

      socket.on('host:resume-auto-calling', (callback) => {
        const room = roomManager.getRoomForSocket(socket.id);
        callback?.(room?.resumeAutoCalling());
      });

      socket.on('host:stop-auto-calling', (callback) => {
        const room = roomManager.getRoomForSocket(socket.id);
        callback?.(room?.stopAutoCalling());
      });

      socket.on('host:call-number', (callback) => {
        const room = roomManager.getRoomForSocket(socket.id);
        const result = room.callNextNumber(true);
        if (result.success) {
          io.to(room.code).emit('game:number-called', {
            number: result.result.number,
            calledNumbers: room.numberCaller.getCalledNumbers(),
            remaining: result.result.remaining,
            totalCalled: result.result.totalCalled,
          });
        }
        callback?.(result.success ? { success: true, ...result.result } : result);
      });

      socket.on('player:join-room', ({ roomCode, playerName }, callback) => {
        const result = roomManager.joinRoom(socket.id, roomCode, playerName);
        if (result.success) {
          socket.join(result.room.code);
          callback?.({ success: true, state: result.room.getState(socket.id) });
        } else {
          callback?.({ success: false, error: result.error });
        }
      });
    });

    await new Promise((resolve) => {
      server.listen(0, () => {
        port = server.address().port;
        resolve();
      });
    });

    const clientUrl = `http://localhost:${port}`;

    await new Promise((resolve) => {
      hostSocket = ioClient(clientUrl, { transports: ['websocket'] });
      hostSocket.on('connect', () => {
        playerSocket = ioClient(clientUrl, { transports: ['websocket'] });
        playerSocket.on('connect', resolve);
      });
    });
  });

  after(async () => {
    if (hostSocket) hostSocket.disconnect();
    if (playerSocket) playerSocket.disconnect();
    if (io) io.close();
    if (server) await new Promise((res) => server.close(res));
  });

  it('should complete the entire manual & auto-calling lifecycle over WebSockets', async () => {
    // 1. Host creates room
    const createRoomRes = await new Promise((resolve) => {
      hostSocket.emit('host:create-room', resolve);
    });
    assert.strictEqual(createRoomRes.success, true);
    const roomCode = createRoomRes.roomCode;
    assert.ok(roomCode);

    // 2. Host updates settings: Automatic mode, 1s interval, 2 tickets per player
    const updateSettingsRes = await new Promise((resolve) => {
      hostSocket.emit('host:update-settings', {
        callingMode: 'automatic',
        callingInterval: 1,
        maxTicketsPerPlayer: 2,
      }, resolve);
    });
    assert.strictEqual(updateSettingsRes.success, true);
    assert.strictEqual(updateSettingsRes.settings.callingMode, 'automatic');
    assert.strictEqual(updateSettingsRes.settings.callingInterval, 1);
    assert.strictEqual(updateSettingsRes.settings.maxTicketsPerPlayer, 2);

    // 3. Player joins room
    const joinRes = await new Promise((resolve) => {
      playerSocket.emit('player:join-room', {
        roomCode,
        playerName: 'Bob',
      }, resolve);
    });
    assert.strictEqual(joinRes.success, true);
    assert.strictEqual(joinRes.state.myTickets.length, 2);
    assert.strictEqual(joinRes.state.settings.callingMode, 'automatic');

    // 4. Host starts game
    const startGameRes = await new Promise((resolve) => {
      hostSocket.emit('host:start-game', resolve);
    });
    assert.strictEqual(startGameRes.success, true);
    assert.strictEqual(startGameRes.state.status, 'playing');

    // 5. Host starts auto calling
    const startAutoRes = await new Promise((resolve) => {
      hostSocket.emit('host:start-auto-calling', resolve);
    });
    assert.strictEqual(startAutoRes.success, true);
    assert.strictEqual(startAutoRes.autoCallingState, 'running');

    // 6. Verify number called automatically and received by player
    const autoNumberData = await new Promise((resolve) => {
      playerSocket.once('game:number-called', resolve);
    });
    assert.ok(autoNumberData.number >= 1 && autoNumberData.number <= 90);
    assert.strictEqual(autoNumberData.calledNumbers.length, 1);

    // 7. Host pauses auto calling
    const pauseRes = await new Promise((resolve) => {
      hostSocket.emit('host:pause-auto-calling', resolve);
    });
    assert.strictEqual(pauseRes.success, true);
    assert.strictEqual(pauseRes.autoCallingState, 'paused');

    // 8. Host resumes auto calling
    const resumeRes = await new Promise((resolve) => {
      hostSocket.emit('host:resume-auto-calling', resolve);
    });
    assert.strictEqual(resumeRes.success, true);
    assert.strictEqual(resumeRes.autoCallingState, 'running');

    // 9. Host stops auto calling
    const stopRes = await new Promise((resolve) => {
      hostSocket.emit('host:stop-auto-calling', resolve);
    });
    assert.strictEqual(stopRes.success, true);
    assert.strictEqual(stopRes.autoCallingState, 'stopped');

    // 10. Host safely switches mode to manual
    const switchModeRes = await new Promise((resolve) => {
      hostSocket.emit('host:switch-mode', { mode: 'manual' }, resolve);
    });
    assert.strictEqual(switchModeRes.success, true);
    assert.strictEqual(switchModeRes.settings.callingMode, 'manual');

    // 11. Host calls next number manually
    const manualCallRes = await new Promise((resolve) => {
      hostSocket.emit('host:call-number', resolve);
    });
    assert.strictEqual(manualCallRes.success, true);
    assert.ok(manualCallRes.number >= 1 && manualCallRes.number <= 90);
    assert.strictEqual(manualCallRes.totalCalled, 2);
  });
});
