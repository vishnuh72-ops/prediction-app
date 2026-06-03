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

  // P2P Token Transfer States
  const [transferTargetId, setTransferTargetId] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [isTransferring, setIsTransferring] = useState(false);

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

    const { data: mData } = await supabase.from('matches').select('*').order('kickoff_time', { ascending: true });
    setMatches(mData || []);

    const { data: bData } = await supabase.from('bets').select('*').eq('user_id', currentUserId);
    setAllBets(bData || []);

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
    alert('🔒 Too late! The match has started.');
    return;
  }

  // Use the unique key we created in your JSX
  const inputKey = `${matchId}_${outcome}`;
  const amountInput = parseFloat(betAmounts[inputKey]);

  // Validation
  if (isNaN(amountInput) || amountInput < 1) {
    return alert('Please enter a valid bid amount of at least $1.');
  }

  // Check purse balance
  if (amountInput > parseFloat(user.purse || 0)) {
    return alert('Insufficient purse balance!');
  }

  try {
    // 1. Deduct the amount
    const newPurse = parseFloat(user.purse || 0) - amountInput;
    const { error: purseErr } = await supabase
      .from('users')
      .update({ purse: newPurse })
      .eq('id', user.id);

    if (purseErr) throw new Error('Failed to update purse');

    // 2. Insert the bet
    const { error: insertErr } = await supabase
      .from('bets')
      .insert([{ 
        user_id: user.id, 
        match_id: matchId, 
        predicted_outcome: outcome, // Directly use the outcome string ('A', 'B', or 'DRAW')
        amount: amountInput 
      }]);
    
    if (insertErr) throw new Error('Failed to place bet: ' + insertErr.message);

    alert('🎯 Bet placed successfully!');
    
    // Clear the specific input field
    setBetAmounts({ ...betAmounts, [inputKey]: '' });
    
    // Refresh data
    fetchDashboardData(user.id);
  } catch (err) {
    alert('Error: ' + err.message);
  }
};

  // NEW P2P TOKEN TRANSFER HANDLER
  const handleTokenTransfer = async (e) => {
    e.preventDefault();
    const amountToTransfer = parseFloat(transferAmount);

    if (!transferTargetId) return alert('Please select a recipient player.');
    if (isNaN(amountToTransfer) || amountToTransfer <= 0) return alert('Please enter a valid amount greater than $0.');

    setIsTransferring(true);

    try {
      // Fetch fresh, up-to-date wallet data for the sender to prevent multi-tab exploits
      const { data: freshSender, error: senderErr } = await supabase.from('users').select('purse').eq('id', user.id).single();
      if (senderErr || !freshSender) throw new Error('Could not verify wallet state.');

      const currentBalance = parseFloat(freshSender.purse || 0);
      const balanceAfterTransfer = currentBalance - amountToTransfer;

      // Enforce Rule: Sender balance cannot drop to $25 or below
      if (balanceAfterTransfer <= 25) {
        alert(`❌ Transaction Denied! Your balance after sending must be strictly more than $25.00.\nMaximum you can currently send is $${(currentBalance - 25.01).toFixed(2)}.`);
        setIsTransferring(false);
        return;
      }

      // Fetch recipient's current wallet balance
      const { data: freshReceiver, error: receiverErr } = await supabase.from('users').select('purse').eq('id', transferTargetId).single();
      if (receiverErr || !freshReceiver) throw new Error('Recipient profile look-up failed.');

      const receiverBalance = parseFloat(freshReceiver.purse || 0);

      // Perform updates sequentially
      await supabase.from('users').update({ purse: balanceAfterTransfer }).eq('id', user.id);
      await supabase.from('users').update({ purse: receiverBalance + amountToTransfer }).eq('id', transferTargetId);

      // Log receipt transaction into tracking table for account deletion rollbacks
      await supabase.from('transfers').insert([{
        sender_id: user.id,
        receiver_id: transferTargetId,
        amount: amountToTransfer
      }]);

      alert(`💸 Successfully transferred $${amountToTransfer.toFixed(2)}!`);
      setTransferAmount('');
      setTransferTargetId('');
      fetchDashboardData(user.id);
    } catch (err) {
      alert(err.message || 'Transfer processing anomaly occurred.');
    } finally {
      setIsTransferring(false);
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

  // UPDATED ANTI-CHEAT ACCOUNT DELETION (Claws back all sent funds)
  const handleDeleteAccount = async () => {
    if (!confirm("⚠️ Proceeding will permanently purge your tournament profile. Continuous?")) return;
    if (!confirm("🚨 SECURITY CHECK: Deleting your account will AUTOMATICALLY claw back and deduct any money you ever transferred to other users to prevent burner-account exploits. Proceed?")) return;

    try {
      // 1. Trace every single token transfer sent by this user
      const { data: historicalSentTransfers } = await supabase.from('transfers').select('*').eq('sender_id', user.id);

      if (historicalSentTransfers && historicalSentTransfers.length > 0) {
        for (const trx of historicalSentTransfers) {
          // Fetch the recipient's live wallet state
          const { data: recipientProfile } = await supabase.from('users').select('purse').eq('id', trx.receiver_id).single();
          
          if (recipientProfile) {
            // Deduct the gifted amount back out of their pool
            const correctedPurse = parseFloat(recipientProfile.purse || 0) - parseFloat(trx.amount);
            await supabase.from('users').update({ purse: correctedPurse }).eq('id', trx.receiver_id);
          }
        }
      }

      // 2. Once funds are successfully stripped, wipe out records and profile
      await supabase.from('bets').delete().eq('user_id', user.id);
      await supabase.from('users').delete().eq('id', user.id);

      alert("Roster slot surrendered. All gifted funds successfully reclaimed.");
      localStorage.removeItem('app_user');
      window.location.href = '/';
    } catch (err) {
      alert("Error executing cascading account purge.");
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
        
        {/* TOP MARQUEE HEADER */}
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

        {/* NEW: ANTI-CHEAT P2P TOKEN VAULT EXCHANGE */}
        <div style={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '16px', padding: '16px' }}>
          <h3 style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: '800', color: '#34d399', textTransform: 'uppercase', letterSpacing: '0.02em' }}>💸 Peer-to-Peer Token Transfer Vault</h3>
          <p style={{ margin: '0 0 12px 0', fontSize: '12px', color: '#94a3b8' }}>
            Loan balance to another user instantly. <strong>Rule:</strong> Your balance after transferring must remain strictly above <strong>$25.00</strong>. Leaving the tournament claws back all funds sent.
          </p>
          <form onSubmit={handleTokenTransfer} style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <select 
              value={transferTargetId} 
              onChange={(e) => setTransferTargetId(e.target.value)}
              style={{ flex: 1, minWidth: '180px', padding: '10px', backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px', color: '#fff', fontSize: '13px' }}
            >
              <option value="">-- Select Recipient Player --</option>
              {usersList.filter(u => u.id !== user.id).map(u => (
                <option key={u.id} value={u.id}>{u.username}</option>
              ))}
            </select>
            <input 
              type="number" 
              step="0.01" 
              placeholder="Amount to send ($)" 
              value={transferAmount} 
              onChange={(e) => setTransferAmount(e.target.value)}
              style={{ width: '150px', padding: '10px', backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px', color: '#fff', fontSize: '13px' }}
            />
            <button 
              type="submit" 
              disabled={isTransferring}
              style={{ backgroundColor: '#10b981', color: '#022c22', border: 'none', padding: '10px 18px', borderRadius: '8px', cursor: 'pointer', fontWeight: '800', fontSize: '13px' }}
            >
              {isTransferring ? 'Processing...' : 'Authorize Transfer'}
            </button>
          </form>
        </div>

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
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', paddingBottom: '10px', borderBottom: '1px solid #334155' }}>
                      <span style={{ fontSize: '11px', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.05em' }}>MATCH NO. {m.match_no}</span>
                      <span style={{ fontSize: '10px', fontWeight: '900', padding: '4px 10px', borderRadius: '20px', color: '#fff', backgroundColor: isClosed ? '#ef4444' : '#10b981', letterSpacing: '0.02em' }}>
                        {isClosed ? '🔒 LOCKED' : '⏳ DEADLINE RUNNING'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', margin: '16px 0', gap: '10px' }}>
                      <div style={{ fontSize: '20px', fontWeight: '900', textAlign: 'center', flex: 1 }}>{m.team_a}</div>
                      <div style={{ backgroundColor: '#0f172a', color: '#10b981', fontSize: '11px', fontWeight: '900', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #064e3b' }}>VS</div>
                      <div style={{ fontSize: '20px', fontWeight: '900', textAlign: 'center', flex: 1 }}>{m.team_b}</div>
                    </div>

                    <div style={{ fontSize: '12px', color: '#94a3b8', textAlign: 'center', marginBottom: '18px', backgroundColor: '#0f172a', padding: '8px', borderRadius: '8px', border: '1px solid #27272a' }}>
                      📅 Kickoff: {matchKickoff.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })} (IST)
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {['A', 'DRAW', 'B'].map((outcome) => {
                        const labelName = outcome === 'A' ? m.team_a : outcome === 'B' ? m.team_b : '🤝 Match Draw';
                        const multiplier = outcome === 'A' ? m.margin_a : outcome === 'B' ? m.margin_b : m.margin_draw;
                        
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

          {/* STANDING LEADERBOARD */}
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
