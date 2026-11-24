import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Trophy, Users, ShieldCheck, Lock, CheckCircle2, Clock, Plus, Swords, ArrowRight, UserCheck, MessageCircle, Award, UserPlus } from 'lucide-react';

const CONFIG = {
  SUPABASE_URL: 'https://gpgrimeivilfxfwuniku.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_Qi9wm6onYZoVHe_vT1k33w_s-EbokgT',
  WHATSAPP_GROUP_URL: 'https://chat.whatsapp.com/LdHAYbxs6MzFmBiwLJajb7?s=cl&p=a&iam=2',
  LOGO_URL: '/logo.png',
  MPESA_NUMBER: '0726593601',
  ADMIN_PASSWORD: 'V3mf54',
};

const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

export default function App() {
  const [step, setStep] = useState('signin');
  const [player, setPlayer] = useState(null);
  const [allPlayers, setAllPlayers] = useState([]);
  const [profile, setProfile] = useState({
    full_name: '', phone_number: '', efootball_username: '', squad_strength: '3150',
  });
  const [tournaments, setTournaments] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [roster, setRoster] = useState([]);
  const [pairs, setPairs] = useState([]);
  const [mpesaCode, setMpesaCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);

  const [adminOpen, setAdminOpen] = useState(false);
  const [passInput, setPassInput] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newFee, setNewFee] = useState('30');
  const [newMax, setNewMax] = useState('4');

  const [addPlayerId, setAddPlayerId] = useState('');
  const [addPaidCode, setAddPaidCode] = useState('ADMIN-PAID');

  const [winnerChoice, setWinnerChoice] = useState('');
  const [customWinnerName, setCustomWinnerName] = useState('');
    const fetchPlayersList = async () => {
    const { data } = await supabase.from('players').select('*').order('id', { ascending: false });
    if (data) {
      setAllPlayers(data);
      if (!addPlayerId && data.length > 0) setAddPlayerId(String(data[0].id));
    }
  };

  const fetchAll = async () => {
    const { data, error } = await supabase
      .from('tournaments')
      .select('*, registrations(id, payment_status)')
      .order('id', { ascending: false });
    if (error) return setMsg({ ok: false, text: error.message });
    if (data && data.length > 0) {
      const list = data.map((t) => {
        const fee = Number(t.entry_fee ?? 50);
        const paid = (t.registrations || []).filter((r) => r.payment_status === 'paid').length;
        const pool = paid * fee;
        return {
          ...t,
          entry_fee: fee,
          paid_count: paid,
          total_pool: pool,
          winner_payout: Math.round(pool * 0.6),
          host_fee: Math.round(pool * 0.4),
        };
      });
      setTournaments(list);
      if (!selectedId) setSelectedId(list[0].id);
    } else {
      setTournaments([
        { id: 'starter-1', title: 'Tournament 1 (30 KES Bid)', entry_fee: 30, max_players: 4, status: 'open', paid_count: 0, total_pool: 0, winner_payout: 0, host_fee: 0 },
      ]);
      setSelectedId('starter-1');
    }
  };

  const fetchRoster = async (tid) => {
    if (!tid || String(tid).startsWith('starter-')) return setRoster([]);
    const { data } = await supabase
      .from('registrations')
      .select('*, players(*)')
      .eq('tournament_id', tid)
      .order('joined_at', { ascending: true });
    setRoster(data || []);
    setPairs([]);
  };

  useEffect(() => {
    const saved = localStorage.getItem('efootball_player');
    if (saved) {
      try {
        const p = JSON.parse(saved);
        setPlayer(p);
        setProfile({
          full_name: p.full_name || '',
          phone_number: p.phone_number || '',
          efootball_username: p.efootball_username || '',
          squad_strength: String(p.squad_strength || '3150'),
        });
      } catch (_) {}
    }
    fetchAll();
    fetchPlayersList();
  }, []);

  useEffect(() => {
    if (selectedId) fetchRoster(selectedId);
  }, [selectedId]);

  const handleSignIn = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      const row = {
        full_name: profile.full_name.trim(),
        phone_number: profile.phone_number.trim(),
        efootball_username: profile.efootball_username.trim(),
        squad_strength: Number(profile.squad_strength),
      };
      const { data, error } = await supabase.from('players').upsert(row, { onConflict: 'phone_number' }).select().single();
      if (error) throw error;
      const active = data || row;
      setPlayer(active);
      localStorage.setItem('efootball_player', JSON.stringify(active));
      await fetchPlayersList();
      setStep('lobbies');
      fetchAll();
    } catch (err) {
      setMsg({ ok: false, text: err.message || 'Sign in error' });
    } finally {
      setLoading(false);
    }
  };

  const activeT = tournaments.find((t) => t.id === selectedId) || tournaments[0];

  const ensureTournamentDbId = async () => {
    if (selectedId && !String(selectedId).startsWith('starter-')) return selectedId;
    const { data: created, error: cErr } = await supabase
      .from('tournaments')
      .insert({
        title: activeT?.title || 'Tournament 1',
        entry_fee: Number(activeT?.entry_fee ?? 30),
        max_players: Number(activeT?.max_players ?? 4),
        status: 'open',
      })
      .select()
      .single();
    if (cErr) throw cErr;
    setSelectedId(created.id);
    return created.id;
  };

  const handleJoin = async (e) => {
    e.preventDefault();
    if (!player) return setStep('signin');
    setLoading(true);
    setMsg(null);
    try {
      const tid = await ensureTournamentDbId();
      const cleanPlayer = {
        full_name: player.full_name,
        phone_number: player.phone_number,
        efootball_username: player.efootball_username,
        squad_strength: Number(player.squad_strength),
      };
      const { data: pData, error: pErr } = await supabase
        .from('players')
        .upsert(cleanPlayer, { onConflict: 'phone_number' })
        .select()
        .single();
      if (pErr) throw pErr;

      const { error: rErr } = await supabase.from('registrations').insert({
        tournament_id: tid,
        player_id: pData.id,
        mpesa_code: mpesaCode.trim().toUpperCase(),
        payment_status: 'pending',
      });
      if (rErr) throw new Error(rErr.code === '23505' ? 'You already joined this tournament!' : rErr.message);

      setMsg({ ok: true, text: `Registered for ${activeT?.entry_fee ?? 50} KES bid! Awaiting host verification.` });
      setMpesaCode('');
      await fetchAll();
      await fetchRoster(tid);
      await fetchPlayersList();
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const verifyPayment = async (id) => {
    await supabase.from('registrations').update({ payment_status: 'paid' }).eq('id', id);
    await fetchAll();
    await fetchRoster(selectedId);
  };

  const addPaidPlayerToTournament = async (e) => {
    e.preventDefault();
    if (!addPlayerId) return;
    setLoading(true);
    setMsg(null);
    try {
      const tid = await ensureTournamentDbId();
      const { error: rErr } = await supabase.from('registrations').insert({
        tournament_id: tid,
        player_id: Number(addPlayerId),
        mpesa_code: (addPaidCode || 'PAID').trim().toUpperCase(),
        payment_status: 'paid',
      });
      if (rErr) throw new Error(rErr.code === '23505' ? 'Player is already in this tournament!' : rErr.message);
      setMsg({ ok: true, text: 'Paid player added to tournament!' });
      await fetchAll();
      await fetchRoster(tid);
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const announceWinner = async (winnerPlayerObj) => {
    setMsg(null);
    const chosenRosterPlayer = roster.find((r) => String(r.player_id) === String(winnerChoice))?.players;
    const target = winnerPlayerObj || chosenRosterPlayer;
    const finalName = target?.efootball_username || customWinnerName.trim();
    const finalPhone = target?.phone_number || '';

    if (!finalName) {
      setMsg({ ok: false, text: 'Select a player or enter the league winner username first.' });
      return;
    }

    try {
      const tid = await ensureTournamentDbId();
      const { error } = await supabase
        .from('tournaments')
        .update({
          status: 'completed',
          winner_username: finalName,
          winner_phone: finalPhone,
        })
        .eq('id', tid);
      if (error) throw error;
      setCustomWinnerName('');
      setWinnerChoice('');
      setMsg({ ok: true, text: `League Winner Announced: ${finalName}!` });
      await fetchAll();
      await fetchRoster(tid);
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    }
  };

  const createTournament = async () => {
    if (!newTitle.trim()) return;
    setMsg(null);
    const fee = Math.max(0, Number(newFee || 0));
    const { data, error } = await supabase
      .from('tournaments')
      .insert({
        title: newTitle.trim(),
        entry_fee: fee,
        max_players: Number(newMax),
        status: 'open',
      })
      .select()
      .single();
    if (error) return setMsg({ ok: false, text: error.message });
    setNewTitle('');
    setMsg({ ok: true, text: `Created "${data.title}" (${fee} KES bid).` });
    if (data?.id) setSelectedId(data.id);
    await fetchAll();
  };

  const pairPaidPlayers = () => {
    const paidPlayers = roster.filter((r) => r.payment_status === 'paid').map((r) => r.players).filter(Boolean);
    if (paidPlayers.length < 2) {
      setMsg({ ok: false, text: 'Need at least 2 PAID players in this tournament to pair.' });
      return;
    }
    const shuffled = [...paidPlayers].sort(() => Math.random() - 0.5);
    const generated = [];
    for (let i = 0; i < shuffled.length - 1; i += 2) {
      generated.push([shuffled[i], shuffled[i + 1]]);
    }
    setPairs(generated);
    setMsg({ ok: true, text: `Paired ${generated.length * 2} paid players into ${generated.length} match(es).` });
  };

  const paidCountInRoster = roster.filter((r) => r.payment_status === 'paid').length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/90 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img
              src={CONFIG.LOGO_URL}
              alt="eFootball Logo"
              className="h-9 w-16 object-contain rounded-md bg-blue-950 border border-slate-700"
            />
            <div>
              <h1 className="font-bold text-base">eFootball Tournaments</h1>
              <p className="text-[11px] text-slate-400">Custom Bids • 60% Winner • 40% Host</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {step === 'lobbies' && (
              <button onClick={() => setStep('signin')} className="px-3 py-1.5 rounded-lg text-xs bg-slate-800 border border-slate-700">
                Player Details
              </button>
            )}
            <button onClick={() => setAdminOpen(!adminOpen)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-slate-800 border border-slate-700">
              <Lock className="w-3.5 h-3.5 text-amber-400" /> Admin
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {msg && (
          <div className={`p-3 rounded-xl text-xs font-medium ${msg.ok ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'}`}>
            {msg.text}
          </div>
        )}

        {adminOpen && (
          <div className="bg-amber-950/20 border border-amber-500/30 rounded-xl p-4 space-y-4">
            {!isAdmin ? (
              <div className="flex gap-2">
                <input
                  type="password"
                  placeholder="Enter Host Admin Password"
                  value={passInput}
                  onChange={(e) => setPassInput(e.target.value)}
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm"
                />
                <button
                  onClick={() => (passInput === CONFIG.ADMIN_PASSWORD ? setIsAdmin(true) : alert('Wrong password'))}
                  className="bg-amber-500 text-slate-950 font-bold px-4 py-2 rounded-lg text-sm"
                >
                  Unlock
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-xs text-amber-300 font-semibold flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4" /> Host Admin Controls
                </div>

                <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 space-y-2">
                  <div className="text-xs font-bold text-slate-200">1. Create Tournament & Bid Amount (KES)</div>
                  <div className="flex flex-wrap gap-2 items-center">
                    <input
                      type="text"
                      placeholder="Tournament Name (e.g. Tournament 1 - 30 Bob)"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      className="flex-1 min-w-[170px] bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm"
                    />
                    <input
                      type="number"
                      min="0"
                      placeholder="Bid (KES)"
                      value={newFee}
                      onChange={(e) => setNewFee(e.target.value)}
                      className="w-28 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm"
                    />
                    <select
                      value={newMax}
                      onChange={(e) => setNewMax(e.target.value)}
                      className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="2">2 Players (Friendly)</option>
                      <option value="4">4 Players</option>
                      <option value="6">6 Players</option>
                      <option value="8">8 Players</option>
                    </select>
                    <button
                      onClick={createTournament}
                      className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1"
                    >
                      <Plus className="w-4 h-4" /> Create
                    </button>
                  </div>
                </div>

                <form onSubmit={addPaidPlayerToTournament} className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 space-y-2">
                  <div className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <UserPlus className="w-4 h-4 text-emerald-400" /> 2. Add Paid Player to {activeT?.title || 'Tournament'}
                  </div>
                  <div className="flex flex-wrap gap-2 items-center">
                    <select
                      value={addPlayerId}
                      onChange={(e) => setAddPlayerId(e.target.value)}
                      className="flex-1 min-w-[180px] bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm"
                    >
                      {allPlayers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.efootball_username} ({p.full_name} • {p.squad_strength})
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      placeholder="M-Pesa / Note"
                      value={addPaidCode}
                      onChange={(e) => setAddPaidCode(e.target.value)}
                      className="w-36 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm uppercase font-mono"
                    />
                    <button
                      disabled={loading}
                      type="submit"
                      className="bg-sky-600 hover:bg-sky-500 text-white px-4 py-2 rounded-lg text-sm font-medium"
                    >
                      Add Paid Player
                    </button>
                  </div>
                </form>

                <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 space-y-2">
                  <div className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <Award className="w-4 h-4 text-amber-400" /> 3. Announce Winner of {activeT?.title || 'League'}
                  </div>
                  <div className="flex flex-wrap gap-2 items-center">
                    <select
                      value={winnerChoice}
                      onChange={(e) => setWinnerChoice(e.target.value)}
                      className="flex-1 min-w-[170px] bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="">-- Pick player from tournament roster --</option>
                      {roster.map((r) => (
                        <option key={r.id} value={r.player_id}>
                          {r.players?.efootball_username} ({r.payment_status})
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      placeholder="Or type winner username"
                      value={customWinnerName}
                      onChange={(e) => setCustomWinnerName(e.target.value)}
                      className="flex-1 min-w-[160px] bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => announceWinner(null)}
                      className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2 rounded-lg text-sm"
                    >
                      Announce Winner
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {step === 'signin' && (
          <div className="max-w-md mx-auto space-y-4">
            <div className="rounded-2xl overflow-hidden border border-blue-500/30 bg-blue-950 shadow-lg">
              <img
                src={CONFIG.LOGO_URL}
                alt="eFootball Opening Banner"
                className="w-full max-h-40 object-contain mx-auto bg-blue-950"
              />
            </div>

            <div className="bg-white text-slate-900 rounded-2xl p-6 shadow-xl space-y-4">
              <h2 className="text-xl font-extrabold text-center">Sign In Free</h2>
              <form onSubmit={handleSignIn} className="space-y-3">
                <input required type="text" placeholder="Full Name" value={profile.full_name} onChange={(e) => setProfile({ ...profile, full_name: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm" />
                <input required type="tel" placeholder="M-Pesa Number e.g. 0712345678" value={profile.phone_number} onChange={(e) => setProfile({ ...profile, phone_number: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm" />
                <input required type="text" placeholder="Username - eFootball username" value={profile.efootball_username} onChange={(e) => setProfile({ ...profile, efootball_username: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm" />
                <input required type="number" placeholder="Account Strength e.g. 3150" value={profile.squad_strength} onChange={(e) => setProfile({ ...profile, squad_strength: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm" />

                <a
                  href={CONFIG.WHATSAPP_GROUP_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full border border-emerald-600 text-emerald-700 hover:bg-emerald-50 font-semibold py-2.5 px-3.5 rounded-lg text-sm flex items-center justify-center gap-2"
                >
                  <MessageCircle className="w-4 h-4" /> Join eFootball WhatsApp Group
                </a>

                <button disabled={loading} type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-lg text-sm flex items-center justify-center gap-2">
                  {loading ? 'Saving...' : 'NEXT'} <ArrowRight className="w-4 h-4" />
                </button>
              </form>
              {player && (
                <button type="button" onClick={() => setStep('lobbies')} className="w-full text-xs text-emerald-700 font-semibold underline pt-1">
                  Continue as {player.efootball_username} →
                </button>
              )}
            </div>
          </div>
        )}

        {step === 'lobbies' && (
          <>
            {player && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 flex items-center justify-between text-xs">
                <span className="flex items-center gap-2">
                
