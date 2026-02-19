import { useState } from 'react';
import { User, Room, TelegramConfig } from '../types';
import { sendTelegram, testTelegramConnection } from '../utils/game';

interface LobbyProps {
  currentUser: User;
  rooms: Room[];
  users: User[];
  onCreateRoom: (data: { name: string; isPrivate: boolean; code: string; minBet: number }) => void;
  onJoinRoom: (roomId: string) => void;
  onLogout: () => void;
  telegramConfig: TelegramConfig;
  onUpdateTelegramConfig: (config: TelegramConfig) => void;
  updateUserBalance: (userId: string, newBalance: number) => void;
  onEnterRoom: (roomId: string) => void;
  onSpectateRoom: (roomId: string) => void;
  isSuperAdmin: boolean;
}

export default function Lobby({
  currentUser, rooms, users, onCreateRoom, onJoinRoom, onLogout,
  telegramConfig, onUpdateTelegramConfig, updateUserBalance, onEnterRoom,
  onSpectateRoom, isSuperAdmin,
}: LobbyProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showTelegram, setShowTelegram] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  const [minBet, setMinBet] = useState(10);
  const [joinCode, setJoinCode] = useState('');
  const [joiningRoomId, setJoiningRoomId] = useState<string | null>(null);
  const [botToken, setBotToken] = useState(telegramConfig.botToken);
  const [chatId, setChatId] = useState(telegramConfig.chatId);
  const [createError, setCreateError] = useState('');
  const [tgStatus, setTgStatus] = useState<{ type: 'idle' | 'loading' | 'success' | 'error'; message: string }>({ type: 'idle', message: '' });
  const [tgSaveMsg, setTgSaveMsg] = useState('');

  // Admin panel states
  const [adminSearch, setAdminSearch] = useState('');
  const [adminTab, setAdminTab] = useState<'users' | 'actions'>('users');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [actionType, setActionType] = useState<'set' | 'add' | 'subtract' | 'reset' | 'withdraw'>('set');
  const [actionAmount, setActionAmount] = useState('');
  const [actionNote, setActionNote] = useState('');
  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [sendingTg, setSendingTg] = useState<string | null>(null);

  const handleCreate = () => {
    setCreateError('');
    if (!roomName.trim()) { setCreateError('Oda adi girin.'); return; }
    if (isPrivate && !roomCode.trim()) { setCreateError('Kapali oda icin kod girin.'); return; }
    if (minBet < 1) { setCreateError('Minimum bahis en az 1 olmali.'); return; }
    onCreateRoom({
      name: roomName.trim(),
      isPrivate,
      code: isPrivate ? roomCode.trim() : '',
      minBet,
    });
    setShowCreate(false);
    setRoomName('');
    setIsPrivate(false);
    setRoomCode('');
    setMinBet(10);
  };

  const handleJoin = (room: Room) => {
    if (room.players.find(p => p.userId === currentUser.id)) {
      onEnterRoom(room.id);
      return;
    }
    if (room.players.length >= room.maxPlayers) return;
    if (room.gameStatus !== 'waiting') return;
    if (room.isPrivate) {
      setJoiningRoomId(room.id);
      setJoinCode('');
    } else {
      onJoinRoom(room.id);
    }
  };

  const confirmJoin = (room: Room) => {
    if (joinCode === room.code) {
      onJoinRoom(room.id);
      setJoiningRoomId(null);
      setJoinCode('');
    }
  };

  // ========== ADMIN BALANCE ACTIONS ==========

  const filteredUsers = users.filter(u => {
    if (u.isSuperAdmin) return false;
    if (!adminSearch.trim()) return true;
    const q = adminSearch.toLowerCase();
    return u.username.toLowerCase().includes(q) ||
      u.fullName.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q);
  });

  const selectedUser = users.find(u => u.id === selectedUserId);

  const handleBalanceAction = async () => {
    if (!selectedUser) return;

    let newBalance = selectedUser.balance;
    let actionLabel = '';
    const amount = parseInt(actionAmount) || 0;

    switch (actionType) {
      case 'set':
        if (amount < 0) { setActionFeedback({ type: 'error', message: 'Bakiye negatif olamaz.' }); return; }
        newBalance = amount;
        actionLabel = 'Bakiye ayarlandi: ' + amount + ' coin';
        break;
      case 'add':
        if (amount <= 0) { setActionFeedback({ type: 'error', message: 'Eklenecek miktar 0\'dan buyuk olmali.' }); return; }
        newBalance = selectedUser.balance + amount;
        actionLabel = 'Bonus eklendi: +' + amount + ' coin';
        break;
      case 'subtract':
        if (amount <= 0) { setActionFeedback({ type: 'error', message: 'Cikarilacak miktar 0\'dan buyuk olmali.' }); return; }
        newBalance = Math.max(0, selectedUser.balance - amount);
        actionLabel = 'Coin cikarildi: -' + amount + ' coin';
        break;
      case 'reset':
        newBalance = 0;
        actionLabel = 'Bakiye sifirlandi';
        break;
      case 'withdraw':
        actionLabel = 'Cekim yapildi: ' + selectedUser.balance + ' coin cekildi';
        newBalance = 0;
        break;
    }

    updateUserBalance(selectedUser.id, newBalance);

    // Send to Telegram
    const tgLines = [
      '\uD83D\uDD27 <b>Admin Islem - Bakiye Degisikligi</b>',
      '',
      '\uD83D\uDC64 <b>Oyuncu:</b> ' + selectedUser.fullName,
      '\uD83C\uDFF7 <b>Kullanici:</b> @' + selectedUser.username,
      '\uD83D\uDCE7 <b>E-posta:</b> ' + selectedUser.email,
      '',
      '\uD83D\uDCCB <b>Islem:</b> ' + actionLabel,
      '\uD83D\uDCB0 <b>Onceki Bakiye:</b> ' + selectedUser.balance.toLocaleString() + ' coin',
      '\uD83D\uDCB5 <b>Yeni Bakiye:</b> ' + newBalance.toLocaleString() + ' coin',
    ];
    if (actionNote.trim()) {
      tgLines.push('\uD83D\uDCDD <b>Not:</b> ' + actionNote.trim());
    }
    tgLines.push('');
    tgLines.push('\uD83D\uDCC5 ' + new Date().toLocaleString('tr-TR'));

    const result = await sendTelegram(telegramConfig, tgLines.join('\n'));
    if (!result.ok) {
      console.warn('[Admin TG]', result.error);
    }

    setActionFeedback({
      type: 'success',
      message: selectedUser.username + ': ' + actionLabel + ' (Yeni: ' + newBalance.toLocaleString() + ' coin)',
    });
    setActionAmount('');
    setActionNote('');
    setTimeout(() => setActionFeedback(null), 5000);
  };

  // Send single user balance to Telegram
  const handleSendUserToTelegram = async (user: User) => {
    setSendingTg(user.id);
    const lines = [
      '\uD83D\uDCCA <b>Oyuncu Bakiye Bilgisi</b>',
      '',
      '\uD83D\uDC64 <b>Ad Soyad:</b> ' + user.fullName,
      '\uD83C\uDFF7 <b>Kullanici:</b> @' + user.username,
      '\uD83D\uDCE7 <b>E-posta:</b> ' + user.email,
      '\uD83D\uDCB0 <b>Mevcut Bakiye:</b> ' + user.balance.toLocaleString() + ' coin',
      '\uD83D\uDCC5 <b>Uyelik Tarihi:</b> ' + new Date(user.createdAt).toLocaleString('tr-TR'),
      '',
      '\uD83D\uDCC5 Sorgu: ' + new Date().toLocaleString('tr-TR'),
    ];
    const result = await sendTelegram(telegramConfig, lines.join('\n'));
    setSendingTg(null);
    if (result.ok) {
      setActionFeedback({ type: 'success', message: user.username + ' bilgisi Telegram\'a gonderildi!' });
    } else {
      setActionFeedback({ type: 'error', message: 'Telegram hatasi: ' + (result.error || 'Bilinmeyen') });
    }
    setTimeout(() => setActionFeedback(null), 4000);
  };

  // Send ALL users report to Telegram
  const handleSendAllToTelegram = async () => {
    setSendingTg('all');
    const normalUsers = users.filter(u => !u.isSuperAdmin);
    const totalCoins = normalUsers.reduce((sum, u) => sum + u.balance, 0);
    const lines = [
      '\uD83D\uDCCA <b>TUM OYUNCU BAKIYELERI</b>',
      '',
      '\uD83D\uDC65 <b>Toplam Oyuncu:</b> ' + normalUsers.length,
      '\uD83D\uDCB0 <b>Toplam Coin:</b> ' + totalCoins.toLocaleString(),
      '',
      '━━━━━━━━━━━━━━━━━━',
    ];
    for (const u of normalUsers) {
      lines.push(
        '\uD83D\uDC64 <b>' + u.fullName + '</b> (@' + u.username + ')'
      );
      lines.push(
        '   \uD83D\uDCB0 ' + u.balance.toLocaleString() + ' coin | \uD83D\uDCE7 ' + u.email
      );
    }
    lines.push('');
    lines.push('━━━━━━━━━━━━━━━━━━');
    lines.push('\uD83D\uDCC5 Rapor: ' + new Date().toLocaleString('tr-TR'));

    const result = await sendTelegram(telegramConfig, lines.join('\n'));
    setSendingTg(null);
    if (result.ok) {
      setActionFeedback({ type: 'success', message: 'Tum bakiyeler Telegram\'a gonderildi!' });
    } else {
      setActionFeedback({ type: 'error', message: 'Telegram hatasi: ' + (result.error || 'Bilinmeyen') });
    }
    setTimeout(() => setActionFeedback(null), 4000);
  };

  // Send withdrawal report to Telegram
  const handleWithdrawReport = async (user: User) => {
    setSendingTg(user.id);
    const lines = [
      '\uD83D\uDCB8 <b>CEKIM TALEBI / ISLEM</b>',
      '',
      '\uD83D\uDC64 <b>Oyuncu:</b> ' + user.fullName,
      '\uD83C\uDFF7 <b>Kullanici:</b> @' + user.username,
      '\uD83D\uDCE7 <b>E-posta:</b> ' + user.email,
      '',
      '\uD83D\uDCB0 <b>Cekilecek Miktar:</b> ' + user.balance.toLocaleString() + ' coin',
      '\uD83D\uDCB5 <b>Cekim Sonrasi Bakiye:</b> 0 coin',
      '',
      '\u26A0\uFE0F <i>Bu rapor bilgi amaclidir. Bakiyeyi sifirlamak icin admin panelini kullanin.</i>',
      '\uD83D\uDCC5 ' + new Date().toLocaleString('tr-TR'),
    ];
    const result = await sendTelegram(telegramConfig, lines.join('\n'));
    setSendingTg(null);
    if (result.ok) {
      setActionFeedback({ type: 'success', message: user.username + ' cekim raporu Telegram\'a gonderildi!' });
    } else {
      setActionFeedback({ type: 'error', message: 'Telegram hatasi: ' + (result.error || 'Bilinmeyen') });
    }
    setTimeout(() => setActionFeedback(null), 4000);
  };

  const handleSaveTelegram = () => {
    onUpdateTelegramConfig({ botToken, chatId });
    setTgSaveMsg('Ayarlar kaydedildi!');
    setTimeout(() => setTgSaveMsg(''), 3000);
  };

  const handleTestTelegram = async () => {
    setTgStatus({ type: 'loading', message: 'Test ediliyor...' });
    try {
      const result = await testTelegramConnection({ botToken, chatId });
      if (result.ok) {
        setTgStatus({
          type: 'success',
          message: 'Basarili! Bot: ' + (result.botName || 'OK') + ' - Test mesaji gonderildi.',
        });
      } else {
        setTgStatus({
          type: 'error',
          message: result.error || 'Bilinmeyen hata',
        });
      }
    } catch (err) {
      setTgStatus({
        type: 'error',
        message: 'Beklenmeyen hata: ' + (err instanceof Error ? err.message : 'Bilinmeyen'),
      });
    }
  };

  // Calculate room inactivity
  const getInactivityInfo = (room: Room) => {
    const now = Date.now();
    const elapsed = now - (room.lastUpdate || 0);
    const remaining = Math.max(0, 60 * 60 * 1000 - elapsed);
    const elapsedMins = Math.floor(elapsed / 60000);
    const remainingMins = Math.floor(remaining / 60000);
    const isWarning = remainingMins <= 15;
    const isDanger = remainingMins <= 5;
    return { elapsedMins, remainingMins, isWarning, isDanger };
  };

  const displayRooms = isSuperAdmin ? rooms : rooms.filter(r => r.gameStatus === 'waiting' || r.players.some(p => p.userId === currentUser.id));

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-emerald-950 to-gray-900">
      {/* Header */}
      <div className="bg-gray-900/80 border-b border-emerald-800/30 backdrop-blur-lg sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🃏</span>
            <h1 className="text-xl font-black bg-gradient-to-r from-amber-300 to-amber-500 bg-clip-text text-transparent">
              OJACK
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="bg-gray-800/80 rounded-xl px-4 py-2 flex items-center gap-3 border border-gray-700/50">
              {isSuperAdmin && <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-lg border border-red-500/30 font-bold">ADMIN</span>}
              <span className="text-gray-400 text-sm">👤</span>
              <span className="text-white font-semibold text-sm">{currentUser.username}</span>
              <span className="text-amber-400 font-bold text-sm">💰 {currentUser.balance.toLocaleString()}</span>
            </div>
            <button onClick={onLogout} className="bg-red-500/20 text-red-400 px-3 py-2 rounded-xl text-sm font-semibold hover:bg-red-500/30 transition-all border border-red-500/30">
              Cikis
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3 mb-6">
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 transition-all transform hover:scale-[1.02] active:scale-[0.98]"
          >
            ➕ Oda Olustur
          </button>
          {isSuperAdmin && (
            <>
              <button
                onClick={() => { setShowAdmin(!showAdmin); if (!showAdmin) setShowTelegram(false); }}
                className={`bg-gradient-to-r from-purple-500 to-purple-600 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-purple-500/20 hover:shadow-purple-500/40 transition-all transform hover:scale-[1.02] active:scale-[0.98] ${showAdmin ? 'ring-2 ring-purple-400' : ''}`}
              >
                🛡️ Admin Paneli
              </button>
              <button
                onClick={() => { setShowTelegram(!showTelegram); if (!showTelegram) setShowAdmin(false); }}
                className={`bg-gradient-to-r from-blue-500 to-blue-600 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-blue-500/20 hover:shadow-blue-500/40 transition-all transform hover:scale-[1.02] active:scale-[0.98] ${showTelegram ? 'ring-2 ring-blue-400' : ''}`}
              >
                📱 Telegram Ayarlari
              </button>
            </>
          )}
        </div>

        {/* Create Room Form */}
        {showCreate && (
          <div className="bg-gray-800/80 backdrop-blur-md rounded-2xl p-6 mb-6 border border-emerald-700/30 shadow-xl animate-fadeIn">
            <h2 className="text-xl font-bold text-white mb-4">🏠 Yeni Oda Olustur</h2>
            {createError && (
              <div className="bg-red-500/15 border border-red-500/30 text-red-400 p-3 rounded-xl mb-4 text-sm">⚠️ {createError}</div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-gray-400 text-xs font-semibold mb-1.5 uppercase tracking-wider">Oda Adi</label>
                <input type="text" value={roomName} onChange={e => setRoomName(e.target.value)} placeholder="Oda adini girin"
                  className="w-full bg-gray-900/60 border border-gray-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all placeholder:text-gray-600" />
              </div>
              <div>
                <label className="block text-gray-400 text-xs font-semibold mb-1.5 uppercase tracking-wider">Minimum Bahis</label>
                <input type="number" value={minBet} onChange={e => setMinBet(Math.max(1, parseInt(e.target.value) || 1))} min={1}
                  className="w-full bg-gray-900/60 border border-gray-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all" />
              </div>
              <div>
                <label className="block text-gray-400 text-xs font-semibold mb-1.5 uppercase tracking-wider">Oda Tipi</label>
                <div className="flex gap-3 mt-1">
                  <button onClick={() => setIsPrivate(false)}
                    className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${!isPrivate ? 'bg-emerald-500 text-white shadow-lg' : 'bg-gray-700/50 text-gray-400 hover:bg-gray-700'}`}>
                    🌐 Acik
                  </button>
                  <button onClick={() => setIsPrivate(true)}
                    className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${isPrivate ? 'bg-amber-500 text-gray-900 shadow-lg' : 'bg-gray-700/50 text-gray-400 hover:bg-gray-700'}`}>
                    🔒 Kapali
                  </button>
                </div>
              </div>
              {isPrivate && (
                <div>
                  <label className="block text-gray-400 text-xs font-semibold mb-1.5 uppercase tracking-wider">Oda Kodu</label>
                  <input type="text" value={roomCode} onChange={e => setRoomCode(e.target.value)} placeholder="Gizli kodu girin"
                    className="w-full bg-gray-900/60 border border-gray-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all placeholder:text-gray-600" />
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={handleCreate} className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white px-6 py-3 rounded-xl font-bold shadow-lg hover:shadow-emerald-500/40 transition-all">
                ✅ Olustur
              </button>
              <button onClick={() => setShowCreate(false)} className="bg-gray-700/50 text-gray-400 px-6 py-3 rounded-xl font-semibold hover:bg-gray-700 transition-all">
                Iptal
              </button>
            </div>
          </div>
        )}

        {/* ==================== ADMIN PANEL ==================== */}
        {showAdmin && isSuperAdmin && (
          <div className="bg-gray-800/80 backdrop-blur-md rounded-2xl p-6 mb-6 border border-purple-700/30 shadow-xl animate-fadeIn">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">🛡️ Admin Paneli</h2>
              <div className="flex items-center gap-2">
                <span className="text-emerald-400 text-xs">✅ Super Admin</span>
                <span className="text-gray-500 text-xs">|</span>
                <span className="text-gray-400 text-xs">{users.filter(u => !u.isSuperAdmin).length} oyuncu</span>
              </div>
            </div>

            {/* Action Feedback */}
            {actionFeedback && (
              <div className={`rounded-xl p-3 mb-4 text-sm animate-fadeIn ${
                actionFeedback.type === 'success' ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400' :
                'bg-red-500/15 border border-red-500/30 text-red-400'
              }`}>
                {actionFeedback.type === 'success' ? '✅' : '❌'} {actionFeedback.message}
              </div>
            )}

            {/* Admin Tabs */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setAdminTab('users')}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                  adminTab === 'users' ? 'bg-purple-500 text-white' : 'bg-gray-700/50 text-gray-400 hover:bg-gray-700'
                }`}
              >
                👥 Oyuncu Listesi
              </button>
              <button
                onClick={() => setAdminTab('actions')}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                  adminTab === 'actions' ? 'bg-purple-500 text-white' : 'bg-gray-700/50 text-gray-400 hover:bg-gray-700'
                }`}
              >
                ⚡ Hizli Islemler
              </button>
              <div className="flex-1" />
              <button
                onClick={handleSendAllToTelegram}
                disabled={sendingTg === 'all'}
                className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:shadow-blue-500/40 transition-all disabled:opacity-50"
              >
                {sendingTg === 'all' ? '⏳ Gonderiliyor...' : '📊 Tum Bakiyeleri Telegram\'a Gonder'}
              </button>
            </div>

            {/* Search Bar */}
            <div className="mb-4">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">🔍</span>
                <input
                  type="text"
                  value={adminSearch}
                  onChange={e => setAdminSearch(e.target.value)}
                  placeholder="Oyuncu ara (isim, kullanici adi, e-posta)..."
                  className="w-full bg-gray-900/60 border border-gray-700 text-white rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all placeholder:text-gray-600"
                />
                {adminSearch && (
                  <button
                    onClick={() => setAdminSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                  >✕</button>
                )}
              </div>
              {adminSearch && (
                <p className="text-gray-500 text-xs mt-1">{filteredUsers.length} sonuc bulundu</p>
              )}
            </div>

            {/* ===== USERS TAB ===== */}
            {adminTab === 'users' && (
              <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                {filteredUsers.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-gray-500">Oyuncu bulunamadi.</p>
                  </div>
                ) : (
                  filteredUsers.map(user => (
                    <div
                      key={user.id}
                      className={`bg-gray-900/50 rounded-xl p-4 border transition-all ${
                        selectedUserId === user.id ? 'border-purple-500/50 shadow-lg shadow-purple-500/10' : 'border-gray-700/30 hover:border-gray-600/50'
                      }`}
                    >
                      {/* User Info Row */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                            {user.fullName.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-white font-semibold text-sm truncate">{user.fullName}</p>
                            <p className="text-gray-500 text-xs truncate">@{user.username} • {user.email}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <div className="text-right">
                            <p className="text-amber-400 font-bold text-lg">{user.balance.toLocaleString()}</p>
                            <p className="text-gray-500 text-[10px]">coin</p>
                          </div>
                          <div className="flex flex-col gap-1">
                            <button
                              onClick={() => setSelectedUserId(selectedUserId === user.id ? null : user.id)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                selectedUserId === user.id
                                  ? 'bg-purple-500 text-white'
                                  : 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 border border-purple-500/30'
                              }`}
                            >
                              {selectedUserId === user.id ? '✕ Kapat' : '✏️ Yonet'}
                            </button>
                            <button
                              onClick={() => handleSendUserToTelegram(user)}
                              disabled={sendingTg === user.id}
                              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 border border-blue-500/30 transition-all disabled:opacity-50"
                            >
                              {sendingTg === user.id ? '⏳' : '📱 TG'}
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Expanded Management Area */}
                      {selectedUserId === user.id && (
                        <div className="mt-4 pt-4 border-t border-gray-700/30 animate-fadeIn">
                          {/* Quick Actions */}
                          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
                            <button
                              onClick={() => setActionType('set')}
                              className={`py-2 rounded-lg text-xs font-bold transition-all ${
                                actionType === 'set' ? 'bg-blue-500 text-white' : 'bg-gray-700/50 text-gray-400 hover:bg-gray-700'
                              }`}
                            >
                              💎 Ayarla
                            </button>
                            <button
                              onClick={() => setActionType('add')}
                              className={`py-2 rounded-lg text-xs font-bold transition-all ${
                                actionType === 'add' ? 'bg-emerald-500 text-white' : 'bg-gray-700/50 text-gray-400 hover:bg-gray-700'
                              }`}
                            >
                              ➕ Bonus
                            </button>
                            <button
                              onClick={() => setActionType('subtract')}
                              className={`py-2 rounded-lg text-xs font-bold transition-all ${
                                actionType === 'subtract' ? 'bg-orange-500 text-white' : 'bg-gray-700/50 text-gray-400 hover:bg-gray-700'
                              }`}
                            >
                              ➖ Cikar
                            </button>
                            <button
                              onClick={() => setActionType('reset')}
                              className={`py-2 rounded-lg text-xs font-bold transition-all ${
                                actionType === 'reset' ? 'bg-red-500 text-white' : 'bg-gray-700/50 text-gray-400 hover:bg-gray-700'
                              }`}
                            >
                              🗑️ Sifirla
                            </button>
                            <button
                              onClick={() => setActionType('withdraw')}
                              className={`py-2 rounded-lg text-xs font-bold transition-all ${
                                actionType === 'withdraw' ? 'bg-pink-500 text-white' : 'bg-gray-700/50 text-gray-400 hover:bg-gray-700'
                              }`}
                            >
                              💸 Cekim
                            </button>
                          </div>

                          {/* Action Form */}
                          <div className="bg-gray-800/60 rounded-xl p-4">
                            <p className="text-gray-400 text-xs mb-2 font-semibold uppercase tracking-wider">
                              {actionType === 'set' && '💎 Bakiyeyi Belirli Bir Miktara Ayarla'}
                              {actionType === 'add' && '➕ Bonus Coin Ekle'}
                              {actionType === 'subtract' && '➖ Coin Cikar'}
                              {actionType === 'reset' && '🗑️ Bakiyeyi Sifirla'}
                              {actionType === 'withdraw' && '💸 Tum Coinleri Cek (Bakiye: ' + user.balance.toLocaleString() + ')'}
                            </p>

                            {(actionType === 'set' || actionType === 'add' || actionType === 'subtract') && (
                              <div className="flex gap-2 mb-3">
                                <input
                                  type="number"
                                  value={actionAmount}
                                  onChange={e => setActionAmount(e.target.value)}
                                  placeholder={
                                    actionType === 'set' ? 'Yeni bakiye...' :
                                    actionType === 'add' ? 'Eklenecek miktar...' :
                                    'Cikarilacak miktar...'
                                  }
                                  min={0}
                                  className="flex-1 bg-gray-900/60 border border-gray-600 text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                                />
                                {actionType === 'add' && (
                                  <div className="flex gap-1">
                                    {[100, 500, 1000, 5000].map(v => (
                                      <button
                                        key={v}
                                        onClick={() => setActionAmount(String(v))}
                                        className="px-2 py-1 rounded-lg text-xs font-bold bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-all"
                                      >
                                        +{v}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}

                            {actionType === 'reset' && (
                              <div className="bg-red-900/20 border border-red-700/30 rounded-lg p-3 mb-3">
                                <p className="text-red-400 text-sm font-semibold">⚠️ Dikkat!</p>
                                <p className="text-red-400/70 text-xs">
                                  {user.fullName} (@{user.username}) adli oyuncunun bakiyesi {user.balance.toLocaleString()} coin'den 0'a sifirlanacak.
                                </p>
                              </div>
                            )}

                            {actionType === 'withdraw' && (
                              <div className="bg-pink-900/20 border border-pink-700/30 rounded-lg p-3 mb-3">
                                <p className="text-pink-400 text-sm font-semibold">💸 Cekim Islemi</p>
                                <p className="text-pink-400/70 text-xs">
                                  {user.fullName} (@{user.username}) adli oyuncunun {user.balance.toLocaleString()} coin'i cekilecek ve bakiyesi 0'a dusecek.
                                </p>
                                <button
                                  onClick={() => handleWithdrawReport(user)}
                                  disabled={sendingTg === user.id}
                                  className="mt-2 bg-blue-500/20 text-blue-400 px-3 py-1 rounded-lg text-xs font-bold hover:bg-blue-500/30 border border-blue-500/30 transition-all disabled:opacity-50"
                                >
                                  {sendingTg === user.id ? '⏳ Gonderiliyor...' : '📱 Oncelikle Cekim Raporunu Telegram\'a Gonder'}
                                </button>
                              </div>
                            )}

                            {/* Note field */}
                            <div className="mb-3">
                              <input
                                type="text"
                                value={actionNote}
                                onChange={e => setActionNote(e.target.value)}
                                placeholder="Not ekle (opsiyonel)..."
                                className="w-full bg-gray-900/40 border border-gray-700 text-white rounded-lg px-4 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-purple-500 placeholder:text-gray-600"
                              />
                            </div>

                            {/* Preview */}
                            <div className="bg-gray-900/40 rounded-lg p-3 mb-3">
                              <p className="text-gray-500 text-[10px] uppercase tracking-wider mb-1">Onizleme</p>
                              <div className="flex items-center gap-2 text-sm">
                                <span className="text-gray-400">{user.balance.toLocaleString()}</span>
                                <span className="text-gray-600">→</span>
                                <span className={`font-bold ${
                                  actionType === 'reset' || actionType === 'withdraw' ? 'text-red-400' :
                                  actionType === 'add' ? 'text-emerald-400' :
                                  actionType === 'subtract' ? 'text-orange-400' :
                                  'text-blue-400'
                                }`}>
                                  {actionType === 'set' ? (parseInt(actionAmount) || 0).toLocaleString() :
                                   actionType === 'add' ? (user.balance + (parseInt(actionAmount) || 0)).toLocaleString() :
                                   actionType === 'subtract' ? Math.max(0, user.balance - (parseInt(actionAmount) || 0)).toLocaleString() :
                                   '0'}
                                </span>
                                <span className="text-gray-500 text-xs">coin</span>
                              </div>
                            </div>

                            {/* Confirm Button */}
                            <div className="flex gap-2">
                              <button
                                onClick={handleBalanceAction}
                                className={`flex-1 py-2.5 rounded-xl font-bold text-sm shadow-lg transition-all transform hover:scale-[1.02] active:scale-[0.98] ${
                                  actionType === 'reset' || actionType === 'withdraw'
                                    ? 'bg-gradient-to-r from-red-500 to-red-600 text-white'
                                    : actionType === 'add'
                                    ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white'
                                    : actionType === 'subtract'
                                    ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white'
                                    : 'bg-gradient-to-r from-blue-500 to-blue-600 text-white'
                                }`}
                              >
                                ✅ {actionType === 'set' ? 'Bakiyeyi Ayarla' :
                                    actionType === 'add' ? 'Bonus Ekle' :
                                    actionType === 'subtract' ? 'Coin Cikar' :
                                    actionType === 'reset' ? 'Sifirla' :
                                    'Cekimi Onayla'}
                              </button>
                              <button
                                onClick={() => { setSelectedUserId(null); setActionAmount(''); setActionNote(''); }}
                                className="px-4 py-2.5 rounded-xl font-bold text-sm bg-gray-700/50 text-gray-400 hover:bg-gray-700 transition-all"
                              >
                                Iptal
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {/* ===== ACTIONS TAB ===== */}
            {adminTab === 'actions' && (
              <div className="space-y-4">
                {/* Quick Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-gray-900/50 rounded-xl p-4 border border-gray-700/30">
                    <p className="text-gray-500 text-xs">Toplam Oyuncu</p>
                    <p className="text-white font-bold text-2xl">{users.filter(u => !u.isSuperAdmin).length}</p>
                  </div>
                  <div className="bg-gray-900/50 rounded-xl p-4 border border-gray-700/30">
                    <p className="text-gray-500 text-xs">Toplam Coin</p>
                    <p className="text-amber-400 font-bold text-2xl">{users.filter(u => !u.isSuperAdmin).reduce((s, u) => s + u.balance, 0).toLocaleString()}</p>
                  </div>
                  <div className="bg-gray-900/50 rounded-xl p-4 border border-gray-700/30">
                    <p className="text-gray-500 text-xs">Aktif Oda</p>
                    <p className="text-emerald-400 font-bold text-2xl">{rooms.length}</p>
                  </div>
                  <div className="bg-gray-900/50 rounded-xl p-4 border border-gray-700/30">
                    <p className="text-gray-500 text-xs">Bakiyesi 0 Olan</p>
                    <p className="text-red-400 font-bold text-2xl">{users.filter(u => !u.isSuperAdmin && u.balance === 0).length}</p>
                  </div>
                </div>

                {/* Bulk Actions */}
                <div className="bg-gray-900/50 rounded-xl p-4 border border-gray-700/30">
                  <h3 className="text-white font-bold mb-3">📊 Telegram Raporlari</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      onClick={handleSendAllToTelegram}
                      disabled={sendingTg === 'all'}
                      className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-4 py-3 rounded-xl font-bold shadow-lg hover:shadow-blue-500/40 transition-all disabled:opacity-50"
                    >
                      {sendingTg === 'all' ? '⏳ Gonderiliyor...' : '📊 Tum Bakiyeleri Gonder'}
                    </button>
                    <button
                      onClick={async () => {
                        setSendingTg('zeros');
                        const zeroUsers = users.filter(u => !u.isSuperAdmin && u.balance === 0);
                        if (zeroUsers.length === 0) {
                          setActionFeedback({ type: 'success', message: 'Bakiyesi 0 olan oyuncu yok!' });
                          setSendingTg(null);
                          setTimeout(() => setActionFeedback(null), 3000);
                          return;
                        }
                        const lines = [
                          '\u26A0\uFE0F <b>BAKIYESI 0 OLAN OYUNCULAR</b>',
                          '',
                        ];
                        for (const u of zeroUsers) {
                          lines.push('\uD83D\uDC64 ' + u.fullName + ' (@' + u.username + ') - ' + u.email);
                        }
                        lines.push('');
                        lines.push('\uD83D\uDC65 Toplam: ' + zeroUsers.length + ' oyuncu');
                        lines.push('\uD83D\uDCC5 ' + new Date().toLocaleString('tr-TR'));
                        await sendTelegram(telegramConfig, lines.join('\n'));
                        setSendingTg(null);
                        setActionFeedback({ type: 'success', message: 'Bakiyesi 0 olan oyuncu raporu gonderildi!' });
                        setTimeout(() => setActionFeedback(null), 3000);
                      }}
                      disabled={sendingTg === 'zeros'}
                      className="bg-gradient-to-r from-orange-500 to-orange-600 text-white px-4 py-3 rounded-xl font-bold shadow-lg hover:shadow-orange-500/40 transition-all disabled:opacity-50"
                    >
                      {sendingTg === 'zeros' ? '⏳...' : '⚠️ Bakiyesi 0 Olanlari Gonder'}
                    </button>
                  </div>
                </div>

                {/* Top Users */}
                <div className="bg-gray-900/50 rounded-xl p-4 border border-gray-700/30">
                  <h3 className="text-white font-bold mb-3">🏆 En Yuksek Bakiyeler</h3>
                  <div className="space-y-2">
                    {users
                      .filter(u => !u.isSuperAdmin)
                      .sort((a, b) => b.balance - a.balance)
                      .slice(0, 10)
                      .map((user, idx) => (
                        <div key={user.id} className="flex items-center justify-between py-2 border-b border-gray-700/20 last:border-0">
                          <div className="flex items-center gap-2">
                            <span className="text-gray-500 text-xs w-5">{idx + 1}.</span>
                            <span className={`font-semibold text-sm ${
                              idx === 0 ? 'text-amber-400' : idx === 1 ? 'text-gray-300' : idx === 2 ? 'text-orange-400' : 'text-gray-400'
                            }`}>
                              {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : ''} {user.fullName}
                            </span>
                            <span className="text-gray-600 text-xs">@{user.username}</span>
                          </div>
                          <span className="text-amber-400 font-bold">{user.balance.toLocaleString()} 💰</span>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ==================== TELEGRAM SETTINGS ==================== */}
        {showTelegram && isSuperAdmin && (
          <div className="bg-gray-800/80 backdrop-blur-md rounded-2xl p-6 mb-6 border border-blue-700/30 shadow-xl animate-fadeIn">
            <h2 className="text-xl font-bold text-white mb-4">📱 Telegram Bot Ayarlari</h2>
            <p className="text-gray-400 text-sm mb-2">
              Telegram botunuzun token ve grup/kanal ID bilgilerini girin.
            </p>
            <div className="bg-gray-900/50 rounded-xl p-4 mb-4 text-xs text-gray-500 space-y-1">
              <p>1. <a href="https://t.me/BotFather" target="_blank" rel="noopener" className="text-blue-400 underline">@BotFather</a> ile bir bot olusturun ve Token&#39;i kopyalayin</p>
              <p>2. Botu grubunuza ekleyin</p>
              <p>3. Chat ID icin: <code className="bg-gray-800 px-1 rounded">https://api.telegram.org/bot[TOKEN]/getUpdates</code></p>
              <p>4. Grup ID&#39;si genellikle <code className="bg-gray-800 px-1 rounded">-100...</code> ile baslar</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-gray-400 text-xs font-semibold mb-1.5 uppercase tracking-wider">Bot Token</label>
                <input type="text" value={botToken} onChange={e => setBotToken(e.target.value)} placeholder="123456789:ABCdefGHI..."
                  className="w-full bg-gray-900/60 border border-gray-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all placeholder:text-gray-600 font-mono text-sm" />
              </div>
              <div>
                <label className="block text-gray-400 text-xs font-semibold mb-1.5 uppercase tracking-wider">Chat ID</label>
                <input type="text" value={chatId} onChange={e => setChatId(e.target.value)} placeholder="-100123456789"
                  className="w-full bg-gray-900/60 border border-gray-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all placeholder:text-gray-600 font-mono text-sm" />
              </div>
            </div>

            {tgStatus.type !== 'idle' && (
              <div className={`rounded-xl p-3 mb-4 text-sm ${
                tgStatus.type === 'loading' ? 'bg-blue-500/10 border border-blue-500/30 text-blue-400' :
                tgStatus.type === 'success' ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400' :
                'bg-red-500/10 border border-red-500/30 text-red-400'
              }`}>
                {tgStatus.type === 'loading' && (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                    <span>{tgStatus.message}</span>
                  </div>
                )}
                {tgStatus.type === 'success' && <span>✅ {tgStatus.message}</span>}
                {tgStatus.type === 'error' && (
                  <div>
                    <span className="font-semibold">❌ Hata: </span>
                    <span className="text-xs opacity-80">{tgStatus.message}</span>
                  </div>
                )}
              </div>
            )}

            {tgSaveMsg && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-xl p-3 mb-4 text-sm">
                ✅ {tgSaveMsg}
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={handleSaveTelegram}
                className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-6 py-3 rounded-xl font-bold shadow-lg hover:shadow-blue-500/40 transition-all">
                💾 Kaydet
              </button>
              <button onClick={handleTestTelegram} disabled={tgStatus.type === 'loading'}
                className="bg-gradient-to-r from-cyan-500 to-cyan-600 text-white px-6 py-3 rounded-xl font-bold shadow-lg hover:shadow-cyan-500/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                {tgStatus.type === 'loading' ? '⏳ Test Ediliyor...' : '🧪 Baglanti Testi'}
              </button>
              <button onClick={() => { setShowTelegram(false); setTgStatus({ type: 'idle', message: '' }); }}
                className="bg-gray-700/50 text-gray-400 px-6 py-3 rounded-xl font-semibold hover:bg-gray-700 transition-all">
                Kapat
              </button>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-700/30">
              <p className="text-xs text-gray-500">
                Mevcut durum:{' '}
                {telegramConfig.botToken && telegramConfig.chatId ? (
                  <span className="text-emerald-400">✅ Yapilandirildi (Token: ...{telegramConfig.botToken.slice(-6)}, Chat: {telegramConfig.chatId})</span>
                ) : telegramConfig.botToken ? (
                  <span className="text-amber-400">⚠️ Chat ID eksik</span>
                ) : (
                  <span className="text-red-400">❌ Yapilandirilmamis</span>
                )}
              </p>
            </div>
          </div>
        )}

        {/* ==================== ROOM LIST ==================== */}
        <div className="mb-4">
          <h2 className="text-xl font-bold text-white mb-1">🎮 Oyun Odalari</h2>
          <p className="text-gray-500 text-sm">
            {isSuperAdmin ? 'Tum odalar gosteriliyor (Admin gorunumu)' : 'Bir odaya katilin veya yeni bir oda olusturun'}
          </p>
        </div>

        {displayRooms.length === 0 ? (
          <div className="bg-gray-800/50 rounded-2xl p-12 text-center border border-gray-700/30">
            <div className="text-5xl mb-4">🏚️</div>
            <p className="text-gray-400 text-lg font-semibold">Henuz oda yok</p>
            <p className="text-gray-500 text-sm mt-1">Ilk odayi siz olusturun!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {displayRooms.map(room => {
              const isMember = room.players.some(p => p.userId === currentUser.id);
              const isSpectator = (room.spectators || []).some(s => s.userId === currentUser.id);
              const isFull = room.players.length >= room.maxPlayers;
              const isPlaying = room.gameStatus !== 'waiting';
              return (
                <div key={room.id} className={`bg-gray-800/80 backdrop-blur-md rounded-2xl p-5 border transition-all hover:shadow-xl ${
                  isMember ? 'border-emerald-500/50 shadow-emerald-500/10' :
                  isSpectator ? 'border-cyan-500/50 shadow-cyan-500/10' :
                  'border-gray-700/30'
                }`}>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-white font-bold text-lg flex items-center gap-2">
                        {room.isPrivate ? '🔒' : '🌐'} {room.name}
                      </h3>
                      <p className="text-gray-500 text-xs mt-0.5">Kurucu: {room.creatorName}</p>
                    </div>
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${
                      room.gameStatus === 'waiting' ? 'bg-emerald-500/20 text-emerald-400' :
                      room.gameStatus === 'betting' ? 'bg-amber-500/20 text-amber-400' :
                      room.gameStatus === 'playing' ? 'bg-red-500/20 text-red-400' :
                      'bg-blue-500/20 text-blue-400'
                    }`}>
                      {room.gameStatus === 'waiting' ? 'Bekliyor' :
                       room.gameStatus === 'betting' ? 'Bahis' :
                       room.gameStatus === 'playing' ? 'Oyunda' : 'Bitti'}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 mb-3 text-sm flex-wrap">
                    <span className="text-gray-400">👥 {room.players.length}/{room.maxPlayers}</span>
                    <span className="text-amber-400">💰 Min: {room.minBet}</span>
                    {room.roundNumber > 0 && <span className="text-blue-400">🎯 El: {room.roundNumber}</span>}
                    {(room.spectators || []).length > 0 && (
                      <span className="text-cyan-400">👁 {(room.spectators || []).length}</span>
                    )}
                  </div>

                  {/* Inactivity Timer */}
                  {(() => {
                    const { elapsedMins, remainingMins, isWarning, isDanger } = getInactivityInfo(room);
                    return (
                      <div className={`mb-4 rounded-lg px-3 py-2 text-xs flex items-center justify-between ${
                        isDanger ? 'bg-red-500/10 border border-red-500/30' :
                        isWarning ? 'bg-amber-500/10 border border-amber-500/30' :
                        'bg-gray-700/30 border border-gray-700/20'
                      }`}>
                        <span className={`${isDanger ? 'text-red-400' : isWarning ? 'text-amber-400' : 'text-gray-500'}`}>
                          ⏱️ {elapsedMins < 1 ? 'Az once aktif' : elapsedMins + ' dk once aktif'}
                        </span>
                        <span className={`font-semibold ${isDanger ? 'text-red-400 animate-pulse' : isWarning ? 'text-amber-400' : 'text-gray-500'}`}>
                          {isDanger ? '⚠️ ' : ''}{remainingMins} dk kaldi
                        </span>
                      </div>
                    );
                  })()}

                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {room.players.map(p => (
                      <span key={p.userId} className={`text-xs px-2 py-1 rounded-lg ${
                        p.userId === currentUser.id ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-gray-700/50 text-gray-400'
                      }`}>
                        {p.username}
                      </span>
                    ))}
                  </div>

                  {joiningRoomId === room.id && (
                    <div className="flex gap-2 mb-3">
                      <input type="text" value={joinCode} onChange={e => setJoinCode(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && confirmJoin(room)}
                        placeholder="Oda kodunu girin"
                        className="flex-1 bg-gray-900/60 border border-amber-500/50 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                        autoFocus />
                      <button onClick={() => confirmJoin(room)} className="bg-amber-500 text-gray-900 px-4 py-2 rounded-lg text-sm font-bold hover:bg-amber-400">✓</button>
                      <button onClick={() => setJoiningRoomId(null)} className="bg-gray-600 text-white px-3 py-2 rounded-lg text-sm hover:bg-gray-500">✕</button>
                    </div>
                  )}

                  <div className="flex gap-2">
                    {!isSuperAdmin || isMember ? (
                      <button
                        onClick={() => handleJoin(room)}
                        disabled={!isMember && (isFull || isPlaying)}
                        className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition-all ${
                          isMember
                            ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-lg hover:shadow-emerald-500/40'
                            : isFull || isPlaying
                            ? 'bg-gray-700/30 text-gray-600 cursor-not-allowed'
                            : 'bg-gradient-to-r from-amber-400 to-amber-600 text-gray-900 shadow-lg hover:shadow-amber-500/40'
                        }`}
                      >
                        {isMember ? '🎮 Odaya Gir' : isFull ? '👥 Dolu' : isPlaying ? '🎴 Oyunda' : '🚪 Katil'}
                      </button>
                    ) : (
                      <>
                        {!isFull && !isPlaying && (
                          <button
                            onClick={() => handleJoin(room)}
                            className="flex-1 py-2.5 rounded-xl font-bold text-sm transition-all bg-gradient-to-r from-amber-400 to-amber-600 text-gray-900 shadow-lg hover:shadow-amber-500/40"
                          >
                            🚪 Katil
                          </button>
                        )}
                      </>
                    )}

                    {isSuperAdmin && !isMember && (
                      <button
                        onClick={() => onSpectateRoom(room.id)}
                        className="flex-1 py-2.5 rounded-xl font-bold text-sm transition-all bg-gradient-to-r from-cyan-500 to-cyan-600 text-white shadow-lg hover:shadow-cyan-500/40"
                      >
                        👁 Izle
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
