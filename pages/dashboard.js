import { useState, useEffect } from 'react';
import { supabase } from '../supabase';

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [matches, setMatches] = useState([]);
  const [allBets, setAllBets] = useState([]);
  const [usersList, setUsersList] = useState([]);
  
  // Track inputs per match AND outcome (e.g., predictions["matchId_A"] = true)
  const [betAmounts, setBetAmounts] = useState({});
  const [currentTime, setCurrentTime] = useState(new Date());

  // Navigation & Settings states
  const [showSettings, setShowSettings] = useState(false);
  const [newPassword, setNewPassword] = useState('');

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
    // Refresh user profile info
    const { data: uProfile } = await supabase.from('users').select('*').eq('id', currentUserId).single();
    if (uProfile) setUser(uProfile);

    // Fetch active and completed tournament matches
    const { data: mData } = await supabase.from('matches').select('*').order('kickoff_time', { ascending: true });
    setMatches(mData || []);

    // Fetch only THIS user's bets to ensure strict client-side anonymity
    const { data: bData } = await supabase.from('bets').select('*').eq('user_id', currentUserId);
    setAllBets(bData || []);

    // Fetch leaderboard data (Sorted purely by purse settled by admin)
    const { data: scoreData } = await supabase
      .from('users')
      .select('id, username, purse')
      .eq('is_admin', false)
      .order('purse', { ascending: false });
    setUsersList(scoreData || []);
  };

  const handlePlaceBet = async (matchId, outcome, kickoffTime) => {
    const matchKickoff = new Date(kickoffTime);
    if (new Date() >= matchKickoff) {
      alert('🔒 Kickoff reached! The window for this prediction is locked.');
      return;
    }

    const inputKey = `${matchId}_${outcome}`;
    const amountInput = parseInt(betAmounts[inputKey]);

    if (isNaN(amountInput) || amountInput < 0) {
      return alert('Please enter a valid stake amount ($1 minimum or 0 to clear).');
    }

    // Locate if there's already a locked stake for this specific match outcome
    const existingBet = allBets.find(b => b.match_id === matchId && b.predicted_outcome === outcome);
    const currentBetAmount = existingBet ? existingBet.amount : 0;
    
    // Calculate available wallet space safely
    const refundedPurse = parseFloat(user.purse || 0) + currentBetAmount;

    if (amountInput > refundedPurse) {
      return alert('Insufficient purse balance for this stake!');
    }

    // Case A: User wants to drop/delete their bet by typing 0
    if (amountInput === 0) {
      if (!existingBet) return;
      
      const { error } = await supabase.from('bets').delete().eq('id', existingBet.id);
      if (!error) {
        await supabase.from('users').update({ purse: refundedPurse }).eq('id', user.id);
        alert('🎯 Stake removed and refunded!');
        fetchDashboardData(user.id);
      }
      return;
    }

    // Case B: Create or Update the specific outcome stake
    const newPurse = refundedPurse - amountInput;
    
    // Optimistic wallet update
    await supabase.from('users').update({ purse: newPurse }).eq('id', user.id);

    if (existingBet) {
      const { error } = await supabase
        .from('bets')
        .update({ amount: amountInput })
        .eq('id', existingBet.id);

      if (error) {
        // Rollback on network slip
        await supabase.from('users').update({ purse: parseFloat(user.purse || 0) }).eq('id', user.id);
        alert('Error shifting your stake.');
      } else {
        alert('🎯 Stake updated successfully!');
        fetchDashboardData(user.id);
      }
    } else {
      const { error } = await supabase
        .from('bets')
        .insert([{ user_id: user.id, match_id: matchId, predicted_outcome: outcome, amount: amountInput }]);

      if (error) {
        // Rollback
        await supabase.from('users').update({ purse: parseFloat(user.purse || 0) }).eq('id', user.id);
        alert('Error saving prediction.');
      } else {
        alert('🎯 Prediction locked in!');
        fetchDashboardData(user.id);
      }
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
    if (!confirm("⚠️ Proceeding will permanently purge your tournament profile. Continuous?")) return;
    if (!confirm("Are you entirely sure? This cannot be undone.")) return;

    try {
      await supabase.from('bets').delete().eq('user_id', user.id);
      await supabase.from('users').delete().eq('id', user.id);
      alert("Account removed.");
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

  if (!user) return <div style={{ color: '#fff', backgroundColor: '#022c22', minHeight: '100vh', padding: '20px' }}>Syncing Arena Portal...</div>;

  const activeMatches = matches.filter(m => !m.winner);
  const settledMatches = matches.filter(m => m.winner);

  return (
    <div style={{ backgroundColor: '#0f172a', minHeight: '100vh', fontFamily: 'system-ui, sans-serif', color: '#f8fafc', padding: '12px' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        
        {/* TOP CODESPORTS MARQUEE HEADER */}
        <div style={{ background: 'linear-gradient(135deg, #064e3b 0%, #022c22 100%)', border: '1px solid #10b981', borderRadius: '16px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '800', color: '#10b981', letterSpacing: '-0.025em' }}>⚽ FIFA 2026 PREDICTOR</h2>
              <div style={{ color: '#94a3b8', fontSize: '13px', marginTop: '2px' }}>Welcome back, <strong style={{ color: '#fff' }}>{user.username}</strong></div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ backgroundColor: '#0f172a', border: '1px solid #334155', color: '#34d399', padding: '8px 14px', borderRadius: '12px', fontSize: '15px', fontWeight: '800' }}>
                🪙 Wallet Balance: ${parseFloat(user.purse || 0).toFixed(2)}
              </div>
              <button onClick={() => setShowSettings(!showSettings)} style={{ backgroundColor: '#334155', border: 'none', color: '#fff', padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '13px' }}>
                {showSettings ? 'Close Panel' : '⚙️ Account'}
              </button>
              <button onClick={handleLogout} style={{ backgroundColor: 'transparent', border: '1px solid #ef4444', color: '#ef4444', padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '13px' }}>Logout</button>
            </div>
          </div>
          <div style={{ fontSize: '12px', color: '#a7f3d0', fontFamily: 'monospace', backgroundColor: 'rgba(0, 0, 0, 0.2)', padding: '6px', borderRadius: '6px', textAlign: 'center', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
            ⏰ Clock: {currentTime.toLocaleTimeString('en-IN')} (IST)
          </div>
        </div>

        {/* SECURITY SETTINGS EXPANSION */}
        {showSettings && (
          <div style={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '16px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '15px', color: '#f8fafc' }}>🔑 Update Arena Password</h3>
              <form onSubmit={handleChangePassword} style={{ display: 'flex', gap: '8px' }}>
                <input type="password" placeholder="Enter new password token" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} style={{ flex: 1, padding: '10px', backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px', color: '#fff', fontSize: '14px' }} />
                <button type="submit" style={{ backgroundColor: '#10b981', color: '#fff', border: 'none', borderRadius: '8px', padding: '0 16px', fontWeight: '600', cursor: 'pointer', fontSize: '14px' }}>Save</button>
              </form>
            </div>
            <hr style={{ border: 'none', borderTop: '1px solid #334155', margin: '0' }} />
            <div>
              <h3 style={{ margin: '0 0 4px 0', fontSize: '15px', color: '#f87171' }}>🚨 Danger Zone</h3>
              <button onClick={handleDeleteAccount} style={{ backgroundColor: '#b91c1c', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 16px', fontWeight: '700', cursor: 'pointer', fontSize: '13px' }}>
                Permanently Forfeit & Delete Profile
              </button>
            </div>
          </div>
        )}

        {/* MAIN DASHBOARD DISTRIBUTION */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px' }}>
          
          {/* LIVE MATCH PRODUCTION HUB */}
          <div style={{ width: '100%' }}>
            <h3 style={{ fontSize: '14px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#10b981', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '8px', height: '8px', backgroundColor: '#10b981', borderRadius: '50%', display: 'inline-block' }}></span>
              Live Fixture Selection Cards
            </h3>
            
            {activeMatches.length === 0 ? (
              <p style={{ color: '#64748b', fontSize: '13px', backgroundColor: '#1e293b', padding: '24px', borderRadius: '12px', border: '1px dashed #334155', textAlign: 'center' }}>No matches configured right now. Waiting on Arena Director...</p>
            ) : (
              activeMatches.map(m => {
                const matchKickoff = new Date(m.kickoff_time);
                const isClosed = currentTime >= matchKickoff;

                return (
                  <div key={m.id} style={{ backgroundColor: '#1e293b', border: isClosed ? '1px solid #334155' : '1px solid #064e3b', borderRadius: '16px', padding: '20px', marginBottom: '16px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                    
                    {/* CARD HEADER METADATA */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', paddingBottom: '10px', borderBottom: '1px solid #334155' }}>
                      <span style={{ fontSize: '11px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.05em' }}>MATCH NO. {m.match_no}</span>
                      <span style={{ fontSize: '10px', fontWeight: '900', padding: '4px 10px', borderRadius: '20px', color: '#fff', backgroundColor: isClosed ? '#ef4444' : '#10b981', letterSpacing: '0.02em' }}>
                        {isClosed ? '🔒 LOCKED' : '⏳ DEADLINE RUNNING'}
                      </span>
                    </div>

                    {/* MATCHUP TITLE PLATFORM */}
                    <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', margin: '16px 0', gap: '10px' }}>
                      <div style={{ fontSize: '20px', fontWeight: '900', textAlign: 'center', flex: 1 }}>{m.team_a}</div>
                      <div style={{ backgroundColor: '#0f172a', color: '#10b981', fontSize: '11px', fontWeight: '900', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #064e3b' }}>VS</div>
                      <div style={{ fontSize: '20px', fontWeight: '900', textAlign: 'center', flex: 1 }}>{m.team_b}</div>
                    </div>

                    <div style={{ fontSize: '12px', color: '#94a3b8', textAlign: 'center', marginBottom: '18px', backgroundColor: '#0f172a', padding: '8px', borderRadius: '8px', border: '1px solid #27272a' }}>
                      📅 Kickoff: {matchKickoff.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })} (IST)
                    </div>

                    {/* OUTCOME OPTIONS ARRAY */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {['A', 'DRAW', 'B'].map((outcome) => {
                        const labelName = outcome === 'A' ? m.team_a : outcome === 'B' ? m.team_b : '🤝 Match Draw';
                        const multiplier = outcome === 'A' ? m.margin_a : outcome === 'B' ? m.margin_b : m.margin_draw;
                        
                        // Extract locked state for this individual specific bet outcome row
                        const individualBet = allBets.find(b => b.match_id === m.id && b.predicted_outcome === outcome);
                        const currentStake = individualBet ? individualBet.amount : 0;

                        const inputKey = `${m.id}_${outcome}`;
                        const liveInputVal = betAmounts[inputKey] !== undefined ? betAmounts[inputKey] : (individualBet ? individualBet.amount : '');
                        
                        const parseInput = parseFloat(liveInputVal || 0);
                        const potentialReturn = parseInput * multiplier;

                        return (
                          <div key={outcome} style={{ backgroundColor: '#0f172a', border: '1px solid #232735', padding: '14px', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: '14px', fontWeight: '700' }}>{labelName}</span>
                              <span style={{ color: '#10b981', fontWeight: '800', fontSize: '14px' }}>Payout: {multiplier}x</span>
                            </div>

                            {currentStake > 0 && (
                              <div style={{ fontSize: '12px', color: '#34d399', backgroundColor: 'rgba(16,185,129,0.08)', padding: '6px 10px', borderRadius: '6px', border: '1px dashed rgba(16,185,129,0.3)' }}>
                                🛡️ Locked Stake: <strong>${currentStake}</strong> (Potential Return: ${(currentStake * multiplier).toFixed(2)})
                              </div>
                            )}

                            {!isClosed ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                  <input 
                                    type="number" 
                                    min="0" 
                                    placeholder="Stake ($) [0 to clear]" 
                                    value={liveInputVal} 
                                    onChange={(e) => setBetAmounts({ ...betAmounts, [inputKey]: e.target.value })} 
                                    style={{ flex: 1, padding: '10px', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#fff', fontSize: '14px', outline: 'none' }} 
                                  />
                                  <button 
                                    onClick={() => handlePlaceBet(m.id, outcome, m.kickoff_time)} 
                                    style={{ padding: '0 16px', backgroundColor: '#10b981', color: '#022c22', border: 'none', borderRadius: '8px', fontWeight: '800', cursor: 'pointer', fontSize: '13px' }}
                                  >
                                    Lock
                                  </button>
                                </div>
                                {parseInput > 0 && (
                                  <div style={{ fontSize: '11px', color: '#94a3b8', paddingLeft: '4px' }}>
                                    📈 Returns if hit: <strong style={{ color: '#34d399' }}>${potentialReturn.toFixed(2)}</strong> (Net Profit: ${(potentialReturn - parseInput).toFixed(2)})
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div style={{ fontSize: '12px', color: '#64748b', fontStyle: 'italic', padding: '4px 0' }}>
                                {currentStake > 0 ? `🔒 Fixed At Kickoff` : '❌ No Position Taken'}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                  </div>
                );
              })
            )}
          </div>

          {/* PERSISTENT LEADERBOARD PLATFORM */}
          <div style={{ width: '100%' }}>
            <h3 style={{ fontSize: '14px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#10b981', marginBottom: '12px' }}>📊 Standing Leaderboard</h3>
            <div style={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '16px', padding: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
              {usersList.map((u, index) => {
                const isMe = user.id === u.id;
                return (
                  <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 10px', borderBottom: index === usersList.length - 1 ? 'none' : '1px solid #334155', fontWeight: isMe ? '800' : '400', backgroundColor: isMe ? 'rgba(16,185,129,0.06)' : 'transparent', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px' }}>
                      <span style={{ color: index === 0 ? '#fbbf24' : index === 1 ? '#94a3b8' : index === 2 ? '#b45309' : '#64748b', fontWeight: '900' }}>#{index + 1}</span>
                      <span>{u.username} {isMe && <span style={{ fontSize: '11px', color: '#10b981', verticalAlign: 'middle' }}>(You)</span>}</span>
                    </div>
                    <span style={{ color: '#10b981', fontWeight: '800', fontSize: '14px' }}>${parseFloat(u.purse || 0).toFixed(2)}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* HISTORICAL RESOLUTIONS TRACK */}
          <div style={{ width: '100%', marginTop: '14px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', marginBottom: '12px' }}>📜 Tournament History</h3>
            {settledMatches.length === 0 ? (
              <p style={{ color: '#64748b', fontSize: '13px', fontStyle: 'italic' }}>No settled history records found on server.</p>
            ) : (
              settledMatches.map(m => {
                // Find all stakes this user placed on this old completed game
                const historicalUserBets = allBets.filter(b => b.match_id === m.id);

                return (
                  <div key={m.id} style={{ backgroundColor: '#1e293b', opacity: 0.9, border: '1px solid #334155', borderRadius: '12px', padding: '14px', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '700' }}>MATCH #{m.match_no}</span>
                      <span style={{ fontSize: '12px', fontWeight: '900', color: '#34d399' }}>Winner Node: {m.winner}</span>
                    </div>
                    <div style={{ fontSize: '15px', fontWeight: '800', marginBottom: '8px' }}>{m.team_a} vs {m.team_b}</div>
                    
                    {historicalUserBets.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', backgroundColor: '#0f172a', padding: '8px', borderRadius: '8px' }}>
                        {historicalUserBets.map(b => {
                          const didWin = b.predicted_outcome === m.winner;
                          let mult = b.predicted_outcome === 'A' ? m.margin_a : b.predicted_outcome === 'B' ? m.margin_b : m.margin_draw;
                          return (
                            <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                              <span style={{ color: '#94a3b8' }}>Staked on ({b.predicted_outcome}): ${b.amount}</span>
                              <span style={{ fontWeight: '800', color: didWin ? '#4ade80' : '#f87171' }}>
                                {didWin ? `+$${(b.amount * mult).toFixed(2)}` : `-$${b.amount}`}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div style={{ fontSize: '12px', color: '#64748b', fontStyle: 'italic' }}>No stakes placed on this fixture.</div>
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
