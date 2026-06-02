import { useState, useEffect } from 'react';
import { supabase } from '../supabase';

export default function Home() {
  const [isRegistering, setIsRegistering] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [user, setUser] = useState(null);
  const [message, setMessage] = useState('');

  // Check if a user is already logged in when the page loads
  useEffect(() => {
    const savedUser = localStorage.getItem('app_user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
  }, []);

  // Handle User Registration
  const handleRegister = async (e) => {
    e.preventDefault();
    setMessage('');
    if (!username || !password) return setMessage('Please fill all fields');

    // Check if username already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('*')
      .eq('username', username.trim().toLowerCase())
      .single();

    if (existingUser) {
      return setMessage('Username already taken!');
    }

    // Save user to database with default $100 purse
    const { data, error } = await supabase
      .from('users')
      .insert([{ username: username.trim().toLowerCase(), password_hash: password, purse: 100 }])
      .select();

    if (error) {
      setMessage('Registration failed. Try again.');
    } else {
      setMessage('Registration successful! You can now log in.');
      setIsRegistering(false);
    }
  };

  // Handle User Login
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
      setMessage('Invalid username or password');
    } else {
      localStorage.setItem('app_user', JSON.stringify(data));
      setUser(data);
      // Redirect based on role
      if (data.is_admin) {
        window.location.href = '/admin';
      } else {
        window.location.href = '/dashboard';
      }
    }
  };

  return (
    <div style={{ fontFamily: 'sans-serif', maxWidth: '400px', margin: '100px auto', padding: '20px', border: '1px solid #ccc', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
      <h2 style={{ textAlign: 'center', color: '#333' }}>🏆 World Cup Predictor</h2>
      <h3 style={{ textAlign: 'center', color: '#666' }}>{isRegistering ? 'Create Account' : 'Login'}</h3>
      
      {message && <p style={{ color: 'red', textAlign: 'center', fontWeight: 'bold' }}>{message}</p>}

      <form onSubmit={isRegistering ? handleRegister : handleLogin}>
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>Username:</label>
          <input 
            type="text" 
            value={username} 
            onChange={(e) => setUsername(e.target.value)}
            style={{ width: '100%', padding: '8px', boxSizing: 'border-box', borderRadius: '4px', border: '1px solid #ccc' }}
          />
        </div>
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>Password:</label>
          <input 
            type="password" 
            value={password} 
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: '100%', padding: '8px', boxSizing: 'border-box', borderRadius: '4px', border: '1px solid #ccc' }}
          />
        </div>
        <button type="submit" style={{ width: '100%', padding: '10px', background: '#0070f3', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '16px' }}>
          {isRegistering ? 'Sign Up' : 'Log In'}
        </button>
      </form>

      <p style={{ textAlign: 'center', marginTop: '20px', fontSize: '14px' }}>
        {isRegistering ? 'Already have an account?' : "Don't have an account?"}{' '}
        <span 
          onClick={() => { setIsRegistering(!isRegistering); setMessage(''); }} 
          style={{ color: '#0070f3', cursor: 'pointer', textDecoration: 'underline' }}
        >
          {isRegistering ? 'Login here' : 'Register here'}
        </span>
      </p>
    </div>
  );
}
