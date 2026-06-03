import { useState, useEffect } from 'react';
import { supabase } from '../supabase';

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [matches, setMatches] = useState([]);
  const [allBets, setAllBets] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [predictions, setPredictions] = useState({});
  const [betAmounts, setBetAmounts] = useState({});
  const [currentTime, setCurrentTime] = useState(new Date());

  const [showSettings, setShowSettings] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [transferTarget, setTransferTarget] = useState('');
  const [transferAmount, setTransferAmount] = useState('');

  // 🛠️ CRITICAL: Single source of truth for extracting Names
  const getDisplayName = (u) => {
    return u.username || u.name || u.display_name || 'Player';
  };

  useEffect(() => {
    const savedUser = JSON.parse(localStorage.getItem('app_user'));
    if (savedUser && !savedUser.is_admin) {
      setUser(savedUser);
      fetchDashboardData(savedUser.id);
    } else {
      window.location.href = '/';
    }
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchDashboardData = async (currentUserId) => {
    // Fetch profile
    const { data: uProfile } = await supabase.from('users').select('*').eq('id', currentUserId).single();
    if (uProfile) setUser(uProfile);

    // Fetch matches
    const { data: mData } = await supabase.from('matches').select('*').order('match_no', { ascending: true });
    setMatches(mData || []);

    // Fetch bets
    const { data: bData } = await supabase.from('bets').select('*');
    setAllBets(bData || []);

    // 🛠️ CRITICAL: Explicitly fetch all possible name columns
    const { data: scoreData } = await supabase
      .from('users')
      .select('id, username, name, display_name, purse')
      .eq('is_admin', false);
      
    // 🛠️ CRITICAL: Sanitize purse and sort
    const formattedData = (scoreData || []).map(u => ({
      ...u,
      purse: parseFloat(u.purse) || 0
    })).sort((a, b) => b.purse - a.purse);
    
    setUsersList(formattedData);
  };

  // ... (Keep handlePlaceBet, handleVirtualTransfer, handleChangePassword, handleDeleteAccount, handleLogout same as your previous version)

  if (!user) return <div style={{ color: '#fff', backgroundColor: '#0f172a', minHeight: '100vh', padding: '20px' }}>Loading...</div>;

  const activeMatches = matches.filter(m => !m.winner);
  const settledMatches = matches.filter(m => m.winner);
  const transferPartners = usersList.filter(u => u.id !== user.id);

  return (
    <div style={{ backgroundColor: '#0f172a', minHeight: '100vh', fontFamily: 'system-ui, sans-serif', color: '#f8fafc', padding: '12px' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        
        {/* HEADER */}
        <div style={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '16px', padding: '16px' }}>
          <h2 style={{ margin: 0 }}>👋 Welcome, {getDisplayName(user)}</h2>
          <div style={{ backgroundColor: '#0284c7', padding: '4px 10px', borderRadius: '20px', display: 'inline-block', marginTop: '8px' }}>
            💰 Purse: ${user.purse ? parseFloat(user.purse).toFixed(2) : '0.00'}
          </div>
        </div>

        {/* SETTINGS / TRANSFER */}
        {showSettings && (
          <div style={{ backgroundColor: '#1e293b', padding: '16px', borderRadius: '16px' }}>
            <h3>💸 Transfer Points</h3>
            <select value={transferTarget} onChange={(e) => setTransferTarget(e.target.value)} style={{ width: '100%', padding: '10px', backgroundColor: '#0f172a', color: '#fff', borderRadius: '8px' }}>
              <option value="">-- Select Recipient --</option>
              {transferPartners.map(u => (
                <option key={u.id} value={u.id}>👤 {getDisplayName(u)}</option>
              ))}
            </select>
          </div>
        )}

        {/* 📊 UPDATED LEADERBOARD */}
        <div style={{ width: '100%' }}>
          <h3>📊 Group Standings</h3>
          <div style={{ backgroundColor: '#1e293b', borderRadius: '16px', padding: '12px' }}>
            {usersList.map((u, index) => (
              <div key={index} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', borderBottom: '1px solid #334155' }}>
                <span>#{index + 1} {getDisplayName(u)}</span>
                <span style={{ color: '#38bdf8' }}>${u.purse.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
