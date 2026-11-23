import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Trophy, Users, ShieldCheck, Lock, CheckCircle2, Clock, Plus, Swords } from 'lucide-react';

// =========================================================
// EDIT THESE 4 LINES WITH YOUR DETAILS BEFORE COMMITTING
// =========================================================
const CONFIG = {
  SUPABASE_URL: 'https://gpgrimeivilfxfwuniku.supabase.co',
  SUPABASE_ANON_KEY: 'YOUR_SUPABASE_ANON_KEY',
  MPESA_NUMBER: '5813215',       // Your Pochi / Till / M-Pesa number
  ADMIN_PASSWORD: 'V3mf54',    // Password to open Host Admin on the site
};

const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

export default function App() {
  const [tournaments, setTournaments] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [roster, setRoster] = useState([]);
  const [pairs, setPairs] = useState([]);

  const [form, setForm] = useState({
    full_name: '',
    phone_number: '',
    efootball_username: '',
    squad_strength: '3100',
    mpesa_code: '',
  });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);

  const [adminOpen, setAdminOpen] = useState(false);
  const [passInput, setPassInput] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newMax, setNewMax] = useState('16');

  const fetchAll = async () => {
    const { data: tData } = await supabase
      .from('tournaments')
      .select('*, registrations(id, payment_status)')
      .order('id', { ascending: false });

    if (tData) {
      const formatted = tData.map((t) => {
        const paidCount = (t.registrations || []).filter((r) => r.payment_status === 'paid').length;
        const totalPool = paidCount * t.entry_fee;
        return {
          ...t,
          paid_count: paidCount,
          total_pool: totalPool,
          winner_payout: Math.round(totalPool * 0.6),
          host_fee: Math.round(totalPool * 0.4),
        };
      });
      setTournaments(formatted);
      if (!selectedId && formatted.length > 0) setSelectedId(formatted[0].id);
    }
  };

  const fetchRoster = async (tid) => {
    const { data } = await supabase
      .from('registrations')
      .select('*, players(*)')
      .eq('tournament_id', tid)
      .order('joined_at', { ascending: true });
    setRoster(data || []);
    setPairs([]);
  };

  useEffect(() => {
    fetchAll();
  }, []);

  useEffect(() => {
    if (selectedId) fetchRoster(selectedId);
  }, [selectedId]);

  const handleJoin = async (e) => {
    e.preventDefault();
    if (!selectedId) return;
    setLoading(true);
    setMsg(null);

    try {
      const cleanPhone = form.phone_number.trim();
      const { data: player, error: pErr } = await supabase
        .from('players')
        .upsert(
          {
            full_name: form.full_name.trim(),
            phone_number: cleanPhone,
            efootball_username: form.efootball_username.trim(),
            squad_strength: Number(form.squad_strength),
          },
          { onConflict: 'phone_number' }
        )
        .select()
        .single();

      if (pErr) throw pErr;

      const { error: rErr } = await supabase.from('registrations').insert({
        tournament_id: selectedId,
        player_id: player.id,
        mpesa_code: form.mpesa_code.trim().toUpperCase(),
        payment_status: 'pending',
      });

      if (rErr) {
        if (rErr.code === '23505') throw new Error('You already joined this tournament!');
        throw rErr;
      }

      setMsg({ ok: true, text: 'Registered! Awaiting collateral host verification of your 50 KES M-Pesa code.' });
      setForm({ ...form, mpesa_code: '' });
      fetchAll();
      fetchRoster(selectedId);
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
    await supabase.from('tournaments').insert({
      title: newTitle.trim(),
      entry_fee: 50,
      max_players: Number(newMax),
      status: 'open',
    });
    setNewTitle('');
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

  const activeT = tournaments.find((t) => t.id === selectedId);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/90 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="w-6 h-6 text-emerald-400" />
            <div>
              <h1 className="font-bold text-base sm:text-lg leading-tight">eFootball Cash Arena</h1>
              <p className="text-[11px] text-slate-400">50 KES Entry • 60% Winner • 40% Host</p>
            </div>
          </div>

          <button
            onClick={() => setAdminOpen(!adminOpen)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-slate-800 border border-slate-700"
          >
            <Lock className="w-3.5 h-3.5 text-amber-400" />
            Host Admin
          </button>
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
                  <ShieldCheck className="w-4 h-4" /> Collateral Admin Unlocked — Create New Tournament
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

        {/* TOURNAMENT LOBBIES */}
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
                  selectedId === t.id
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
          </div>
        </div>

        {/* REGISTRATION + ROSTER */}
        {activeT && (
          <div className="grid md:grid-cols-12 gap-6">
            {/* JOIN FORM */}
            <div className="md:col-span-5 bg-slate-900 border border-slate-800 rounded-xl p-5">
              <h3 className="font-bold text-base mb-1">Join {activeT.title}</h3>
              <p className="text-xs text-slate-400 mb-4">
                Send <strong className="text-white">{activeT.entry_fee} KES</strong> via M-Pesa to{' '}
                <strong className="text-emerald-400">{CONFIG.MPESA_NUMBER}</strong>, then fill your details below:
              </p>

              <form onSubmit={handleJoin} className="space-y-3">
                <input
                  required
                  type="text"
                  placeholder="Your Full Name"
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm"
                />
                <input
                  required
                  type="tel"
                  placeholder="M-Pesa Phone (e.g. 0712345678)"
                  value={form.phone_number}
                  onChange={(e) => setForm({ ...form, phone_number: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    required
                    type="text"
                    placeholder="eFootball Username"
                    value={form.efootball_username}
                    onChange={(e) => setForm({ ...form, efootball_username: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm"
                  />
                  <input
                    required
                    type="number"
                    placeholder="Squad Strength"
                    value={form.squad_strength}
                    onChange={(e) => setForm({ ...form, squad_strength: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <input
                  required
                  type="text"
                  placeholder="M-Pesa Code (e.g. SK94H2P10X)"
                  value={form.mpesa_code}
                  onChange={(e) => setForm({ ...form, mpesa_code: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm uppercase font-mono"
                />

                {msg && (
                  <div className={`p-2.5 rounded-lg text-xs ${msg.ok ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
                    {msg.text}
                  </div>
                )}

                <button
                  disabled={loading}
                  type="submit"
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2.5 rounded-lg text-sm"
                >
                  {loading ? 'Registering...' : 'Join Tournament (50 KES)'}
                </button>
              </form>
            </div>

            {/* ROSTER & ESCROW */}
            <div className="md:col-span-7 space-y-4">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex justify-between items-center">
                <div>
                  <span className="text-[11px] text-slate-400">Total Escrow Pot</span>
                  <div className="text-xl font-extrabold">{activeT.total_pool} KES</div>
                </div>
                <div className="text-right">
                  <span className="text-[11px] text-emerald-400">Champion Gets (60%)</span>
                  <div className="text-xl font-extrabold text-emerald-400">{activeT.winner_payout} KES</div>
                </div>
              </div>

              {activeT.winner_username && (
                <div className="bg-emerald-950/40 border border-emerald-500/40 rounded-xl p-3 text-xs text-emerald-300">
                  Champion: <strong>{activeT.winner_username}</strong> ({activeT.winner_phone}) — 60% Payout Disbursed
                </div>
              )}

              <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-800 flex justify-between items-center">
                  <span className="text-sm font-semibold flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-emerald-400" /> Gamers in Lobby ({roster.length})
                  </span>
                  {isAdmin && (
                    <button
                      onClick={generatePairings}
                      className="text-xs bg-amber-500 text-slate-950 font-bold px-2.5 py-1 rounded"
                    >
                      Pair Opponents
                    </button>
                  )}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950 text-slate-400 uppercase">
                      <tr>
                        <th className="px-3 py-2">Gamer</th>
                        <th className="px-3 py-2">Squad</th>
                        <th className="px-3 py-2">Status</th>
                        {isAdmin && <th className="px-3 py-2">Admin</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {roster.map((r) => (
                        <tr key={r.id}>
                          <td className="px-3 py-2.5">
                            <div className="font-semibold">{r.players?.efootball_username}</div>
                            <div className="text-slate-500">{r.players?.full_name}</div>
                          </td>
                          <td className="px-3 py-2.5 font-mono text-emerald-400">{r.players?.squad_strength}</td>
                          <td className="px-3 py-2.5">
                            {r.payment_status === 'paid' ? (
                              <span className="text-emerald-400 flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Paid
                              </span>
                            ) : (
                              <span className="text-amber-400 flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5" /> Pending
                              </span>
                            )}
                          </td>
                          {isAdmin && (
                            <td className="px-3 py-2.5 space-y-1">
                              <div className="font-mono text-[10px] text-slate-300">
                                {r.mpesa_code} • {r.players?.phone_number}
                              </div>
                              <div className="flex gap-1">
                                {r.payment_status !== 'paid' && (
                                  <button
                                    onClick={() => verifyPayment(r.id)}
                                    className="bg-emerald-600 text-white px-2 py-0.5 rounded text-[11px]"
                                  >
                                    Verify
                                  </button>
                                )}
                                <button
                                  onClick={() => crownWinner(r.players)}
                                  className="bg-amber-600 text-white px-2 py-0.5 rounded text-[11px]"
                                >
                                  Crown Winner
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {pairs.length > 0 && (
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2">
                  <div className="text-xs font-semibold text-amber-400 flex items-center gap-1">
                    <Swords className="w-4 h-4" /> Generated 1v1 Matchups
                  </div>
                  {pairs.map(([p1, p2], idx) => (
                    <div key={idx} className="flex justify-between bg-slate-950 px-3 py-2 rounded text-xs">
                      <span>{p1.efootball_username} ({p1.squad_strength})</span>
                      <span className="text-amber-400 font-bold">VS</span>
                      <span>{p2.efootball_username} ({p2.squad_strength})</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
