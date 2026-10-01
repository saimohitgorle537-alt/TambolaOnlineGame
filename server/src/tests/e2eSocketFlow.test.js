const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { io: ioClient } = require('socket.io-client');

describe('E2E Socket.IO Real-Time Flow', () => {
  let hostSocket;
  let playerSocket;
  const SERVER_URL = 'http://localhost:3001';

  before(async () => {
    await new Promise((resolve) => {
      hostSocket = ioClient(SERVER_URL, {
        transports: ['websocket'],
        forceNew: true,
      });
      hostSocket.on('connect', () => {
        playerSocket = ioClient(SERVER_URL, {
          transports: ['websocket'],
          forceNew: true,
        });
        playerSocket.on('connect', resolve);
      });
    });
  });

  after(() => {
    if (hostSocket && hostSocket.connected) hostSocket.disconnect();
    if (playerSocket && playerSocket.connected) playerSocket.disconnect();
  });

  it('should complete the entire manual & auto-calling lifecycle over WebSockets', async () => {
    // 1. Host creates room
    const createRoomRes = await new Promise((resolve) => {
      hostSocket.emit('host:create-room', resolve);
    });
    assert.strictEqual(createRoomRes.success, true);
    const roomCode = createRoomRes.roomCode;
    assert.ok(roomCode);

    // 2. Host updates settings: Automatic mode, 2s interval, 2 tickets per player
    const updateSettingsRes = await new Promise((resolve) => {
      hostSocket.emit('host:update-settings', {
        callingMode: 'automatic',
        callingInterval: 2,
        maxTicketsPerPlayer: 2,
        categorySettings: {
          top_line: { enabled: true, maxWinners: 2 },
        },
      }, resolve);
    });
    assert.strictEqual(updateSettingsRes.success, true);
    assert.strictEqual(updateSettingsRes.settings.callingMode, 'automatic');
    assert.strictEqual(updateSettingsRes.settings.callingInterval, 2);
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

    // 6. Verify timer tick received by player
    const tickReceived = await new Promise((resolve) => {
      playerSocket.once('game:timer-tick', (data) => {
        resolve(data);
      });
    });
    assert.ok(typeof tickReceived.timerRemaining === 'number');

    // 7. Verify number called automatically and received by player
    const autoNumberData = await new Promise((resolve) => {
      playerSocket.once('game:number-called', (data) => {
        resolve(data);
      });
    });
    assert.ok(autoNumberData.number >= 1 && autoNumberData.number <= 90);
    assert.strictEqual(autoNumberData.calledNumbers.length, 1);

    // 8. Host pauses auto calling
    const pauseRes = await new Promise((resolve) => {
      hostSocket.emit('host:pause-auto-calling', resolve);
    });
    assert.strictEqual(pauseRes.success, true);
    assert.strictEqual(pauseRes.autoCallingState, 'paused');

    // 9. Host resumes auto calling
    const resumeRes = await new Promise((resolve) => {
      hostSocket.emit('host:resume-auto-calling', resolve);
    });
    assert.strictEqual(resumeRes.success, true);
    assert.strictEqual(resumeRes.autoCallingState, 'running');

    // 10. Host stops auto calling
    const stopRes = await new Promise((resolve) => {
      hostSocket.emit('host:stop-auto-calling', resolve);
    });
    assert.strictEqual(stopRes.success, true);
    assert.strictEqual(stopRes.autoCallingState, 'stopped');

    // 11. Host safely switches mode to manual
    const switchModeRes = await new Promise((resolve) => {
      hostSocket.emit('host:switch-mode', { mode: 'manual' }, resolve);
    });
    assert.strictEqual(switchModeRes.success, true);
    assert.strictEqual(switchModeRes.settings.callingMode, 'manual');

    // 12. Host calls next number manually
    const manualCallRes = await new Promise((resolve) => {
      hostSocket.emit('host:call-number', resolve);
    });
    assert.strictEqual(manualCallRes.success, true);
    assert.ok(manualCallRes.number >= 1 && manualCallRes.number <= 90);
    assert.strictEqual(manualCallRes.totalCalled, 2);
  });
});
