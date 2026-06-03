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

  // 🛠️ HELPER: Uniformly extracts the best available name property
  const getDisplayName = (u) => {
    if (!u) return 'Player';
    return u.username || u.name || u.display_name || 'Player';
  };

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

    // 🛠️ CRITICAL FIX: Changed column arguments to a single comma-separated string
    const { data: scoreData } = await supabase
      .from('users')
      .select('id, username, name, display_name, purse')
      .eq('is_admin', false);
    
    // 🛠️ CRITICAL FIX: Sanitize the numeric inputs right here to block $NaN leaks 
    // and manually handle descending leaderboard sorting safely
    const formattedData = (scoreData || []).map(u => ({
      ...u,
      purse: parseFloat(u.purse) || 0
    })).sort((a, b) => b.purse - a.purse);

    setUsersList(formattedData);
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
    const refundedPurse = parseFloat(user.purse || 0) + currentBetAmount;

    if (amountInput > refundedPurse) return alert('Insufficient purse balance!');

    const newPurse = refundedPurse - amountInput;
    await supabase.from('users').update({ purse: newPurse }).eq('id', user.id);

    if (existingBet) {
      const { error } = await supabase
        .from('bets')
        .update({ predicted_outcome: prediction, amount: amountInput })
        .eq('id', existingBet.id);

      if (error) {
        await supabase.from('users').update({ purse: parseFloat(user.purse || 0) }).eq('id', user.id);
        alert('Error updating your bet.');
      } else {
        alert('🎯 Your bid has been updated successfully!');
        fetchDashboardData(user.id);
      }
    } else {
      const { error } = await supabase.from('bets').insert([{ user_id: user.id, match_id: matchId, predicted_outcome: prediction, amount: amountInput }]);

      if (error) {
        await supabase.from('users').update({ purse: parseFloat(user.purse || 0) }).eq('id', user.id);
        alert('Bet saving error.');
      } else {
        alert('🎯 Bet locked in!');
        fetchDashboardData(user.id);
      }
    }
  };

  // 💸 VIRTUAL PEER-TO-PEER TRANSFER LOGIC
  const handleVirtualTransfer = async (e) => {
    e.preventDefault();
    const amount = parseFloat(transferAmount);

    if (!transferTarget) return alert('Please select a friend to send points to.');
    if (isNaN(amount) || amount <= 0) return alert('Please enter a valid amount greater than 0.');
    if (amount > parseFloat(user.purse || 0)) return alert('Insufficient purse balance for this transfer!');
    if (transferTarget.toString() === user.id.toString()) return alert('You cannot send points to yourself.');

    // 🛠️ FIX: String normalization comparison to guarantee safe recipient matchmaking
    const recipient = usersList.find(u => u.id.toString() === transferTarget.toString());
    const recipientName = getDisplayName(recipient);
    
    if (!confirm(`Are you sure you want to transfer $${amount.toFixed(2)} to ${recipientName}?`)) return;

    try {
      const { data: targetUser, error: fetchErr } = await supabase.from('users').select('purse, username, name, display_name').eq('id', transferTarget).single();
      if (fetchErr || !targetUser) throw new Error('Recipient not found');

      const senderNewPurse = parseFloat(user.purse || 0) - amount;
      await supabase.from('users').update({ purse: senderNewPurse }).eq('id', user.id);

      const recipientNewPurse = (parseFloat(targetUser.purse) || 0) + amount;
      await supabase.from('users').update({ purse: recipientNewPurse }).eq('id', transferTarget);

      alert(`✅ Successfully transferred $${amount.toFixed(2)} to ${getDisplayName(targetUser)}!`);
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
  
  const transferPartners = usersList.filter(u => u.id !== user.id);

  return (
    <div style={{ backgroundColor: '#0f172a', minHeight: '100vh', fontFamily: 'system-ui, sans-serif', color: '#f8fafc', padding: '12px' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        
        {/* HEADER BLOCK */}
        <div style={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '16px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '700' }}>👋 Welcome, {getDisplayName(user)}</h2>
              <div style={{ display: 'inline-block', backgroundColor: '#0284c7', color: '#fff', padding: '4px 10px', borderRadius: '20px', fontSize: '13px', fontWeight: '700', marginTop: '4px' }}>
                💰 Purse: ${parseFloat(user.purse || 0).toFixed(2)}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setShowSettings(!showSettings)} style={{ backgroundColor: '#475569', border: 'none', color: '#fff', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontWeight: '600',
