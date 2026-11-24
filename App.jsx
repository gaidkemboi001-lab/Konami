import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Trophy, Users, ShieldCheck, Lock, CheckCircle2, Clock, Plus, Swords, ArrowRight, UserCheck } from 'lucide-react';

const CONFIG = {
  SUPABASE_URL: 'https://gpgrimeivilfxfwuniku.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_Qi9wm6onYZoVHe_vT1k33w_s-EbokgT',
  MPESA_NUMBER: '5813215',
  ADMIN_PASSWORD: 'V3mf54',
};

const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

export default function App() {
  const [step, setStep] = useState('signin');
  const [player, setPlayer] = useState(null);
  const [profile, setProfile] = useState({
    full_name: '', phone_number: '', efootball_username: '', squad_strength: '3150', county: '',
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
  const [newMax, setNewMax] = useState('16');

  const fetchAll = async () => {
    const { data, error } = await supabase
      .from('tournaments')
      .select('*, registrations(id, payment_status)')
      .order('id', { ascending: false });
    if (error) return setMsg({ ok: false, text: error.message });
    if (data && data.length > 0) {
      const list = data.map((t) => {
        const paid = (t.registrations || []).filter((r) => r.payment_status === 'paid').length;
        const pool = paid * (t.entry_fee || 50);
        return { ...t, paid_count: paid, total_pool: pool, winner_payout: Math.round(pool * 0.6), host_fee: Math.round(pool * 0.4) };
      });
      setTournaments(list);
      if (!selectedId) setSelectedId(list[0].id);
    } else {
      setTournaments([{ id: 'starter-1', title: 'Daily 50 KES Cup #1', entry_fee: 50, max_players: 16, status: 'open', paid_count: 0, total_pool: 0, winner_payout: 0, host_fee: 0 }]);
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
        setProfile(p);
      } catch (_) {}
    }
    fetchAll();
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
        county: profile.county.trim(),
      };
      const { data, error } = await supabase.from('players').upsert(row, { onConflict: 'phone_number' }).select().single();
      if (error) throw error;
      const active = data || row;
      setPlayer(active);
      localStorage.setItem('efootball_player', JSON.stringify(active));
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
      let tid = selectedId;
      if (!tid || String(tid).startsWith('starter-')) {
        const { data: created, error: cErr } = await supabase.from('tournaments').insert({ title: 'Daily 50 KES Cup #1', entry_fee: 50, max_players: 16, status: 'open' }).select().single();
        if (cErr) throw cErr;
        tid = created.id;
        setSelectedId(tid);
      }
      const { data: pData, error: pErr } = await supabase.from('players').upsert(player, { onConflict: 'phone_number' }).select().single();
      if (pErr) throw pErr;
      const { error: rErr } = await supabase.from('registrations').insert({ tournament_id: tid, player_id: pData.id, mpesa_code: mpesaCode.trim().toUpperCase(), payment_status: 'pending' });
      if (rErr) throw new Error(rErr.code === '23505' ? 'You already joined this lobby!' : rErr.message);
      setMsg({ ok: true, text: 'Registered! Awaiting host M-Pesa verification.' });
      setMpesaCode('');
      await fetchAll();
      await fetchRoster(tid);
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const verifyPayment = async (id) => {
    await supabase.from('registrations').update({ payment_status: 'paid' }).eq('id', id);
    fetchAll();
    fetchRoster(selectedId);
  };

  const crownWinner = async (p) => {
    if (!p || String(selectedId).startsWith('starter-')) return;
    await supabase.from('tournaments').update({ status: 'completed', winner_username: p.efootball_username, winner_phone: p.phone_number }).eq('id', selectedId);
    fetchAll();
  };

  const createTournament = async () => {
    if (!newTitle.trim()) return;
    const { data, error } = await supabase.from('tournaments').insert({ title: newTitle.trim(), entry_fee: 50, max_players: Number(newMax), status: 'open' }).select().single();
    if (error) return setMsg({ ok: false, text: error.message });
    setNewTitle('');
    if (data?.id) setSelectedId(data.id);
    fetchAll();
  };

  const generatePairings = () => {
    const paid = roster.filter((r) => r.payment_status === 'paid').map((r) => r.players);
    const shuffled = [...paid].sort(() => Math.random() - 0.5);
    const out = [];
    for (let i = 0; i < shuffled.length - 1; i += 2) out.push([shuffled[i], shuffled[i + 1]]);
    setPairs(out);
  };

  const activeT = tournaments.find((t) => t.id === selectedId) || tournaments[0];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/90 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="w-6 h-6 text-emerald-400" />
            <div>
              <h1 className="font-bold text-base">eFootball Tournaments</h1>
              <p className="text-[11px] text-slate-400">Earn by playing eFootball • 60% Winner • 40% Host</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {step === 'lobbies' && <button onClick={() => setStep('signin')} className="px-3 py-1.5 rounded-lg text-xs bg-slate-800 border border-slate-700">Player Details</button>}
            <button onClick={() => setAdminOpen(!adminOpen)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-slate-800 border border-slate-700">
              <Lock className="w-3.5 h-3.5 text-amber-400" /> Admin
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {adminOpen && (
          <div className="bg-amber-950/20 border border-amber-500/30 rounded-xl p-4 space-y-3">
            {!isAdmin ? (
              <div className="flex gap-2">
                <input type="password" placeholder="Enter Host Admin Password" value={passInput} onChange={(e) => setPassInput(e.target.value)} className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm" />
                <button onClick={() => (passInput === CONFIG.ADMIN_PASSWORD ? setIsAdmin(true) : alert('Wrong password'))} className="bg-amber-500 text-slate-950 font-bold px-4 py-2 rounded-lg text-sm">Unlock</button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-xs text-amber-300 font-semibold flex items-center gap-1 w-full"><ShieldCheck className="w-4 h-4" /> Host Admin Unlocked</span>
                <input type="text" placeholder="New Tournament Name" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} className="flex-1 min-w-[180px] bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm" />
                <select value={newMax} onChange={(e) => setNewMax(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm">
                  <option value="8">8 Players</option><option value="16">16 Players</option><option value="32">32 Players</option>
                </select>
                <button onClick={createTournament} className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1"><Plus className="w-4 h-4" /> Create</button>
              </div>
            )}
          </div>
        )}

        {step === 'signin' && (
          <div className="max-w-md mx-auto space-y-5">
            <div className="text-center space-y-2">
              <span className="inline-block bg-amber-400 text-slate-950 text-xs font-extrabold px-3 py-1 rounded-full">Earn by playing eFootball!</span>
              <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                <div className="bg-slate-900 border border-emerald-500/40 rounded-xl p-2.5"><div className="text-[11px] font-bold text-emerald-400">DAILY</div><div className="text-[11px] text-slate-400">50 KES</div><div className="text-xs font-bold mt-0.5">60% Pot</div></div>
                <div className="bg-slate-900 border border-emerald-500/40 rounded-xl p-2.5"><div className="text-[11px] font-bold text-emerald-400">WEEKLY</div><div className="text-[11px] text-slate-400">100 KES</div><div className="text-xs font-bold mt-0.5">60% Pot</div></div>
                <div className="bg-slate-900 border border-emerald-500/40 rounded-xl p-2.5"><div className="text-[11px] font-bold text-emerald-400">MONTHLY</div><div className="text-[11px] text-slate-400">500 KES</div><div className="text-xs font-bold mt-0.5">60% Pot</div></div>
              </div>
            </div>
            <div className="bg-white text-slate-900 rounded-2xl p-6 shadow-xl space-y-4">
              <h2 className="text-xl font-extrabold text-center">Sign In Free</h2>
              <form onSubmit={handleSignIn} className="space-y-3">
                <input required type="text" placeholder="Full Name" value={profile.full_name} onChange={(e) => setProfile({ ...profile, full_name: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm" />
                <input required type="tel" placeholder="M-Pesa Number e.g. 0712345678" value={profile.phone_number} onChange={(e) => setProfile({ ...profile, phone_number: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm" />
                <input required type="text" placeholder="Username - eFootball username" value={profile.efootball_username} onChange={(e) => setProfile({ ...profile, efootball_username: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm" />
                <input required type="number" placeholder="Account Strength e.g. 3150" value={profile.squad_strength} onChange={(e) => setProfile({ ...profile, squad_strength: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm" />
                <input required type="text" placeholder="County" value={profile.county} onChange={(e) => setProfile({ ...profile, county: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm" />
                {msg && <div className={`p-2.5 rounded-lg text-xs ${msg.ok ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>{msg.text}</div>}
                <button disabled={loading} type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-lg text-sm flex items-center justify-center gap-2">
                  {loading ? 'Saving...' : 'NEXT'} <ArrowRight className="w-4 h-4" />
                </button>
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
                  <div className="flex justify-between mb-2"><h3 className="font-bold text-sm">{t.title}</h3><span className="text-[10px] uppercase px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-semibold">{t.status}</span></div>
                  <div className="grid grid-cols-3 gap-2 text-center bg-slate-950 rounded-lg p-2 text-xs">
                    <div><span className="text-slate-400 block text-[10px]">Joined</span><strong>{t.paid_count}/{t.max_players}</strong></div>
                    <div><span className="text-slate-400 block text-[10px]">Winner (60%)</span><strong className="text-emerald-400">{t.winner_payout} KES</strong></div>
                    <div><span className="text-slate-400 block text-[10px]">Host (40%)</span><strong>{t.host_fee} KES</strong></div>
                  </div>
                </div>
              ))}
            </div>
            {activeT && (
              <div className="grid md:grid-cols-12 gap-6">
                <div className="md:col-span-5 bg-slate-900 border border-slate-800 rounded-xl p-5">
                  <h3 className="font-bold text-base mb-1">Join {activeT.title}</h3>
                  <p className="text-xs text-slate-400 mb-4">Send <strong className="text-white">{activeT.entry_fee} KES</strong> via M-Pesa to <strong className="text-emerald-400">{CONFIG.MPESA_NUMBER}</strong>, then enter code:</p>
                  <form onSubmit={handleJoin} className="space-y-3">
                    <input required type="text" placeholder="M-Pesa Code (e.g. SK94H2P10X)" value={mpesaCode} onChange={(e) => setMpesaCode(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-sm uppercase font-mono" />
                    {msg && <div className={`p-2.5 rounded-lg text-xs ${msg.ok ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>{msg.text}</div>}
                    <button disabled={loading} type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2.5 rounded-lg text-sm">{loading ? 'Registering...' : `Join (${activeT.entry_fee} KES)`}</button>
                  </form>
                </div>
                <div className="md:col-span-7 space-y-4">
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex justify-between">
                    <div><span className="text-[11px] text-slate-400">Escrow Pot</span><div className="text-xl font-extrabold">{activeT.total_pool} KES</div></div>
                    <div className="text-right"><span className="text-[11px] text-emerald-400">Winner (60%)</span><div className="text-xl font-extrabold text-emerald-400">{activeT.winner_payout} KES</div></div>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-800 flex justify-between items-center">
                      <span className="text-sm font-semibold flex items-center gap-1.5"><Users className="w-4 h-4 text-emerald-400" /> Gamers ({roster.length})</span>
                      {isAdmin && <button onClick={generatePairings} className="text-xs bg-amber-500 text-slate-950 font-bold px-2.5 py-1 rounded">Pair Opponents</button>}
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
                                <div className="flex gap-1">
                                  {r.payment_status !== 'paid' && <button onClick={() => verifyPayment(r.id)} className="bg-emerald-600 text-white px-2 py-0.5 rounded text-[11px]">Verify</button>}
                                  <button onClick={() => crownWinner(r.players)} className="bg-amber-600 text-white px-2 py-0.5 rounded text-[11px]">Crown</button>
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
                      <div className="text-xs font-semibold text-amber-400 flex items-center gap-1"><Swords className="w-4 h-4" /> Matchups</div>
                      {pairs.map(([a, b], i) => (
                        <div key={i} className="flex justify-between bg-slate-950 px-3 py-2 rounded text-xs"><span>{a.efootball_username} ({a.squad_strength})</span><span className="text-amber-400 font-bold">VS</span><span>{b.efootball_username} ({b.squad_strength})</span></div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
    }
                  
