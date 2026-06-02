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
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
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
    if (new Date() >= matchKickoff) return alert('🔒 Prediction window closed!');

    const prediction = predictions[matchId];
    const amountInput = parseInt(betAmounts[matchId]);

    if (!prediction) return alert('Select an outcome!');
    if (isNaN(amountInput) || amountInput < 1) return alert('Minimum bet is $1.');
    if (amountInput > user.purse) return alert('Insufficient purse balance!');

    const newPurse = parseFloat(user.purse) - amountInput;
    await supabase.from('users').update({ purse: newPurse }).eq('id', user.id);

    const { error } = await supabase.from('bets').insert([{ user_id: user.id, match_id: matchId, predicted_outcome: prediction, amount: amountInput }]);

    if (error) {
      await supabase.from('users').update({ purse: parseFloat(user.purse) }).eq('id', user.id);
      alert('Bet error.');
    } else {
      alert('🎯 Bet locked in!');
      fetchDashboardData(user.id);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('app_user');
    window.location.href = '/';
  };

  if (!user) return <div style={{ color: '#fff', backgroundColor: '#0f172a', minHeight: '100vh', padding: '20px' }}>Loading...</div>;

  return (
    <div style={{ backgroundColor: '#0f172a', minHeight: '100vh', fontFamily: 'system-ui, sans-serif', color: '#f8fafc', padding: '24px' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr', gap: '24px' }}>
        
        <div style={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '16px', padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '700' }}>👋 Welcome, {user.username}</h2>
            <div style={{ display: 'inline-block', backgroundColor: '#0284c7', color: '#fff', padding: '4px 12px', borderRadius: '20px', fontSize: '14px', fontWeight: '700', marginTop: '6px' }}>
              💰 Purse Account: ${parseFloat(user.purse).toFixed(2)}
            </div>
          </div>
          <button onClick={handleLogout} style={{ backgroundColor: 'transparent', border: '1px solid #475569', color: '#94a3b8', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}>Logout</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: '24px', alignItems: 'start' }}>
          
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#38bdf8', marginBottom: '16px' }}>⚡ Live Match Cards</h3>
            
            {matches.map(m => {
              const matchKickoff = new Date(m.kickoff_time);
              const isClosed = currentTime >= matchKickoff;
              const myBet = allBets.find(b => b.match_id === m.id && b.user_id === user.id);
              const matchBets = allBets.filter(b => b.match_id === m.id);

              return (
                <div key={m.id} style={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '16px', padding: '24px', marginBottom: '20px' }}>
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid #334155' }}>
                    <span style={{ fontSize: '12px', fontWeight: '700', color: '#94a3b8', letterSpacing: '0.05em' }}>MATCH NO. {m.match_no}</span>
                    <span style={{ fontSize: '11px', fontWeight: '800', padding: '4px 10px', borderRadius: '6px', color: '#fff', backgroundColor: m.winner ? '#15803d' : isClosed ? '#b91c1c' : '#0284c7' }}>
                      {m.winner ? '🏆 SETTLED' : isClosed ? '🔒 LOCKED' : '⏳ ACTIVE'}
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

                  {!myBet && !isClosed && (
                    <div style={{ backgroundColor: '#0f172a', padding: '16px', borderRadius: '12px', border: '1px solid #334155' }}>
                      <div style={{ display: 'flex', justifyContent: 'center', gap: '15px', marginBottom: '16px' }}>
                        
                        {/* ADJUSTED BUTTON LABELS TO SHOW ASSIGNED MULTIPLIER ODDS */}
                        <label style={{ flex: 1, textDisplay: 'center', backgroundColor: predictions[m.id] === 'A' ? '#0284c7' : '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '10px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', fontWeight: '600', fontSize: '14px' }}>
                          <input type="radio" name={`outcome-${m.id}`} onClick={() => setPredictions({ ...predictions, [m.id]: 'A' })} style={{ display: 'none' }} />
                          <span>🚩 {m.team_a}</span>
                          <span style={{fontSize:'12px', color:'#38bdf8', marginTop:'4px'}}>{m.margin_a}x</span>
                        </label>

                        <label style={{ flex: 1, textDisplay: 'center', backgroundColor: predictions[m.id] === 'DRAW' ? '#0284c7' : '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '10px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', fontWeight: '600', fontSize: '14px' }}>
                          <input type="radio" name={`outcome-${m.id}`} onClick={() => setPredictions({ ...predictions, [m.id]: 'DRAW' })} style={{ display: 'none' }} />
                          <span>🤝 Draw</span>
                          <span style={{fontSize:'12px', color:'#38bdf8', marginTop:'4px'}}>{m.margin_draw}x</span>
                        </label>

                        <label style={{ flex: 1, textDisplay: 'center', backgroundColor: predictions[m.id] === 'B' ? '#0284c7' : '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '10px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', fontWeight: '600', fontSize: '14px' }}>
                          <input type="radio" name={`outcome-${m.id}`} onClick={() => setPredictions({ ...predictions, [m.id]: 'B' })} style={{ display: 'none' }} />
                          <span>🏁 {m.team_b}</span>
                          <span style={{fontSize:'12px', color:'#38bdf8', marginTop:'4px'}}>{m.margin_b}x</span>
                        </label>

                      </div>
                      <div style={{ display: 'flex', gap: '12px' }}>
                        <input type="number" min="1" placeholder="Enter Stake ($)" onChange={(e) => setBetAmounts({ ...betAmounts, [m.id]: e.target.value })} style={{ flex: '2', padding: '12px', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#fff', outline: 'none' }} />
                        <button onClick={() => handlePlaceBet(m.id, m.kickoff_time)} style={{ flex: '1', backgroundColor: '#38bdf8', color: '#0f172a', border: 'none', borderRadius: '8px', fontWeight: '700', cursor: 'pointer' }}>Lock Bet</button>
                      </div>
                    </div>
                  )}

                  {myBet && (
                    <div style={{ backgroundColor: 'rgba(2,132,199,0.15)', border: '1px solid rgba(2,132,199,0.3)', padding: '14px', borderRadius: '12px', textAlign: 'center', color: '#38bdf8', fontWeight: '600', fontSize: '14px' }}>
                      🎯 Lock-in saved: <strong>${myBet.amount}</strong> on {myBet.predicted_outcome === 'DRAW' ? 'Draw' : myBet.predicted_outcome === 'A' ? m.team_a : m.team_b}
                    </div>
                  )}

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
            })}
          </div>

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
