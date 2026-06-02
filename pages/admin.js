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
  // Three distinct margin states
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

    // Determine correct margin based on who won
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
    alert('Match settled and specific outcome leaderboards calculated!');
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

  const handleLogout = () => {
    localStorage.removeItem('app_user');
    window.location.href = '/';
  };

  if (!isAdmin) return <p>Checking credentials...</p>;

  return (
    <div style={{ fontFamily: 'sans-serif', maxWidth: '900px', margin: '30px auto', padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #333', paddingBottom: '10px' }}>
        <h2>👑 Administrator Console (Multi-Margin)</h2>
        <button onClick={handleLogout} style={{ background: '#ff4d4d', color: '#fff', border: 'none', borderRadius: '4px', padding: '5px 15px', cursor: 'pointer' }}>Logout</button>
      </div>

      <section style={{ background: '#f9f9f9', padding: '20px', borderRadius: '8px', marginTop: '20px' }}>
        <h3>1. Create Live Match Card</h3>
        <form onSubmit={handleCreateMatch} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
          <input type="number" placeholder="Match Number" value={matchNo} onChange={e=>setMatchNo(e.target.value)} style={{padding:'8px'}} />
          <input type="datetime-local" placeholder="Kickoff Time (IST)" value={kickoff} onChange={e=>setKickoff(e.target.value)} style={{padding:'8px'}} />
          <input type="text" placeholder="Team A (e.g. Croatia)" value={teamA} onChange={e=>setTeamA(e.target.value)} style={{padding:'8px'}} />
          <input type="text" placeholder="Team B (e.g. Belgium)" value={teamB} onChange={e=>setTeamB(e.target.value)} style={{padding:'8px'}} />
          
          {/* THREE DISTINCT MARGIN INPUT FIELDS */}
          <input type="number" step="0.01" placeholder="Team A Win Margin (e.g. 2.65)" value={marginA} onChange={e=>setMarginA(e.target.value)} style={{padding:'8px'}} />
          <input type="number" step="0.01" placeholder="Team B Win Margin (e.g. 2.85)" value={marginB} onChange={e=>setMarginB(e.target.value)} style={{padding:'8px'}} />
          <input type="number" step="0.01" placeholder="Draw Margin (e.g. 3.01)" value={marginDraw} onChange={e=>setMarginDraw(e.target.value)} style={{padding:'8px', gridColumn: 'span 2'}} />
          
          <button type="submit" style={{gridColumn: 'span 2', background: '#0070f3', color: 'white', border:'none', padding:'10px', borderRadius:'4px', cursor:'pointer'}}>Publish Match</button>
        </form>
      </section>

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

      <section style={{ marginTop: '30px' }}>
        <h3>3. Active Fixtures & Settlement</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '10px' }}>
          <thead>
            <tr style={{ background: '#333', color: '#fff', textAlign: 'left' }}>
              <th style={{padding:'10px'}}>#</th>
              <th>Teams</th>
              <th>Kickoff Time (IST)</th>
              <th>Margins (A / B / X)</th>
              <th>Status / Settle Action</th>
            </tr>
          </thead>
          <tbody>
            {matches.map(m => (
              <tr key={m.id} style={{ borderBottom: '1px solid #ddd' }}>
                <td style={{padding:'10px'}}>{m.match_no}</td>
                <td><strong>{m.team_a}</strong> vs <strong>{m.team_b}</strong></td>
                <td>{new Date(m.kickoff_time).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</td>
                <td><span style={{color:'blue'}}>{m.margin_a}x</span> / <span style={{color:'green'}}>{m.margin_b}x</span> / <span style={{color:'orange'}}>{m.margin_draw}x</span></td>
                <td>
                  {m.winner ? (
                    <span style={{ color: 'green', fontWeight: 'bold' }}>Settled ({m.winner})</span>
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
