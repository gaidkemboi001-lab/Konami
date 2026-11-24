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
  const [profile, setProfile] = useState({ full_name: '', phone_number: '', efootball_username: '', squad_strength: '3150' });
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
    const { data, error } = await supabase.from('tournaments').select('*, registrations(id, payment_status)').order('id', { ascending: false });
    if (error) return setMsg({ ok: false, text: error.message });
    if (data && data.length > 0) {
      const list = data.map((t) => {
        const fee = Number(t.entry_fee ?? 50);
        const paid = (t.registrations || []).filter((r) => r.payment_status === 'paid').length;
        const pool = paid * fee;
        return { ...t, entry_fee: fee, paid_count: paid, total_pool: pool, winner_payout: Math.round(pool * 0.6), host_fee: Math.round(pool * 0.4) };
      });
      setTournaments(list);
      if (!selectedId) setSelectedId(list[0].id);
    } else {
      setTournaments([{ id: 'starter-1', title: 'Tournament 1 (30 KES Bid)', entry_fee: 30, max_players: 4, status: 'open', paid_count: 0, total_pool: 0, winner_payout: 0, host_fee: 0 }]);
      setSelectedId('starter-1');
    }
  };

  const fetchRoster = async (tid) => {
    if (!tid || String(tid).startsWith('starter-')) return setRoster([]);
    const { data } = await supabase.from('registrations').select('*, players(*)').eq('tournament_id', tid).order('joined_at', { ascending: true });
    setRoster(data || []);
    setPairs([]);
  };

  useEffect(() => {
    const saved = localStorage.getItem('efootball_player');
    if (saved) {
      try {
        const p = JSON.parse(saved);
        setPlayer(p);
        setProfile({ full_name: p.full_name || '', phone_number: p.phone_number || '', efootball_username: p.efootball_username || '', squad_strength: String(p.squad_strength || '3150') });
      } catch (_) {}
    }
    fetchAll();
    fetchPlayersList();
  }, []);

  useEffect(() => {
    if (selectedId) fetchRoster(selectedId);
  }, [selectedId]);

  const activeT = tournaments.find((t) => t.id === selectedId) || tournaments[0];
    const ensureTournamentDbId = async () => {
    if (selectedId && !String(selectedId).startsWith('starter-')) return selectedId;
    const { data: created, error: cErr } = await supabase.from('tournaments').insert({ title: activeT?.title || 'Tournament 1', entry_fee: Number(activeT?.entry_fee ?? 30), max_players: Number(activeT?.max_players ?? 4), status: 'open' }).select().single();
    if (cErr) throw cErr;
    setSelectedId(created.id);
    return created.id;
  };

  const handleSignIn = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      const row = { full_name: profile.full_name.trim(), phone_number: profile.phone_number.trim(), efootball_username: profile.efootball_username.trim(), squad_strength: Number(profile.squad_strength) };
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

  const handleJoin = async (e) => {
    e.preventDefault();
    if (!player) return setStep('signin');
    setLoading(true);
    setMsg(null);
    try {
      const tid = await ensureTournamentDbId();
      const { data: pData, error: pErr } = await supabase.from('players').upsert({ full_name: player.full_name, phone_number: player.phone_number, efootball_username: player.efootball_username, squad_strength: Number(player.squad_strength) }, { onConflict: 'phone_number' }).select().single();
      if (pErr) throw pErr;
      const { error: rErr } = await supabase.from('registrations').insert({ tournament_id: tid, player_id: pData.id, mpesa_code: mpesaCode.trim().toUpperCase(), payment_status: 'pending' });
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
      const { error: rErr } = await supabase.from('registrations').insert({ tournament_id: tid, player_id: Number(addPlayerId), mpesa_code: (addPaidCode || 'PAID').trim().toUpperCase(), payment_status: 'paid' });
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
    const chosen = roster.find((r) => String(r.player_id) === String(winnerChoice))?.players;
    const target = winnerPlayerObj || chosen;
    const finalName = target?.efootball_username || customWinnerName.trim();
    if (!finalName) return setMsg({ ok: false, text: 'Select a player or enter winner username.' });
    try {
      const tid = await ensureTournamentDbId();
      const { error } = await supabase.from('tournaments').update({ status: 'completed', winner_username: finalName, winner_phone: target?.phone_number || '' }).eq('id', tid);
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
    const { data, error } = await supabase.from('tournaments').insert({ title: newTitle.trim(), entry_fee: fee, max_players: Number(newMax), status: 'open' }).select().single();
    if (error) return setMsg({ ok: false, text: error.message });
    setNewTitle('');
    setMsg({ ok: true, text: `Created "${data.title}" (${fee} KES bid).` });
    if (data?.id) setSelectedId(data.id);
    await fetchAll();
  };

  const pairPaidPlayers = () => {
    const paidPlayers = roster.filter((r) => r.payment_status === 'paid').map((r) => r.players).filter(Boolean);
    if (paidPlayers.length < 2) return setMsg({ ok: false, text: 'Need at least 2 PAID players to pair.' });
    const shuffled = [...paidPlayers].sort(() => Math.random() - 0.5);
    const generated = [];
    for (let i = 0; i < shuffled.length - 1; i += 2) generated.push([shuffled[i], shuffled[i + 1]]);
    setPairs(generated);
    setMsg({ ok: true, text: `Paired ${generated.length * 2} paid players into ${generated.length} match(es).` });
  };

  const paidCountInRoster = roster.filter((r) => r.payment_status === 'paid').length;
             return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/90 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src={CONFIG.LOGO_URL} alt="eFootball Logo" className="h-9 w-16 object-contain rounded-md bg-blue-950 border border-slate-700" />
            <div>
              <h1 className="font-bold text-base">eFootball Tournaments</h1>
              <p className="text-[11px] text-slate-400">Custom Bids • 60% Winner • 40% Host</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {step === 'lobbies' && <button onClick={() => setStep('signin')} className="px-3 py-1.5 rounded-lg text-xs bg-slate-800 border border-slate-700">Player Details</button>}
            <button onClick={() => setAdminOpen(!adminOpen)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-slate-800 border border-slate-700"><Lock className="w-3.5 h-3.5 text-amber-400" /> Admin</button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {msg && <div className={`p-3 rounded-xl text-xs font-medium ${msg.ok ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'}`}>{msg.text}</div>}

        {adminOpen && (
          <div className="bg-amber-950/20 border border-amber-500/30 rounded-xl p-4 space-y-4">
            {!isAdmin ? (
              <div className="flex gap-2">
                <input type="password" placeholder="Enter Host Admin Password" value={passInput} onChange={(e) => setPassInput(e.target.value)} className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm" />
                <button onClick={() => (passInput === CONFIG.ADMIN_PASSWORD ? setIsAdmin(true) : alert('Wrong password'))} className="bg-amber-500 text-slate-950 font-bold px-4 py-2 rounded-lg text-sm">Unlock</button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-xs text-amber-300 font-semibold flex items-center gap-1.5"><ShieldCheck className="w-4 h-4" /> Host Admin Controls</div>
                <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 space-y-2">
                  <div className="text-xs font-bold">1. Create Tournament & Bid (KES)</div>
                  <div className="flex flex-wrap gap-2 items-center">
                    <input type="text" placeholder="Tournament Name" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} className="flex-1 min-w-[170px] bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm" />
                    <input type="number" min="0" placeholder="Bid" value={newFee} onChange={(e) => setNewFee(e.target.value)} className="w-24 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm" />
                    <select value={newMax} onChange={(e) => setNewMax(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm">
                      <option value="2">2 (Friendly)</option><option value="4">4 Players</option><option value="6">6 Players</option><option value="8">8 Players</option>
                    </select>
                    <button onClick={createTournament} className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1"><Plus className="w-4 h-4" /> Create</button>
                  </div>
                </div>
                <form onSubmit={addPaidPlayerToTournament} className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 space-y-2">
                  <div className="text-xs font-bold flex items-center gap-1.5"><UserPlus className="w-4 h-4 text-emerald-400" /> 2. Add Paid Player to Tournament</div>
                  <div className="flex flex-wrap gap-2 items-center">
                    <select value={addPlayerId} onChange={(e) => setAddPlayerId(e.target.value)} className="flex-1 min-w-[180px] bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm">
                      {allPlayers.map((p) => <option key={p.id} value={p.id}>{p.efootball_username} ({p.full_name})</option>)}
                    </select>
                    <input type="text" placeholder="M-Pesa Code" value={addPaidCode} onChange={(e) => setAddPaidCode(e.target.value)} className="w-32 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm uppercase font-mono" />
                    <button disabled={loading} type="submit" className="bg-sky-600 text-white px-4 py-2 rounded-lg text-sm font-medium">Add Paid</button>
                  </div>
                </form>
                <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 space-y-2">
                  <div className="text-xs font-bold flex items-center gap-1.5"><Award className="w-4 h-4 text-amber-400" /> 3. Announce Winner</div>
                  <div className="flex flex-wrap gap-2 items-center">
                    <select value={winnerChoice} onChange={(e) => setWinnerChoice(e.target.value)} className="flex-1 min-w-[170px] bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm">
                      <option value="">-- Pick from roster --</option>
                      {roster.map((r) => <option key={r.id} value={r.player_id}>{r.players?.efootball_username} ({r.payment_status})</option>)}
                    </select>
                    <input type="text" placeholder="Or type username" value={customWinnerName} onChange={(e) => setCustomWinnerName(e.target.value)} className="flex-1 min-w-[150px] bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm" />
                    <button type="button" onClick={() => announceWinner(null)} className="bg-amber-500 text-slate-950 font-bold px-4 py-2 rounded-lg text-sm">Announce</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {step === 'signin' && (
          <div className="max-w-md mx-auto space-y-4">
            <div className="rounded-2xl overflow-hidden border border-blue-500/30 bg-blue-950 shadow-lg">
              <img src={CONFIG.LOGO_URL} alt="eFootball Opening Banner" className="w-full max-h-40 object-contain mx-auto bg-blue-950" />
            </div>
            <div className="bg-white text-slate-900 rounded-2xl p-6 shadow-xl space-y-4">
              <h2 className="text-xl font-extrabold text-center">Sign In Free</h2>
              <form onSubmit={handleSignIn} className="space-y-3">
                <input required type="text" placeholder="Full Name" value={profile.full_name} onChange={(e) => setProfile({ ...profile, full_name: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm" />
                <input required type="tel" placeholder="M-Pesa Number e.g. 0712345678" value={profile.phone_number} onChange={(e) => setProfile({ ...profile, phone_number: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm" />
                <input required type="text" placeholder="Username - eFootball username" value={profile.efootball_username} onChange={(e) => setProfile({ ...profile, efootball_username: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm" />
                <input required type="number" placeholder="Account Strength e.g. 3150" value={profile.squad_strength} onChange={(e) => setProfile({ ...profile, squad_strength: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm" />
                <a href={CONFIG.WHATSAPP_GROUP_URL} target="_blank" rel="noreferrer" className="w-full border border-emerald-600 text-emerald-700 hover:bg-emerald-50 font-semibold py-2.5 px-3.5 rounded-lg text-sm flex items-center justify-center gap-2"><MessageCircle className="w-4 h-4" /> Join eFootball WhatsApp Group</a>
                <button disabled={loading} type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-lg text-sm flex items-center justify-center gap-2">{loading ? 'Saving...' : 'NEXT'} <ArrowRight className="w-4 h-4" /></button>
              </form>
              {player && <button type="button" onClick={() => setStep('lobbies')} className="w-full text-xs text-emerald-700 font-semibold underline pt-1">Continue as {player.efootball_username} →</button>}
            </div>
          </div>
        )}

        {step === 'lobbies' && (
          <>
            {player && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 flex items-center justify-between text-xs">
                <span className="flex items-center gap-2"><UserCheck className="w-4 h-4 text-emerald-400" /> Signed in as <strong>{player.efootball_username}</strong> ({player.squad_strength})</span>
                <button onClick={() => setStep('signin')} className="text-emerald-400 hover:underline">Edit Details</button>
              </div>
            )}
            <div className="grid sm:grid-cols-2 gap-3">
              {tournaments.map((t) => (
                <div key={t.id} onClick={() => setSelectedId(t.id)} className={`cursor-pointer rounded-xl p-4 border ${activeT?.id === t.id ? 'bg-slate-900 border-emerald-500' : 'bg-slate-900/50 border-slate-800'}`}>
                  <div className="flex justify-between items-start gap-2 mb-2">
                    <div><h3 className="font-bold text-sm">{t.title}</h3><span className="text-[11px] text-amber-300 font-semibold">Bid / Entry: {t.entry_fee} KES</span></div>
                    <span className="text-[10px] uppercase px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-semibold">{t.status}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center bg-slate-950 rounded-lg p-2 text-xs">
                    <div><span className="text-slate-400 block text-[10px]">Paid / Cap</span><strong>{t.paid_count}/{t.max_players}</strong></div>
                    <div><span className="text-slate-400 block text-[10px]">Winner (60%)</span><strong className="text-emerald-400">{t.winner_payout} KES</strong></div>
                    <div><span className="text-slate-400 block text-[10px]">Host (40%)</span><strong>{t.host_fee} KES</strong></div>
                  </div>
                </div>
              ))}
            </div>
            {activeT && (
              <div className="space-y-4">
                {activeT.winner_username && (
                  <div className="bg-amber-500/15 border border-amber-400/50 rounded-xl p-4 flex items-center gap-3 text-amber-200">
                    <Award className="w-6 h-6 text-amber-400 shrink-0" />
                    <div><div className="text-[11px] uppercase tracking-wider text-amber-400 font-bold">Official League Winner</div><div className="text-sm font-extrabold text-white">{activeT.winner_username} {activeT.winner_phone ? `(${activeT.winner_phone})` : ''} — Champion of {activeT.title}</div></div>
                  </div>
                )}
                <div className="grid md:grid-cols-12 gap-6">
                  <div className="md:col-span-5 bg-slate-900 border border-slate-800 rounded-xl p-5">
                    <h3 className="font-bold text-base mb-1">Join {activeT.title}</h3>
                    <p className="text-xs text-slate-400 mb-4">Send <strong className="text-amber-300">{activeT.entry_fee} KES</strong> via M-Pesa to <strong className="text-emerald-400">{CONFIG.MPESA_NUMBER}</strong>, then enter code:</p>
                    <form onSubmit={handleJoin} className="space-y-3">
                      <input required type="text" placeholder="M-Pesa Code (e.g. SK94H2P10X)" value={mpesaCode} onChange={(e) => setMpesaCode(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-sm uppercase font-mono" />
                      <button disabled={loading} type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2.5 rounded-lg text-sm">{loading ? 'Registering...' : `Join (${activeT.entry_fee} KES)`}</button>
                    </form>
                  </div>
                  <div className="md:col-span-7 space-y-4">
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex justify-between">
                      <div><span className="text-[11px] text-slate-400">Escrow Pot</span><div className="text-xl font-extrabold">{activeT.total_pool} KES</div></div>
                      <div className="text-right"><span className="text-[11px] text-emerald-400">Winner (60%)</span><div className="text-xl font-extrabold text-emerald-400">{activeT.winner_payout} KES</div></div>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                      <div className="px-4 py-3 border-b border-slate-800 flex flex-wrap justify-between items-center gap-2">
                        <span className="text-sm font-semibold flex items-center gap-1.5"><Users className="w-4 h-4 text-emerald-400" /> Gamers ({roster.length}) • Paid ({paidCountInRoster})</span>
                        {isAdmin && <button onClick={pairPaidPlayers} className="text-xs bg-amber-500 text-slate-950 font-bold px-2.5 py-1 rounded">Pair Paid Players</button>}
                      </div>
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-950 text-slate-400 uppercase"><tr><th className="px-3 py-2">Gamer</th><th className="px-3 py-2">Squad</th><th className="px-3 py-2">Status</th>{isAdmin && <th className="px-3 py-2">Admin</th>}</tr></thead>
                        <tbody className="divide-y divide-slate-800">
                          {roster.map((r) => (
                            <tr key={r.id}>
                              <td className="px-3 py-2.5"><div className="font-semibold">{r.players?.efootball_username}</div><div className="text-slate-500">{r.players?.full_name}</div></td>
                              <td className="px-3 py-2.5 font-mono text-emerald-400">{r.players?.squad_strength}</td>
                              <td className="px-3 py-2.5">{r.payment_status === 'paid' ? <span className="text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Paid</span> : <span className="text-amber-400 flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Pending</span>}</td>
                              {isAdmin && (
                                <td className="px-3 py-2.5 space-y-1">
                                  <div className="font-mono text-[10px]">{r.mpesa_code} • {r.players?.phone_number}</div>
                                  <div className="flex flex-wrap gap-1">
                                    {r.payment_status !== 'paid' && <button onClick={() => verifyPayment(r.id)} className="bg-emerald-600 text-white px-2 py-0.5 rounded text-[11px]">Verify Paid</button>}
                                    <button onClick={() => announceWinner(r.players)} className="bg-amber-600 text-white px-2 py-0.5 rounded text-[11px]">Announce Winner</button>
                                  </div>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {pairs.length > 0 && (
                      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2">
                        <div className="text-xs font-semibold text-amber-400 flex items-center gap-1"><Swords className="w-4 h-4" /> Paired Paid Players (1v1 Matchups)</div>
                        {pairs.map(([a, b], i) => <div key={i} className="flex justify-between bg-slate-950 px-3 py-2 rounded text-xs"><span>{a.efootball_username} ({a.squad_strength})</span><span className="text-amber-400 font-bold">VS</span><span>{b.efootball_username} ({b.squad_strength})</span></div>)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
                    }
                  
