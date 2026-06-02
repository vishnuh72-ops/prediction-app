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

    const { data: scoreData } = await supabase.from('users').select('id', 'username', 'purse').eq('is_admin', false).order('purse', { ascending: false });
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

    // Look up if an existing bet already exists for this match
    const existingBet = allBets.find(b => b.match_id === matchId && b.user_id === user.id);
    
    // Calculate what the wallet balance WOULD be after replacing/adding the bet
    const currentBetAmount = existingBet ? existingBet.amount : 0;
    const refundedPurse = parseFloat(user.purse) + currentBetAmount;

    if (amountInput > refundedPurse) return alert('Insufficient purse balance!');

    // Deduct the new stake from the refunded total
    const newPurse = refundedPurse - amountInput;
    
    // Update the user's wallet in the database
    await supabase.from('users').update({ purse: newPurse }).eq('id', user.id);

    if (existingBet) {
      // SMART EDIT: If bet exists, overwrite it instead of creating a duplicate row
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
      // Fresh new submission
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

  const handleLogout = () => {
    localStorage.removeItem('app_user');
    window.location.href = '/';
  };

  if (!user) return <div style={{ color: '#fff', backgroundColor: '#0f172a', minHeight: '100vh', padding: '20px' }}>Loading...</div>;

  const activeMatches = matches.filter(m => !m.winner);
  const settledMatches = matches.filter(m => m.winner);

  return (
    <div style={{ backgroundColor: '#0f172a', minHeight: '100vh', fontFamily: 'system-ui, sans-serif', color: '#f8fafc', padding: '24px' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr', gap: '24px' }}>
        
        {/* NAV HUB */}
        <div style={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '16px', padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '700' }}>👋 Welcome, {user.username}</h2>
            <div style={{ display: 'inline-block', backgroundColor: '#0284c7', color: '#fff', padding: '4px 12px', borderRadius: '20px', fontSize: '14px', fontWeight: '700', marginTop: '6px' }}>
              💰 Purse Account: ${parseFloat(user.purse).toFixed(2)}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <span style={{ fontSize: '13px', color: '#64748b', fontFamily: 'monospace', backgroundColor: '#0f172a', padding: '6px 12px', borderRadius: '6px', border: '1px solid #334155' }}>
              ⏰ {currentTime.toLocaleTimeString('en-IN')}
            </span>
            <button onClick={handleLogout} style={{ backgroundColor: 'transparent', border: '1px solid #475569', color: '#94a3b8', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}>Logout</button>
          </div>
        </div>

        {/* MAIN BODY LAYOUT */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: '24px', alignItems: 'start' }}>
          
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#38bdf8', marginBottom: '16px' }}>⚡ Live Match Cards</h3>
            
            {activeMatches.length === 0 ? (
              <p style={{ color: '#64748b', fontSize: '14px', backgroundColor: '#1e293b', padding: '20px', borderRadius: '12px', border: '1px dashed #334155' }}>No active fixtures right now.</p>
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
                  <div key={m.id} style={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '16px', padding: '24px', marginBottom: '20px' }}>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid #334155' }}>
                      <span style={{ fontSize: '12px', fontWeight: '700', color: '#94a3b8', letterSpacing: '0.05em' }}>MATCH NO. {m.match_no}</span>
                      <span style={{ fontSize: '11px', fontWeight: '800', padding: '4px 10px', borderRadius: '6px', color: '#fff', backgroundColor: isClosed ? '#b91c1c' : '#0284c7' }}>
                        {isClosed ? '🔒 LOCKED' : '⏳ BIDS OPEN'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', margin: '20px 0' }}>
                      <div style={{ textAlign: 'center', flex: 1 }}><span style={{ fontSize: '20px', fontWeight: '800' }}>{m.team_a}</span></div>
                      <div style={{ backgroundColor: '#0f172a', color: '#64748b', fontSize: '12px', fontWeight: '700', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #334155' }}>VS</div>
                      <div style={{ textAlign: 'center', flex: 1 }}><span style={{ fontSize: '20px', fontWeight: '800' }}>{m.team_b}</span></div>
                    </div>

                    <div style={{ fontSize: '13px', color: '#94a3b8', textAlign: 'center', marginBottom: '20px', backgroundColor: '#0f172a', padding: '8px', borderRadius: '8px' }}>
                      📅 Kickoff: {matchKickoff.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} (IST)
                    </div>

                    {/* ALWAYS SHOW INPUT CONTROLS IF KICKOFF HAS NOT PASSED */}
                    {!isClosed ? (
                      <div style={{ backgroundColor: '#0f172a', padding: '16px', borderRadius: '12px', border: '1px solid #334155' }}>
                        
                        {myBet && (
                          <div style={{ backgroundColor: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8', fontSize: '13px', padding: '8px 12px', borderRadius: '6px', marginBottom: '12px', fontWeight: '600', border: '1px dashed rgba(56, 189, 248, 0.3)' }}>
                            📝 Current Bid: ${myBet.amount} on {myBet.predicted_outcome === 'DRAW' ? 'Draw' : myBet.predicted_outcome === 'A' ? m.team_a : m.team_b}. Feel free to change options below to modify it!
                          </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'center', gap: '15px', marginBottom: '16px' }}>
                          <label style={{ flex: 1, textAlign: 'center', backgroundColor: selectedOutcome === 'A' ? '#0284c7' : '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '10px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', fontWeight: '600', fontSize: '14px' }}>
                            <input type="radio" name={`outcome-${m.id}`} checked={selectedOutcome === 'A'} onChange={() => setPredictions({ ...predictions, [m.id]: 'A' })} style={{ display: 'none' }} />
                            <span>🚩 {m.team_a}</span>
                            <span style={{fontSize:'12px', color:'#38bdf8', marginTop:'4px'}}>{m.margin_a}x</span>
                          </label>

                          <label style={{ flex: 1, textAlign: 'center', backgroundColor: selectedOutcome === 'DRAW' ? '#0284c7' : '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '10px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', fontWeight: '600', fontSize: '14px' }}>
                            <input type="radio" name={`outcome-${m.id}`} checked={selectedOutcome === 'DRAW'} onChange={() => setPredictions({ ...predictions, [m.id]: 'DRAW' })} style={{ display: 'none' }} />
                            <span>🤝 Draw</span>
                            <span style={{fontSize:'12px', color:'#38bdf8', marginTop:'4px'}}>{m.margin_draw}x</span>
                          </label>

                          <label style={{ flex: 1, textAlign: 'center', backgroundColor: selectedOutcome === 'B' ? '#0284c7' : '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '10px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', fontWeight: '600', fontSize: '14px' }}>
                            <input type="radio" name={`outcome-${m.id}`} checked={selectedOutcome === 'B'} onChange={() => setPredictions({ ...predictions, [m.id]: 'B' })} style={{ display: 'none' }} />
                            <span>🏁 {m.team_b}</span>
                            <span style={{fontSize:'12px', color:'#38bdf8', marginTop:'4px'}}>{m.margin_b}x</span>
                          </label>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          <input type="number" min="1" placeholder="Enter Bid Amount ($)" value={betAmounts[m.id] !== undefined ? betAmounts[m.id] : (myBet ? myBet.amount : '')} onChange={(e) => setBetAmounts({ ...betAmounts, [m.id]: e.target.value })} style={{ padding: '12px', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#fff', outline: 'none', fontSize: '15px' }} />
                          
                          {selectedOutcome && enteredStake > 0 && (
                            <div style={{ backgroundColor: 'rgba(56, 189, 248, 0.08)', border: '1px solid rgba(56, 189, 248, 0.2)', padding: '14px', borderRadius: '8px', fontSize: '13px', color: '#e2e8f0', lineHeight: '1.6' }}>
                              📈 <em>If correct:</em> You will get <strong>${potentialReturn.toFixed(2)}</strong> coins including a net profit of <strong style={{ color: '#4ade80' }}>${potentialProfit.toFixed(2)}</strong>.<br/>
                              📉 <em>If wrong:</em> Lose <strong>${enteredStake.toFixed(2)}</strong> coins only.
                            </div>
                          )}

                          <button onClick={() => handlePlaceBet(m.id, m.kickoff_time)} style={{ padding: '14px', backgroundColor: '#38bdf8', color: '#0f172a', border: 'none', borderRadius: '8px', fontWeight: '700', cursor: 'pointer', fontSize: '15px' }}>
                            {myBet ? '🔄 Update Current Bid' : 'Place Bid'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* SHOW STATIC LOCKED LABELS ONCE KICKOFF HAS PASSED */
                      <div>
                        {myBet ? (
                          <div style={{ backgroundColor: 'rgba(2,132,199,0.15)', border: '1px solid rgba(2,132,199,0.3)', padding: '14px', borderRadius: '12px', textAlign: 'center', color: '#38bdf8', fontWeight: '600', fontSize: '14px' }}>
                            🎯 Locked Bid: <strong>${myBet.amount}</strong> on {myBet.predicted_outcome === 'DRAW' ? 'Draw' : myBet.predicted_outcome === 'A' ? m.team_a : m.team_b} 🔒
                          </div>
                        ) : (
                          <div style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', padding: '14px', borderRadius: '12px', textAlign: 'center', color: '#f87171', fontWeight: '600', fontSize: '14px' }}>
                            🛑 Prediction window has closed.
                          </div>
                        )}
                      </div>
                    )}

                    {/* LIVE REVEAL LOGIC AT KICKOFF */}
                    {isClosed && (
                      <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px dashed #334155' }}>
                        <div style={{ fontSize: '13px', fontWeight: '700', color: '#94a3b8', marginBottom: '8px' }}>👁️ Group Submissions:</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '8px' }}>
                          {matchBets.map(b => {
                            const lookup = usersList.find(ul => ul.id === b.user_id)?.username || 'Player';
                            return (
                              <div key={b.id} style={{ backgroundColor: '#0f172a', border: '1px solid #334155', padding: '8px', borderRadius: '8px', fontSize: '12px' }}>
                                👤 <strong style={{color:'#fff'}}>{lookup}</strong>: ${b.amount} ({b.predicted_outcome})
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

            {/* MATCH HISTORY */}
            <h3 style={{ fontSize: '18px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94a3b8', marginTop: '40px', marginBottom: '16px' }}>📜 Match History & Past Returns</h3>
            {settledMatches.length === 0 ? (
              <p style={{ color: '#64748b', fontSize: '14px' }}>No matches have been settled yet.</p>
            ) : (
              settledMatches.map(m => {
                const userBet = allBets.find(b => b.match_id === m.id && b.user_id === user.id);
                const didWin = userBet && userBet.predicted_outcome === m.winner;
                
                let payoutMultiplier = 1;
                if (m.winner === 'A') payoutMultiplier = m.margin_a;
                if (m.winner === 'B') payoutMultiplier = m.margin_b;
                if (m.winner === 'DRAW') payoutMultiplier = m.margin_draw;

                return (
                  <div key={m.id} style={{ backgroundColor: '#1e293b', opacity: 0.85, border: '1px solid #334155', borderRadius: '12px', padding: '16px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '700' }}>MATCH #{m.match_no}</span>
                      <div style={{ fontSize: '15px', fontWeight: '700', marginTop: '2px' }}>{m.team_a} vs {m.team_b}</div>
                      <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
                        Official Result: <strong style={{color: '#38bdf8'}}>{m.winner === 'DRAW' ? 'Draw 🤝' : m.winner === 'A' ? m.team_a : m.team_b}</strong>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      {userBet ? (
                        <div>
                          <div style={{ fontSize: '13px', color: '#94a3b8' }}>Your Bid: ${userBet.amount} ({userBet.predicted_outcome})</div>
                          <div style={{ fontSize: '14px', fontWeight: '800', marginTop: '4px', color: didWin ? '#4ade80' : '#f87171' }}>
                            {didWin ? `✅ Won +$${(userBet.amount * payoutMultiplier).toFixed(2)}` : `❌ Lost -$${userBet.amount}`}
                          </div>
                        </div>
                      ) : (
                        <div style={{ fontSize: '12px', color: '#64748b', fontStyle: 'italic' }}>No Bid Placed</div>
                      )}
                    </div>
                  </div>
                );
              })
            )}

          </div>

          {/* STANDINGS */}
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#38bdf8', marginBottom: '16px' }}>📊 Group Standings</h3>
            <div style={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '16px', padding: '20px' }}>
              {usersList.map((u, index) => (
                <div key={index} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 8px', borderBottom: index === usersList.length - 1 ? 'none' : '1px solid #334155', fontWeight: user.username === u.username ? '700' : '400', backgroundColor: user.username === u.username ? 'rgba(56,189,248,0.05)' : 'transparent', borderRadius: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ color: index === 0 ? '#fbbf24' : index === 1 ? '#94a3b8' : index === 2 ? '#b45309' : '#64748b', fontWeight: '800' }}>#{index + 1}</span>
                    <span>{u.username}</span>
                  </div>
                  <span style={{ color: '#38bdf8', fontWeight: '700' }}>${parseFloat(u.purse).toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
