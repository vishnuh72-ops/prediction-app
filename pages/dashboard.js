import { useState, useEffect } from 'react';
import { supabase } from '../supabase';

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [matches, setMatches] = useState([]);
  const [allBets, setAllBets] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [predictions, setPredictions] = useState({}); // Stores selected outcomes: { matchId: 'A' }
  const [betAmounts, setBetAmounts] = useState({});   // Stores input amounts: { matchId: 20 }
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const savedUser = JSON.parse(localStorage.getItem('app_user'));
    if (savedUser && !savedUser.is_admin) {
      setUser(savedUser);
      fetchDashboardData(savedUser.id);
    } else {
      window.location.href = '/';
    }

    // Keep clock updating to handle lock-in times dynamically
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchDashboardData = async (currentUserId) => {
    // 1. Refresh user profile info to get the accurate purse amount
    const { data: uProfile } = await supabase.from('users').select('*').eq('id', currentUserId).single();
    if (uProfile) setUser(uProfile);

    // 2. Fetch all matches
    const { data: mData } = await supabase.from('matches').select('*').order('match_no', { ascending: true });
    setMatches(mData || []);

    // 3. Fetch all bets in the system
    const { data: bData } = await supabase.from('bets').select('*');
    setAllBets(bData || []);

    // 4. Fetch all users sorted by purse balance to create the scoreboard
    const { data: scoreData } = await supabase.from('users').select('username', 'purse').eq('is_admin', false).order('purse', { ascending: false });
    setUsersList(scoreData || []);
  };

  const handlePlaceBet = async (matchId, kickoffTime) => {
    const matchKickoff = new Date(kickoffTime);
    if (new Date() >= matchKickoff) {
      alert('The prediction window has closed for this match!');
      return;
    }

    const prediction = predictions[matchId];
    const amountInput = parseInt(betAmounts[matchId]);

    if (!prediction) return alert('Please select a winner or draw.');
    if (isNaN(amountInput) || amountInput < 1) return alert('Minimum bet is $1.');
    if (amountInput > user.purse) return alert('You cannot bet more than your current purse balance.');

    // Secure operational step: Deduct funds from user purse profile
    const newPurse = parseFloat(user.purse) - amountInput;
    const { error: purseError } = await supabase.from('users').update({ purse: newPurse }).eq('id', user.id);

    if (purseError) return alert('Transaction error. Try again.');

    // Record the prediction entry
    const { error: betError } = await supabase.from('bets').insert([{
      user_id: user.id,
      match_id: matchId,
      predicted_outcome: prediction,
      amount: amountInput
    }]);

    if (betError) {
      // Refund if insertion failed
      await supabase.from('users').update({ purse: parseFloat(user.purse) }).eq('id', user.id);
      alert('You have already placed a bet on this match!');
    } else {
      alert('Bet placed successfully! Your prediction is locked and hidden.');
      fetchDashboardData(user.id);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('app_user');
    window.location.href = '/';
  };

  if (!user) return <p style={{ padding: '20px' }}>Loading account profile...</p>;

  return (
    <div style={{ fontFamily: 'sans-serif', maxWidth: '1000px', margin: '20px auto', padding: '15px', display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
      
      {/* LEFT COLUMN: ACTIVE MATCH CARDS */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #eaeaea', paddingBottom: '10px' }}>
          <div>
            <h2>👋 Hello, {user.username}</h2>
            <h3 style={{ margin: 0, color: '#0070f3' }}>Your Purse: ${parseFloat(user.purse).toFixed(2)}</h3>
          </div>
          <button onClick={handleLogout} style={{ background: '#eaeaea', border: 'none', borderRadius: '4px', padding: '8px 15px', cursor: 'pointer' }}>Logout</button>
        </div>

        <h3 style={{ marginTop: '20px' }}>⚽ Match Predictions</h3>
        {matches.map(m => {
          const matchKickoff = new Date(m.kickoff_time);
          const isClosed = currentTime >= matchKickoff;
          const myBet = allBets.find(b => b.match_id === m.id && b.user_id === user.id);
          const matchBets = allBets.filter(b => b.match_id === m.id);

          return (
            <div key={m.id} style={{ border: '1px solid #ccc', borderRadius: '8px', padding: '15px', marginBottom: '15px', background: isClosed ? '#fdfdfd' : '#fff', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#666' }}>
                <span>MATCH #{m.match_no}</span>
                <span style={{ fontWeight: 'bold', color: isClosed ? 'red' : 'green' }}>
                  {m.winner ? '🏆 SETTLED' : isClosed ? '🔒 LOCKED (Live/Past)' : '⏳ OPEN FOR BETS'}
                </span>
              </div>

              <div style={{ textDisplay: 'center', margin: '15px 0', display: 'flex', justifyContent: 'space-around', alignItems: 'center' }}>
                <span style={{ fontSize: '18px', fontWeight: 'bold' }}>{m.team_a}</span>
                <span style={{ color: '#999' }}>vs</span>
                <span style={{ fontSize: '18px', fontWeight: 'bold' }}>{m.team_b}</span>
              </div>

              <div style={{ fontSize: '13px', color: '#555', marginBottom: '10px' }}>
                <strong>Kickoff:</strong> {matchKickoff.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} (IST) <br />
                <strong>Payout Rate:</strong> {m.margin_rate}x return rate
              </div>

              {/* IF USER HAS NOT PLACED A BET AND MATCH IS OPEN */}
              {!myBet && !isClosed && (
                <div style={{ background: '#f5f5f5', padding: '10px', borderRadius: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-around', marginBottom: '10px' }}>
                    <label><input type="radio" name={`outcome-${m.id}`} onClick={() => setPredictions({ ...predictions, [m.id]: 'A' })} /> {m.team_a}</label>
                    <label><input type="radio" name={`outcome-${m.id}`} onClick={() => setPredictions({ ...predictions, [m.id]: 'DRAW' })} /> Draw</label>
                    <label><input type="radio" name={`outcome-${m.id}`} onClick={() => setPredictions({ ...predictions, [m.id]: 'B' })} /> {m.team_b}</label>
                  </div>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <input type="number" min="1" step="1" placeholder="Bet Amount ($)" onChange={(e) => setBetAmounts({ ...betAmounts, [m.id]: e.target.value })} style={{ padding: '6px', width: '60%' }} />
                    <button onClick={() => handlePlaceBet(m.id, m.kickoff_time)} style={{ width: '40%', background: '#0070f3', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Lock Prediction</button>
                  </div>
                </div>
              )}

              {/* IF USER ALREADY PLACED A BET */}
              {myBet && (
                <div style={{ background: '#e3f2fd', padding: '8px 12px', borderRadius: '6px', fontSize: '14px', color: '#0d47a1' }}>
                  ✔ You bet <strong>${myBet.amount}</strong> on <strong>{myBet.predicted_outcome === 'DRAW' ? 'Draw' : myBet.predicted_outcome === 'A' ? m.team_a : m.team_b}</strong>
                </div>
              )}

              {/* REVEAL GROUP LOGS: SHOW ONLY IF WINDOW CLOSED */}
              {isClosed && (
                <div style={{ marginTop: '12px', borderTop: '1px dashed #ccc', paddingTop: '10px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#555' }}>Group Stakes:</span>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px', fontSize: '12px', marginTop: '5px' }}>
                    {matchBets.map(b => {
                      const lookupName = usersList.find(ul => ul.id === b.user_id)?.username || `User #${b.user_id}`;
                      return (
                        <div key={b.id} style={{ background: '#eee', padding: '3px 6px', borderRadius: '4px' }}>
                          👤 {lookupName}: ${b.amount} on <strong>{b.predicted_outcome}</strong>
                        </div>
                      );
                    })}
                    {matchBets.length === 0 && <span style={{ color: '#aaa', fontStyle: 'italic' }}>No predictions submitted.</span>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* RIGHT COLUMN: SCOREBOARD / LEADERBOARD */}
      <div style={{ borderLeft: '2px solid #eaeaea', paddingLeft: '20px' }}>
        <h3 style={{ marginTop: 0 }}>📊 Live Scoreboard</h3>
        <p style={{ fontSize: '12px', color: '#777' }}>Ranked by remaining wallet purse balance</p>
        <ol style={{ paddingLeft: '20px', lineHeight: '2' }}>
          {usersList.map((u, index) => (
            <li key={index} style={{ marginBottom: '8px', fontWeight: user.username === u.username ? 'bold' : 'normal' }}>
              <span style={{ color: '#333' }}>{u.username}</span> 
              <span style={{ float: 'right', color: '#0070f3' }}>${parseFloat(u.purse).toFixed(2)}</span>
            </li>
          ))}
        </ol>
      </div>

    </div>
  );
}
