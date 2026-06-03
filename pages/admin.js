import { useState, useEffect } from 'react';
import { supabase } from '../supabase';

export default function AdminDashboard() {
  const [matches, setMatches] = useState([]);
  const [usersList, setUsersList] = useState([]);
  
  -- Form State: Add Match --
  const [matchNo, setMatchNo] = useState('');
  const [teamA, setTeamA] = useState('');
  const [teamB, setTeamB] = useState('');
  const [marginA, setMarginA] = useState('');
  const [marginB, setMarginB] = useState('');
  const [marginDraw, setMarginDraw] = useState('');
  const [kickoffTime, setKickoffTime] = useState('');

  -- Form State: Edit Purse --
  const [editingUserId, setEditingUserId] = useState(null);
  const [newPurseValue, setNewPurseValue] = useState('');

  useEffect(() => {
    // Basic verification gate check
    const savedUser = JSON.parse(localStorage.getItem('app_user'));
    if (savedUser && savedUser.is_admin) {
      fetchAdminData();
    } else {
      alert("Unauthorized Access Portal.");
      window.location.href = '/';
    }
  }, []);

  const fetchAdminData = async () => {
    const { data: mData } = await supabase.from('matches').select('*').order('match_no', { ascending: true });
    setMatches(mData || []);

    const { data: uData } = await supabase.from('users').select('*').eq('is_admin', false).order('username', { ascending: true });
    setUsersList(uData || []);
  };

  const handleCreateMatch = async (e) => {
    e.preventDefault();
    if (!matchNo || !teamA || !teamB || !marginA || !marginB || !marginDraw || !kickoffTime) {
      return alert('Please fill out all match setup fields.');
    }

    const { error } = await supabase.from('matches').insert([{
      match_no: parseInt(matchNo),
      team_a: teamA,
      team_b: teamB,
      margin_a: parseFloat(marginA),
      margin_b: parseFloat(marginB),
      margin_draw: parseFloat(marginDraw),
      kickoff_time: new Date(kickoffTime).toISOString(),
      winner: null
    }]);

    if (error) {
      alert('Error creating match parameters.');
    } else {
      alert('⚽ Match card generated successfully!');
      setMatchNo(''); setTeamA(''); setTeamB(''); setMarginA(''); setMarginB(''); setMarginDraw(''); setKickoffTime('');
      fetchAdminData();
    }
  };

  const handleSettleMatch = async (matchId, selectedWinner) => {
    if (!selectedWinner) return alert('Select a resolution state first.');
    if (!confirm(`Confirm result resolution state as: ${selectedWinner}? This computes wallet entries.`)) return;

    try {
      const { data: targetMatch } = await supabase.from('matches').select('*').eq('id', matchId).single();
      const { data: relatedBets } = await supabase.from('bets').select('*').eq('match_id', matchId);

      let multiplier = 1;
      if (selectedWinner === 'A') multiplier = targetMatch.margin_a;
      if (selectedWinner === 'B') multiplier = targetMatch.margin_b;
      if (selectedWinner === 'DRAW') multiplier = targetMatch.margin_draw;

      if (relatedBets && relatedBets.length > 0) {
        for (const bet of relatedBets) {
          if (bet.predicted_outcome === selectedWinner) {
            const payoutAmount = parseFloat(bet.amount) * multiplier;
            const { data: profile } = await supabase.from('users').select('purse').eq('id', bet.user_id).single();
            const upgradedPurse = parseFloat(profile.purse || 0) + payoutAmount;
            await supabase.from('users').update({ purse: upgradedPurse }).eq('id', bet.user_id);
          }
        }
      }

      await supabase.from('matches').update({ winner: selectedWinner }).eq('id', matchId);
      alert('🎯 Match settled and wallet points assigned!');
      fetchAdminData();
    } catch (err) {
      alert('Resolution computation engine error.');
    }
  };

  const handleUpdatePurseDirect = async (userId) => {
    const freshValue = parseFloat(newPurseValue);
    if (isNaN(freshValue)) return alert('Input valid point numbers.');

    const { error } = await supabase.from('users').update({ purse: freshValue }).eq('id', userId);
    if (!error) {
      alert('🪙 User balance manually re-assigned.');
      setEditingUserId(null);
      setNewPurseValue('');
      fetchAdminData();
    }
  };

  const handleDeleteUser = async (userId, userName) => {
    if (!confirm(`🚨 Are you completely sure you want to drop player "${userName}" from the league profile?`)) return;

    await supabase.from('bets').delete().eq('user_id', userId);
    const { error } = await supabase.from('users').delete().eq('id', userId);
    
    if (!error) {
      alert('User removed from roster configuration.');
      fetchAdminData();
    }
  };

  const handleNuclearReset = async () => {
    if (!confirm("☢️ WARNING: This button will completely clear ALL matches, ALL bets, and reset every player back to $100.00. Proceed?")) return;
    if (!confirm("Are you absolutely sure you want to clean out the database history fields?")) return;

    try {
      await supabase.from('bets').delete().not('id', 'is', null);
      await supabase.from('matches').delete().not('id', 'is', null);
      await supabase.from('users').update({ purse: 100.00 }).eq('is_admin', false);
      
      alert('🧹 Tournament environment restored completely back to 100$ baseline.');
      fetchAdminData();
    } catch (err) {
      alert('Global truncation rollback failure.');
    }
  };

  // ADDED: LOGOUT HANDLER FOR ADMIN SESSIONS
  const handleLogout = () => {
    localStorage.removeItem('app_user');
    window.location.href = '/';
  };

  const activeMatches = matches.filter(m => !m.winner);
  const settledMatches = matches.filter(m => m.winner);

  return (
    <div style={{ backgroundColor: '#022c22', minHeight: '100vh', fontFamily: 'system-ui, sans-serif', color: '#f8fafc', padding: '16px' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        
        {/* ADMIN CONTROL PANEL HEADER */}
        <div style={{ background: 'linear-gradient(135deg, #111827 0%, #1f2937 100%)', border: '2px solid #b91c1c', borderRadius: '16px', padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '900', color: '#ef4444' }}>🛠️ FIFA 2026 ARENA OPERATOR PANEL</h2>
            <p style={{ margin: '2px 0 0 0', fontSize: '13px', color: '#94a3b8' }}>Global Configuration Mode • All dates map into Indian Standard Time (IST)</p>
          </div>
          
          {/* UPDATED CONTROL WRAPPER WITH LOGOUT BUTTON */}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button onClick={handleNuclearReset} style={{ backgroundColor: '#b91c1c', border: 'none', color: '#fff', padding: '10px 18px', borderRadius: '8px', cursor: 'pointer', fontWeight: '800', fontSize: '13px', boxShadow: '0 4px 12px rgba(185,28,28,0.3)' }}>
              🧹 Reset Whole Tournament ($100 Baseline)
            </button>
            <button onClick={handleLogout} style={{ backgroundColor: 'transparent', border: '1px solid #94a3b8', color: '#f8fafc', padding: '10px 18px', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', fontSize: '13px', transition: 'all 0.2s' }}>
              Exit Portal 🚪
            </button>
          </div>
        </div>

        {/* DOUBLE COLUMN PANELS */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px' }}>
          
          {/* COLUMN 1: MATCH GENERATOR FIELD */}
          <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '16px', padding: '20px' }}>
            <h3 style={{ margin: '0 0 14px 0', fontSize: '16px', fontWeight: '800', color: '#10b981', borderBottom: '1px solid #1f2937', paddingBottom: '6px' }}>➕ Deploy New Match Card</h3>
            <form onSubmit={handleCreateMatch} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', gap: '10px' }}>
                <input type="number" placeholder="Match No." value={matchNo} onChange={(e) => setMatchNo(e.target.value)} style={{ width: '100px', padding: '10px', backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: '#fff' }} />
                <input type="text" placeholder="Team A (e.g. Argentina)" value={teamA} onChange={(e) => setTeamA(e.target.value)} style={{ flex: 1, padding: '10px', backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: '#fff' }} />
                <input type="text" placeholder="Team B (e.g. France)" value={teamB} onChange={(e) => setTeamB(e.target.value)} style={{ flex: 1, padding: '10px', backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: '#fff' }} />
              </div>
              
              <div style={{ display: 'flex', gap: '10px' }}>
                <input type="number" step="0.01" placeholder="Odds Team A (e.g. 2.5)" value={marginA} onChange={(e) => setMarginA(e.target.value)} style={{ flex: 1, padding: '10px', backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: '#fff' }} />
                <input type="number" step="0.01" placeholder="Odds Draw (e.g. 3.1)" value={marginDraw} onChange={(e) => setMarginDraw(e.target.value)} style={{ flex: 1, padding: '10px', backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: '#fff' }} />
                <input type="number" step="0.01" placeholder="Odds Team B (e.g. 2.6)" value={marginB} onChange={(e) => setMarginB(e.target.value)} style={{ flex: 1, padding: '10px', backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: '#fff' }} />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px', fontWeight: '700' }}>📆 KICKOFF TIME (INPUT IN LOCAL INDIAN TIME BASELINE):</label>
                <input type="datetime-local" value={kickoffTime} onChange={(e) => setKickoffTime(e.target.value)} style={{ width: '100%', padding: '10px', backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: '#fff', boxSizing: 'border-box' }} />
              </div>

              <button type="submit" style={{ padding: '12px', backgroundColor: '#10b981', border: 'none', color: '#022c22', borderRadius: '8px', fontWeight: '800', fontSize: '14px', cursor: 'pointer', marginTop: '6px' }}>
                Broadcast Live Match Card
              </button>
            </form>
          </div>

          {/* COLUMN 2: ACTIVE MATCHES & SETTLEMENT ENGINE */}
          <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '16px', padding: '20px' }}>
            <h3 style={{ margin: '0 0 14px 0', fontSize: '16px', fontWeight: '800', color: '#f59e0b', borderBottom: '1px solid #1f2937', paddingBottom: '6px' }}>⚡ Pending Settlement Queue</h3>
            {activeMatches.length === 0 ? (
              <p style={{ color: '#64748b', fontSize: '13px', fontStyle: 'italic' }}>No pending active matches waiting on verification.</p>
            ) : (
              activeMatches.map(m => (
                <div key={m.id} style={{ backgroundColor: '#1f2937', padding: '14px', borderRadius: '12px', marginBottom: '12px', border: '1px solid #374151' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>
                    <span>MATCH #{m.match_no}</span>
                    <span>Kickoff: {new Date(m.kickoff_time).toLocaleTimeString('en-IN')} (IST)</span>
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: '800', marginBottom: '12px', textAlign: 'center' }}>
                    {m.team_a} ({m.margin_a}x) <span style={{ color: '#10b981' }}>VS</span> {m.team_b} ({m.margin_b}x)
                  </div>
                  
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button onClick={() => handleSettleMatch(m.id, 'A')} style={{ flex: 1, backgroundColor: '#0284c7', color: '#fff', border: 'none', padding: '8px', borderRadius: '6px', fontWeight: '700', cursor: 'pointer', fontSize: '12px' }}>
                      🏆 {m.team_a} Won
                    </button>
                    <button onClick={() => handleSettleMatch(m.id, 'DRAW')} style={{ flex: 1, backgroundColor: '#4b5563', color: '#fff', border: 'none', padding: '8px', borderRadius: '6px', fontWeight: '700', cursor: 'pointer', fontSize: '12px' }}>
                      🤝 Ended in Draw
                    </button>
                    <button onClick={() => handleSettleMatch(m.id, 'B')} style={{ flex: 1, backgroundColor: '#0284c7', color: '#fff', border: 'none', padding: '8px', borderRadius: '6px', fontWeight: '700', cursor: 'pointer', fontSize: '12px' }}>
                      🏆 {m.team_b} Won
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* PLAYER ROSTER & PURSE MANIPULATION TRACK */}
          <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '16px', padding: '20px' }}>
            <h3 style={{ margin: '0 0 14px 0', fontSize: '16px', fontWeight: '800', color: '#94a3b8', borderBottom: '1px solid #1f2937', paddingBottom: '6px' }}>👥 Active Player Profiles & Wallets</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {usersList.map(u => (
                <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1f2937', padding: '10px 14px', borderRadius: '8px' }}>
                  <div>
                    <span style={{ fontWeight: '800', fontSize: '14px' }}>👤 {u.username}</span>
                    <span style={{ marginLeft: '12px', color: '#10b981', fontWeight: '700', fontSize: '14px' }}>${parseFloat(u.purse || 0).toFixed(2)}</span>
                  </div>
                  
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {editingUserId === u.id ? (
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <input type="number" step="0.01" placeholder="New $" value={newPurseValue} onChange={(e) => setNewPurseValue(e.target.value)} style={{ width: '80px', padding: '6px', backgroundColor: '#111827', border: '1px solid #4b5563', borderRadius: '6px', color: '#fff', fontSize: '12px' }} />
                        <button onClick={() => handleUpdatePurseDirect(u.id)} style={{ backgroundColor: '#10b981', color: '#022c22', padding: '6px 10px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '700' }}>Save</button>
                        <button onClick={() => setEditingUserId(null)} style={{ backgroundColor: '#374151', color: '#fff', padding: '6px 10px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>X</button>
                      </div>
                    ) : (
                      <>
                        <button onClick={() => { setEditingUserId(u.id); setNewPurseValue(u.purse); }} style={{ backgroundColor: '#4b5563', color: '#fff', padding: '4px 10px', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: '600' }}>
                          ✏️ Edit Balance
                        </button>
                        <button onClick={() => handleDeleteUser(u.id, u.username)} style={{ backgroundColor: 'transparent', border: '1px solid #ef4444', color: '#ef4444', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: '600' }}>
                          Kick
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* SETTLED ARCHIVE TRACK */}
          <div style={{ backgroundColor: '#111827', opacity: 0.75, border: '1px solid #1f2937', borderRadius: '16px', padding: '20px' }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '14px', fontWeight: '800', color: '#6b7280', textTransform: 'uppercase' }}>📜 Settled Historic Log</h3>
            {settledMatches.map(m => (
              <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '6px 0', borderBottom: '1px solid #1f2937' }}>
                <span>Match #{m.match_no}: {m.team_a} vs {m.team_b}</span>
                <span style={{ color: '#10b981', fontWeight: '800' }}>Resolved: {m.winner}</span>
              </div>
            ))}
          </div>

        </div>

      </div>
    </div>
  );
}
