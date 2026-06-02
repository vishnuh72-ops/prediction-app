import { useState, useEffect } from 'react';
import { supabase } from '../supabase';

export default function Admin() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [matches, setMatches] = useState([]);
  const [users, setUsers] = useState([]);
  
  // Form States for creating a match
  const [matchNo, setMatchNo] = useState('');
  const [teamA, setTeamA] = useState('');
  const [teamB, setTeamB] = useState('');
  const [kickoff, setKickoff] = useState('');
  const [margin, setMargin] = useState('');

  // Form States for updating user purse (Loans)
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
    // Get all matches
    const { data: mData } = await supabase.from('matches').select('*').order('match_no', { ascending: true });
    setMatches(mData || []);

    // Get all users for ledger/scoreboard management
    const { data: uData } = await supabase.from('users').select('*').order('username', { ascending: true });
    setUsers(uData || []);
  };

  // 1. Create a Match
  const handleCreateMatch = async (e) => {
    e.preventDefault();
    if (!matchNo || !teamA || !teamB || !kickoff || !margin) return alert('Fill all fields');

    const { error } = await supabase.from('matches').insert([{
      match_no: parseInt(matchNo),
      team_a: teamA,
      team_b: teamB,
      kickoff_time: new Date(kickoff).toISOString(), // Input reads local time, converts securely
      margin_rate: parseFloat(margin)
    }]);

    if (error) alert('Error creating match');
    else {
      alert('Match created successfully!');
      setMatchNo(''); setTeamA(''); setTeamB(''); setKickoff(''); setMargin('');
      fetchAdminData();
    }
  };

  // 2. Settle Match Winnings Automatically
  const handleSettleMatch = async (matchId, officialWinner) => {
    if (!confirm(`Confirm outcome as: ${officialWinner}? This will automatically process payouts.`)) return;

    // Fetch the match profile to grab the margin rate
    const { data: match } = await supabase.from('matches').select('*').eq('id', matchId).single();
    // Fetch all predictions for this match
    const { data: bets } = await supabase.from('bets').select('*').eq('match_id', matchId);

    if (bets && bets.length > 0) {
      for (let bet of bets) {
        if (bet.predicted_outcome === officialWinner) {
          // Calculate payout: Bet Amount * Margin Rate
          const payout = parseFloat(bet.amount) * parseFloat(match.margin_rate);
          
          // Get the current user purse directly from DB to prevent errors
          const { data: userProfile } = await supabase.from('users').select('purse').eq('id', bet.user_id).single();
          const runningPurse = parseFloat(userProfile.purse);

          // Return original bet stake + margin profit
          await supabase.from('users').update({ purse: runningPurse + payout }).eq('id', bet.user_id);
        }
        // If wrong, their purse remains untouched because the stake was already deducted on bet placement.
      }
    }

    // Mark the match completed
    await supabase.from('matches').update({ winner: officialWinner }).eq('id', matchId);
    alert('Match settled and leaderboards calculated!');
    fetchAdminData();
  };

  // 3. Edit Purse Manually (For Peer-to-Peer Loans)
  const handleManualPurseEdit = async (e) => {
    e.preventDefault();
    if (!selectedUser || !newPurseAmount) return alert('Select user and entry amount');

    const { error } = await supabase.from('users').update({ purse: parseFloat(newPurseAmount) }).eq('id', selectedUser);

    if (error) alert('Failed to update balance');
    else {
      alert('User wallet updated successfully.');
      setSelectedUser(''); setNewPurseAmount('');
      fetchAdminData();
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('app_user');
    window.location.href = '/';
  };

  if (!isAdmin) return <p style={{ padding: '20px' }}>Checking credentials...</p>;

  return (
    <div style={{ fontFamily: 'sans-serif', maxWidth: '900px', margin: '30px auto', padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #333', paddingBottom: '10px' }}>
        <h2>👑 Administrator Console</h2>
        <button onClick={handleLogout} style={{ background: '#ff4d4d', color: '#fff', border: 'none', borderRadius: '4px', padding: '5px 15px', cursor: 'pointer' }}>Logout</button>
      </div>

      {/* SECTION A: CREATE MATCH */}
      <section style={{ background: '#f9f9f9', padding: '20px', borderRadius: '8px', marginTop: '20px' }}>
        <h3>1. Create Live Match Card</h3>
        <form onSubmit={handleCreateMatch} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
          <input type="number" placeholder="Match Number" value={matchNo} onChange={e=>setMatchNo(e.target.value)} style={{padding:'8px'}} />
          <input type="text" placeholder="Team A (e.g. Croatia)" value={teamA} onChange={e=>setTeamA(e.target.value)} style={{padding:'8px'}} />
          <input type="text" placeholder="Team B (e.g. Belgium)" value={teamB} onChange={e=>setTeamB(e.target.value)} style={{padding:'8px'}} />
          <input type="datetime-local" placeholder="Kickoff Time (IST)" value={kickoff} onChange={e=>setKickoff(e.target.value)} style={{padding:'8px'}} />
          <input type="number" step="0.01" placeholder="Return Margin (e.g. 2.5)" value={margin} onChange={e=>setMargin(e.target.value)} style={{padding:'8px', gridColumn: 'span 2'}} />
          <button type="submit" style={{gridColumn: 'span 2', background: '#0070f3', color: 'white', border:'none', padding:'10px', borderRadius:'4px', cursor:'pointer'}}>Publish Match</button>
        </form>
      </section>

      {/* SECTION B: LOAN ADJUSTMENT LEDGER */}
      <section style={{ background: '#f9f9f9', padding: '20px', borderRadius: '8px', marginTop: '20px' }}>
        <h3>2. Adjust Wallets / Close Manual Loans</h3>
        <form onSubmit={handleManualPurseEdit} style={{ display: 'flex', gap: '15px' }}>
          <select value={selectedUser} onChange={e=>setSelectedUser(e.target.value)} style={{padding:'8px', flex: 2}}>
            <option value="">-- Select User --</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.username} (Current: ${u.purse})</option>
            ))}
          </select>
          <input type="number" step="0.01" placeholder="New Purse Balance ($)" value={newPurseAmount} onChange={e=>setNewPurseAmount(e.target.value)} style={{padding:'8px', flex: 1}} />
          <button type="submit" style={{background: '#4caf50', color: 'white', border:'none', padding:'8px 15px', borderRadius:'4px', cursor:'pointer'}}>Update Balance</button>
        </form>
      </section>

      {/* SECTION C: SETTLE PENDING MATCHES */}
      <section style={{ marginTop: '30px' }}>
        <h3>3. Active Fixtures & Settlement</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '10px' }}>
          <thead>
            <tr style={{ background: '#333', color: '#fff', textAlign: 'left' }}>
              <th style={{padding:'10px'}}>#</th>
              <th>Teams</th>
              <th>Kickoff Time (IST)</th>
              <th>Margin</th>
              <th>Status / Settle Action</th>
            </tr>
          </thead>
          <tbody>
            {matches.map(m => (
              <tr key={m.id} style={{ borderBottom: '1px solid #ddd' }}>
                <td style={{padding:'10px'}}>{m.match_no}</td>
                <td><strong>{m.team_a}</strong> vs <strong>{m.team_b}</strong></td>
                <td>{new Date(m.kickoff_time).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</td>
                <td>{m.margin_rate}x</td>
                <td>
                  {m.winner ? (
                    <span style={{ color: 'green', fontWeight: 'bold' }}>Settled (Winner: {m.winner})</span>
                  ) : (
                    <div style={{ display: 'flex', gap: '5px', padding: '5px 0' }}>
                      <button onClick={() => handleSettleMatch(m.id, 'A')} style={{padding:'3px 8px', cursor:'pointer'}}>{m.team_a}</button>
                      <button onClick={() => handleSettleMatch(m.id, 'B')} style={{padding:'3px 8px', cursor:'pointer'}}>{m.team_b}</button>
                      <button onClick={() => handleSettleMatch(m.id, 'DRAW')} style={{padding:'3px 8px', cursor:'pointer'}}>Draw</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
