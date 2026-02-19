import { useState } from 'react';
import { User } from '../types';

interface AuthProps {
  users: User[];
  onLogin: (user: User) => void;
  onRegister: (data: { username: string; fullName: string; email: string; password: string }) => void;
}

export default function Auth({ users, onLogin, onRegister }: AuthProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!username || !password) { setError('Tüm alanları doldurun.'); return; }
    const user = users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.password === password);
    if (user) {
      onLogin(user);
    } else {
      setError('Kullanıcı adı veya şifre hatalı.');
    }
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!username || !password || !fullName || !email) { setError('Tüm alanları doldurun.'); return; }
    if (username.length < 3) { setError('Kullanıcı adı en az 3 karakter olmalı.'); return; }
    if (password.length < 4) { setError('Şifre en az 4 karakter olmalı.'); return; }
    if (!email.includes('@')) { setError('Geçerli bir e-posta girin.'); return; }
    if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
      setError('Bu kullanıcı adı zaten kullanılıyor.');
      return;
    }
    if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
      setError('Bu e-posta zaten kayıtlı.');
      return;
    }
    onRegister({ username, fullName, email, password });
  };

  const switchMode = () => {
    setIsLogin(!isLogin);
    setError('');
    setUsername('');
    setPassword('');
    setFullName('');
    setEmail('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-emerald-950 to-gray-900 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Decorative elements */}
      <div className="absolute top-10 left-10 text-8xl text-emerald-800/20 select-none animate-pulse">♠</div>
      <div className="absolute top-20 right-16 text-7xl text-red-800/20 select-none animate-pulse" style={{ animationDelay: '0.5s' }}>♥</div>
      <div className="absolute bottom-16 left-20 text-7xl text-red-800/20 select-none animate-pulse" style={{ animationDelay: '1s' }}>♦</div>
      <div className="absolute bottom-10 right-10 text-8xl text-emerald-800/20 select-none animate-pulse" style={{ animationDelay: '1.5s' }}>♣</div>

      <div className="bg-gray-800/90 backdrop-blur-xl rounded-3xl shadow-2xl p-8 w-full max-w-md border border-emerald-700/30 relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="relative inline-block mb-3 select-none">
            {/* Ace of Spades Card */}
            <div className="w-24 h-36 bg-gradient-to-br from-white to-gray-100 rounded-xl shadow-2xl shadow-black/50 border-2 border-gray-300 flex flex-col items-center justify-between p-2 mx-auto transform hover:rotate-3 transition-transform duration-300">
              {/* Top left A */}
              <div className="self-start flex flex-col items-center leading-none">
                <span className="text-lg font-black text-gray-900">A</span>
                <span className="text-sm text-gray-900">♠</span>
              </div>
              {/* Center large spade */}
              <div className="text-5xl text-gray-900 -mt-2 drop-shadow-lg">♠</div>
              {/* Bottom right A (rotated) */}
              <div className="self-end flex flex-col items-center leading-none rotate-180">
                <span className="text-lg font-black text-gray-900">A</span>
                <span className="text-sm text-gray-900">♠</span>
              </div>
            </div>
            {/* Glow effect */}
            <div className="absolute inset-0 bg-emerald-400/20 blur-2xl rounded-full -z-10 animate-pulse"></div>
          </div>
          <h1 className="text-4xl font-black bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 bg-clip-text text-transparent tracking-tight">
            OJACK
          </h1>
          <p className="text-emerald-400/80 mt-2 text-sm font-medium tracking-wider uppercase">
            Oyuncuya Karşı Oyuncu
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex mb-6 bg-gray-900/60 rounded-xl p-1">
          <button
            onClick={() => { if (!isLogin) switchMode(); }}
            className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all duration-300 ${
              isLogin
                ? 'bg-amber-500 text-gray-900 shadow-lg shadow-amber-500/30'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Giriş Yap
          </button>
          <button
            onClick={() => { if (isLogin) switchMode(); }}
            className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all duration-300 ${
              !isLogin
                ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Üye Ol
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-500/15 border border-red-500/30 text-red-400 p-3 rounded-xl mb-4 text-sm text-center font-medium">
            ⚠️ {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={isLogin ? handleLogin : handleRegister} className="space-y-4">
          {!isLogin && (
            <>
              <div>
                <label className="block text-gray-400 text-xs font-semibold mb-1.5 uppercase tracking-wider">Ad Soyad</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="Adınız Soyadınız"
                  className="w-full bg-gray-900/60 border border-gray-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all placeholder:text-gray-600"
                />
              </div>
              <div>
                <label className="block text-gray-400 text-xs font-semibold mb-1.5 uppercase tracking-wider">E-posta</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="ornek@mail.com"
                  className="w-full bg-gray-900/60 border border-gray-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all placeholder:text-gray-600"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-gray-400 text-xs font-semibold mb-1.5 uppercase tracking-wider">Kullanıcı Adı</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="kullanici_adi"
              className="w-full bg-gray-900/60 border border-gray-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all placeholder:text-gray-600"
            />
          </div>

          <div>
            <label className="block text-gray-400 text-xs font-semibold mb-1.5 uppercase tracking-wider">Şifre</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-gray-900/60 border border-gray-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all placeholder:text-gray-600"
            />
          </div>

          <button
            type="submit"
            className={`w-full py-3.5 font-black text-lg rounded-xl transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] shadow-lg ${
              isLogin
                ? 'bg-gradient-to-r from-amber-400 to-amber-600 text-gray-900 shadow-amber-500/30 hover:shadow-amber-500/50'
                : 'bg-gradient-to-r from-emerald-400 to-emerald-600 text-white shadow-emerald-500/30 hover:shadow-emerald-500/50'
            }`}
          >
            {isLogin ? '🎰 Giriş Yap' : '✨ Üye Ol'}
          </button>
        </form>

        {/* Footer */}
        <div className="mt-6 text-center">
          <p className="text-gray-500 text-xs">
            {isLogin ? 'Hesabın yok mu?' : 'Zaten üye misin?'}{' '}
            <button onClick={switchMode} className="text-amber-400 hover:text-amber-300 font-semibold transition-colors">
              {isLogin ? 'Üye Ol' : 'Giriş Yap'}
            </button>
          </p>
        </div>

        {/* Info */}
        <div className="mt-6 bg-emerald-900/30 border border-emerald-800/30 rounded-xl p-3">
          <p className="text-emerald-400/70 text-xs text-center">
            🎁 Yeni üyelere <span className="font-bold text-amber-400">1.000 coin</span> hediye!
          </p>
        </div>
      </div>
    </div>
  );
}
