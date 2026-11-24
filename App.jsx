import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Trophy, Users, ShieldCheck, Lock, CheckCircle2, Clock, Plus, Swords, ArrowRight, UserCheck } from 'lucide-react';

// =========================================================
// CHECK YOUR SUPABASE ANON / PUBLISHABLE KEY BELOW
// =========================================================
const CONFIG = {
  SUPABASE_URL: 'https://gpgrimeivilfxfwuniku.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_Qi9wm6onYZoVHe_vT1k33w_s-EbokgT',
  MPESA_NUMBER: '5813215',
  ADMIN_PASSWORD: 'V3mf54',
};

const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

export default function App() {
  const [step, setStep] = useState('signin'); // 'signin' | 'lobbies'
  const [playerProfile, setPlayerProfile] = useState(null);

  const [profileForm, setProfileForm] = useState({
    full_name: '',
    phone_number: '',
    efootball_username: '',
    squad_strength: '3150',
    county: '',
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
    const { data: tData, error } = await supabase
      .from('tournaments')
      .select('*, registrations(id, payment_status)')
      .order('id', { ascending: false });

    if (error) {
      setMsg({ ok: false, text: `Database error: ${error.message}` });
      return;
    }

    if (tData && tData.length > 0) {
      const formatted = tData.map((t) => {
        const paidCount = (t.registrations || []).filter((r) => r.payment_status === 'paid').length;
        const totalPool = paidCount * (t.entry_fee || 50);
        return {
          ...t,
          paid_count: paidCount,
          total_pool: totalPool,
          winner_payout: Math.round(totalPool * 0.6),
          host_fee: Math.round(totalPool * 0.4),
        };
      });
      setTournaments(formatted);
      if (!selectedId) setSelectedId(formatted[0].id);
    } else {
      // Show a default starter lobby so the screen is never empty
      const starter = [
        {
          id: 'starter-1',
          title: 'Daily 50 KES Cup #1',
          entry_fee: 50,
          max_players: 16,
          status: 'open',
          paid_count: 0,
          total_pool: 0,
          winner_payout: 0,
          host_fee: 0,
          isStarter: true,
        },
      ];
      setTournaments(starter);
      setSelectedId('starter-1');
    }
  };

  const fetchRoster = async (tid) => {
    if (!tid || String(tid).startsWith('starter-')) {
      setRoster([]);
      setPairs([]);
      return;
    }
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
        const parsed = JSON.parse(saved);
        setPlayerProfile(parsed);
        setProfileForm(parsed);
      } catch (_) {}
    }
    fetchAll();
  }, []);

  useEffect(() => {
    if (selectedId) fetchRoster(selectedId);
  }, [selectedId]);

  const handleSignInNext = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMsg(null);

    try {
      const cleanPhone = profileForm.phone_number.trim();
      const payload = {
        full_name: profileForm.full_name.trim(),
        phone_number: cleanPhone,
        efootball_username: profileForm.efootball_username.trim(),
        squad_strength: Number(profileForm.squad_strength),
        county: profileForm.county.trim(),
      };

      const { data: player, error } = await supabase
        .from('players')
        .upsert(payload, { onConflict: 'phone_number' })
        .select()
        .single();

      if (error) throw error;

      const activePlayer = player || payload;
      setPlayerProfile(activePlayer);
      localStorage.setItem('efootball_player', JSON.stringify(activePlayer));
      setStep('lobbies');
      fetchAll();
    } catch (err) {
      setMsg({ ok: false, text: err.message || 'Could not save player details. Check your Supabase key.' });
    } finally {
      setLoading(false);
    }
  };

  const ensureRealTournamentId = async () => {
    if (selectedId && !String(selectedId).startsWith('starter-')) return selectedId;
    const { data, error } = await supabase
      .from('tournaments')
      .insert({
        title: 'Daily 50 KES Cup #1',
        entry_fee: 50,
        max_players: 16,
        status: 'open',
      })
      .select()
      .single();
    if (error) throw error;
    setSelectedId(data.id);
    return data.id;
  };

  const handleJoin = async (e) => {
    e.preventDefault();
    if (!playerProfile) {
      setStep('signin');
      return;
    }
    setLoading(true);
    setMsg(null);

    try {
      const realTid = await ensureRealTournamentId();

      const { data: player, error: pErr } = await supabase
        .from('players')
        .upsert(
          {
            full_name: playerProfile.full_name,
            phone_number: playerProfile.phone_number,
            efootball_username: playerProfile.efootball_username,
            squad_strength: Number(playerProfile.squad_strength),
            county: playerProfile.county,
          },
          { onConflict: 'phone_number' }
        )
        .select()
        .single();

      if (pErr) throw pErr;

      const { error: rErr } = await supabase.from('registrations').insert({
        tournament_id: realTid,
        player_id: player.id,
        mpesa_code: mpesaCode.trim().toUpperCase(),
        payment_status: 'pending',
      });

      if (rErr) {
        if (rErr.code === '23505') throw new Error('You already joined this tournament!');
        throw rErr;
      }

      setMsg({ ok: true, text: 'Registered! Awaiting host verification of your 50 KES M-Pesa code.' });
      setMpesaCode('');
      await fetchAll();
      await fetchRoster(realTid);
    } catch (err) {
      setMsg({ ok: false, text: err.message || 'Error joining tournament' });
    } finally {
      setLoading(false);
    }
  };

  const verifyPayment = async (regId) => {
    await supabase.from('registrations').update({ payment_status: 'paid' }).eq('id', regId);
    fetchAll();
    fetchRoster(selectedId);
  };

  const crownWinner = async (player) => {
    if (!player || String(selectedId).startsWith('starter-')) return;
    await supabase
      .from('tournaments')
      .update({
        status: 'completed',
        winner_username: player.efootball_username,
        winner_phone: player.phone_number,
      })
      .eq('id', selectedId);
    fetchAll();
  };

  const createTournament = async () => {
    if (!newTitle.trim()) return;
    const { data, error } = await supabase
      .from('tournaments')
      .insert({
        title: newTitle.trim(),
        entry_fee: 50,
        max_players: Number(newMax),
        status: 'open',
      })
      .select()
      .single();
    if (error) {
      setMsg({ ok: false, text: error.message });
      return;
    }
    setNewTitle('');
    if (data?.id) setSelectedId(data.id);
    fetchAll();
  };

  const generatePairings = () => {
    const paid = roster.filter((r) => r.payment_status === 'paid').map((r) => r.players);
    const shuffled = [...paid].sort(() => Math.random() - 0.5);
    const generated = [];
    for (let i = 0; i < shuffled.length - 1; i += 2) {
      generated.push([shuffled[i], shuffled[i + 1]]);
    }
    setPairs(generated);
  };

  const activeT = tournaments.find((t) => t.id === selectedId) || tournaments[0];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/90 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="w-6 h-6 text-emerald-400" />
            <div>
              <h1 className="font-bold text-base sm:text-lg leading-tight">eFootball Tournaments</h1>
              <p className="text-[11px] text-slate-400">Earn by playing eFootball • 60% Winner • 40% Host</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {step === 'lobbies' && (
              <button
                onClick={() => setStep('signin')}
                className="px-3 py-1.5 rounded-lg text-xs bg-slate-800 border border-slate-700"
              >
                Player Details
              </button>
            )}
            <button
              onClick={() => setAdminOpen(!adminOpen)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-slate-800 border border-slate-700"
            >
              <Lock className="w-3.5 h-3.5 text-amber-400" />
              Admin
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* ADMIN LOGIN & CONTROLS */}
        {adminOpen && (
          <div className="bg-amber-950/20 border border-amber-500/30 rounded-xl p-4 space-y-3">
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
                  onClick={() => {
                    if (passInput === CONFIG.ADMIN_PASSWORD) setIsAdmin(true);
                    else alert('Wrong password');
                  }}
                  className="bg-amber-500 text-slate-950 font-bold px-4 py-2 rounded-lg text-sm"
                >
                  Unlock
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-xs text-amber-300 font-semibold flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4" /> Host Admin Unlocked — Create New Tournament
                </div>
                <div className="flex flex-wrap gap-2">
                  <input
                    type="text"
                    placeholder="New Tournament Name"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="flex-1 min-w-[180px] bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm"
                  />
                  <select
                    value={newMax}
                    onChange={(e) => setNewMax(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="8">8 Players</option>
                    <option value="16">16 Players</option>
                    <option value="32">32 Players</option>
                  </select>
                  <button
                    onClick={createTournament}
                    className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1"
                  >
                    <Plus className="w-4 h-4" /> Create
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 1: LANDING / SIGN IN FREE SCREEN */}
        {step === 'signin' && (
          <div className="max-w-md mx-auto space-y-5">
            <div className="text-center space-y-2">
              <span className="inline-block bg-amber-400 text-slate-950 text-xs font-extrabold px-3 py-1 rounded-full">
                Earn by playing eFootball!
              </span>
              <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                <div className="bg-slate-900 border border-emerald-500/40 rounded-xl p-2.5">
                  <div className="text-[11px] font-bold text-emerald-400">DAILY</div>
                  <div className="text-[11px] text-slate-400">50 KES</div>
                  <div className="text-xs font-bold text-white mt-0.5">60% Pot</div>
                </div>
                <div className="bg-slate-900 border border-emerald-500/40 rounded-xl p-2.5">
                  <div className="text-[11px] font-bold text-emerald-400">WEEKLY</div>
                  <div className="text-[11px] text-slate-400">100 KES</div>
                  <div className="text-xs font-bold text-white mt-0.5">60% Pot</div>
                </div>
                <div className="bg-slate-900 border border-emerald-500/40 rounded-xl p-2.5">
                  <div className="text-[11px] font-bold text-emerald-400">MONTHLY</div>
                  <div className="text-[11px] text-slate-400">500 KES</div>
                  <div className="text-xs font-bold text-white mt-0.5">60% Pot</div>
                </div>
              </div>
            </div>

            <div className="bg-white text-slate-900 rounded-2xl p-6 shadow-xl space-y-4">
              <h2 className="text-xl font-extrabold text-center">Sign In Free</h2>

              <form onSubmit={handleSignInNext} className="space-y-3">
                <input
                  required
                  type="text"
                  placeholder="Full Name"
                  value={profileForm.full_name}
                  onChange={(e) => setProfileForm({ ...profileForm, full_name: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:border-emerald-600"
                />
                <input
                  required
                  type="tel"
                  placeholder="M-Pesa Number e.g. 0712345678"
                  value={profileForm.phone_number}
                  onChange={(e) => setProfileForm({ ...profileForm, phone_number: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:border-emerald-600"
                />
                <input
                  required
                  type="text"
                  placeholder="Username - eFootball username"
                  value={profileForm.efootball_username}
                  onChange={(e) => setProfileForm({ ...profileForm, efootball_username: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:border-emerald-600"
                />
                <input
                  required
                  type="number"
                  placeholder="Account Strength e.g. 3150"
                  value={profileForm.squad_strength}
                  onChange={(e) => setProfileForm({ ...profileForm, squad_strength: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:border-emerald-600"
                />
                <input
                  required
                  type="text"
                  placeholder="County"
                  value={profileForm.county}
                  onChange={(e) => setProfileForm({ ...profileForm, county: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:border-emerald-600"
                />

                {msg && (
                  <div className={`p-2.5 rounded-lg text-xs ${msg.ok ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                    {msg.text}
                  </div>
                )}

                <button
                  disabled={loading}
                  type="submit"
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-lg text-sm flex items-center justify-center gap-2"
                >
                  {loading ? 'Saving...' : 'NEXT'} <ArrowRight className="w-4 h-4" />
                </button>
              </form>

              {playerProfile && (
                <button
                  type="button"
                  onClick={() => setStep('lobbies')}
                  className="w-full text-xs text-emerald-700 font-semibold underline pt-1"
                >
                  Continue as {playerProfile.efootball_username} →
                </button>
              )}
            </div>
          </div>
        )}

        {/* STEP 2: TOURNAMENT LOBBIES & JOIN */}
        {step === 'lobbies' && (
          <>
            {playerProfile && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-emerald-400" />
                  <span>
                    Signed in as <strong>{playerProfile.efootball_username}</strong> ({playerProfile.full_name}) •{' '}
                    <span className="text-emerald-400">{playerProfile.squad_strength}</span>
                  </span>
                </div>
                <button
                  onClick={() => setStep('signin')}
                  className="text-emerald-400 hover:underline font-medium"
                >
                  Edit Details
                </button>
              </div>
            )}

            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2.5">
                Select a Tournament Lobby (Join One or Many)
              </h2>
              <div className="grid sm:grid-cols-2 gap-3">
                {tournaments.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => setSelectedId(t.id)}
                    className={`cursor-pointer rounded-xl p-4 border transition ${
                      activeT?.id === t.id
                        ? 'bg-slate-900 border-emerald-500'
                        : 'bg-slate-900/50 border-slate-800'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-bold text-sm">{t.title}</h3>
                      <span className="text-[10px] uppercase px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-semibold">
                        {t.status}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center bg-slate-950 rounded-lg p-2 text-xs">
                      <div>
                        <span className="text-slate-400 block text-[10px]">Joined</span>
                        <strong>{t.paid_count}/{t.max_players}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">Winner (60%)</span>
                        <strong className="text-emerald-400">{t.winner_payout} KES</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">Host (40%)</span>
                        <strong>{t.host_fee} KES</strong>
                      </div>
                    </div>
                  </div>
                ))}
        
