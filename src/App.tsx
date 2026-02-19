import { useState, useEffect, useCallback } from 'react';
import { User, Room, TelegramConfig, SUPER_ADMIN_USERNAME, SUPER_ADMIN_PASSWORD } from './types';
import { generateId, loadData, saveData, sendTelegram } from './utils/game';
import Auth from './components/Auth';
import Lobby from './components/Lobby';
import GameRoom from './components/GameRoom';

type View = 'auth' | 'lobby' | 'game';

function ensureSuperAdmin(): void {
  const users = loadData<User[]>('bj_users', []);
  const exists = users.some(u => u.username === SUPER_ADMIN_USERNAME);
  if (!exists) {
    const adminUser: User = {
      id: 'superadmin_' + generateId(),
      username: SUPER_ADMIN_USERNAME,
      fullName: 'Super Admin',
      email: SUPER_ADMIN_USERNAME,
      password: SUPER_ADMIN_PASSWORD,
      balance: 999999,
      isAdmin: true,
      isSuperAdmin: true,
      createdAt: Date.now(),
    };
    saveData('bj_users', [...users, adminUser]);
  } else {
    const updated = users.map(u =>
      u.username === SUPER_ADMIN_USERNAME
        ? { ...u, isSuperAdmin: true, isAdmin: true }
        : u
    );
    saveData('bj_users', updated);
  }
}

ensureSuperAdmin();

export function App() {
  const [users, setUsers] = useState<User[]>(() => loadData('bj_users', []));
  const [rooms, setRooms] = useState<Room[]>(() => loadData('bj_rooms', []));
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      const data = sessionStorage.getItem('bj_currentUser');
      return data ? JSON.parse(data) : null;
    } catch { return null; }
  });
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(() => {
    return sessionStorage.getItem('bj_currentRoomId') || null;
  });
  const [isSpectating, setIsSpectating] = useState<boolean>(() => {
    return sessionStorage.getItem('bj_spectating') === 'true';
  });
  const [telegramConfig, setTelegramConfig] = useState<TelegramConfig>(() =>
    loadData('bj_telegram', { botToken: '', chatId: '' })
  );
  const [view, setView] = useState<View>(() => {
    const savedUser = sessionStorage.getItem('bj_currentUser');
    const savedRoom = sessionStorage.getItem('bj_currentRoomId');
    if (!savedUser) return 'auth';
    if (savedRoom) return 'game';
    return 'lobby';
  });

  const isSuperAdmin = currentUser?.isSuperAdmin === true;

  useEffect(() => {
    const ROOM_TIMEOUT = 60 * 60 * 1000; // 1 saat

    const cleanupInactiveRooms = () => {
      const now = Date.now();
      const freshRooms = loadData<Room[]>('bj_rooms', []);
      const activeRooms: Room[] = [];
      const expiredRooms: Room[] = [];

      for (const room of freshRooms) {
        const elapsed = now - (room.lastUpdate || 0);
        if (elapsed >= ROOM_TIMEOUT) {
          expiredRooms.push(room);
        } else {
          activeRooms.push(room);
        }
      }

      if (expiredRooms.length > 0) {
        saveData('bj_rooms', activeRooms);
        setRooms(activeRooms);
        console.log(`[Cleanup] ${expiredRooms.length} inaktif oda silindi:`, expiredRooms.map(r => r.name));

        // Telegram'a bildir
        const tgConfig = loadData<TelegramConfig>('bj_telegram', { botToken: '', chatId: '' });
        if (tgConfig.botToken && tgConfig.chatId) {
          const lines = [
            '🧹 <b>Otomatik Oda Temizliği</b>',
            '',
            `⏰ <b>${expiredRooms.length}</b> inaktif oda silindi (1 saat):`,
            '',
            ...expiredRooms.map(r => {
              const mins = Math.floor((now - (r.lastUpdate || 0)) / 60000);
              return `• <b>${r.name}</b> (${r.players.length} oyuncu, ${mins} dk inaktif)`;
            }),
            '',
            `📊 Kalan aktif oda: <b>${activeRooms.length}</b>`,
          ];
          sendTelegram(tgConfig, lines.join('\n'));
        }

        // Eğer kullanıcı silinen bir odadaysa, lobiye geri gönder
        if (currentRoomId && expiredRooms.some(r => r.id === currentRoomId)) {
          setCurrentRoomId(null);
          setIsSpectating(false);
          sessionStorage.removeItem('bj_currentRoomId');
          sessionStorage.removeItem('bj_spectating');
          if (view === 'game') setView('lobby');
        }
      }
    };

    // İlk açılışta temizlik yap
    cleanupInactiveRooms();

    // Her 60 saniyede temizlik kontrolü
    const cleanupInterval = setInterval(cleanupInactiveRooms, 60000);

    const interval = setInterval(() => {
      const freshUsers = loadData<User[]>('bj_users', []);
      const freshRooms = loadData<Room[]>('bj_rooms', []);
      setUsers(freshUsers);
      setRooms(freshRooms);

      if (currentUser) {
        const updatedUser = freshUsers.find(u => u.id === currentUser.id);
        if (updatedUser && (updatedUser.balance !== currentUser.balance || updatedUser.isAdmin !== currentUser.isAdmin)) {
          setCurrentUser(updatedUser);
          sessionStorage.setItem('bj_currentUser', JSON.stringify(updatedUser));
        }
      }

      if (currentRoomId) {
        const roomExists = freshRooms.some(r => r.id === currentRoomId);
        if (!roomExists) {
          setCurrentRoomId(null);
          setIsSpectating(false);
          sessionStorage.removeItem('bj_currentRoomId');
          sessionStorage.removeItem('bj_spectating');
          if (view === 'game') setView('lobby');
        }
      }
    }, 800);

    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'bj_users' && e.newValue) {
        const freshUsers = JSON.parse(e.newValue);
        setUsers(freshUsers);
        if (currentUser) {
          const updatedUser = freshUsers.find((u: User) => u.id === currentUser.id);
          if (updatedUser) {
            setCurrentUser(updatedUser);
            sessionStorage.setItem('bj_currentUser', JSON.stringify(updatedUser));
          }
        }
      }
      if (e.key === 'bj_rooms' && e.newValue) {
        setRooms(JSON.parse(e.newValue));
      }
      if (e.key === 'bj_telegram' && e.newValue) {
        setTelegramConfig(JSON.parse(e.newValue));
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => {
      clearInterval(interval);
      clearInterval(cleanupInterval);
      window.removeEventListener('storage', handleStorage);
    };
  }, [currentUser, currentRoomId, view]);

  const handleRegister = useCallback(async (data: { username: string; fullName: string; email: string; password: string }) => {
    const freshUsers = loadData<User[]>('bj_users', []);
    const newUser: User = {
      id: generateId(),
      ...data,
      balance: 1000,
      isAdmin: false,
      isSuperAdmin: false,
      createdAt: Date.now(),
    };
    const updatedUsers = [...freshUsers, newUser];
    saveData('bj_users', updatedUsers);
    setUsers(updatedUsers);
    setCurrentUser(newUser);
    sessionStorage.setItem('bj_currentUser', JSON.stringify(newUser));
    setView('lobby');

    const tgConfig = loadData<TelegramConfig>('bj_telegram', { botToken: '', chatId: '' });
    const lines = [
      '\uD83C\uDD95 <b>Yeni \u00DCye Kaydi!</b>',
      '',
      '\uD83D\uDC64 <b>Ad Soyad:</b> ' + newUser.fullName,
      '\uD83D\uDCE7 <b>E-posta:</b> ' + newUser.email,
      '\uD83C\uDFF7 <b>Kullanici:</b> @' + newUser.username,
      '\uD83D\uDCB0 <b>Baslangic Bakiye:</b> ' + newUser.balance + ' coin',
      '\uD83D\uDCC5 <b>Tarih:</b> ' + new Date().toLocaleString('tr-TR'),
    ];
    const result = await sendTelegram(tgConfig, lines.join('\n'));
    if (!result.ok) {
      console.warn('[Register TG]', result.error);
    }
  }, []);

  const handleLogin = useCallback((user: User) => {
    const freshUsers = loadData<User[]>('bj_users', []);
    const freshUser = freshUsers.find(u => u.id === user.id) || user;
    setCurrentUser(freshUser);
    sessionStorage.setItem('bj_currentUser', JSON.stringify(freshUser));
    setView('lobby');
  }, []);

  const handleLogout = useCallback(() => {
    if (currentRoomId && currentUser) {
      const freshRooms = loadData<Room[]>('bj_rooms', []);
      const updatedRooms = freshRooms.map(room => {
        if (room.id === currentRoomId) {
          const updatedSpectators = (room.spectators || []).filter(s => s.userId !== currentUser.id);
          const updatedPlayers = room.players.filter(p => p.userId !== currentUser.id);
          if (updatedPlayers.length === 0 && updatedSpectators.length === 0) return null;
          if (updatedPlayers.length === 0) return null;
          return { ...room, players: updatedPlayers, spectators: updatedSpectators, lastUpdate: Date.now() };
        }
        return room;
      }).filter(Boolean) as Room[];
      saveData('bj_rooms', updatedRooms);
      setRooms(updatedRooms);
    }
    setCurrentUser(null);
    setCurrentRoomId(null);
    setIsSpectating(false);
    sessionStorage.removeItem('bj_currentUser');
    sessionStorage.removeItem('bj_currentRoomId');
    sessionStorage.removeItem('bj_spectating');
    setView('auth');
  }, [currentRoomId, currentUser]);

  const handleCreateRoom = useCallback((data: { name: string; isPrivate: boolean; code: string; minBet: number }) => {
    if (!currentUser) return;
    const freshRooms = loadData<Room[]>('bj_rooms', []);
    const newRoom: Room = {
      id: generateId(),
      ...data,
      creatorId: currentUser.id,
      creatorName: currentUser.username,
      players: [{
        userId: currentUser.id,
        username: currentUser.username,
        hand: [],
        bet: 0,
        status: 'waiting',
      }],
      spectators: [],
      maxPlayers: 8,
      gameStatus: 'waiting',
      deck: [],
      currentTurnIndex: 0,
      roundNumber: 0,
      pot: 0,
      winners: [],
      message: 'Oyuncular bekleniyor...',
      lastUpdate: Date.now(),
    };
    const updatedRooms = [...freshRooms, newRoom];
    saveData('bj_rooms', updatedRooms);
    setRooms(updatedRooms);
    setCurrentRoomId(newRoom.id);
    setIsSpectating(false);
    sessionStorage.setItem('bj_currentRoomId', newRoom.id);
    sessionStorage.removeItem('bj_spectating');
    setView('game');
  }, [currentUser]);

  const handleJoinRoom = useCallback((roomId: string) => {
    if (!currentUser) return;
    const freshRooms = loadData<Room[]>('bj_rooms', []);
    const updatedRooms = freshRooms.map(room => {
      if (room.id === roomId) {
        if (room.players.find(p => p.userId === currentUser.id)) return room;
        if (room.players.length >= room.maxPlayers) return room;
        const updatedSpectators = (room.spectators || []).filter(s => s.userId !== currentUser.id);
        return {
          ...room,
          players: [...room.players, {
            userId: currentUser.id,
            username: currentUser.username,
            hand: [] as never[],
            bet: 0,
            status: 'waiting' as const,
          }],
          spectators: updatedSpectators,
          lastUpdate: Date.now(),
        };
      }
      return room;
    });
    saveData('bj_rooms', updatedRooms);
    setRooms(updatedRooms);
    setCurrentRoomId(roomId);
    setIsSpectating(false);
    sessionStorage.setItem('bj_currentRoomId', roomId);
    sessionStorage.removeItem('bj_spectating');
    setView('game');
  }, [currentUser]);

  const handleSpectateRoom = useCallback((roomId: string) => {
    if (!currentUser || !currentUser.isSuperAdmin) return;
    const freshRooms = loadData<Room[]>('bj_rooms', []);
    const updatedRooms = freshRooms.map(room => {
      if (room.id === roomId) {
        const spectators = room.spectators || [];
        if (spectators.find(s => s.userId === currentUser.id)) return room;
        return {
          ...room,
          spectators: [...spectators, { userId: currentUser.id, username: currentUser.username }],
          lastUpdate: Date.now(),
        };
      }
      return room;
    });
    saveData('bj_rooms', updatedRooms);
    setRooms(updatedRooms);
    setCurrentRoomId(roomId);
    setIsSpectating(true);
    sessionStorage.setItem('bj_currentRoomId', roomId);
    sessionStorage.setItem('bj_spectating', 'true');
    setView('game');
  }, [currentUser]);

  const handleEnterRoom = useCallback((roomId: string) => {
    setCurrentRoomId(roomId);
    setIsSpectating(false);
    sessionStorage.setItem('bj_currentRoomId', roomId);
    sessionStorage.removeItem('bj_spectating');
    setView('game');
  }, []);

  const handleLeaveRoom = useCallback(() => {
    if (!currentUser || !currentRoomId) return;
    const freshRooms = loadData<Room[]>('bj_rooms', []);
    const updatedRooms = freshRooms.map(room => {
      if (room.id === currentRoomId) {
        const updatedSpectators = (room.spectators || []).filter(s => s.userId !== currentUser.id);
        const updatedPlayers = room.players.filter(p => p.userId !== currentUser.id);
        if (updatedPlayers.length === 0) return null;
        let updatedRoom = { ...room, players: updatedPlayers, spectators: updatedSpectators, lastUpdate: Date.now() };
        if (updatedPlayers.length < 2 && room.gameStatus !== 'waiting') {
          updatedRoom = {
            ...updatedRoom,
            gameStatus: 'waiting',
            message: 'Yeterli oyuncu kalmadi. Yeni oyuncular bekleniyor...',
            currentTurnIndex: 0,
          };
          updatedRoom.players = updatedRoom.players.map(p => ({
            ...p, hand: [], bet: 0, status: 'waiting' as const,
          }));
        }
        return updatedRoom;
      }
      return room;
    }).filter(Boolean) as Room[];

    saveData('bj_rooms', updatedRooms);
    setRooms(updatedRooms);
    setCurrentRoomId(null);
    setIsSpectating(false);
    sessionStorage.removeItem('bj_currentRoomId');
    sessionStorage.removeItem('bj_spectating');
    setView('lobby');
  }, [currentUser, currentRoomId]);

  const handleUpdateRoom = useCallback((updatedRoom: Room) => {
    const freshRooms = loadData<Room[]>('bj_rooms', []);
    const updatedRooms = freshRooms.map(r => r.id === updatedRoom.id ? updatedRoom : r);
    saveData('bj_rooms', updatedRooms);
    setRooms(updatedRooms);
  }, []);

  const handleUpdateUserBalance = useCallback((userId: string, newBalance: number) => {
    const freshUsers = loadData<User[]>('bj_users', []);
    const updatedUsers = freshUsers.map(u => u.id === userId ? { ...u, balance: newBalance } : u);
    saveData('bj_users', updatedUsers);
    setUsers(updatedUsers);
    if (currentUser?.id === userId) {
      const updated = { ...currentUser, balance: newBalance };
      setCurrentUser(updated);
      sessionStorage.setItem('bj_currentUser', JSON.stringify(updated));
    }
  }, [currentUser]);

  const handleUpdateTelegramConfig = useCallback((config: TelegramConfig) => {
    setTelegramConfig(config);
    saveData('bj_telegram', config);
  }, []);

  if (view === 'auth' || !currentUser) {
    return <Auth users={users} onLogin={handleLogin} onRegister={handleRegister} />;
  }

  const currentRoom = rooms.find(r => r.id === currentRoomId);

  if (view === 'game' && currentRoom) {
    const isPlayer = currentRoom.players.some(p => p.userId === currentUser.id);
    const isSpec = isSpectating || (currentRoom.spectators || []).some(s => s.userId === currentUser.id);

    if (isPlayer || isSpec) {
      return (
        <GameRoom
          room={currentRoom}
          currentUser={currentUser}
          users={users}
          updateRoom={handleUpdateRoom}
          updateUserBalance={handleUpdateUserBalance}
          onLeaveRoom={handleLeaveRoom}
          telegramConfig={telegramConfig}
          isSpectator={isSpec && !isPlayer}
        />
      );
    }
  }

  return (
    <Lobby
      currentUser={currentUser}
      rooms={rooms}
      users={users}
      onCreateRoom={handleCreateRoom}
      onJoinRoom={handleJoinRoom}
      onLogout={handleLogout}
      telegramConfig={telegramConfig}
      onUpdateTelegramConfig={handleUpdateTelegramConfig}
      updateUserBalance={handleUpdateUserBalance}
      onEnterRoom={handleEnterRoom}
      onSpectateRoom={handleSpectateRoom}
      isSuperAdmin={isSuperAdmin}
    />
  );
}
