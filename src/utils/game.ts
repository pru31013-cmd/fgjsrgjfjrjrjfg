import { Card, TelegramConfig } from '../types';

const SUITS: Card['suit'][] = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export function createDeck(numDecks = 2): Card[] {
  const deck: Card[] = [];
  for (let d = 0; d < numDecks; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        deck.push({ suit, rank });
      }
    }
  }
  return shuffle(deck);
}

export function shuffle<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function handValue(hand: Card[]): number {
  let value = 0;
  let aces = 0;
  for (const card of hand) {
    if (card.rank === 'A') {
      aces++;
      value += 11;
    } else if (['J', 'Q', 'K'].includes(card.rank)) {
      value += 10;
    } else {
      value += parseInt(card.rank);
    }
  }
  while (value > 21 && aces > 0) {
    value -= 10;
    aces--;
  }
  return value;
}

export function suitSymbol(suit: Card['suit']): string {
  const symbols: Record<Card['suit'], string> = {
    hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠',
  };
  return symbols[suit];
}

export function isRedSuit(suit: Card['suit']): boolean {
  return suit === 'hearts' || suit === 'diamonds';
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
}

export function loadData<T>(key: string, fallback: T): T {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : fallback;
  } catch {
    return fallback;
  }
}

export function saveData<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

export async function sendTelegram(
  config: TelegramConfig,
  message: string
): Promise<{ ok: boolean; error?: string }> {
  if (!config.botToken || !config.chatId) {
    console.warn('[Telegram] Bot token veya Chat ID bos.');
    return { ok: false, error: 'Bot Token veya Chat ID girilmemis.' };
  }

  const url = 'https://api.telegram.org/bot' + config.botToken + '/sendMessage';
  const payload = {
    chat_id: config.chatId,
    text: message,
    parse_mode: 'HTML',
  };

  console.log('[Telegram] Mesaj gonderiliyor...', { chatId: config.chatId, messageLength: message.length });

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({ description: 'HTTP ' + res.status }));
      const errMsg = data.description || ('HTTP Hata: ' + res.status);
      console.error('[Telegram] API Hatasi:', errMsg);
      return { ok: false, error: errMsg };
    }

    const data = await res.json();
    console.log('[Telegram] Basarili:', data);

    if (data.ok) {
      return { ok: true };
    } else {
      return { ok: false, error: data.description || 'Bilinmeyen hata' };
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Baglanti hatasi';
    console.error('[Telegram] Fetch hatasi:', errMsg);
    return { ok: false, error: 'Baglanti hatasi: ' + errMsg };
  }
}

export async function testTelegramConnection(
  config: TelegramConfig
): Promise<{ ok: boolean; botName?: string; error?: string }> {
  if (!config.botToken) {
    return { ok: false, error: 'Bot Token girilmemis.' };
  }

  try {
    const meUrl = 'https://api.telegram.org/bot' + config.botToken + '/getMe';
    console.log('[Telegram Test] Bot kontrol ediliyor...');
    const meRes = await fetch(meUrl);

    if (!meRes.ok) {
      return { ok: false, error: 'Gecersiz Bot Token. HTTP ' + meRes.status };
    }

    const meData = await meRes.json();

    if (!meData.ok) {
      return { ok: false, error: 'Gecersiz Bot Token: ' + (meData.description || 'Token kontrol edin') };
    }

    const botName = meData.result?.first_name || meData.result?.username || 'Bot';
    console.log('[Telegram Test] Bot bulundu:', botName);

    if (!config.chatId) {
      return { ok: false, botName, error: 'Chat ID girilmemis. Bot dogrulandi ama mesaj gonderilemez.' };
    }

    const msgUrl = 'https://api.telegram.org/bot' + config.botToken + '/sendMessage';
    const testMsg = [
      '\u2705 OJACK baglanti testi basarili!',
      '',
      '\uD83E\uDD16 Bot: ' + botName,
      '\uD83D\uDCAC Chat ID: ' + config.chatId,
      '\uD83D\uDCC5 ' + new Date().toLocaleString('tr-TR'),
    ].join('\n');

    const msgRes = await fetch(msgUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.chatId,
        text: testMsg,
      }),
    });

    const msgData = await msgRes.json();

    if (msgData.ok) {
      return { ok: true, botName };
    } else {
      let errorHint = msgData.description || 'Bilinmeyen hata';
      if (errorHint.includes('chat not found')) {
        errorHint += ' -- Ipucu: Botu gruba ekleyin ve Chat ID yi kontrol edin.';
      }
      if (errorHint.includes('bot was blocked')) {
        errorHint += ' -- Ipucu: Bot engellenmis. Tekrar ekleyin.';
      }
      return { ok: false, botName, error: errorHint };
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Sunucuya ulasilamiyor';
    console.error('[Telegram Test] Hata:', errMsg);
    return { ok: false, error: 'Baglanti hatasi: ' + errMsg };
  }
}

export function isBlackjack(hand: Card[]): boolean {
  return hand.length === 2 && handValue(hand) === 21;
}

export function isFiveCardCharlie(hand: Card[]): boolean {
  return hand.length === 5 && handValue(hand) <= 21;
}

export const MAX_CARDS = 5;

export function effectiveHandValue(hand: Card[]): number {
  if (isFiveCardCharlie(hand)) return 21;
  return handValue(hand);
}
