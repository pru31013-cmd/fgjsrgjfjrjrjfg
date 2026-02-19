import { useState, useEffect, useCallback } from 'react';
import { User, Room, Card, TelegramConfig, PlayerInGame } from '../types';
import {
  handValue, suitSymbol, isRedSuit, createDeck, isBlackjack,
  isFiveCardCharlie, effectiveHandValue, MAX_CARDS,
  sendTelegram, loadData, saveData,
} from '../utils/game';

interface GameRoomProps {
  room: Room;
  currentUser: User;
  users: User[];
  updateRoom: (room: Room) => void;
  updateUserBalance: (userId: string, newBalance: number) => void;
  onLeaveRoom: () => void;
  telegramConfig: TelegramConfig;
  isSpectator: boolean;
}

function CardView({ card, small }: { card: Card; small?: boolean }) {
  const red = isRedSuit(card.suit);
  const sym = suitSymbol(card.suit);
  if (small) {
    return (
      <div className={`w-10 h-14 sm:w-12 sm:h-[4.2rem] bg-white rounded-lg border-2 border-gray-200 flex flex-col items-center justify-center shadow-md flex-shrink-0 animate-cardDeal ${red ? 'text-red-600' : 'text-gray-900'}`}>
        <span className="text-xs font-black leading-none">{card.rank}</span>
        <span className="text-sm leading-none">{sym}</span>
      </div>
    );
  }
  return (
    <div className={`w-14 h-20 sm:w-16 sm:h-[5.6rem] bg-white rounded-xl border-2 border-gray-200 flex flex-col items-center justify-between p-1.5 shadow-lg flex-shrink-0 animate-cardDeal ${red ? 'text-red-600' : 'text-gray-900'}`}>
      <span className="text-xs font-black self-start leading-none">{card.rank}</span>
      <span className="text-xl leading-none">{sym}</span>
      <span className="text-xs font-black self-end leading-none rotate-180">{card.rank}</span>
    </div>
  );
}

function CardBack({ small }: { small?: boolean }) {
  if (small) {
    return (
      <div className="w-10 h-14 sm:w-12 sm:h-[4.2rem] bg-gradient-to-br from-blue-700 to-blue-900 rounded-lg border-2 border-blue-500 flex items-center justify-center shadow-md flex-shrink-0">
        <span className="text-lg">{'\uD83C\uDCA0'}</span>
      </div>
    );
  }
  return (
    <div className="w-14 h-20 sm:w-16 sm:h-[5.6rem] bg-gradient-to-br from-blue-700 to-blue-900 rounded-xl border-2 border-blue-500 flex items-center justify-center shadow-lg flex-shrink-0">
      <div className="text-blue-300 text-2xl">{'\u2660'}</div>
    </div>
  );
}

export default function GameRoom({
  room, currentUser, users, updateRoom, updateUserBalance, onLeaveRoom, telegramConfig, isSpectator,
}: GameRoomProps) {
  const [betAmount, setBetAmount] = useState(room.minBet);
  const [message, setMessage] = useState('');

  const myPlayer = room.players.find(p => p.userId === currentUser.id);
  const isCreator = room.creatorId === currentUser.id;
  const isMyTurn = !isSpectator && room.gameStatus === 'playing' && room.players[room.currentTurnIndex]?.userId === currentUser.id;

  const getFreshRoom = useCallback((): Room | null => {
    const rooms = loadData<Room[]>('bj_rooms', []);
    return rooms.find(r => r.id === room.id) || null;
  }, [room.id]);

  const saveRoom = useCallback((updatedRoom: Room) => {
    const rooms = loadData<Room[]>('bj_rooms', []);
    const updated = rooms.map(r => r.id === updatedRoom.id ? updatedRoom : r);
    saveData('bj_rooms', updated);
    updateRoom(updatedRoom);
  }, [updateRoom]);

  useEffect(() => {
    if (room.message && room.message !== message) {
      setMessage(room.message);
    }
  }, [room.message, message]);

  const isPlayerDone = (status: string): boolean => {
    return ['bust', 'stand', 'blackjack', 'fivecard'].includes(status);
  };

  useEffect(() => {
    if (isSpectator) return;
    if (room.gameStatus === 'playing') {
      const currentPlayer = room.players[room.currentTurnIndex];
      if (currentPlayer && isPlayerDone(currentPlayer.status)) {
        const timer = setTimeout(() => {
          const fresh = getFreshRoom();
          if (!fresh || fresh.gameStatus !== 'playing') return;
          const cp = fresh.players[fresh.currentTurnIndex];
          if (cp && isPlayerDone(cp.status)) {
            advanceToNextPlayer(fresh);
          }
        }, 1000);
        return () => clearTimeout(timer);
      }
    }
  }, [room.gameStatus, room.currentTurnIndex, room.players, getFreshRoom, isSpectator]);

  useEffect(() => {
    if (isSpectator) return;
    if (room.gameStatus === 'betting') {
      const allReady = room.players.every(p => p.status === 'ready');
      if (allReady && room.players.length >= 2) {
        const timer = setTimeout(() => {
          const fresh = getFreshRoom();
          if (!fresh || fresh.gameStatus !== 'betting') return;
          if (fresh.players.every(p => p.status === 'ready')) {
            startDealing(fresh);
          }
        }, 500);
        return () => clearTimeout(timer);
      }
    }
  }, [room.gameStatus, room.players, getFreshRoom, isSpectator]);

  const advanceToNextPlayer = (currentRoom: Room) => {
    let nextIndex = currentRoom.currentTurnIndex + 1;
    while (nextIndex < currentRoom.players.length) {
      const p = currentRoom.players[nextIndex];
      if (p.status === 'playing') break;
      nextIndex++;
    }

    if (nextIndex >= currentRoom.players.length) {
      endRound(currentRoom);
    } else {
      saveRoom({
        ...currentRoom,
        currentTurnIndex: nextIndex,
        message: '\uD83C\uDFAF ' + currentRoom.players[nextIndex].username + ' oynuyor...',
        lastUpdate: Date.now(),
      });
    }
  };

  const startDealing = (currentRoom: Room) => {
    const deck = createDeck(2);
    const updatedPlayers = currentRoom.players.map(p => {
      const hand = [deck.pop()!, deck.pop()!];
      const isBJ = isBlackjack(hand);
      return {
        ...p,
        hand,
        status: (isBJ ? 'blackjack' : 'playing') as typeof p.status,
      };
    });

    const pot = updatedPlayers.reduce((sum, p) => sum + p.bet, 0);

    let firstIndex = 0;
    while (firstIndex < updatedPlayers.length && updatedPlayers[firstIndex].status !== 'playing') {
      firstIndex++;
    }

    const updatedRoom: Room = {
      ...currentRoom,
      deck,
      players: updatedPlayers,
      gameStatus: firstIndex >= updatedPlayers.length ? 'roundEnd' : 'playing',
      currentTurnIndex: firstIndex,
      pot,
      roundNumber: currentRoom.roundNumber + 1,
      message: firstIndex >= updatedPlayers.length
        ? '\uD83C\uDCCF Kartlar dagitildi!'
        : '\uD83C\uDCCF Kartlar dagitildi! ' + updatedPlayers[firstIndex].username + ' oynuyor...',
      lastUpdate: Date.now(),
    };

    if (firstIndex >= updatedPlayers.length) {
      endRound(updatedRoom);
    } else {
      saveRoom(updatedRoom);
    }
  };

  const endRound = async (currentRoom: Room) => {
    const players = [...currentRoom.players];
    const activePlayers = players.filter(p => p.status !== 'bust');

    let winners: string[] = [];
    let msg = '';

    if (activePlayers.length === 0) {
      msg = '\uD83D\uDCA5 Herkes batti! Bahisler iade edildi.';
      winners = [];
    } else {
      const bjPlayers = activePlayers.filter(p => isBlackjack(p.hand));
      if (bjPlayers.length > 0) {
        winners = bjPlayers.map(p => p.userId);
      } else {
        const maxVal = Math.max(...activePlayers.map(p => effectiveHandValue(p.hand)));
        winners = activePlayers.filter(p => effectiveHandValue(p.hand) === maxVal).map(p => p.userId);
      }

      if (winners.length === 1) {
        const w = players.find(p => p.userId === winners[0])!;
        const ehv = effectiveHandValue(w.hand);
        const label = isBlackjack(w.hand) ? ' - BLACKJACK!' : isFiveCardCharlie(w.hand) ? ' - 5 KART!' : '';
        msg = '\uD83C\uDFC6 ' + w.username + ' kazandi! (' + ehv + label + ')';
      } else {
        const names = winners.map(id => players.find(p => p.userId === id)!.username).join(', ');
        msg = '\uD83E\uDD1D Berabere: ' + names;
      }
    }

    const losers = players.filter(p => !winners.includes(p.userId));
    const losersTotal = losers.reduce((sum, p) => sum + p.bet, 0);
    const winnerShare = winners.length > 0 ? Math.floor(losersTotal / winners.length) : 0;

    const allUsers = loadData<User[]>('bj_users', []);
    const updatedUsers = allUsers.map(u => {
      const player = players.find(p => p.userId === u.id);
      if (!player) return u;
      if (winners.length === 0) return u;
      if (winners.includes(u.id)) {
        return { ...u, balance: u.balance + winnerShare };
      } else {
        return { ...u, balance: Math.max(0, u.balance - player.bet) };
      }
    });
    saveData('bj_users', updatedUsers);

    for (const u of updatedUsers) {
      const player = players.find(p => p.userId === u.id);
      if (player) {
        updateUserBalance(u.id, u.balance);
      }
    }

    // Send Telegram notification with proper newlines
    if (winners.length > 0) {
      const tgLines: string[] = [];
      tgLines.push('\uD83C\uDFB0 <b>El #' + currentRoom.roundNumber + ' - Sonuclar</b>');
      tgLines.push('');
      for (const p of players) {
        const isW = winners.includes(p.userId);
        const ehv = effectiveHandValue(p.hand);
        const change = isW ? ('+' + winnerShare) : ('-' + p.bet);
        const fcLabel = isFiveCardCharlie(p.hand) ? ' [5KC]' : '';
        const icon = isW ? '\uD83C\uDFC6' : '\u274C';
        tgLines.push(icon + ' ' + p.username + ': ' + ehv + fcLabel + ' (' + change + ' coin)');
      }
      const result = await sendTelegram(telegramConfig, tgLines.join('\n'));
      if (!result.ok) {
        console.warn('[GameRoom TG]', result.error);
      }
    }

    const updatedRoom: Room = {
      ...currentRoom,
      gameStatus: 'roundEnd',
      winners,
      message: msg,
      lastUpdate: Date.now(),
    };
    saveRoom(updatedRoom);
  };

  // ACTIONS
  const handleStartGame = () => {
    if (isSpectator) return;
    const fresh = getFreshRoom();
    if (!fresh) return;
    if (fresh.players.length < 2) return;

    const updatedPlayers = fresh.players.map(p => ({
      ...p, status: 'waiting' as const, hand: [], bet: 0,
    }));

    saveRoom({
      ...fresh,
      players: updatedPlayers,
      gameStatus: 'betting',
      pot: 0,
      winners: [],
      message: '\uD83D\uDCB0 Bahislerinizi koyun!',
      lastUpdate: Date.now(),
    });
  };

  const handlePlaceBet = () => {
    if (isSpectator) return;
    const fresh = getFreshRoom();
    if (!fresh || fresh.gameStatus !== 'betting') return;

    const bet = Math.max(fresh.minBet, Math.min(betAmount, currentUser.balance));
    if (bet > currentUser.balance) return;

    const updatedPlayers = fresh.players.map(p =>
      p.userId === currentUser.id
        ? { ...p, bet, status: 'ready' as const }
        : p
    );

    saveRoom({
      ...fresh,
      players: updatedPlayers,
      message: '\uD83D\uDCB0 ' + currentUser.username + ' ' + bet + ' coin bahis koydu!',
      lastUpdate: Date.now(),
    });
  };

  const handleHit = () => {
    if (isSpectator) return;
    const fresh = getFreshRoom();
    if (!fresh || fresh.gameStatus !== 'playing') return;
    const playerIndex = fresh.players.findIndex(p => p.userId === currentUser.id);
    if (playerIndex !== fresh.currentTurnIndex) return;

    const player = fresh.players[playerIndex];

    if (player.hand.length >= MAX_CARDS || player.status === 'bust') return;

    const deck = [...fresh.deck];
    const card = deck.pop();
    if (!card) return;

    const newHand = [...player.hand, card];
    const value = handValue(newHand);
    const busted = value > 21;
    const reachedMaxCards = newHand.length >= MAX_CARDS;
    const fiveCardCharlie = reachedMaxCards && !busted;

    let newStatus: PlayerInGame['status'];
    let msgText: string;

    if (busted) {
      newStatus = 'bust';
      msgText = '\uD83C\uDCCF ' + currentUser.username + ' sirasini tamamladi.';
    } else if (fiveCardCharlie) {
      newStatus = 'fivecard';
      msgText = '\uD83C\uDCCF ' + currentUser.username + ' sirasini tamamladi.';
    } else if (value === 21) {
      newStatus = 'stand';
      msgText = '\uD83C\uDCCF ' + currentUser.username + ' sirasini tamamladi.';
    } else {
      newStatus = 'playing';
      msgText = '\uD83C\uDCCF ' + currentUser.username + ' kart cekti.';
    }

    const updatedPlayers = [...fresh.players];
    updatedPlayers[playerIndex] = {
      ...updatedPlayers[playerIndex],
      hand: newHand,
      status: newStatus,
    };

    const updatedRoom: Room = {
      ...fresh,
      deck,
      players: updatedPlayers,
      message: msgText,
      lastUpdate: Date.now(),
    };

    saveRoom(updatedRoom);
  };

  const handleStand = () => {
    if (isSpectator) return;
    const fresh = getFreshRoom();
    if (!fresh || fresh.gameStatus !== 'playing') return;
    const playerIndex = fresh.players.findIndex(p => p.userId === currentUser.id);
    if (playerIndex !== fresh.currentTurnIndex) return;

    const updatedPlayers = [...fresh.players];
    updatedPlayers[playerIndex] = {
      ...updatedPlayers[playerIndex],
      status: 'stand',
    };

    saveRoom({
      ...fresh,
      players: updatedPlayers,
      message: '\u270B ' + currentUser.username + ' sirasini tamamladi.',
      lastUpdate: Date.now(),
    });
  };

  const handleNextRound = () => {
    if (isSpectator) return;
    const fresh = getFreshRoom();
    if (!fresh) return;

    const allUsers = loadData<User[]>('bj_users', []);
    const updatedPlayers = fresh.players
      .filter(p => {
        const user = allUsers.find(u => u.id === p.userId);
        return user && user.balance >= fresh.minBet;
      })
      .map(p => ({
        ...p,
        hand: [],
        bet: 0,
        status: 'waiting' as const,
      }));

    if (updatedPlayers.length < 2) {
      saveRoom({
        ...fresh,
        players: updatedPlayers,
        gameStatus: 'waiting',
        pot: 0,
        winners: [],
        message: '\u26A0\uFE0F Yeterli oyuncu yok. Yeni oyuncular bekleniyor...',
        lastUpdate: Date.now(),
      });
    } else {
      saveRoom({
        ...fresh,
        players: updatedPlayers,
        gameStatus: 'betting',
        pot: 0,
        winners: [],
        message: '\uD83D\uDCB0 Yeni el! Bahislerinizi koyun!',
        lastUpdate: Date.now(),
      });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'waiting': return '\u23F3';
      case 'ready': return '\u2705';
      case 'playing': return '\uD83C\uDFAE';
      case 'stand': return '\u270B';
      case 'bust': return '\uD83D\uDCA5';
      case 'blackjack': return '\uD83C\uDCCF';
      case 'fivecard': return '\uD83D\uDD90\uFE0F';
      default: return '\u23F3';
    }
  };

  const getStatusText = (status: string, isVisible: boolean) => {
    if (!isVisible && (status === 'bust' || status === 'fivecard' || status === 'blackjack')) {
      return 'Bitti';
    }
    switch (status) {
      case 'waiting': return 'Bekliyor';
      case 'ready': return 'Hazir';
      case 'playing': return 'Oynuyor';
      case 'stand': return 'Durdu';
      case 'bust': return 'Batti';
      case 'blackjack': return 'Blackjack!';
      case 'fivecard': return '5 Kart!';
      default: return status;
    }
  };

  const getStatusIconForVisibility = (status: string, isVisible: boolean) => {
    if (!isVisible && (status === 'bust' || status === 'fivecard' || status === 'blackjack')) {
      return '\uD83D\uDD12';
    }
    return getStatusIcon(status);
  };

  const getPlayerUser = (userId: string) => users.find(u => u.id === userId);

  const canSeeCards = (playerId: string): boolean => {
    if (playerId === currentUser.id && !isSpectator) return true;
    if (isSpectator) return true;
    if (room.gameStatus === 'roundEnd') return true;
    return false;
  };

  const spectatorCount = (room.spectators || []).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-emerald-950 to-gray-900 flex flex-col">
      {/* Header */}
      <div className="bg-gray-900/80 border-b border-emerald-800/30 backdrop-blur-lg">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onLeaveRoom}
              className="bg-gray-700/50 text-gray-300 px-3 py-2 rounded-xl text-sm font-semibold hover:bg-gray-700 transition-all"
            >
              {'\u2190'} Lobi
            </button>
            <div>
              <h1 className="text-lg font-bold text-white flex items-center gap-2">
                {room.isPrivate ? '\uD83D\uDD12' : '\uD83C\uDF10'} {room.name}
                {isSpectator && (
                  <span className="text-xs bg-cyan-500/20 text-cyan-400 px-2 py-0.5 rounded-lg border border-cyan-500/30 font-bold ml-2">
                    {'\uD83D\uDC41'} IZLEYICI
                  </span>
                )}
              </h1>
              <p className="text-gray-500 text-xs">El #{room.roundNumber} {'\u2022'} Min Bahis: {room.minBet} {'\u2022'} Max {MAX_CARDS} Kart</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-2">
              <span className="text-amber-400 font-bold">{'\uD83D\uDCB0'} {room.pot.toLocaleString()}</span>
              <span className="text-gray-500 text-xs ml-1">pot</span>
            </div>
            <div className="bg-gray-800/80 rounded-xl px-4 py-2 border border-gray-700/50">
              <span className="text-white font-semibold text-sm">{currentUser.username}</span>
              {!isSpectator && (
                <span className="text-amber-400 font-bold text-sm ml-2">{currentUser.balance.toLocaleString()}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Spectator Banner */}
      {isSpectator && (
        <div className="bg-cyan-900/30 border-b border-cyan-700/30">
          <div className="max-w-6xl mx-auto px-4 py-2">
            <p className="text-center text-sm font-semibold text-cyan-300">
              {'\uD83D\uDC41'} Izleyici modasiniz {'\u2022'} Tum kartlari gorebilirsiniz
            </p>
          </div>
        </div>
      )}

      {/* Message Bar */}
      {(room.message || message) && (
        <div className="bg-gray-800/60 border-b border-gray-700/30">
          <div className="max-w-6xl mx-auto px-4 py-2">
            <p className="text-center text-sm font-semibold text-gray-300">{room.message || message}</p>
          </div>
        </div>
      )}

      {/* Game Table */}
      <div className="flex-1 flex flex-col">
        <div className="max-w-6xl mx-auto px-4 py-6 w-full flex-1">
          {/* Players Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {room.players.map((player, idx) => {
              const pUser = getPlayerUser(player.userId);
              const isCurrentTurn = room.gameStatus === 'playing' && idx === room.currentTurnIndex;
              const isWinner = room.gameStatus === 'roundEnd' && room.winners.includes(player.userId);
              const isMe = player.userId === currentUser.id && !isSpectator;
              const showCards = canSeeCards(player.userId);
              const hv = player.hand.length > 0 ? handValue(player.hand) : 0;
              const ehv = player.hand.length > 0 ? effectiveHandValue(player.hand) : 0;

              return (
                <div
                  key={player.userId}
                  className={`bg-gray-800/80 backdrop-blur-md rounded-2xl p-4 border-2 transition-all duration-300 ${
                    isCurrentTurn
                      ? 'border-amber-400 shadow-lg shadow-amber-400/20 animate-glow'
                      : isWinner
                      ? 'border-emerald-400 shadow-lg shadow-emerald-400/20'
                      : player.status === 'bust' && showCards
                      ? 'border-red-500/40'
                      : isMe
                      ? 'border-blue-500/30'
                      : 'border-gray-700/30'
                  }`}
                >
                  {/* Player Header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{getStatusIconForVisibility(player.status, showCards)}</span>
                      <div>
                        <p className={`font-bold text-sm ${isMe ? 'text-blue-400' : 'text-white'}`}>
                          {player.username}
                          {isMe && <span className="text-xs text-blue-400/60 ml-1">(sen)</span>}
                        </p>
                        <p className="text-xs text-gray-500">
                          {'\uD83D\uDCB0'} {pUser?.balance.toLocaleString() ?? '?'}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-xs font-bold px-2 py-0.5 rounded-lg ${
                        showCards && player.status === 'bust' ? 'bg-red-500/20 text-red-400' :
                        showCards && player.status === 'blackjack' ? 'bg-amber-500/20 text-amber-400' :
                        showCards && player.status === 'fivecard' ? 'bg-purple-500/20 text-purple-400' :
                        player.status === 'stand' ? 'bg-blue-500/20 text-blue-400' :
                        isCurrentTurn ? 'bg-amber-500/20 text-amber-400' :
                        isPlayerDone(player.status) && !showCards ? 'bg-gray-600/50 text-gray-400' :
                        'bg-gray-700/50 text-gray-400'
                      }`}>
                        {getStatusText(player.status, showCards)}
                      </p>
                      {player.bet > 0 && (
                        <p className="text-amber-400 text-xs font-semibold mt-1">{'\uD83C\uDFB0'} {player.bet}</p>
                      )}
                    </div>
                  </div>

                  {/* Cards Area */}
                  {player.hand.length > 0 && (
                    <div className="mb-2">
                      <div className="flex gap-1 flex-wrap">
                        {showCards ? (
                          player.hand.map((card, cardIdx) => (
                            <CardView key={cardIdx} card={card} small />
                          ))
                        ) : (
                          player.hand.map((_, cardIdx) => (
                            <CardBack key={cardIdx} small />
                          ))
                        )}
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        {showCards ? (
                          <>
                            <div className="flex items-center gap-2">
                              <span className={`text-lg font-black ${
                                hv > 21 ? 'text-red-400' :
                                ehv === 21 ? 'text-amber-400' :
                                'text-white'
                              }`}>
                                {hv}
                              </span>
                              {isFiveCardCharlie(player.hand) && (
                                <span className="text-purple-400 text-xs font-bold bg-purple-500/20 px-1.5 py-0.5 rounded">= 21</span>
                              )}
                            </div>
                            {isWinner && <span className="text-emerald-400 font-bold text-sm">{'\uD83C\uDFC6'} Kazandi!</span>}
                            {room.gameStatus === 'roundEnd' && player.status === 'bust' && (
                              <span className="text-red-400 font-bold text-sm">{'\uD83D\uDCA5'} Batti</span>
                            )}
                            {room.gameStatus === 'roundEnd' && player.status === 'blackjack' && (
                              <span className="text-amber-400 font-bold text-sm">{'\uD83C\uDCCF'} BJ!</span>
                            )}
                            {room.gameStatus === 'roundEnd' && player.status === 'fivecard' && !isWinner && (
                              <span className="text-purple-400 font-bold text-sm">{'\uD83D\uDD90\uFE0F'} 5 Kart</span>
                            )}
                          </>
                        ) : (
                          <span className="text-gray-500 text-sm italic">
                            {player.hand.length} kart {'\u2022'} Gizli
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Waiting state placeholder */}
                  {player.hand.length === 0 && room.gameStatus === 'waiting' && (
                    <div className="flex gap-1 opacity-30">
                      <CardBack small />
                      <CardBack small />
                    </div>
                  )}

                  {/* Betting state */}
                  {!isSpectator && room.gameStatus === 'betting' && player.userId === currentUser.id && player.status !== 'ready' && (
                    <div className="mt-2 bg-gray-900/50 rounded-xl p-3">
                      <label className="block text-gray-400 text-xs font-semibold mb-1">Bahis Miktari</label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          value={betAmount}
                          onChange={e => setBetAmount(Math.max(room.minBet, parseInt(e.target.value) || room.minBet))}
                          min={room.minBet}
                          max={currentUser.balance}
                          className="flex-1 bg-gray-800 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                        />
                        <button
                          onClick={handlePlaceBet}
                          disabled={betAmount > currentUser.balance}
                          className="bg-amber-500 text-gray-900 px-4 py-2 rounded-lg text-sm font-bold hover:bg-amber-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Koy
                        </button>
                      </div>
                      <div className="flex gap-1 mt-2">
                        {[room.minBet, 50, 100, 250, 500].filter(v => v <= currentUser.balance && v >= room.minBet).map(v => (
                          <button
                            key={v}
                            onClick={() => setBetAmount(v)}
                            className={`flex-1 py-1 rounded text-xs font-bold transition-all ${
                              betAmount === v ? 'bg-amber-500 text-gray-900' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                            }`}
                          >
                            {v}
                          </button>
                        ))}
                        <button
                          onClick={() => setBetAmount(currentUser.balance)}
                          className={`flex-1 py-1 rounded text-xs font-bold transition-all ${
                            betAmount === currentUser.balance ? 'bg-red-500 text-white' : 'bg-gray-700 text-red-400 hover:bg-gray-600'
                          }`}
                        >
                          ALL
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Private bust/fivecard info */}
                  {isMe && room.gameStatus === 'playing' && player.status === 'bust' && (
                    <div className="mt-2 bg-red-900/30 border border-red-700/30 rounded-lg p-2 text-center">
                      <p className="text-red-400 text-xs font-bold">{'\uD83D\uDCA5'} Battin! ({hv})</p>
                      <p className="text-gray-500 text-[10px]">Diger oyuncular goremez</p>
                    </div>
                  )}
                  {isMe && room.gameStatus === 'playing' && player.status === 'fivecard' && (
                    <div className="mt-2 bg-purple-900/30 border border-purple-700/30 rounded-lg p-2 text-center">
                      <p className="text-purple-400 text-xs font-bold">{'\uD83D\uDD90\uFE0F'} 5 Kart Charlie! (= 21)</p>
                      <p className="text-gray-500 text-[10px]">Diger oyuncular goremez</p>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Empty slots */}
            {Array.from({ length: Math.max(0, 2 - room.players.length) }).map((_, i) => (
              <div key={`empty-${i}`} className="bg-gray-800/30 rounded-2xl p-4 border-2 border-dashed border-gray-700/30 flex items-center justify-center min-h-[120px]">
                <p className="text-gray-600 text-sm">Bos Koltuk</p>
              </div>
            ))}
          </div>

          {/* Action Panel */}
          <div className="bg-gray-800/80 backdrop-blur-md rounded-2xl p-4 border border-gray-700/30">
            {isSpectator ? (
              <div className="text-center">
                {room.gameStatus === 'waiting' && (
                  <p className="text-cyan-400">{'\uD83D\uDC41'} Oyun henuz baslamadi. Oyuncular bekleniyor...</p>
                )}
                {room.gameStatus === 'betting' && (
                  <p className="text-cyan-400">
                    {'\uD83D\uDC41'} Bahis asamasi izleniyor {'\u2022'}{' '}
                    <span className="text-gray-400">
                      {room.players.filter(p => p.status === 'ready').length}/{room.players.length} oyuncu hazir
                    </span>
                  </p>
                )}
                {room.gameStatus === 'playing' && (
                  <p className="text-cyan-400">
                    {'\uD83D\uDC41'} <span className="text-white font-semibold">{room.players[room.currentTurnIndex]?.username}</span> oynuyor...
                  </p>
                )}
                {room.gameStatus === 'roundEnd' && (
                  <div>
                    <RoundResults room={room} />
                    <p className="text-cyan-400 text-sm">{'\uD83D\uDC41'} Oda kurucusu yeni eli baslatmayi bekliyor...</p>
                  </div>
                )}
                <button
                  onClick={onLeaveRoom}
                  className="mt-4 bg-gray-700/50 text-gray-300 px-6 py-3 rounded-xl font-semibold hover:bg-gray-700 transition-all"
                >
                  {'\uD83D\uDEAA'} Izlemeyi Birak
                </button>
              </div>
            ) : (
              <>
                {room.gameStatus === 'waiting' && (
                  <div className="text-center">
                    <p className="text-gray-400 mb-3">
                      {'\uD83D\uDC65'} {room.players.length} oyuncu odada
                      {room.players.length < 2 && ' \u2022 En az 2 oyuncu gerekli'}
                    </p>
                    {isCreator && (
                      <button
                        onClick={handleStartGame}
                        disabled={room.players.length < 2}
                        className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white px-8 py-3 rounded-xl font-bold text-lg shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 transition-all transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                      >
                        {'\uD83C\uDFAE'} Oyunu Baslat
                      </button>
                    )}
                    {!isCreator && (
                      <p className="text-amber-400/80 text-sm">Oda kurucusu oyunu baslatmayi bekliyor...</p>
                    )}
                  </div>
                )}

                {room.gameStatus === 'betting' && (
                  <div className="text-center">
                    <p className="text-amber-400 font-semibold">
                      {'\uD83D\uDCB0'} Bahis asamasi {'\u2022'}{' '}
                      <span className="text-gray-400">
                        {room.players.filter(p => p.status === 'ready').length}/{room.players.length} oyuncu hazir
                      </span>
                    </p>
                    {myPlayer?.status === 'ready' && (
                      <p className="text-emerald-400 text-sm mt-2">{'\u2705'} Bahsiniz alindi: {myPlayer.bet} coin {'\u2022'} Diger oyuncular bekleniyor...</p>
                    )}
                  </div>
                )}

                {room.gameStatus === 'playing' && (
                  <div className="flex flex-col items-center gap-3">
                    {isMyTurn ? (
                      <>
                        <p className="text-amber-400 font-bold text-lg animate-pulse">{'\uD83C\uDFAF'} Senin siran!</p>
                        <div className="flex gap-3">
                          {myPlayer && myPlayer.hand.length < MAX_CARDS && (
                            <button
                              onClick={handleHit}
                              className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white px-8 py-3 rounded-xl font-bold text-lg shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 transition-all transform hover:scale-[1.02] active:scale-[0.98]"
                            >
                              {'\uD83C\uDCCF'} Kart Cek (Hit)
                            </button>
                          )}
                          <button
                            onClick={handleStand}
                            className="bg-gradient-to-r from-amber-500 to-amber-600 text-gray-900 px-8 py-3 rounded-xl font-bold text-lg shadow-lg shadow-amber-500/20 hover:shadow-amber-500/40 transition-all transform hover:scale-[1.02] active:scale-[0.98]"
                          >
                            {'\u270B'} Dur (Stand)
                          </button>
                        </div>
                        {myPlayer && (
                          <div className="flex items-center gap-3">
                            <p className="text-gray-400 text-sm">
                              El degeri: <span className="text-white font-bold">{handValue(myPlayer.hand)}</span>
                            </p>
                            <p className="text-gray-500 text-xs">
                              Kart: {myPlayer.hand.length}/{MAX_CARDS}
                            </p>
                          </div>
                        )}
                      </>
                    ) : myPlayer && isPlayerDone(myPlayer.status) ? (
                      <div className="text-center">
                        <p className="text-gray-400 text-sm mb-1">
                          Siran bitti. Diger oyuncular oynuyor...
                        </p>
                        <p className="text-gray-500">
                          {'\u23F3'} <span className="text-white font-semibold">{room.players[room.currentTurnIndex]?.username}</span> oynuyor...
                        </p>
                      </div>
                    ) : (
                      <p className="text-gray-400">
                        {'\u23F3'} <span className="text-white font-semibold">{room.players[room.currentTurnIndex]?.username}</span> oynuyor...
                      </p>
                    )}
                  </div>
                )}

                {room.gameStatus === 'roundEnd' && (
                  <div className="text-center">
                    <RoundResults room={room} />
                    <div className="flex gap-3 justify-center flex-wrap">
                      {isCreator ? (
                        <button
                          onClick={handleNextRound}
                          className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white px-8 py-3 rounded-xl font-bold text-lg shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 transition-all transform hover:scale-[1.02] active:scale-[0.98]"
                        >
                          {'\uD83D\uDD04'} Yeni El Baslat
                        </button>
                      ) : (
                        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-6 py-3">
                          <p className="text-amber-400 font-semibold text-sm">{'\u23F3'} Oda kurucusu yeni eli baslatmayi bekliyor...</p>
                        </div>
                      )}
                      <button
                        onClick={onLeaveRoom}
                        className="bg-gray-700/50 text-gray-300 px-6 py-3 rounded-xl font-semibold hover:bg-gray-700 transition-all"
                      >
                        {'\uD83D\uDEAA'} Odadan Cik
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Room Info */}
          <div className="mt-4 bg-gray-800/40 rounded-xl p-3 flex flex-wrap items-center gap-4 text-xs text-gray-500">
            <span>{'\uD83C\uDD94'} Oda: {room.id.substring(0, 8)}</span>
            <span>{'\uD83D\uDC51'} Kurucu: {room.creatorName}</span>
            <span>{'\uD83D\uDC65'} {room.players.length}/{room.maxPlayers} oyuncu</span>
            {spectatorCount > 0 && <span>{'\uD83D\uDC41'} {spectatorCount} izleyici</span>}
            {room.isPrivate && <span>{'\uD83D\uDD12'} Kapali oda</span>}
            <span>{'\uD83C\uDFAF'} El: #{room.roundNumber}</span>
            <span>{'\uD83C\uDCCF'} Max {MAX_CARDS} kart</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* Round Results sub-component */
function RoundResults({ room }: { room: Room }) {
  return (
    <div className="bg-gray-900/50 rounded-xl p-4 mb-4 max-w-md mx-auto">
      <h3 className="text-lg font-bold text-white mb-3">{'\uD83D\uDCCA'} El Sonuclari</h3>
      {room.players.map(p => {
        const isWinner = room.winners.includes(p.userId);
        const hv = handValue(p.hand);
        const ehv = effectiveHandValue(p.hand);
        const fc = isFiveCardCharlie(p.hand);
        const losersTotal = room.players
          .filter(lp => !room.winners.includes(lp.userId))
          .reduce((s, lp) => s + lp.bet, 0);
        const winnerShare = room.winners.length > 0 ? Math.floor(losersTotal / room.winners.length) : 0;
        const change = room.winners.length === 0 ? 0 : isWinner ? winnerShare : -p.bet;
        return (
          <div key={p.userId} className={`flex items-center justify-between py-2 border-b border-gray-700/30 last:border-0 ${
            isWinner ? 'text-emerald-400' : p.status === 'bust' ? 'text-red-400' : 'text-gray-400'
          }`}>
            <div className="flex items-center gap-2">
              <span>{isWinner ? '\uD83C\uDFC6' : p.status === 'bust' ? '\uD83D\uDCA5' : '\u274C'}</span>
              <span className="font-semibold">{p.username}</span>
              <span className="text-xs opacity-60">
                ({hv}{fc ? ' \u2192 ' + ehv : ''})
              </span>
              {fc && <span className="text-[10px] bg-purple-500/20 text-purple-400 px-1 rounded">5KC</span>}
            </div>
            <span className={`font-bold ${change > 0 ? 'text-emerald-400' : change < 0 ? 'text-red-400' : 'text-gray-500'}`}>
              {change > 0 ? '+' : ''}{change} {'\uD83D\uDCB0'}
            </span>
          </div>
        );
      })}
    </div>
  );
}
