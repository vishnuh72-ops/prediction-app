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

  // Settings & Transfer states
  const [showSettings, setShowSettings] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [transferTarget, setTransferTarget] = useState('');
  const [transferAmount, setTransferAmount] = useState('');

  useEffect(() => {
    const savedUser = JSON.parse(localStorage.getItem('app_user'));
    if (savedUser && !savedUser.is_admin) {
      setUser(savedUser);
      fetchDashboardData(savedUser.id);
    } else {
      window.location.href = '/';
    }

    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const fetchDashboardData = async (currentUserId) => {
    const { data: uProfile } = await supabase.from('users').select('*').eq('id', currentUserId).single();
    if (uProfile) setUser(uProfile);

    const { data: mData } = await supabase.from('matches').select('*').order('match_no', { ascending: true });
    setMatches(mData || []);

    const { data: bData } = await supabase.from('bets').select('*');
    setAllBets(bData || []);

    const { data: scoreData } = await supabase.from('users').select('id', 'username', 'name', 'purse').eq('is_admin', false).order('purse', { ascending: false });
    setUsersList(scoreData || []);
  };

  const handlePlaceBet = async (matchId, kickoffTime) => {
    const matchKickoff = new Date(kickoffTime);
    if (new Date() >= matchKickoff) {
      alert('🔒 Too late! The match has started and predictions are locked.');
      return;
    }

    const prediction = predictions[matchId];
    const amountInput = parseInt(betAmounts[matchId]);

    if (!prediction) return alert('Select an outcome!');
    if (isNaN(amountInput) || amountInput < 1) return alert('Minimum bet is $1.');

    const existingBet = allBets.find(b => b.match_id === matchId && b.user_id === user.id);
    const currentBetAmount = existingBet ? existingBet.amount : 0;
    const refundedPurse = parseFloat(user.purse) + currentBetAmount;

    if (amountInput > refundedPurse) return alert('Insufficient purse balance!');

    const newPurse = refundedPurse - amountInput;
    await supabase.from('users').update({ purse: newPurse }).eq('id', user.id);

    if (existingBet) {
      const { error } = await supabase
        .from('bets')
        .update({ predicted_outcome: prediction, amount: amountInput })
        .eq('id', existingBet.id);

      if (error) {
        await supabase.from('users').update({ purse: parseFloat(user.purse) }).eq('id', user.id);
        alert('Error updating your bet.');
      } else {
        alert('🎯 Your bid has been updated successfully!');
        fetchDashboardData(user.id);
      }
    } else {
      const { error } = await supabase.from('bets').insert([{ user_id: user.id, match_id: matchId, predicted_outcome: prediction, amount: amountInput }]);

      if (error) {
        await supabase.from('users').update({ purse: parseFloat(user.purse) }).eq('id', user.id);
        alert('Bet saving error.');
      } else {
        alert('🎯 Bet locked in!');
        fetchDashboardData(user.id);
      }
    }
  };

  // 💸 VIRTUAL USER TO USER TRANSFER LOGIC
  const handleVirtualTransfer = async (e) => {
    e.preventDefault();
    const amount = parseFloat(transferAmount);

    if (!transferTarget) return alert('Please select a friend to send points to.');
    if (isNaN(amount) || amount <= 0) return alert('Please enter a valid amount greater than 0.');
    if (amount > parseFloat(user.purse)) return alert('Insufficient purse balance for this transfer!');
    if (transferTarget === user.id) return alert('You cannot send points to yourself.');

    if (!confirm(`Are you sure you want to transfer $${amount.toFixed(2)} to this user?`)) return;

    try {
      // 1. Fetch recipient's current balance
      const { data: recipient, error: fetchErr } = await supabase.from('users').select('purse, username').eq('id', transferTarget).single();
      if (fetchErr || !recipient) throw new Error('Recipient not found');

      // 2. Deduct from Sender
      const senderNewPurse = parseFloat(user.purse) - amount;
      await supabase.from('users').update({ purse: senderNewPurse }).eq('id', user.id);

      // 3. Add to Recipient
      const recipientNewPurse = parseFloat(recipient.purse) + amount;
      await supabase.from('users').update({ purse: recipientNewPurse }).eq('id', transferTarget);

      alert(`✅ Successfully transferred $${amount.toFixed(2)} to ${recipient.username}!`);
      setTransferAmount('');
      setTransferTarget('');
      fetchDashboardData(user.id);
    } catch (err) {
      alert('Transfer failed. Please try again.');
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!newPassword.trim()) return alert('Please enter a valid password.');
    
    const { error } = await supabase.from('users').update({ password: newPassword }).eq('id', user.id);
    if (error) alert('Error updating password.');
    else {
      alert('🔒 Password updated successfully!');
      setNewPassword('');
      setShowSettings(false);
    }
  };

  const handleDeleteAccount = async () => {
    const confirmFirst = confirm("⚠️ WARNING: This will permanently delete your account and all points. Proceed?");
    if (!confirmFirst) return;
    const confirmFinal = confirm("Are you absolutely sure?");
    if (!confirmFinal) return;

    try {
      await supabase.from('bets').delete().eq('user_id', user.id);
      await supabase.from('users').delete().eq('id', user.id);
      alert("👋 Account deleted.");
      localStorage.removeItem('app_user');
      window.location.href = '/';
    } catch (err) {
      alert("Error deleting account.");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('app_user');
    window.location.href = '/';
  };

  if (!user) return <div style={{ color: '#fff', backgroundColor: '#0f172a', minHeight: '100vh', padding: '20px' }}>Loading...</div>;

  const activeMatches = matches.filter(m => !m.winner);
  const settledMatches = matches.filter(m => m.winner);
  
  // Filter out the logged-in user so they can't send money to themselves
  const transferPartners = usersList.filter(u => u.id !== user.id);

  return (
    <div style={{ backgroundColor: '#0f172a', minHeight: '100vh', fontFamily: 'system-ui, sans-serif', color: '#f8fafc', padding: '12px' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        
        {/* HEADER */}
        <div style={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '16px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '700' }}>👋 Welcome, {user.username}</h2>
              <div style={{ display: 'inline-block', backgroundColor: '#0284c7', color: '#fff', padding: '4px 10px', borderRadius: '20px', fontSize: '13px', fontWeight: '700', marginTop: '4px' }}>
                💰 Purse: ${parseFloat(user.purse).toFixed(2)}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setShowSettings(!showSettings)} style={{ backgroundColor: '#475569', border: 'none', color: '#fff', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '13px' }}>
                {showSettings ? 'Close Menu' : '⚙️ Settings'}
              </button>
              <button onClick={handleLogout} style={{ backgroundColor: 'transparent', border: '1px solid #475569', color: '#94a3b8', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '13px' }}>Logout</button>
            </div>
          </div>
          <div style={{ fontSize: '12px', color: '#64748b', fontFamily: 'monospace', backgroundColor: '#0f172a', padding: '6px', borderRadius: '6px', border: '1px solid #334155', textAlign: 'center' }}>
            ⏰ Clock: {currentTime.toLocaleTimeString('en-IN')}
          </div>
        </div>

        {/* SETTINGS MENU (PASSWORD, ACCOUNT DELETION, AND VIRTUAL TRANSFER) */}
        {showSettings && (
          <div style={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '16px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* NEW VIRTUAL TRANSFER FORM */}
            <div>
              <h3 style={{ margin: '0 0 4px 0', fontSize: '16px', color: '#38bdf8' }}>💸 Transfer Points to Friend</h3>
              <p style={{ margin: '0 0 10px 0', fontSize: '12px', color: '#94a3b8' }}>Send virtual tokens from your wallet directly to another player.</p>
              <form onSubmit={handleVirtualTransfer} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <select value={transferTarget} onChange={(e) => setTransferTarget(e.target.value)} style={{ padding: '10px', backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px', color: '#fff', fontSize: '14px', width: '100%' }}>
  <option value="">-- Select Recipient --</option>
  {transferPartners.map(u => (
    <option key={u.id} value={u.id}>👤 {u.username || u.name || 'Player'}</option>
  ))}
</select>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input type="number" step="0.01" min="0.01" placeholder="Amount to send ($)" value={transferAmount} onChange={(e) => setTransferAmount(e.target.value)} style={{ flex: 1, padding: '10px', backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px', color: '#fff', fontSize: '14px' }} />
                  <button type="submit" style={{ backgroundColor: '#10b981', color: '#fff', border: 'none', borderRadius: '8px', padding: '0 20px', fontWeight: '700', cursor: 'pointer', fontSize: '14px' }}>Send</button>
                </div>
              </form>
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid #334155', margin: '0' }} />

            {/* PASSWORD UPDATE */}
            <div>
              <h3 style={{ margin: '0 0 4px 0', fontSize: '16px', color: '#f8fafc' }}>🔑 Change Password</h3>
              <form onSubmit={handleChangePassword} style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <input type="password" placeholder="Enter new password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} style={{ flex: 1, padding: '10px', backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px', color: '#fff', fontSize: '14px' }} />
                <button type="submit" style={{ backgroundColor: '#0284c7', color: '#fff', border: 'none', borderRadius: '8px', padding: '0 16px', fontWeight: '600', cursor: 'pointer', fontSize: '14px' }}>Save</button>
              </form>
            </div>
            
            <hr style={{ border: 'none', borderTop: '1px solid #334155', margin: '0' }} />

            {/* DANGER ZONE */}
            <div>
              <h3 style={{ margin: '0 0 4px 0', fontSize: '16px', color: '#f87171' }}>🚨 Danger Zone</h3>
              <button onClick={handleDeleteAccount} style={{ backgroundColor: '#dc2626', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 16px', fontWeight: '700', cursor: 'pointer', fontSize: '13px', width: '100%' }}>
                Delete My Account Permanently
              </button>
            </div>
          </div>
        )}

        {/* RESPONSIVE LAYOUT FLUID COUPLING */}
        <div style={{ display: 'flex', flexDirection: 'column-reverse', gap: '20px' }}>
          
          {/* STANDINGS */}
          <div style={{ width: '100%' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#38bdf8', marginBottom: '12px' }}>📊 Group Standings</h3>
            <div style={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '16px', padding: '12px' }}>
              {usersList.map((u, index) => (
                <div key={index} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 6px', borderBottom: index === usersList.length - 1 ? 'none' : '1px solid #334155', fontWeight: user.username === u.username ? '700' : '400', backgroundColor: user.username === u.username ? 'rgba(56,189,248,0.05)' : 'transparent', borderRadius: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
                    <span style={{ color: index === 0 ? '#fbbf24' : index === 1 ? '#94a3b8' : index === 2 ? '#b45309' : '#64748b', fontWeight: '800' }}>#{index + 1}</span>
                    <span>{u.username}</span>
                  </div>
                  <span style={{ color: '#38bdf8', fontWeight: '700', fontSize: '14px' }}>${parseFloat(u.purse).toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* MAIN FIXTURES */}
          <div style={{ width: '100%' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#38bdf8', marginBottom: '12px' }}>⚡ Live Match Cards</h3>
            
            {activeMatches.length === 0 ? (
              <p style={{ color: '#64748b', fontSize: '13px', backgroundColor: '#1e293b', padding: '16px', borderRadius: '12px', border: '1px dashed #334155' }}>No active fixtures right now.</p>
            ) : (
              activeMatches.map(m => {
                const matchKickoff = new Date(m.kickoff_time);
                const isClosed = currentTime >= matchKickoff;
                
                const myBet = allBets.find(b => b.match_id === m.id && b.user_id === user.id);
                const matchBets = allBets.filter(b => b.match_id === m.id);
                
                const selectedOutcome = predictions[m.id] || (myBet ? myBet.predicted_outcome : null);
                const enteredStake = betAmounts[m.id] !== undefined ? parseFloat(betAmounts[m.id]) : (myBet ? myBet.amount : 0);
                
                let activeMultiplier = 0;
                if (selectedOutcome === 'A') activeMultiplier = m.margin_a;
                if (selectedOutcome === 'B') activeMultiplier = m.margin_b;
                if (selectedOutcome === 'DRAW') activeMultiplier = m.margin_draw;

                const potentialReturn = enteredStake * activeMultiplier;
                const potentialProfit = potentialReturn - enteredStake;

                return (
                  <div key={m.id} style={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '16px', padding: '16px', marginBottom: '16px' }}>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid #334155' }}>
                      <span style={{ fontSize: '11px', fontWeight: '700', color: '#94a3b8' }}>MATCH NO. {m.match_no}</span>
                      <span style={{ fontSize: '10px', fontWeight: '800', padding: '3px 8px', borderRadius: '6px', color: '#fff', backgroundColor: isClosed ? '#b91c1c' : '#0284c7' }}>
                        {isClosed ? '🔒 LOCKED' : '⏳ OPEN'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', margin: '14px 0' }}>
                      <div style={{ fontSize: '18px', fontWeight: '800', textAlign: 'center' }}>{m.team_a}</div>
                      <div style={{ backgroundColor: '#0f172a', color: '#64748b', fontSize: '11px', fontWeight: '700', width: '26px', height: '26px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #334155' }}>VS</div>
                      <div style={{ fontSize: '18px', fontWeight: '800', textAlign: 'center' }}>{m.team_b}</div>
                    </div>

                    <div style={{ fontSize: '12px', color: '#94a3b8', textAlign: 'center', marginBottom: '14px', backgroundColor: '#0f172a', padding: '6px', borderRadius: '8px' }}>
                      📅 {matchKickoff.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' })} (IST)
                    </div>

                    {!isClosed ? (
                      <div style={{ backgroundColor: '#0f172a', padding: '12px', borderRadius: '12px', border: '1px solid #334155' }}>
                        
                        {myBet && (
                          <div style={{ backgroundColor: 'rgba(56, 189, 248, 0.08)', color: '#38bdf8', fontSize: '12px', padding: '8px', borderRadius: '6px', marginBottom: '12px', textAlign: 'center', border: '1px dashed rgba(56, 189, 248, 0.2)' }}>
                            📝 Live Bid: ${myBet.amount} on {myBet.predicted_outcome === 'DRAW' ? 'Draw' : myBet.predicted_outcome === 'A' ? 'Team A' : 'Team B'}
                          </div>
                        )}

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
                          <label style={{ textAlign: 'center', backgroundColor: selectedOutcome === 'A' ? '#0284c7' : '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '10px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: '600', fontSize: '13px' }}>
                            <input type="radio" name={`outcome-${m.id}`} checked={selectedOutcome === 'A'} onChange={() => setPredictions({ ...predictions, [m.id]: 'A' })} style={{ display: 'none' }} />
                            <span>🚩 {m.team_a}</span>
                            <span style={{color:'#38bdf8'}}>{m.margin_a}x</span>
                          </label>

                          <label style={{ textAlign: 'center', backgroundColor: selectedOutcome === 'DRAW' ? '#0284c7' : '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '10px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: '600', fontSize: '13px' }}>
                            <input type="radio" name={`outcome-${m.id}`} checked={selectedOutcome === 'DRAW'} onChange={() => setPredictions({ ...predictions, [m.id]: 'DRAW' })} style={{ display: 'none' }} />
                            <span>🤝 Draw</span>
                            <span style={{color:'#38bdf8'}}>{m.margin_draw}x</span>
                          </label>

                          <label style={{ textAlign: 'center', backgroundColor: selectedOutcome === 'B' ? '#0284c7' : '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '10px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: '600', fontSize: '13px' }}>
                            <input type="radio" name={`outcome-${m.id}`} checked={selectedOutcome === 'B'} onChange={() => setPredictions({ ...predictions, [m.id]: 'B' })} style={{ display: 'none' }} />
                            <span>🏁 {m.team_b}</span>
                            <span style={{color:'#38bdf8'}}>{m.margin_b}x</span>
                          </label>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          <input type="number" min="1" placeholder="Enter Bid Amount ($)" value={betAmounts[m.id] !== undefined ? betAmounts[m.id] : (myBet ? myBet.amount : '')} onChange={(e) => setBetAmounts({ ...betAmounts, [m.id]: e.target.value })} style={{ padding: '10px', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#fff', outline: 'none', fontSize: '14px', width: '100%', boxSizing: 'border-box' }} />
                          
                          {selectedOutcome && enteredStake > 0 && (
                            <div style={{ backgroundColor: 'rgba(56, 189, 248, 0.05)', border: '1px solid rgba(56, 189, 248, 0.15)', padding: '10px', borderRadius: '8px', fontSize: '12px', color: '#e2e8f0', lineHeight: '1.5' }}>
                              📈 Get <strong>${potentialReturn.toFixed(2)}</strong> (Profit: <strong style={{ color: '#4ade80' }}>${potentialProfit.toFixed(2)}</strong>)
                            </div>
                          )}

                          <button onClick={() => handlePlaceBet(m.id, m.kickoff_time)} style={{ padding: '12px', backgroundColor: '#38bdf8', color: '#0f172a', border: 'none', borderRadius: '8px', fontWeight: '700', cursor: 'pointer', fontSize: '14px' }}>
                            {myBet ? '🔄 Update Current Bid' : 'Place Bid'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        {myBet ? (
                          <div style={{ backgroundColor: 'rgba(2,132,199,0.15)', border: '1px solid rgba(2,132,199,0.3)', padding: '12px', borderRadius: '12px', textAlign: 'center', color: '#38bdf8', fontWeight: '600', fontSize: '13px' }}>
                            🎯 Locked: <strong>${myBet.amount}</strong> on {myBet.predicted_outcome} 🔒
                          </div>
                        ) : (
                          <div style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', padding: '12px', borderRadius: '12px', textAlign: 'center', color: '#f87171', fontWeight: '600', fontSize: '13px' }}>
                            🛑 Window closed.
                          </div>
                        )}
                      </div>
                    )}

                    {/* COMPACT REVEAL GRID */}
                    {isClosed && (
                      <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px dashed #334155' }}>
                        <div style={{ fontSize: '12px', fontWeight: '700', color: '#94a3b8', marginBottom: '6px' }}>👁️ Group Submissions:</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {matchBets.map(b => {
                            const lookup = usersList.find(ul => ul.id === b.user_id)?.username || 'Player';
                            return (
                              <div key={b.id} style={{ backgroundColor: '#0f172a', border: '1px solid #334155', padding: '6px 10px', borderRadius: '8px', fontSize: '12px', display: 'flex', justifyContent: 'space-between' }}>
                                <span>👤 <strong>{lookup}</strong></span>
                                <span style={{color: '#38bdf8'}}>${b.amount} ({b.predicted_outcome})</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                  </div>
                );
              })
            )}

            {/* HISTORIC LOG LIST */}
            <h3 style={{ fontSize: '16px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94a3b8', marginTop: '30px', marginBottom: '12px' }}>📜 Match History</h3>
            {settledMatches.length === 0 ? (
              <p style={{ color: '#64748b', fontSize: '13px' }}>No matches settled yet.</p>
            ) : (
              settledMatches.map(m => {
                const userBet = allBets.find(b => b.match_id === m.id && b.user_id === user.id);
                const didWin = userBet && userBet.predicted_outcome === m.winner;
                let payoutMultiplier = 1;
                if (m.winner === 'A') payoutMultiplier = m.margin_a;
                if (m.winner === 'B') payoutMultiplier = m.margin_b;
                if (m.winner === 'DRAW') payoutMultiplier = m.margin_draw;

                return (
                  <div key={m.id} style={{ backgroundColor: '#1e293b', opacity: 0.85, border: '1px solid #334155', borderRadius: '12px', padding: '12px', marginBottom: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '700' }}>MATCH #{m.match_no}</span>
                      <span style={{ fontSize: '12px', fontWeight: '700', color: '#38bdf8' }}>Result: {m.winner}</span>
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: '700' }}>{m.team_a} vs {m.team_b}</div>
                    
                    {userBet ? (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0f172a', padding: '6px 10px', borderRadius: '6px', fontSize: '12px' }}>
                        <span style={{ color: '#94a3b8' }}>Bid: ${userBet.amount}</span>
                        <span style={{ fontWeight: '800', color: didWin ? '#4ade80' : '#f87171' }}>
                          {didWin ? `+$${(userBet.amount * payoutMultiplier).toFixed(2)}` : `-$${userBet.amount}`}
                        </span>
                      </div>
                    ) : (
                      <div style={{ fontSize: '11px', color: '#64748b', fontStyle: 'italic' }}>No Bid Placed</div>
                    )}
                  </div>
                );
              })
            )}

          </div>

        </div>

      </div>
    </div>
  );
}
