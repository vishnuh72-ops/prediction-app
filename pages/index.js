import { useState, useEffect } from 'react';
import { supabase } from '../supabase';

export default function Home() {
  const [isRegistering, setIsRegistering] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const savedUser = localStorage.getItem('app_user');
    if (savedUser) {
      const data = JSON.parse(savedUser);
      if (data.is_admin) window.location.href = '/admin';
      else window.location.href = '/dashboard';
    }
  }, []);

  const handleRegister = async (e) => {
    e.preventDefault();
    setMessage('');
    if (!username || !password) return setMessage('⚠️ Please fill all fields');

    const { data: existingUser } = await supabase
      .from('users')
      .select('*')
      .eq('username', username.trim().toLowerCase())
      .single();

    if (existingUser) return setMessage('❌ Username already taken!');

    const { error } = await supabase
      .from('users')
      .insert([{ username: username.trim().toLowerCase(), password_hash: password, purse: 100 }]);

    if (error) {
      setMessage('❌ Registration failed. Try again.');
    } else {
      setMessage('🎉 Success! You can now log in.');
      setIsRegistering(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setMessage('');

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', username.trim().toLowerCase())
      .eq('password_hash', password)
      .single();

    if (error || !data) {
      setMessage('❌ Invalid username or password');
    } else {
      localStorage.setItem('app_user', JSON.stringify(data));
      if (data.is_admin) window.location.href = '/admin';
      else window.location.href = '/dashboard';
    }
  };

  return (
    <div style={{ backgroundColor: '#0f172a', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif', padding: '20px' }}>
      <div style={{ backgroundColor: '#1e293b', width: '100%', maxWidth: '400px', padding: '40px 30px', borderRadius: '16px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)', border: '1px solid #334155' }}>
        
        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
          <span style={{ fontSize: '48px' }}>🏆</span>
          <h2 style={{ color: '#fff', margin: '10px 0 5px 0', fontSize: '28px', fontWeight: '800', tracking: '-0.05em' }}>WORLD CUP</h2>
          <p style={{ color: '#38bdf8', margin: 0, fontSize: '14px', fontWeight: '600', letterSpacing: '0.1em' }}>PREDICTION LEAGUE</p>
        </div>

        <h3 style={{ color: '#94a3b8', fontSize: '16px', textAlign: 'center', marginBottom: '24px' }}>{isRegistering ? 'Create your manager account' : 'Sign in to place your bets'}</h3>
        
        {message && <div style={{ backgroundColor: message.includes('🎉') ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', color: message.includes('🎉') ? '#4ade80' : '#f87171', padding: '12px', borderRadius: '8px', fontSize: '14px', textAlign: 'center', marginBottom: '20px', border: message.includes('🎉') ? '1px solid rgba(34,197,94,0.2)' : '1px solid rgba(239,68,68,0.2)' }}>{message}</div>}

        <form onSubmit={isRegistering ? handleRegister : handleLogin}>
          <div style={{ marginBottom: '18px' }}>
            <label style={{ display: 'block', marginBottom: '6px', color: '#94a3b8', fontSize: '13px', fontWeight: '500' }}>Username</label>
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="enter username" style={{ width: '100%', padding: '12px 16px', backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px', color: '#fff', fontSize: '15px', outline: 'none' }} />
          </div>
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', marginBottom: '6px', color: '#94a3b8', fontSize: '13px', fontWeight: '500' }}>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" style={{ width: '100%', padding: '12px 16px', backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px', color: '#fff', fontSize: '15px', outline: 'none' }} />
          </div>
          <button type="submit" style={{ width: '100%', padding: '14px', backgroundColor: '#38bdf8', color: '#0f172a', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '16px', fontWeight: '700', transition: 'all 0.2s' }}>
            {isRegistering ? 'Create Account' : 'Get Started'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: '24px', fontSize: '14px', color: '#64748b' }}>
          {isRegistering ? 'Already a player?' : "New to the group?"}{' '}
          <span onClick={() => { setIsRegistering(!isRegistering); setMessage(''); }} style={{ color: '#38bdf8', cursor: 'pointer', fontWeight: '600', textDecoration: 'underline' }}>
            {isRegistering ? 'Login here' : 'Register here'}
          </span>
        </p>
      </div>
    </div>
  );
}
