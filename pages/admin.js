import { useState, useEffect } from 'react';
import { supabase } from '../supabase';

export default function Admin() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [matches, setMatches] = useState([]);
  const [users, setUsers] = useState([]);
  
  const [matchNo, setMatchNo] = useState('');
  const [teamA, setTeamA] = useState('');
  const [teamB, setTeamB] = useState('');
  const [kickoff, setKickoff] = useState('');
  const [marginA, setMarginA] = useState('');
  const [marginB, setMarginB] = useState('');
  const [marginDraw, setMarginDraw] = useState('');

  const [selectedUser, setSelectedUser] = useState('');
  const [newPurseAmount, setNewPurseAmount] = useState('');

  useEffect(() => {
    const savedUser = JSON.parse(localStorage.getItem('app_user'));
    if (savedUser && savedUser.is_admin) {
      setIsAdmin(true);
      fetchAdminData();
    } else {
      window.location.href = '/';
    }
  }, []);

  const fetchAdminData = async () => {
    const { data: mData } = await supabase.from('matches').select('*').order('match_no', { ascending: true });
    setMatches(mData || []);
    const { data: uData } = await supabase.from('users').select('*').order('username', { ascending: true });
    setUsers(uData || []);
  };

  const handleCreateMatch = async (e) => {
    e.preventDefault();
    if (!matchNo || !teamA || !teamB || !kickoff || !marginA || !marginB || !marginDraw) return alert('Fill all fields');

    const { error } = await supabase.from('matches').insert([{
      match_no: parseInt(matchNo),
      team_a: teamA,
      team_b: teamB,
      kickoff_time: new Date(kickoff).toISOString(),
      margin_a: parseFloat(marginA),
      margin_b: parseFloat(marginB),
      margin_draw: parseFloat(marginDraw)
    }]);

    if (error) alert('Error creating match');
    else {
      alert('Match created successfully!');
      setMatchNo(''); setTeamA(''); setTeamB(''); setKickoff(''); setMarginA(''); setMarginB(''); setMarginDraw('');
      fetchAdminData();
    }
  };

  const handleSettleMatch = async (matchId, officialWinner) => {
    if (!confirm(`Confirm outcome as: ${officialWinner}?`)) return;

    const { data: match } = await supabase.from('matches').select('*').eq('id', matchId).single();
    const { data: bets } = await supabase.from('bets').select('*').eq('match_id', matchId);

    let activeMultiplier = 1;
    if (officialWinner === 'A') activeMultiplier = parseFloat(match.margin_a);
    if (officialWinner === 'B') activeMultiplier = parseFloat(match.margin_b);
    if (officialWinner === 'DRAW') activeMultiplier = parseFloat(match.margin_draw);

    if (bets && bets.length > 0) {
      for (let bet of bets) {
        if (bet.predicted_outcome === officialWinner) {
          const payout = parseFloat(bet.amount) * activeMultiplier;
          const { data: userProfile } = await supabase.from('users').select('purse').eq('id', bet.user_id).single();
          const runningPurse = parseFloat(userProfile.purse);

          await supabase.from('users').update({ purse: runningPurse + payout }).eq('id', bet.user_id);
        }
      }
    }

    await supabase.from('matches').update({ winner: officialWinner }).eq('id', matchId);
    alert('Match settled and payouts calculated anonymously!');
    fetchAdminData();
  };

  const handleManualPurseEdit = async (e) => {
    e.preventDefault();
    if (!selectedUser || !newPurseAmount) return alert('Select user and entry amount');
    const { error } = await supabase.from('users').update({ purse: parseFloat(newPurseAmount) }).eq('id', selectedUser);
    if (error) alert('Failed to update balance');
    else {
      alert('User wallet updated.');
      setSelectedUser(''); setNewPurseAmount('');
      fetchAdminData();
    }
  };

  // 🗑️ NEW TOURNAMENT PREPARATION ACTION: PERMANENTLY WIPE EVERYTHING
  const handlePurgeAllMatches = async () => {
    const check1 = confirm("🚨 HOLD ON! This will permanently DELETE all current match cards and any placed test bets from the database. This leaves your app entirely empty for the real FIFA 2026 World Cup games. Proceed?");
    if (!check1) return;

    const check2 = confirm("Confirming again: Delete every single fixture item forever?");
    if (!check2) return;

    try {
      // Clear associated bets table first to preserve constraints
      await supabase.from('bets').delete().neq('id', 0);
      // Nuke match templates entirely
      const { error } = await supabase.from('matches').delete().neq('id', 0);
      
      if (error) throw error;
      alert("💥 Success! Your system is now an absolute blank slate. Ready for official tournament entry.");
      fetchAdminData();
    } catch (err) {
      console.error(err);
      alert("Error purging records.");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('app_user');
    window.location.href = '/';
  };

  if (!isAdmin) return <p>Checking credentials...</p>;

  return (
    <div style={{ fontFamily: 'sans-serif', maxWidth: '900px', margin: '30px auto', padding: '20px', color: '#333' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #333', paddingBottom: '10px' }}>
        <h2>👑 Administrator Console (Blind Admin Mode)</h2>
        <button onClick={handleLogout} style={{ background: '#ff4d4d', color: '#fff', border: 'none', borderRadius: '4px', padding: '5px 15px', cursor: 'pointer' }}>Logout</button>
      </div>

      {/* RE-ENGINEERED PRODUCTION PREPARATION UTILITY */}
      <section style={{ background: '#fef2f2', padding: '16px', borderRadius: '8px', marginTop: '20px', border: '1px solid #fee2e2', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h4 style={{ margin: '0 0 4px 0', color: '#991b1b' }}>🏆 Official FIFA World Cup 2026 Preparation Tool</h4>
          <p style={{ margin: 0, fontSize: '13px', color: '#7f1d1d' }}>Use this to clear out test games completely before entering the official tournament match cards.</p>
        </div>
        <button onClick={handlePurgeAllMatches} style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: '6px', padding: '10px 16px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>
          Delete All Match Cards Completely
        </button>
      </section>

      <section style={{ background: '#f9f9f9', padding: '20px', borderRadius: '8px', marginTop: '20px', border: '1px solid #ddd' }}>
        <h3>1. Create Live Match Card</h3>
        <form onSubmit={handleCreateMatch} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
          <input type="number" placeholder="Match Number" value={matchNo} onChange={e=>setMatchNo(e.target.value)} style={{padding:'8px'}} />
          <input type="datetime-local" placeholder="Kickoff Time (IST)" value={kickoff} onChange={e=>setKickoff(e.target.value)} style={{padding:'8px'}} />
          <input type="text" placeholder="Team A" value={teamA} onChange={e=>setTeamA(e.target.value)} style={{padding:'8px'}} />
          <input type="text" placeholder="Team B" value={teamB} onChange={e=>setTeamB(e.target.value)} style={{padding:'8px'}} />
          <input type="number" step="0.01" placeholder="Team A Margin Multiplier" value={marginA} onChange={e=>setMarginA(e.target.value)} style={{padding:'8px'}} />
          <input type="number"
