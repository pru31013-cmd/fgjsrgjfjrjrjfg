export interface User {
  id: string;
  username: string;
  fullName: string;
  email: string;
  password: string;
  balance: number;
  isAdmin: boolean;
  isSuperAdmin?: boolean;
  createdAt: number;
}

export const SUPER_ADMIN_USERNAME = 'remzibuluk99@gmail.com';
export const SUPER_ADMIN_PASSWORD = 'Dandanakan9-9';

export interface Card {
  suit: 'hearts' | 'diamonds' | 'clubs' | 'spades';
  rank: string;
}

export interface PlayerInGame {
  userId: string;
  username: string;
  hand: Card[];
  bet: number;
  status: 'waiting' | 'ready' | 'playing' | 'stand' | 'bust' | 'blackjack' | 'fivecard';
}

export interface Spectator {
  userId: string;
  username: string;
}

export interface Room {
  id: string;
  name: string;
  creatorId: string;
  creatorName: string;
  isPrivate: boolean;
  code: string;
  players: PlayerInGame[];
  spectators: Spectator[];
  maxPlayers: number;
  gameStatus: 'waiting' | 'betting' | 'playing' | 'roundEnd';
  deck: Card[];
  currentTurnIndex: number;
  roundNumber: number;
  minBet: number;
  pot: number;
  winners: string[];
  message: string;
  lastUpdate: number;
}

export interface TelegramConfig {
  botToken: string;
  chatId: string;
}
