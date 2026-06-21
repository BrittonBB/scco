import { useState, useEffect, useCallback, useRef } from "react";
import { Trophy, Users, User, Plus, Medal, Trash2, ChevronRight, ChevronDown, X, Crown, Repeat, Coins, BarChart2, Settings, Wifi, WifiOff } from "lucide-react";
import { loadKey, saveKey, subscribeToChanges } from "./storage";

// ---- Toast ----
function useToast() {
  const [toast, setToast] = useState(null);
  const timerRef = useRef(null);
  const show = useCallback((type = "ok") => {
    clearTimeout(timerRef.current);
    setToast({ type });
    timerRef.current = setTimeout(() => setToast(null), type === "ok" ? 1800 : 3500);
  }, []);
  return [toast, show];
}
function Toast({ toast }) {
  if (!toast) return null;
  const ok = toast.type === "ok";
  return (
    <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: ok ? "#064e3b" : "#7f1d1d", color: ok ? "#d1fae5" : "#fee2e2", padding: "10px 20px", borderRadius: 24, fontSize: 14, fontWeight: 700, zIndex: 999, boxShadow: "0 4px 16px rgba(0,0,0,0.35)", whiteSpace: "nowrap", pointerEvents: "none" }}>
      {ok ? "✓ Saved" : "⚠ Save failed — check connection"}
    </div>
  );
}

// ---- Scoring ----
const DEFAULT_POINTS = { 1: 10, 2: 8, 3: 6, 4: 5, 5: 4, 6: 3 };
const PARTICIPATION = 2;
const pointsForPlace = (place, scheme) => (scheme[place] != null ? scheme[place] : PARTICIPATION);

// ---- Themes ----
const THEMES = {
  default:   { label: "Classic",   emoji: "🏅", panelBg: "linear-gradient(135deg,#1e3a8a,#3b0764)", text: "#f8fafc", accent: "#fbbf24", dark: true },
  poker:     { label: "Poker",     emoji: "♠️", panelBg: "radial-gradient(ellipse at 50% -10%, #1f8a4c 0%, #0c4026 72%)", text: "#fdfdfd", accent: "#e8c873", dark: true, suits: true },
  spikeball: { label: "Spikeball", emoji: "🏐", panelBg: "linear-gradient(160deg,#fcd34d,#f59e0b)", text: "#7c2d12", accent: "#c2410c", dark: false },
  baseball:  { label: "9/9/9",     emoji: "⚾", panelBg: "radial-gradient(ellipse at 50% 16%, #3eb96b 0%, #166534 80%)", text: "#fff", accent: "#fde68a", dark: true },
  tennis:    { label: "Tennis",    emoji: "🎾", panelBg: "radial-gradient(ellipse at 50% 14%, #3b82f6 0%, #1e3a8a 82%)", text: "#fff", accent: "#bef264", dark: true },
  cornhole:  { label: "Cornhole",  emoji: "🌽", panelBg: "linear-gradient(160deg,#ef4444,#7f1d1d)", text: "#fff", accent: "#fde68a", dark: true },
  beerpong:  { label: "Beer Pong", emoji: "🍺", panelBg: "linear-gradient(160deg,#dc2626,#991b1b)", text: "#fff", accent: "#fef08a", dark: true },
  golf:      { label: "Golf",      emoji: "⛳", panelBg: "linear-gradient(160deg,#86efac,#16a34a)", text: "#14532d", accent: "#166534", dark: false },
  darts:     { label: "Darts",     emoji: "🎯", panelBg: "radial-gradient(ellipse at 50% -10%, #334155, #0f172a 75%)", text: "#f8fafc", accent: "#ef4444", dark: true },
  trivia:    { label: "Trivia",    emoji: "🧠", panelBg: "linear-gradient(160deg,#8b5cf6,#4c1d95)", text: "#fff", accent: "#fde68a", dark: true },
  beerdie:   { label: "Beer Die",  emoji: "🎲", panelBg: "radial-gradient(ellipse at 50% 12%, #b5793f 0%, #5c3a1e 85%)", text: "#fff", accent: "#fcd34d", dark: true },
};
const THEME_ORDER = ["poker", "spikeball", "baseball", "tennis", "beerdie", "cornhole", "beerpong", "golf", "darts", "trivia", "default"];
const getTheme = (k) => THEMES[k] || THEMES.default;

// ---- Round-robin engine (balanced 5-player doubles) ----
function genRoundRobin(ids) {
  if (!ids || ids.length !== 5) return null;
  const F = [[0, [1, 4], [2, 3]], [1, [0, 2], [3, 4]], [2, [1, 3], [0, 4]], [3, [2, 4], [0, 1]], [4, [0, 3], [1, 2]]];
  return F.map((f, i) => ({ round: i, sitter: ids[f[0]], teamA: [ids[f[1][0]], ids[f[1][1]]], teamB: [ids[f[2][0]], ids[f[2][1]]] }));
}
function computeRRStandings(ev) {
  const stats = {};
  (ev.players || []).forEach((p) => (stats[p] = { id: p, wins: 0, losses: 0, diff: 0 }));
  (ev.schedule || []).forEach((r, i) => {
    const m = (ev.matches || {})[i]; if (!m || !m.winner) return;
    const aWin = m.winner === "A"; const sa = Number(m.scoreA) || 0, sb = Number(m.scoreB) || 0;
    r.teamA.forEach((p) => { if (stats[p]) { stats[p][aWin ? "wins" : "losses"]++; stats[p].diff += sa - sb; } });
    r.teamB.forEach((p) => { if (stats[p]) { stats[p][aWin ? "losses" : "wins"]++; stats[p].diff += sb - sa; } });
  });
  const arr = Object.values(stats).sort((x, y) => y.wins - x.wins || y.diff - x.diff);
  let place = 0, prevKey = null, seen = 0;
  arr.forEach((s) => { seen++; const key = s.wins + "/" + s.diff; if (key !== prevKey) { place = seen; prevKey = key; } s.place = place; s.played = s.wins + s.losses; });
  return arr;
}
function computeLedgerStandings(ev) {
  const players = ev.players && ev.players.length ? ev.players : [];
  const arr = players.map((id) => { const l = (ev.ledger || {})[id] || {}; const buyIn = Number(l.buyIn) || 0, cashOut = Number(l.cashOut) || 0; return { id, buyIn, cashOut, net: cashOut - buyIn }; });
  arr.sort((a, b) => b.net - a.net);
  let place = 0, prev = null, seen = 0;
  arr.forEach((s) => { seen++; if (s.net !== prev) { place = seen; prev = s.net; } s.place = place; });
  return arr;
}
function computeInningsStandings(ev) {
  const players = ev.players && ev.players.length ? ev.players : [];
  const arr = players.map((id) => ({ id, innings: Math.max(0, Math.min(9, Number((ev.progress || {})[id]) || 0)) }));
  arr.sort((a, b) => b.innings - a.innings);
  let place = 0, prev = null, seen = 0;
  arr.forEach((s) => { seen++; if (s.innings !== prev) { place = seen; prev = s.innings; } s.place = place; });
  return arr;
}
function computeGolfStandings(ev) {
  const players = ev.players && ev.players.length ? ev.players : [];
  const arr = players.map((id) => {
    const card = (ev.scores || {})[id] || {};
    const holesPlayed = Object.keys(card).filter((h) => card[h] != null && card[h] !== "").length;
    const total = Object.values(card).reduce((s, v) => s + (Number(v) || 0), 0);
    return { id, total, holesPlayed };
  });
  arr.sort((a, b) => {
    if (a.holesPlayed === 0 && b.holesPlayed === 0) return 0;
    if (a.holesPlayed === 0) return 1;
    if (b.holesPlayed === 0) return -1;
    return a.total - b.total || b.holesPlayed - a.holesPlayed;
  });
  let place = 0, prev = null, seen = 0;
  arr.forEach((s) => {
    seen++;
    const key = s.holesPlayed > 0 ? s.total + "/" + s.holesPlayed : "none";
    if (key !== prev) { place = seen; prev = key; }
    s.place = s.holesPlayed > 0 ? place : 99;
  });
  return arr;
}

const pairKey = (a, b) => [a, b].slice().sort().join("|");
function tennisPairings(players) {
  const ps = players || []; const out = [];
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) out.push({ a: ps[i], b: ps[j], key: pairKey(ps[i], ps[j]) });
  return out;
}
function genTennisRounds(players) {
  const ps = (players || []).slice();
  if (ps.length < 2) return [];
  const arr = ps.slice(); if (arr.length % 2 === 1) arr.push(null);
  const n = arr.length; const fixed = arr[0]; let rot = arr.slice(1); const rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const lineup = [fixed, ...rot]; const matches = []; let bye = null;
    for (let i = 0; i < n / 2; i++) {
      const a = lineup[i], b = lineup[n - 1 - i];
      if (a === null) bye = b; else if (b === null) bye = a; else matches.push({ a, b, key: pairKey(a, b) });
    }
    rounds.push({ bye, matches });
    rot = [rot[rot.length - 1], ...rot.slice(0, rot.length - 1)];
  }
  return rounds;
}
function computeTennisStandings(ev) {
  const players = ev.players && ev.players.length ? ev.players : [];
  const wins = {}, losses = {}; players.forEach((p) => { wins[p] = 0; losses[p] = 0; });
  const R = ev.results || {};
  tennisPairings(players).forEach((m) => { const w = R[m.key]; if (w === m.a) { wins[m.a]++; losses[m.b]++; } else if (w === m.b) { wins[m.b]++; losses[m.a]++; } });
  const arr = players.map((id) => ({ id, wins: wins[id] || 0, losses: losses[id] || 0 }));
  arr.sort((x, y) => y.wins - x.wins || x.losses - y.losses);
  let place = 0, prev = null, seen = 0;
  arr.forEach((s) => { seen++; const k = s.wins + "/" + s.losses; if (k !== prev) { place = seen; prev = k; } s.place = place; s.played = s.wins + s.losses; });
  return arr;
}

const YEAR = 2026;
const KEYS = {
  competitors: `scco:${YEAR}:competitors`,
  teams:       `scco:${YEAR}:teams`,
  events:      `scco:${YEAR}:events`,
  scheme:      `scco:${YEAR}:scheme`,
  golfCard:    (id) => `scco:${YEAR}:golf:${id}`,
  rrMatch:     (evId, round) => `scco:${YEAR}:rr:${evId}:${round}`,
  pokerEntry:  (evId, playerId) => `scco:${YEAR}:poker:${evId}:${playerId}`,
  tennisMatch: (evId, matchKey) => `scco:${YEAR}:tennis:${evId}:${matchKey}`,
  innings:     (evId, playerId) => `scco:${YEAR}:innings:${evId}:${playerId}`,
};
// Legacy keys from before year-scoping — used once to migrate data
const LEGACY_KEYS = { competitors: "scco:competitors", teams: "scco:teams", events: "scco:events", scheme: "scco:scheme" };
const uid = () => Math.random().toString(36).slice(2, 9);
const SEED_NAMES = ["Colby Jackson", "Nathan Platter", "Britton Blanchard", "Chris Freese", "Lucas Noland"];

export default function App() {
  const [competitors, setCompetitors] = useState([]);
  const [teams, setTeams] = useState([]);
  const [events, setEvents] = useState([]);
  const [scheme, setScheme] = useState(DEFAULT_POINTS);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("leaderboard");
  const [online, setOnline] = useState(navigator.onLine);
  const [toast, showToast] = useToast();

  const refresh = useCallback(async () => {
    const [c, t, e, s] = await Promise.all([loadKey(KEYS.competitors, []), loadKey(KEYS.teams, []), loadKey(KEYS.events, []), loadKey(KEYS.scheme, DEFAULT_POINTS)]);
    setCompetitors(c); setTeams(t); setEvents(e); setScheme(s);
  }, []);

  useEffect(() => {
    (async () => {
      // One-time migration: if new year-scoped keys are empty, copy from legacy keys
      const alreadyMigrated = await loadKey(KEYS.events, null);
      if (alreadyMigrated == null) {
        const [legacyC, legacyT, legacyE, legacyS] = await Promise.all([
          loadKey(LEGACY_KEYS.competitors, null),
          loadKey(LEGACY_KEYS.teams, null),
          loadKey(LEGACY_KEYS.events, null),
          loadKey(LEGACY_KEYS.scheme, null),
        ]);
        if (legacyE != null) {
          await Promise.all([
            legacyC != null && saveKey(KEYS.competitors, legacyC),
            legacyT != null && saveKey(KEYS.teams, legacyT),
            saveKey(KEYS.events, legacyE),
            legacyS != null && saveKey(KEYS.scheme, legacyS),
          ]);
        }
      }

      // Load existing data first — never overwrite what's already there
      let curr = await loadKey(KEYS.competitors, []);
      const have = new Set(curr.map((c) => c.name.trim().toLowerCase()));
      const missing = SEED_NAMES.filter((n) => !have.has(n.toLowerCase()));
      if (missing.length) { curr = [...curr, ...missing.map((n) => ({ id: uid(), name: n }))]; await saveKey(KEYS.competitors, curr); }
      setCompetitors(curr);

      const [t, s] = await Promise.all([loadKey(KEYS.teams, []), loadKey(KEYS.scheme, DEFAULT_POINTS)]);
      setTeams(t); setScheme(s);

      let ev = await loadKey(KEYS.events, null);
      const fiveIds = SEED_NAMES.map((n) => curr.find((c) => c.name.toLowerCase() === n.toLowerCase())?.id).filter(Boolean);

      if (ev == null) {
        // Brand new — seed all events
        ev = [
          { id: uid(), name: "Poker", type: "poker", theme: "poker", players: curr.map((c) => c.id), ledger: {}, done: false },
          { id: uid(), name: "Spikeball", type: "roundrobin", theme: "spikeball", players: fiveIds, schedule: genRoundRobin(fiveIds) || [], matches: {}, done: false },
          { id: uid(), name: "9/9/9", type: "innings", theme: "baseball", players: curr.map((c) => c.id), progress: {}, done: false },
          { id: uid(), name: "Tennis", type: "tournament", theme: "tennis", players: fiveIds, results: {}, done: false },
          { id: uid(), name: "Beer Die", type: "roundrobin", theme: "beerdie", players: fiveIds, schedule: genRoundRobin(fiveIds) || [], matches: {}, done: false },
        ];
        await saveKey(KEYS.events, ev);
      }
      // Never touch existing events on reload — just display them as-is
      setEvents(ev);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    const unsub = subscribeToChanges((key) => {
      if (key) refresh();
    });
    return unsub;
  }, [refresh]);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  const derivedPlaces = {};
  for (const ev of events) {
    if (!ev.done) continue;
    let st = null;
    if (ev.type === "roundrobin") st = computeRRStandings(ev);
    else if (ev.type === "poker") st = computeLedgerStandings(ev);
    else if (ev.type === "innings") st = computeInningsStandings(ev);
    else if (ev.type === "tournament") st = computeTennisStandings(ev);
    else if (ev.type === "golf") st = computeGolfStandings(ev).filter((s) => s.place !== 99);
    if (st) derivedPlaces[ev.id] = Object.fromEntries(st.map((s) => [s.id, s.place]));
  }

  const standings = competitors.map((c) => {
    const breakdown = []; let total = 0;
    for (const ev of events) {
      if (ev.type === "roundrobin" || ev.type === "poker" || ev.type === "innings" || ev.type === "tournament" || ev.type === "golf") {
        const place = derivedPlaces[ev.id]?.[c.id];
        if (place != null) { const pts = pointsForPlace(place, scheme); total += pts; breakdown.push({ event: ev.name, theme: ev.theme, place, pts }); }
      } else {
        for (const r of ev.results) {
          const hit = (ev.type === "individual" && r.competitorId === c.id) || (ev.type === "team" && r.teamMembers && r.teamMembers.includes(c.id));
          if (hit) { const pts = pointsForPlace(r.place, scheme); total += pts; breakdown.push({ event: ev.name, theme: ev.theme, place: r.place, pts }); }
        }
      }
    }
    return { ...c, total, breakdown, events: breakdown.length };
  }).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  const [showSettings, setShowSettings] = useState(false);

  if (loading) return <div style={{ minHeight: 480, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui" }}><div style={{ textAlign: "center", color: "#64748b" }}><Trophy size={32} style={{ marginBottom: 8 }} /><div>Loading the Games…</div></div></div>;

  return (
    <div style={{ fontFamily: "-apple-system, system-ui, sans-serif", maxWidth: 760, margin: "0 auto", color: "#0f172a", paddingBottom: 40, width: "100%" }}>
      <div style={{ background: "linear-gradient(135deg,#1e3a8a,#3b0764)", color: "white", padding: "calc(env(safe-area-inset-top, 0px) + 20px) 18px 16px", borderRadius: "0 0 18px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, overflow: "hidden" }}>
            <div style={{ fontSize: 28, flexShrink: 0 }}>🏛️</div>
            <div style={{ minWidth: 0 }}><div style={{ fontSize: 11, letterSpacing: 1.5, opacity: 0.8, fontWeight: 600 }}>SOUTH CAROLINA</div><div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.1 }}>Small Claims Olympics</div></div>
          </div>
          <button onClick={() => setShowSettings(true)} style={iconBtn}><Settings size={18} /></button>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, padding: "12px 14px 0", flexWrap: "wrap" }}>
        <TabBtn active={tab === "leaderboard"} onClick={() => setTab("leaderboard")} icon={<Crown size={15} />} label="Leaderboard" />
        <TabBtn active={tab === "events"} onClick={() => setTab("events")} icon={<Medal size={15} />} label="Events" />
        <TabBtn active={tab === "analytics"} onClick={() => setTab("analytics")} icon={<BarChart2 size={15} />} label="Analytics" />
      </div>
      {!online && (
        <div style={{ background: "#7f1d1d", color: "#fecaca", fontSize: 13, fontWeight: 700, textAlign: "center", padding: "6px 14px", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <WifiOff size={14} /> No connection — changes won't save until you're back online
        </div>
      )}
      <div style={{ padding: "14px" }}>
        {tab === "leaderboard" && <Leaderboard standings={standings} events={events} competitors={competitors} />}
        {tab === "events" && <Events events={events} setEvents={setEvents} competitors={competitors} teams={teams} scheme={scheme} showToast={showToast} />}
        {tab === "analytics" && <Analytics events={events} competitors={competitors} standings={standings} />}
      </div>
      <Toast toast={toast} />
      {showSettings && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={() => setShowSettings(false)}>
          <div style={{ background: "#fff", borderRadius: "20px 20px 0 0", padding: "20px 16px 36px", width: "100%", maxWidth: 760, boxSizing: "border-box" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ fontWeight: 800, fontSize: 17 }}>Scoring Settings</div>
              <button onClick={() => setShowSettings(false)} style={iconBtnGray}><X size={18} /></button>
            </div>
            <ScoringEditor scheme={scheme} setScheme={setScheme} />
          </div>
        </div>
      )}
    </div>
  );
}
// ============ LEADERBOARD ============
const CONFETTI = [
  { t: 10, l: "12%", c: "#fbbf24", r: 20 }, { t: 24, l: "26%", c: "#34d399", r: -15 },
  { t: 8, l: "46%", c: "#f472b6", r: 35 }, { t: 22, l: "66%", c: "#60a5fa", r: -25 },
  { t: 12, l: "82%", c: "#fbbf24", r: 10 }, { t: 32, l: "90%", c: "#f472b6", r: -30 }, { t: 34, l: "6%", c: "#60a5fa", r: 18 },
];
function Podium({ slots, extras = [] }) {
  const order = [2, 1, 3];
  const H = { 1: 104, 2: 78, 3: 60 };
  const COL = { 1: "linear-gradient(180deg,#fde68a,#f59e0b)", 2: "linear-gradient(180deg,#e5e7eb,#9ca3af)", 3: "linear-gradient(180deg,#f3c294,#c2773f)" };
  const present = order.map((rk) => slots.find((x) => x.rank === rk)).filter(Boolean);
  return (
    <div style={{ background: "linear-gradient(165deg,#1e3a8a 0%,#3b0764 100%)", borderRadius: 18, padding: "18px 14px 0", position: "relative", overflow: "hidden", boxShadow: "0 8px 24px rgba(30,27,75,0.35)" }}>
      <div style={{ position: "absolute", top: -50, left: "50%", width: 220, height: 200, transform: "translateX(-50%)", background: "radial-gradient(circle,rgba(255,255,255,0.18),transparent 65%)", pointerEvents: "none" }} />
      {CONFETTI.map((c, i) => (<div key={i} style={{ position: "absolute", width: 6, height: 6, borderRadius: 1, background: c.c, top: c.t, left: c.l, transform: `rotate(${c.r}deg)`, opacity: 0.85 }} />))}
      <div style={{ position: "relative", textAlign: "center", color: "#fff", marginBottom: 12 }}><div style={{ fontSize: 11, letterSpacing: 2, fontWeight: 700, opacity: 0.75 }}>🏛️ THE PODIUM</div></div>
      <div style={{ position: "relative", display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 8 }}>
        {present.map(({ rank, s }) => (
          <div key={s.id} style={{ width: 104, maxWidth: "31%", textAlign: "center" }}>
            <div style={{ fontSize: 26, marginBottom: 2 }}>{["🥇", "🥈", "🥉"][rank - 1]}</div>
            <div style={{ width: 46, height: 46, borderRadius: "50%", margin: "0 auto 6px", background: COL[rank], display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 18, color: "#1f2937", boxShadow: "0 3px 8px rgba(0,0,0,0.3)", border: "2px solid rgba(255,255,255,0.6)" }}>{s.name.charAt(0).toUpperCase()}</div>
            <div style={{ color: "#fff", fontWeight: 700, fontSize: 13, lineHeight: 1.15, marginBottom: 2, wordBreak: "break-word" }}>{s.name}</div>
            <div style={{ color: "#fde68a", fontWeight: 800, fontSize: 15, marginBottom: 6 }}>{s.total}<span style={{ fontSize: 9, opacity: 0.8, marginLeft: 2 }}>PTS</span></div>
            <div style={{ height: H[rank], background: COL[rank], borderRadius: "8px 8px 0 0", display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 8, boxShadow: "inset 0 2px 6px rgba(255,255,255,0.4)" }}><span style={{ fontWeight: 900, fontSize: 26, color: "rgba(0,0,0,0.32)" }}>{rank}</span></div>
          </div>
        ))}
      </div>
      {extras.length > 0 && (
        <div style={{ position: "relative", display: "flex", gap: 6, marginTop: 14, paddingBottom: 14 }}>
          {extras.map(({ rank, s, last }) => (
            <div key={s.id} style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 6, padding: "8px 8px", borderRadius: 10, background: last ? "rgba(220,38,38,0.25)" : "rgba(255,255,255,0.1)", border: last ? "1px solid rgba(248,113,113,0.55)" : "1px solid rgba(255,255,255,0.12)" }}>
              {last ? <span style={{ fontSize: 18, flexShrink: 0 }}>🤡</span> : <span style={{ width: 22, height: 22, flexShrink: 0, borderRadius: "50%", background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12, color: "#fff" }}>{rank}</span>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: "#fff", fontWeight: 700, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</div>
                <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.5, color: last ? "#fca5a5" : "rgba(255,255,255,0.55)" }}>{last ? "DEAD LAST 🥄" : ordinal(rank).toUpperCase() + " PLACE"}</div>
              </div>
              <div style={{ color: last ? "#fca5a5" : "#fde68a", fontWeight: 800, fontSize: 12, flexShrink: 0 }}>{s.total}<span style={{ fontSize: 8, opacity: 0.8, marginLeft: 1 }}>PTS</span></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
function Leaderboard({ standings, events, competitors }) {
  const [open, setOpen] = useState({});
  if (standings.length === 0) return <Empty icon={<Crown size={28} />} title="No competitors yet" sub="Add people in the Roster tab to start the medal count." />;
  const doneCount = events.filter((e) => e.done).length;
  const nameOf = (id) => competitors.find((c) => c.id === id)?.name || "(removed)";

  const champions = events.filter((e) => e.done).map((ev) => {
    let winner = null;
    if (ev.type === "roundrobin") { const w = computeRRStandings(ev).find((s) => s.place === 1); winner = w ? nameOf(w.id) : null; }
    else if (ev.type === "poker") { const w = computeLedgerStandings(ev).find((s) => s.place === 1); winner = w ? nameOf(w.id) : null; }
    else if (ev.type === "innings") { const w = computeInningsStandings(ev).find((s) => s.place === 1); winner = w ? nameOf(w.id) : null; }
    else if (ev.type === "tournament") { const w = computeTennisStandings(ev).find((s) => s.place === 1); winner = w ? nameOf(w.id) : null; }
    else if (ev.type === "team") { const r = ev.results.find((x) => x.place === 1); winner = r ? r.teamName : null; }
    else { const r = ev.results.find((x) => x.place === 1); winner = r ? nameOf(r.competitorId) : null; }
    return { id: ev.id, name: ev.name, theme: ev.theme, winner };
  }).filter((c) => c.winner);

  const slots = [];
  if (standings[0]) slots.push({ rank: 1, s: standings[0] });
  if (standings[1]) slots.push({ rank: 2, s: standings[1] });
  if (standings[2]) slots.push({ rank: 3, s: standings[2] });

  return (
    <div>
      <Podium slots={slots} extras={standings.slice(3, 5).map((s, k) => ({ rank: k + 4, s, last: k + 4 === standings.length }))} />
      <div style={{ fontSize: 13, color: "#64748b", margin: "16px 0 10px", fontWeight: 600 }}>{standings.length} competitor{standings.length !== 1 ? "s" : ""} · {events.length} event{events.length !== 1 ? "s" : ""} ({doneCount} final)</div>

      {champions.length > 0 && (
        <div style={{ ...card, marginBottom: 14, padding: "12px 14px" }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8 }}>Event Champions</div>
          {champions.map((c) => (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 9, padding: "5px 0" }}>
              <div style={{ width: 26, height: 26, borderRadius: 7, background: getTheme(c.theme).panelBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>{getTheme(c.theme).emoji}</div>
              <div style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>{c.name}</div>
              <div style={{ fontSize: 13, color: "#475569", fontWeight: 600 }}>🥇 {c.winner}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8 }}>Full Standings</div>
      {standings.map((s, i) => {
        const isOpen = open[s.id];
        return (
          <div key={s.id} style={{ ...card, padding: 0, marginBottom: 10, overflow: "hidden", border: i < 3 ? `1.5px solid ${MEDAL_COLORS[i]}` : card.border }}>
            <div onClick={() => setOpen((o) => ({ ...o, [s.id]: !o[s.id] }))} style={{ display: "flex", alignItems: "center", padding: "12px 18px 12px 14px", cursor: "pointer", gap: 12 }}>
              <div style={{ width: 30, textAlign: "center", fontWeight: 800, fontSize: 18, color: i < 3 ? MEDAL_COLORS[i] : "#94a3b8" }}>{i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}</div>
              <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 700, fontSize: 16, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</div><div style={{ fontSize: 12, color: "#94a3b8" }}>{s.events} event{s.events !== 1 ? "s" : ""} scored</div></div>
              <div style={{ textAlign: "right", flexShrink: 0 }}><div style={{ fontWeight: 800, fontSize: 20, color: "#1e3a8a" }}>{s.total}</div><div style={{ fontSize: 10, color: "#94a3b8", letterSpacing: 0.5 }}>PTS</div></div>
              {s.breakdown.length > 0 && (isOpen ? <ChevronDown size={16} color="#94a3b8" /> : <ChevronRight size={16} color="#94a3b8" />)}
            </div>
            {isOpen && s.breakdown.length > 0 && (
              <div style={{ borderTop: "1px solid #f1f5f9", padding: "8px 14px 12px", background: "#fafbff" }}>
                {s.breakdown.map((b, j) => (
                  <div key={j} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0" }}>
                    <span style={{ color: "#475569" }}>{getTheme(b.theme).emoji} {b.event} <span style={{ color: "#94a3b8" }}>· {ordinal(b.place)}</span></span>
                    <span style={{ fontWeight: 600, color: "#1e3a8a" }}>+{b.pts}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============ EVENTS LIST ============
function Events({ events, setEvents, competitors, teams, scheme, showToast }) {
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("individual");
  const [newTheme, setNewTheme] = useState("poker");
  const [editing, setEditing] = useState(null);
  const toast = (r) => { if (showToast) showToast(r?.ok === false ? "err" : "ok"); };
  const persist = async (next) => { setEvents(next); toast(await saveKey(KEYS.events, next)); };

  const addEvent = async () => {
    if (!newName.trim()) return;
    let ev;
    if (newType === "roundrobin") { const ids = competitors.length === 5 ? competitors.map((c) => c.id) : []; ev = { id: uid(), name: newName.trim(), type: "roundrobin", theme: newTheme, players: ids, schedule: genRoundRobin(ids) || [], matches: {}, done: false }; }
    else if (newType === "poker") { ev = { id: uid(), name: newName.trim(), type: "poker", theme: "poker", players: competitors.map((c) => c.id), ledger: {}, done: false }; }
    else if (newType === "innings") { ev = { id: uid(), name: newName.trim(), type: "innings", theme: "baseball", players: competitors.map((c) => c.id), progress: {}, done: false }; }
    else if (newType === "tournament") { ev = { id: uid(), name: newName.trim(), type: "tournament", theme: "tennis", players: competitors.map((c) => c.id), results: {}, done: false }; }
    else if (newType === "golf") { ev = { id: uid(), name: newName.trim(), type: "golf", theme: "golf", players: competitors.map((c) => c.id), scores: {}, done: false }; }
    else { ev = { id: uid(), name: newName.trim(), type: newType, theme: newTheme, results: [], done: false }; }
    await persist([...events, ev]);
    setNewName(""); setNewType("individual"); setNewTheme("poker"); setShowNew(false); setEditing(ev.id);
  };
  const deleteEvent = async (id) => { if (!confirm("Delete this event and its results?")) return; await persist(events.filter((e) => e.id !== id)); };

  if (editing) {
    const ev = events.find((e) => e.id === editing);
    if (!ev) { setEditing(null); return null; }
    const onSave = async (u) => { await persist(events.map((e) => (e.id === u.id ? u : e))); };
    if (ev.type === "poker") return <PokerEditor ev={ev} competitors={competitors} scheme={scheme} onBack={() => setEditing(null)} onSave={onSave} showToast={showToast} />;
    if (ev.type === "innings") return <InningsEditor ev={ev} competitors={competitors} scheme={scheme} onBack={() => setEditing(null)} onSave={onSave} showToast={showToast} />;
    if (ev.type === "tournament") return <TennisEditor ev={ev} competitors={competitors} scheme={scheme} onBack={() => setEditing(null)} onSave={onSave} showToast={showToast} />;
    if (ev.type === "roundrobin") return <RoundRobinEditor ev={ev} competitors={competitors} scheme={scheme} onBack={() => setEditing(null)} onSave={onSave} showToast={showToast} />;
    if (ev.type === "golf") return <GolfEditor ev={ev} competitors={competitors} scheme={scheme} onBack={() => setEditing(null)} onSave={onSave} showToast={showToast} />;
    return <EventEditor ev={ev} competitors={competitors} teams={teams} scheme={scheme} onBack={() => setEditing(null)} onSave={onSave} />;
  }

  return (
    <div>
      {!showNew ? (
        <button onClick={() => setShowNew(true)} style={primaryBtn}><Plus size={16} /> New Event</button>
      ) : (
        <div style={{ ...card, marginBottom: 14 }}>
          <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Event name (e.g. Cornhole)" style={input} onKeyDown={(e) => e.key === "Enter" && addEvent()} />
          <div style={{ display: "flex", gap: 8, margin: "10px 0", flexWrap: "wrap" }}>
            <TypeChip active={newType === "individual"} onClick={() => setNewType("individual")} icon={<User size={14} />} label="Individual" />
            <TypeChip active={newType === "team"} onClick={() => setNewType("team")} icon={<Users size={14} />} label="Team" />
            <TypeChip active={newType === "roundrobin"} onClick={() => setNewType("roundrobin")} icon={<Repeat size={14} />} label="Doubles RR" />
            <TypeChip active={newType === "poker"} onClick={() => { setNewType("poker"); setNewTheme("poker"); }} icon={<Coins size={14} />} label="Poker $" />
            <TypeChip active={newType === "innings"} onClick={() => { setNewType("innings"); setNewTheme("baseball"); }} icon={<span style={{ fontSize: 15 }}>⚾</span>} label="9/9/9" />
            <TypeChip active={newType === "tournament"} onClick={() => { setNewType("tournament"); setNewTheme("tennis"); }} icon={<span style={{ fontSize: 15 }}>🎾</span>} label="Tennis RR" />
            <TypeChip active={newType === "golf"} onClick={() => { setNewType("golf"); setNewTheme("golf"); }} icon={<span style={{ fontSize: 15 }}>⛳</span>} label="Golf" />
          </div>
          {newType === "roundrobin" && <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>Rotating-partner doubles, tuned for 5 players. You'll set the lineup inside.</div>}
          {newType === "poker" && <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>Cash game: track buy-ins and final stacks. Net winnings set the finishing order.</div>}
          {newType === "innings" && <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>A hot dog and a beer every inning. Score is innings completed, out of 9.</div>}
          {newType === "tournament" && <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>Singles round robin — everyone plays everyone once. Fairest format; 5 players = 10 matches.</div>}
          {newType === "golf" && <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>18-hole stroke play. Each player enters their own scorecard hole by hole. Lowest total wins.</div>}
          {newType !== "poker" && newType !== "innings" && newType !== "tournament" && newType !== "golf" && (<><div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", letterSpacing: 0.5, margin: "4px 0 6px" }}>THEME</div><ThemePicker value={newTheme} onChange={setNewTheme} /></>)}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button onClick={addEvent} style={{ ...primaryBtn, flex: 1, marginBottom: 0 }}>Create</button>
            <button onClick={() => { setShowNew(false); setNewName(""); }} style={ghostBtn}>Cancel</button>
          </div>
        </div>
      )}

      {events.length === 0 && <Empty icon={<Medal size={28} />} title="No events yet" sub="Create your first event to begin scoring." />}

      {[...events].sort((a, b) => (a.done === b.done ? 0 : a.done ? 1 : -1)).map((ev) => {
        const t = getTheme(ev.theme);
        let meta;
        if (ev.type === "roundrobin") { const played = Object.values(ev.matches || {}).filter((m) => m && m.winner).length; meta = `Doubles round robin · ${t.label} · ${played}/${(ev.schedule || []).length} rounds`; }
        else if (ev.type === "poker") { const totalIn = (ev.players || []).reduce((s, id) => s + (Number((ev.ledger || {})[id]?.buyIn) || 0), 0); meta = `Poker cash game · ${(ev.players || []).length} players · $${totalIn} in`; }
        else if (ev.type === "innings") { const tops = (ev.players || []).map((id) => Number((ev.progress || {})[id]) || 0); const lead = tops.length ? Math.max(...tops) : 0; meta = `Hot dog & beer · ${(ev.players || []).length} players · top ${lead}/9`; }
        else if (ev.type === "tournament") { const st = computeTennisStandings(ev); const played = Object.values(ev.results || {}).filter(Boolean).length; const totalM = tennisPairings(ev.players || []).length; const champ = ev.done && st[0] ? competitors.find((c) => c.id === st[0].id)?.name : null; meta = `Tennis round robin · ${(ev.players || []).length} players · ${champ ? "🏆 " + champ : played + "/" + totalM + " matches"}`; }
        else if (ev.type === "golf") { const st = computeGolfStandings(ev); const leader = st.find((s) => s.holesPlayed > 0); const holesIn = leader ? leader.holesPlayed : 0; meta = `Stroke play · ${(ev.players || []).length} players · ${holesIn}/18 holes`; }
        else meta = `${ev.type === "team" ? "Team event" : "Individual"} · ${t.label} · ${ev.results.length} placement${ev.results.length !== 1 ? "s" : ""}`;
        return (
          <div key={ev.id} style={{ ...card, marginBottom: 10, display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 11, background: t.panelBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.06)" }}>{t.emoji}</div>
            <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => setEditing(ev.id)}>
              <div style={{ fontWeight: 700, fontSize: 15, display: "flex", alignItems: "center", gap: 7 }}>{ev.name}{ev.done && <span style={badge("#dcfce7", "#16a34a")}>FINAL</span>}</div>
              <div style={{ fontSize: 12, color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{meta}</div>
            </div>
            <button onClick={() => setEditing(ev.id)} style={smallBtn}>Score</button>
            <button onClick={() => deleteEvent(ev.id)} style={iconBtnGray}><Trash2 size={15} /></button>
          </div>
        );
      })}
    </div>
  );
}

function ThemePicker({ value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 7, overflowX: "auto", paddingBottom: 4 }}>
      {THEME_ORDER.map((k) => {
        const t = THEMES[k]; const on = value === k;
        return (
          <button key={k} onClick={() => onChange(k)} style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "8px 10px", borderRadius: 10, cursor: "pointer", border: on ? "2px solid #1e3a8a" : "2px solid transparent", background: "#f8fafc" }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: t.panelBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>{t.emoji}</div>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: on ? "#1e3a8a" : "#64748b" }}>{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function FeltShell({ theme, children }) {
  return (
    <div style={{ background: theme.panelBg, borderRadius: 18, padding: "18px 14px 16px", boxShadow: "0 8px 24px rgba(0,0,0,0.18)", position: "relative", overflow: "hidden" }}>
      {theme.suits && <div style={{ position: "absolute", inset: 0, fontSize: 90, opacity: 0.06, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", letterSpacing: 14 }}>♠♥♦♣</div>}
      <div style={{ position: "relative" }}>{children}</div>
    </div>
  );
}
function EditorTopBar({ onBack }) {
  return (<div style={{ marginBottom: 12 }}><button onClick={onBack} style={{ ...ghostBtn, padding: "6px 12px" }}>← Back</button></div>);
}
// ============ DECOR: poker ============
function Chip({ color, edge = "#fff", style }) {
  return (
    <div style={{ position: "absolute", width: 54, height: 54, borderRadius: "50%", background: `repeating-conic-gradient(${color} 0deg 22deg, ${edge} 22deg 45deg)`, boxShadow: "0 6px 14px rgba(0,0,0,0.45)", ...style }}>
      <div style={{ position: "absolute", inset: 6, borderRadius: "50%", background: `radial-gradient(circle at 38% 32%, rgba(255,255,255,0.35), ${color})` }} />
      <div style={{ position: "absolute", inset: 11, borderRadius: "50%", border: "2px dashed rgba(255,255,255,0.5)" }} />
    </div>
  );
}
function PlayingCard({ rank, suit, style }) {
  const red = suit === "♥" || suit === "♦";
  return (
    <div style={{ position: "absolute", width: 48, height: 66, borderRadius: 7, background: "#fff", boxShadow: "0 6px 16px rgba(0,0,0,0.4)", color: red ? "#dc2626" : "#1e293b", fontWeight: 800, padding: "5px 6px", boxSizing: "border-box", ...style }}>
      <div style={{ fontSize: 13, lineHeight: 1 }}>{rank}</div><div style={{ fontSize: 22, textAlign: "center", marginTop: 4 }}>{suit}</div>
    </div>
  );
}
function PokerBackdrop() {
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, fontSize: 120, opacity: 0.05, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", letterSpacing: 20 }}>♠♥♦♣</div>
      <Chip color="#b91c1c" style={{ top: -16, left: -18 }} /><Chip color="#1e293b" style={{ top: -26, left: 14, width: 46, height: 46 }} />
      <PlayingCard rank="A" suit="♠" style={{ top: 2, right: 44, transform: "rotate(-16deg)" }} /><PlayingCard rank="K" suit="♥" style={{ top: -6, right: 8, transform: "rotate(8deg)" }} />
      <Chip color="#15803d" style={{ top: "42%", right: -24 }} /><Chip color="#1e293b" style={{ top: "52%", left: -26, width: 48, height: 48 }} />
      <PlayingCard rank="Q" suit="♦" style={{ bottom: 6, left: 30, transform: "rotate(14deg)" }} /><PlayingCard rank="J" suit="♣" style={{ bottom: -4, left: -10, transform: "rotate(-10deg)" }} />
      <Chip color="#1d4ed8" style={{ bottom: -18, right: -14 }} /><Chip color="#b91c1c" style={{ bottom: 10, right: 22, width: 46, height: 46 }} />
    </div>
  );
}
function MoneyInput({ value, onChange, accent = "#1e293b" }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 1, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "5px 7px", width: 78 }}>
      <span style={{ color: "#94a3b8", fontSize: 13, fontWeight: 700 }}>$</span>
      <input inputMode="decimal" value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder="0" style={{ border: "none", outline: "none", width: "100%", fontSize: 14, fontWeight: 700, background: "transparent", textAlign: "right", color: accent }} />
    </div>
  );
}

// ============ DECOR: baseball ============
function Baseball({ size = 46, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" style={{ position: "absolute", filter: "drop-shadow(0 6px 12px rgba(0,0,0,0.4))", ...style }}>
      <circle cx="24" cy="24" r="23" fill="#fff" />
      <path d="M10 5 C17 15,17 33,10 43" fill="none" stroke="#dc2626" strokeWidth="1.6" /><path d="M38 5 C31 15,31 33,38 43" fill="none" stroke="#dc2626" strokeWidth="1.6" />
      <g stroke="#dc2626" strokeWidth="1.2" strokeLinecap="round">
        <line x1="11" y1="12" x2="15" y2="11" /><line x1="11" y1="17" x2="15" y2="16" /><line x1="11" y1="22" x2="15" y2="21" /><line x1="11" y1="27" x2="15" y2="28" /><line x1="11" y1="32" x2="15" y2="33" /><line x1="11" y1="37" x2="15" y2="38" />
        <line x1="37" y1="12" x2="33" y2="11" /><line x1="37" y1="17" x2="33" y2="16" /><line x1="37" y1="22" x2="33" y2="21" /><line x1="37" y1="27" x2="33" y2="28" /><line x1="37" y1="32" x2="33" y2="33" /><line x1="37" y1="37" x2="33" y2="38" />
      </g>
    </svg>
  );
}
function BaseballBackdrop() {
  const dog = (style) => <span style={{ position: "absolute", fontSize: 44, filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.35))", ...style }}>🌭</span>;
  const beer = (style) => <span style={{ position: "absolute", fontSize: 44, filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.35))", ...style }}>🍺</span>;
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg viewBox="0 0 200 280" style={{ position: "absolute", left: "50%", top: "45%", width: 320, height: 320, transform: "translate(-50%,-50%)", opacity: 0.13 }}>
        <polygon points="100,30 170,100 100,170 30,100" fill="rgba(255,255,255,0.05)" stroke="#fff" strokeWidth="3" />
        <rect x="95" y="25" width="10" height="10" fill="#fff" /><rect x="165" y="95" width="10" height="10" fill="#fff" /><rect x="95" y="165" width="10" height="10" fill="#fff" /><rect x="25" y="95" width="10" height="10" fill="#fff" /><circle cx="100" cy="100" r="9" fill="rgba(255,255,255,0.6)" />
      </svg>
      {dog({ top: -6, left: 6, transform: "rotate(-16deg)" })}<Baseball size={44} style={{ top: 20, left: 56 }} />{beer({ top: 2, right: 10, transform: "rotate(12deg)" })}
      <Baseball size={40} style={{ top: "44%", right: -14 }} />{beer({ top: "50%", left: -8, fontSize: 40, transform: "rotate(-8deg)" })}
      <Baseball size={44} style={{ bottom: -12, left: -10 }} />{dog({ bottom: 6, left: 50, transform: "rotate(10deg)" })}{beer({ bottom: -4, right: 14, transform: "rotate(-12deg)" })}<Baseball size={42} style={{ bottom: 16, right: 56 }} />
    </div>
  );
}

// ============ DECOR: tennis ============
function TennisBall({ size = 44, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" style={{ position: "absolute", filter: "drop-shadow(0 6px 12px rgba(0,0,0,0.4))", ...style }}>
      <circle cx="24" cy="24" r="23" fill="#c9e265" />
      <path d="M5 13 C17 20,31 20,43 13" fill="none" stroke="#fff" strokeWidth="2.4" /><path d="M5 35 C17 28,31 28,43 35" fill="none" stroke="#fff" strokeWidth="2.4" />
    </svg>
  );
}
function TennisBackdrop() {
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg viewBox="0 0 200 300" style={{ position: "absolute", left: "50%", top: "47%", width: 250, height: 360, transform: "translate(-50%,-50%)", opacity: 0.13 }}>
        <rect x="22" y="14" width="156" height="272" fill="none" stroke="#fff" strokeWidth="3" />
        <line x1="46" y1="14" x2="46" y2="286" stroke="#fff" strokeWidth="2" /><line x1="154" y1="14" x2="154" y2="286" stroke="#fff" strokeWidth="2" />
        <line x1="22" y1="150" x2="178" y2="150" stroke="#fff" strokeWidth="3" />
        <line x1="46" y1="86" x2="154" y2="86" stroke="#fff" strokeWidth="2" /><line x1="46" y1="214" x2="154" y2="214" stroke="#fff" strokeWidth="2" /><line x1="100" y1="86" x2="100" y2="214" stroke="#fff" strokeWidth="2" />
      </svg>
      <TennisBall size={44} style={{ top: -8, left: 8 }} /><span style={{ position: "absolute", top: 6, right: 12, fontSize: 40, filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.35))" }}>🏆</span>
      <TennisBall size={38} style={{ top: "44%", right: -12 }} /><TennisBall size={40} style={{ top: "50%", left: -12 }} />
      <TennisBall size={44} style={{ bottom: -10, left: -8 }} /><TennisBall size={42} style={{ bottom: 14, right: 48 }} />
    </div>
  );
}
function SlotBtn({ name, win, disabled, onClick }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "9px 11px", borderRadius: 9, border: win ? "1.5px solid #84cc16" : "1.5px solid transparent", background: win ? "#f7fee7" : "#f8fafc", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.55 : 1 }}>
      <span style={{ flex: 1, textAlign: "left", fontWeight: 600, fontSize: 14, color: name ? "#1e293b" : "#94a3b8" }}>{name || "TBD"}</span>
      {win && <span style={{ fontSize: 14 }}>🎾</span>}
    </button>
  );
}

// ============ DECOR: beer die ============
const DIE_PIPS = {
  1: [[18, 18]], 2: [[11, 11], [25, 25]], 3: [[11, 11], [18, 18], [25, 25]],
  4: [[11, 11], [25, 11], [11, 25], [25, 25]], 5: [[11, 11], [25, 11], [18, 18], [11, 25], [25, 25]],
  6: [[11, 11], [25, 11], [11, 18], [25, 18], [11, 25], [25, 25]],
};
function Die({ value = 5, size = 34, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" style={{ position: "absolute", filter: "drop-shadow(0 5px 10px rgba(0,0,0,0.4))", ...style }}>
      <rect x="1.5" y="1.5" width="33" height="33" rx="7" fill="#fafafa" stroke="#e5e7eb" />
      {(DIE_PIPS[value] || []).map(([cx, cy], i) => <circle key={i} cx={cx} cy={cy} r="3.1" fill="#1f2937" />)}
    </svg>
  );
}
function Cup({ size = 40, style }) {
  return (
    <div style={{ position: "absolute", width: size, height: size * 1.12, ...style }}>
      <div style={{ width: "100%", height: "100%", background: "linear-gradient(#ef4444,#b91c1c)", clipPath: "polygon(10% 0,90% 0,72% 100%,28% 100%)", boxShadow: "0 6px 12px rgba(0,0,0,0.35)" }} />
      <div style={{ position: "absolute", top: 0, left: "10%", width: "80%", height: 4, background: "#fee2e2", borderRadius: 2 }} />
    </div>
  );
}
function BeerDieBackdrop() {
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: "8% 6%", border: "2px solid rgba(255,255,255,0.12)", borderRadius: 6 }} />
      <div style={{ position: "absolute", left: "6%", right: "6%", top: "50%", height: 2, background: "rgba(255,255,255,0.16)" }} />
      <Die value={5} size={34} style={{ top: 14, left: 10, transform: "rotate(-12deg)" }} />
      <Die value={3} size={28} style={{ bottom: -4, left: 10, transform: "rotate(-8deg)" }} />
      <Die value={2} size={30} style={{ top: "46%", right: -6, transform: "rotate(10deg)" }} />
      <Die value={6} size={30} style={{ bottom: 18, left: "46%", transform: "rotate(8deg)" }} />
      <Cup size={40} style={{ top: 8, right: 14 }} />
      <Cup size={34} style={{ bottom: -6, right: 18 }} />
      <span style={{ position: "absolute", top: "48%", left: -6, fontSize: 38, filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.35))" }}>🍺</span>
    </div>
  );
}

// ============ POKER EDITOR ============
function PokerEditor({ ev, competitors, scheme, onBack, onSave, showToast }) {
  const theme = getTheme("poker");
  const [ledger, setLedger] = useState(ev.ledger || {});
  const [players, setPlayers] = useState(ev.players && ev.players.length ? ev.players : competitors.map((c) => c.id));
  const [done, setDone] = useState(ev.done);
  const [editPlayers, setEditPlayers] = useState(false);
  const nameOf = (id) => competitors.find((c) => c.id === id)?.name || "(removed)";

  // Load per-player entries on mount and subscribe to realtime updates
  useEffect(() => {
    if (!ev.id) return;
    (async () => {
      const entries = await Promise.all(players.map((id) => loadKey(KEYS.pokerEntry(ev.id, id), null)));
      const merged = { ...ev.ledger };
      players.forEach((id, i) => { if (entries[i] != null) merged[id] = entries[i]; });
      setLedger(merged);
    })();
    const unsub = subscribeToChanges((key) => {
      if (key && key.startsWith(`scco:${YEAR}:poker:${ev.id}:`)) {
        const playerId = key.replace(`scco:${YEAR}:poker:${ev.id}:`, "");
        loadKey(key, null).then((entry) => { if (entry != null) setLedger((prev) => ({ ...prev, [playerId]: entry })); });
      }
    });
    return unsub;
  }, [ev.id]);

  const setAmount = async (id, field, val) => {
    const entry = { ...(ledger[id] || {}), [field]: val };
    const nl = { ...ledger, [id]: entry };
    setLedger(nl);
    const r1 = await saveKey(KEYS.pokerEntry(ev.id, id), entry);
    const r2 = await onSave({ ...ev, ledger: nl, players, done });
    if (showToast) showToast(r1?.ok === false ? "err" : "ok");
  };
  const togglePlayer = async (id) => { const np = players.includes(id) ? players.filter((x) => x !== id) : [...players, id]; setPlayers(np); await onSave({ ...ev, ledger, players: np, done }); };
  const toggleDone = async () => { const nd = !done; setDone(nd); await onSave({ ...ev, ledger, players, done: nd }); };
  const standings = computeLedgerStandings({ ledger, players });
  const totalIn = standings.reduce((s, p) => s + p.buyIn, 0), totalOut = standings.reduce((s, p) => s + p.cashOut, 0);
  const balance = +(totalOut - totalIn).toFixed(2);
  const hasData = standings.some((s) => s.buyIn || s.cashOut);
  const fmt = (n) => (n < 0 ? "-$" + Math.abs(n) : "$" + n);
  const netColor = (n) => (n > 0 ? "#16a34a" : n < 0 ? "#dc2626" : "#94a3b8");
  const tcard = { background: "#fff", border: "1px solid rgba(232,200,115,0.45)", borderRadius: 13, boxShadow: "0 4px 14px rgba(0,0,0,0.22)" };
  return (
    <div>
      <EditorTopBar onBack={onBack} />
      <div style={{ background: theme.panelBg, borderRadius: 20, padding: "20px 16px 18px", boxShadow: "0 10px 30px rgba(0,0,0,0.3), inset 0 0 60px rgba(0,0,0,0.25)", position: "relative", overflow: "hidden", minHeight: 520, border: "1px solid rgba(232,200,115,0.3)" }}>
        <PokerBackdrop />
        <div style={{ position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 3 }}>
            <span style={{ fontSize: 26 }}>♠️</span><h2 style={{ margin: 0, fontSize: 23, color: "#fff", textShadow: "0 1px 4px rgba(0,0,0,0.4)" }}>{ev.name}</h2>
            <span style={badge("rgba(0,0,0,0.3)", "#fde68a")}>CASH GAME</span>{done && <span style={badge("rgba(232,200,115,0.3)", "#fff")}>FINAL</span>}
          </div>
          <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.85)", marginBottom: 14 }}>Log each player's buy-in and final stack. Net winnings set the finishing order and overall points.</div>
          <div style={{ ...tcard, padding: 13, marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#0c4026", textTransform: "uppercase", letterSpacing: 0.5 }}>The Table</div>
              <button onClick={() => setEditPlayers((s) => !s)} style={{ ...smallBtn, background: "#f0fdf4", color: "#15803d" }}>{editPlayers ? "Done" : "Who's playing"}</button>
            </div>
            {editPlayers ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                {competitors.length === 0 && <span style={{ fontSize: 13, color: "#94a3b8" }}>Add people in the Roster tab first.</span>}
                {competitors.map((c) => { const on = players.includes(c.id); return <button key={c.id} onClick={() => togglePlayer(c.id)} style={{ ...pickBtn, background: on ? "#15803d" : "#f1f5f9", color: on ? "white" : "#334155", borderColor: on ? "#15803d" : "#e2e8f0" }}>{on ? "✓ " : ""}{c.name}</button>; })}
              </div>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 2px 6px", fontSize: 10.5, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.4 }}><div style={{ flex: 1 }}>Player</div><div style={{ width: 78, textAlign: "center" }}>Buy-in</div><div style={{ width: 78, textAlign: "center" }}>End</div><div style={{ width: 56, textAlign: "right" }}>Net</div></div>
                {players.length === 0 && <div style={{ fontSize: 13, color: "#94a3b8", textAlign: "center", padding: 8 }}>Tap "Who's playing" to seat the table.</div>}
                {players.map((id) => {
                  const l = ledger[id] || {}; const net = (Number(l.cashOut) || 0) - (Number(l.buyIn) || 0);
                  return (
                    <div key={id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderTop: "1px solid #f1f5f9" }}>
                      <div style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>{nameOf(id)}</div>
                      <MoneyInput value={l.buyIn} onChange={(v) => setAmount(id, "buyIn", v)} /><MoneyInput value={l.cashOut} onChange={(v) => setAmount(id, "cashOut", v)} accent="#0c4026" />
                      <div style={{ width: 56, textAlign: "right", fontWeight: 800, fontSize: 14, color: netColor(net) }}>{net > 0 ? "+" : ""}{fmt(net)}</div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
          {!editPlayers && (
            <div style={{ ...tcard, padding: "11px 13px", marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ textAlign: "center" }}><div style={{ fontSize: 10.5, color: "#94a3b8", fontWeight: 700, letterSpacing: 0.4 }}>IN</div><div style={{ fontWeight: 800, fontSize: 16, color: "#0c4026" }}>${totalIn}</div></div>
              <div style={{ textAlign: "center" }}><div style={{ fontSize: 10.5, color: "#94a3b8", fontWeight: 700, letterSpacing: 0.4 }}>OUT</div><div style={{ fontWeight: 800, fontSize: 16, color: "#0c4026" }}>${totalOut}</div></div>
              <div style={{ textAlign: "center" }}><div style={{ fontSize: 10.5, color: "#94a3b8", fontWeight: 700, letterSpacing: 0.4 }}>BOOKS</div><div style={{ fontWeight: 800, fontSize: 14, color: balance === 0 ? "#16a34a" : "#dc2626" }}>{balance === 0 ? "Balanced ✓" : (balance > 0 ? "+" : "") + fmt(balance)}</div></div>
            </div>
          )}
          {!editPlayers && players.length > 0 && (
            <div style={{ ...tcard, padding: "10px 13px" }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#0c4026", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Standings by net</div>
              {standings.map((s, i) => (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0", borderTop: i ? "1px solid #f1f5f9" : "none" }}>
                  <div style={{ width: 24, textAlign: "center", fontSize: 15 }}>{i < 3 && hasData ? ["🥇", "🥈", "🥉"][i] : <span style={{ fontWeight: 700, color: "#94a3b8" }}>{s.place}</span>}</div>
                  <div style={{ flex: 1, fontWeight: 600 }}>{nameOf(s.id)}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: netColor(s.net), width: 56, textAlign: "right" }}>{s.net > 0 ? "+" : ""}{fmt(s.net)}</div>
                  <div style={{ fontWeight: 800, color: "#b45309", fontSize: 13, width: 32, textAlign: "right" }}>+{pointsForPlace(s.place, scheme)}</div>
                </div>
              ))}
              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 6 }}>Placement points count toward the overall board once you mark this event final.</div>
            </div>
          )}
        </div>
      </div>
      {!editPlayers && players.length > 0 && <button onClick={toggleDone} style={{ ...(done ? ghostBtn : primaryBtn), width: "100%", marginTop: 14, justifyContent: "center" }}>{done ? "Reopen event" : "Mark event final"}</button>}
    </div>
  );
}
// ============ 9/9/9 INNINGS EDITOR ============
function InningsEditor({ ev, competitors, scheme, onBack, onSave, showToast }) {
  const theme = getTheme("baseball");
  const [progress, setProgress] = useState(ev.progress || {});
  const [players, setPlayers] = useState(ev.players && ev.players.length ? ev.players : competitors.map((c) => c.id));
  const [done, setDone] = useState(ev.done);
  const [editPlayers, setEditPlayers] = useState(false);
  const nameOf = (id) => competitors.find((c) => c.id === id)?.name || "(removed)";

  // Load per-player innings on mount and subscribe to realtime updates
  useEffect(() => {
    if (!ev.id) return;
    (async () => {
      const vals = await Promise.all(players.map((id) => loadKey(KEYS.innings(ev.id, id), null)));
      const merged = { ...ev.progress };
      players.forEach((id, i) => { if (vals[i] != null) merged[id] = vals[i]; });
      setProgress(merged);
    })();
    const unsub = subscribeToChanges((key) => {
      if (key && key.startsWith(`scco:${YEAR}:innings:${ev.id}:`)) {
        const playerId = key.replace(`scco:${YEAR}:innings:${ev.id}:`, "");
        loadKey(key, null).then((v) => { if (v != null) setProgress((prev) => ({ ...prev, [playerId]: v })); });
      }
    });
    return unsub;
  }, [ev.id]);

  const setInnings = async (id, val) => {
    const n = Math.max(0, Math.min(9, val));
    const np = { ...progress, [id]: n };
    setProgress(np);
    const r1 = await saveKey(KEYS.innings(ev.id, id), n);
    const r2 = await onSave({ ...ev, progress: np, players, done });
    if (showToast) showToast(r1?.ok === false ? "err" : "ok");
  };
  const togglePlayer = async (id) => { const np = players.includes(id) ? players.filter((x) => x !== id) : [...players, id]; setPlayers(np); await onSave({ ...ev, progress, players: np, done }); };
  const toggleDone = async () => { const nd = !done; setDone(nd); await onSave({ ...ev, progress, players, done: nd }); };
  const standings = computeInningsStandings({ progress, players });
  const totalInnings = standings.reduce((s, p) => s + p.innings, 0);
  const hasData = standings.some((s) => s.innings > 0);
  const tcard = { background: "#fff", border: "1px solid rgba(253,230,138,0.5)", borderRadius: 13, boxShadow: "0 4px 14px rgba(0,0,0,0.22)" };
  return (
    <div>
      <EditorTopBar onBack={onBack} />
      <div style={{ background: theme.panelBg, borderRadius: 20, padding: "20px 16px 18px", boxShadow: "0 10px 30px rgba(0,0,0,0.3), inset 0 0 60px rgba(0,0,0,0.22)", position: "relative", overflow: "hidden", minHeight: 520, border: "1px solid rgba(253,230,138,0.3)" }}>
        <BaseballBackdrop />
        <div style={{ position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 3 }}>
            <span style={{ fontSize: 26 }}>⚾</span><h2 style={{ margin: 0, fontSize: 23, color: "#fff", textShadow: "0 1px 4px rgba(0,0,0,0.4)" }}>{ev.name}</h2>
            <span style={badge("rgba(0,0,0,0.3)", "#fde68a")}>9 INNINGS</span>{done && <span style={badge("rgba(253,230,138,0.3)", "#fff")}>FINAL</span>}
          </div>
          <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.9)", marginBottom: 14 }}>🌭 + 🍺 every inning. Tap an inning to mark it completed — score is innings finished, out of 9.</div>
          <div style={{ ...tcard, padding: 13, marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#166534", textTransform: "uppercase", letterSpacing: 0.5 }}>The Lineup</div>
              <button onClick={() => setEditPlayers((s) => !s)} style={{ ...smallBtn, background: "#f0fdf4", color: "#15803d" }}>{editPlayers ? "Done" : "Who's playing"}</button>
            </div>
            {editPlayers ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                {competitors.length === 0 && <span style={{ fontSize: 13, color: "#94a3b8" }}>Add people in the Roster tab first.</span>}
                {competitors.map((c) => { const on = players.includes(c.id); return <button key={c.id} onClick={() => togglePlayer(c.id)} style={{ ...pickBtn, background: on ? "#15803d" : "#f1f5f9", color: on ? "white" : "#334155", borderColor: on ? "#15803d" : "#e2e8f0" }}>{on ? "✓ " : ""}{c.name}</button>; })}
              </div>
            ) : (
              <>
                {players.length === 0 && <div style={{ fontSize: 13, color: "#94a3b8", textAlign: "center", padding: 8 }}>Tap "Who's playing" to set the lineup.</div>}
                {players.map((id, idx) => {
                  const n = Math.max(0, Math.min(9, Number(progress[id]) || 0));
                  return (
                    <div key={id} style={{ padding: "9px 0", borderTop: idx ? "1px solid #f1f5f9" : "none" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
                        <div style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>{nameOf(id)}</div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: n === 9 ? "#b45309" : "#166534" }}>{n}/9</div>
                        <button onClick={() => setInnings(id, n - 1)} style={stepBtn}>−</button><button onClick={() => setInnings(id, n + 1)} style={stepBtn}>+</button>
                      </div>
                      <div style={{ display: "flex", gap: 4 }}>
                        {Array.from({ length: 9 }).map((_, j) => { const inning = j + 1; const filled = inning <= n; return <button key={j} onClick={() => setInnings(id, inning === n ? inning - 1 : inning)} title={`Inning ${inning}`} style={{ flex: 1, height: 28, borderRadius: 6, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 800, background: filled ? (inning === 9 ? "#f59e0b" : "#16a34a") : "#eef2f6", color: filled ? "#fff" : "#94a3b8", boxShadow: filled ? "0 2px 4px rgba(0,0,0,0.15)" : "none" }}>{inning}</button>; })}
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
          {!editPlayers && players.length > 0 && (
            <div style={{ ...tcard, padding: "11px 13px", marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-around" }}>
              <div style={{ textAlign: "center" }}><div style={{ fontSize: 20 }}>🌭</div><div style={{ fontWeight: 800, fontSize: 16, color: "#166534" }}>{totalInnings}</div><div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 700 }}>EATEN</div></div>
              <div style={{ textAlign: "center" }}><div style={{ fontSize: 20 }}>🍺</div><div style={{ fontWeight: 800, fontSize: 16, color: "#166534" }}>{totalInnings}</div><div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 700 }}>DRAINED</div></div>
              <div style={{ textAlign: "center" }}><div style={{ fontSize: 20 }}>⚾</div><div style={{ fontWeight: 800, fontSize: 16, color: "#166534" }}>{players.length * 9}</div><div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 700 }}>POSSIBLE</div></div>
            </div>
          )}
          {!editPlayers && players.length > 0 && (
            <div style={{ ...tcard, padding: "10px 13px" }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#166534", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Standings by innings</div>
              {standings.map((s, i) => (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0", borderTop: i ? "1px solid #f1f5f9" : "none" }}>
                  <div style={{ width: 24, textAlign: "center", fontSize: 15 }}>{i < 3 && hasData ? ["🥇", "🥈", "🥉"][i] : <span style={{ fontWeight: 700, color: "#94a3b8" }}>{s.place}</span>}</div>
                  <div style={{ flex: 1, fontWeight: 600 }}>{nameOf(s.id)}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#166534", width: 40, textAlign: "right" }}>{s.innings}/9</div>
                  <div style={{ fontWeight: 800, color: "#b45309", fontSize: 13, width: 32, textAlign: "right" }}>+{pointsForPlace(s.place, scheme)}</div>
                </div>
              ))}
              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 6 }}>Placement points count toward the overall board once you mark this event final.</div>
            </div>
          )}
        </div>
      </div>
      {!editPlayers && players.length > 0 && <button onClick={toggleDone} style={{ ...(done ? ghostBtn : primaryBtn), width: "100%", marginTop: 14, justifyContent: "center" }}>{done ? "Reopen event" : "Mark event final"}</button>}
    </div>
  );
}

// ============ TENNIS — SINGLES ROUND ROBIN EDITOR ============
function TennisEditor({ ev, competitors, scheme, onBack, onSave, showToast }) {
  const theme = getTheme("tennis");
  const [results, setResults] = useState(ev.results || {});
  const [players, setPlayers] = useState(ev.players && ev.players.length ? ev.players : competitors.map((c) => c.id));
  const [done, setDone] = useState(ev.done);
  const [editLineup, setEditLineup] = useState((ev.players || []).length < 2);
  const [pick, setPick] = useState(ev.players || []);
  const nameOf = (id) => competitors.find((c) => c.id === id)?.name || "(removed)";
  const ready = players.length >= 2;

  // Load per-match keys on mount and subscribe to realtime updates
  useEffect(() => {
    if (!ev.id || !ready) return;
    (async () => {
      const pairs = tennisPairings(players);
      const vals = await Promise.all(pairs.map((m) => loadKey(KEYS.tennisMatch(ev.id, m.key), null)));
      const merged = { ...ev.results };
      pairs.forEach((m, i) => { if (vals[i] != null) merged[m.key] = vals[i]; });
      setResults(merged);
    })();
    const unsub = subscribeToChanges((key) => {
      if (key && key.startsWith(`scco:${YEAR}:tennis:${ev.id}:`)) {
        const matchKey = key.replace(`scco:${YEAR}:tennis:${ev.id}:`, "");
        loadKey(key, null).then((v) => { if (v != null) setResults((prev) => ({ ...prev, [matchKey]: v })); });
      }
    });
    return unsub;
  }, [ev.id, ready]);

  const setWinner = async (matchKey, id) => {
    const R = { ...results };
    if (R[matchKey] === id) delete R[matchKey]; else R[matchKey] = id;
    setResults(R);
    const val = R[matchKey] || null;
    const r1 = val != null
      ? await saveKey(KEYS.tennisMatch(ev.id, matchKey), val)
      : await saveKey(KEYS.tennisMatch(ev.id, matchKey), null);
    const r2 = await onSave({ ...ev, results: R, players, done });
    if (showToast) showToast(r1?.ok === false ? "err" : "ok");
  };
  const toggleDone = async () => { const nd = !done; setDone(nd); await onSave({ ...ev, results, players, done: nd }); };
  const saveLineup = async () => { setPlayers(pick); setEditLineup(false); setResults({}); setDone(false); await onSave({ ...ev, players: pick, results: {}, done: false }); };

  const rounds = ready ? genTennisRounds(players) : [];
  const standings = ready ? computeTennisStandings({ players, results }) : [];
  const totalM = tennisPairings(players).length;
  const played = Object.values(results).filter(Boolean).length;
  const hasData = played > 0;
  const complete = totalM > 0 && played === totalM;
  const champ = complete && standings[0] && (!standings[1] || standings[0].wins > standings[1].wins) ? standings[0] : null;
  const tcard = { background: "#fff", border: "1px solid rgba(132,204,22,0.4)", borderRadius: 13, boxShadow: "0 4px 14px rgba(0,0,0,0.22)" };

  return (
    <div>
      <EditorTopBar onBack={onBack} />
      <div style={{ background: theme.panelBg, borderRadius: 20, padding: "20px 16px 18px", boxShadow: "0 10px 30px rgba(0,0,0,0.3), inset 0 0 60px rgba(0,0,0,0.22)", position: "relative", overflow: "hidden", minHeight: 520, border: "1px solid rgba(132,204,22,0.3)" }}>
        <TennisBackdrop />
        <div style={{ position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 3 }}>
            <span style={{ fontSize: 26 }}>🎾</span><h2 style={{ margin: 0, fontSize: 23, color: "#fff", textShadow: "0 1px 4px rgba(0,0,0,0.4)" }}>{ev.name}</h2>
            <span style={badge("rgba(0,0,0,0.3)", "#bef264")}>ROUND ROBIN</span>{done && <span style={badge("rgba(190,242,100,0.3)", "#fff")}>FINAL</span>}
          </div>
          <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.9)", marginBottom: 14 }}>Singles, everyone plays everyone once — the fairest draw. Tap the winner of each match.</div>

          {(editLineup || !ready) ? (
            <div style={{ ...tcard, padding: 13, marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#3f6212", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 9 }}>Who's playing ({pick.length} → {pick.length >= 2 ? pick.length * (pick.length - 1) / 2 : 0} matches)</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                {competitors.length === 0 && <span style={{ fontSize: 13, color: "#94a3b8" }}>Add people in the Roster tab first.</span>}
                {competitors.map((c) => { const on = pick.includes(c.id); return <button key={c.id} onClick={() => setPick((p) => p.includes(c.id) ? p.filter((x) => x !== c.id) : [...p, c.id])} style={{ ...pickBtn, background: on ? "#4d7c0f" : "#f1f5f9", color: on ? "white" : "#334155", borderColor: on ? "#4d7c0f" : "#e2e8f0" }}>{on ? "✓ " : ""}{c.name}</button>; })}
              </div>
              <button onClick={saveLineup} disabled={pick.length < 2} style={{ ...primaryBtn, width: "100%", marginTop: 12, marginBottom: 0, opacity: pick.length < 2 ? 0.5 : 1 }}>{ready ? "Rebuild matches" : "Generate matches"}</button>
              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 8 }}>With an odd number, one player sits out each round (everyone sits the same amount over the event).</div>
            </div>
          ) : (
            <>
              {champ && (
                <div style={{ ...tcard, padding: "12px 14px", marginBottom: 12, display: "flex", alignItems: "center", gap: 10, background: "linear-gradient(90deg,#ecfccb,#bef264)" }}>
                  <span style={{ fontSize: 26 }}>🏆</span>
                  <div><div style={{ fontSize: 11, fontWeight: 800, color: "#3f6212", letterSpacing: 0.5 }}>CHAMPION</div><div style={{ fontWeight: 800, fontSize: 18, color: "#1a2e05" }}>{nameOf(champ.id)}</div></div>
                </div>
              )}
              {rounds.map((rd, ri) => (
                <div key={ri} style={{ ...tcard, padding: 11, marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
                    <div style={{ fontWeight: 800, fontSize: 12, color: "#3f6212", textTransform: "uppercase", letterSpacing: 0.5 }}>Round {ri + 1}</div>
                    {rd.bye && <div style={{ fontSize: 11, color: "#94a3b8" }}>{nameOf(rd.bye)} sits</div>}
                  </div>
                  {rd.matches.map((m, mi) => (
                    <div key={m.key} style={{ marginBottom: mi < rd.matches.length - 1 ? 8 : 0 }}>
                      <SlotBtn name={nameOf(m.a)} win={results[m.key] === m.a} onClick={() => setWinner(m.key, m.a)} />
                      <div style={{ textAlign: "center", fontSize: 10, color: "#cbd5e1", fontWeight: 700, margin: "3px 0" }}>vs</div>
                      <SlotBtn name={nameOf(m.b)} win={results[m.key] === m.b} onClick={() => setWinner(m.key, m.b)} />
                    </div>
                  ))}
                </div>
              ))}
              <div style={{ ...tcard, padding: "10px 13px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#3f6212", textTransform: "uppercase", letterSpacing: 0.5 }}>Standings ({played}/{totalM})</div>
                  <button onClick={() => { setPick(players); setEditLineup(true); }} style={{ ...smallBtn, background: "#f1f5f9", color: "#475569" }}>Players</button>
                </div>
                {standings.map((s, i) => (
                  <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0", borderTop: i ? "1px solid #f1f5f9" : "none" }}>
                    <div style={{ width: 24, textAlign: "center", fontSize: 15 }}>{i < 3 && hasData ? ["🥇", "🥈", "🥉"][i] : <span style={{ fontWeight: 700, color: "#94a3b8" }}>{s.place}</span>}</div>
                    <div style={{ flex: 1, fontWeight: 600 }}>{nameOf(s.id)}</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: "#334155" }}>{s.wins}-{s.losses}</div>
                    <div style={{ fontWeight: 800, color: "#4d7c0f", fontSize: 13, width: 32, textAlign: "right" }}>+{pointsForPlace(s.place, scheme)}</div>
                  </div>
                ))}
                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 6 }}>Ranked by wins. Placement points count toward the overall board once you mark this event final.</div>
              </div>
            </>
          )}
        </div>
      </div>
      {ready && !editLineup && <button onClick={toggleDone} style={{ ...(done ? ghostBtn : primaryBtn), width: "100%", marginTop: 14, justifyContent: "center" }}>{done ? "Reopen event" : "Mark event final"}</button>}
    </div>
  );
}
// ============ ROUND ROBIN EDITOR (doubles) ============
function RoundRobinEditor({ ev, competitors, scheme, onBack, onSave, showToast }) {
  const theme = getTheme(ev.theme);
  const [matches, setMatches] = useState(ev.matches || {});
  const [done, setDone] = useState(ev.done);
  const [editLineup, setEditLineup] = useState((ev.players || []).length !== 5);
  const [pick, setPick] = useState(ev.players || []);
  const nameOf = (id) => competitors.find((c) => c.id === id)?.name || "(removed)";
  const ready = (ev.schedule || []).length > 0 && (ev.players || []).length === 5;

  // Load per-match keys on mount and subscribe to realtime updates
  useEffect(() => {
    if (!ev.id || !(ev.schedule || []).length) return;
    (async () => {
      const rounds = await Promise.all((ev.schedule || []).map((_, i) => loadKey(KEYS.rrMatch(ev.id, i), null)));
      const merged = { ...ev.matches };
      rounds.forEach((m, i) => { if (m != null) merged[i] = m; });
      setMatches(merged);
    })();
    const unsub = subscribeToChanges((key) => {
      if (key && key.startsWith(`scco:${YEAR}:rr:${ev.id}:`)) {
        const round = parseInt(key.split(":").pop(), 10);
        loadKey(key, null).then((m) => { if (m != null) setMatches((prev) => ({ ...prev, [round]: m })); });
      }
    });
    return unsub;
  }, [ev.id]);

  const persist = async (nextMatches, nextDone = done) => {
    setMatches(nextMatches);
    await onSave({ ...ev, matches: nextMatches, done: nextDone });
  };
  const setWinner = async (ri, w) => {
    const m = matches[ri] || {};
    const next = { ...m, winner: m.winner === w ? null : w };
    setMatches((prev) => ({ ...prev, [ri]: next }));
    // per-match key for concurrent-safe writes
    const r1 = await saveKey(KEYS.rrMatch(ev.id, ri), next);
    // also snapshot on the event for standings / archiving
    const nextMatches = { ...matches, [ri]: next };
    const r2 = await onSave({ ...ev, matches: nextMatches, done });
    if (showToast) showToast(r1?.ok === false || r2 === false ? "err" : "ok");
  };
  const toggleDone = async () => { const nd = !done; setDone(nd); await onSave({ ...ev, matches, done: nd }); };
  const regenerate = async () => { if (!confirm("Rebuild the schedule with this lineup? Any recorded results will be cleared.")) return; await onSave({ ...ev, players: pick, schedule: genRoundRobin(pick) || [], matches: {}, done: false }); setMatches({}); setDone(false); setEditLineup(false); };

  const standings = computeRRStandings({ ...ev, matches });
  const tcard = { background: "#fff", border: `1px solid ${theme.dark ? theme.accent + "55" : "rgba(0,0,0,0.07)"}`, borderRadius: 13, boxShadow: "0 3px 10px rgba(0,0,0,0.12)" };
  const onFelt = { color: theme.text };
  const Backdrop = ev.theme === "beerdie" ? BeerDieBackdrop : null;

  const content = (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 3 }}>
        <span style={{ fontSize: 24 }}>{theme.emoji}</span><h2 style={{ margin: 0, fontSize: 22, ...onFelt }}>{ev.name}</h2>
        <span style={badge("rgba(0,0,0,0.18)", theme.text)}>ROUND ROBIN</span>{done && <span style={badge("rgba(255,255,255,0.25)", theme.text)}>FINAL</span>}
      </div>
      <div style={{ fontSize: 12.5, opacity: 0.9, marginBottom: 14, ...onFelt }}>Rotating partners · 5 rounds. Everyone partners each player once, faces each twice, and sits once.</div>

      {editLineup || !ready ? (
        <div style={{ ...tcard, padding: 13, marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 9, textTransform: "uppercase", letterSpacing: 0.5 }}>Pick exactly 5 players ({pick.length}/5)</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {competitors.length === 0 && <span style={{ fontSize: 13, color: "#94a3b8" }}>Add people in the Roster tab first.</span>}
            {competitors.map((c) => { const on = pick.includes(c.id); const disabled = !on && pick.length >= 5; return <button key={c.id} disabled={disabled} onClick={() => setPick((p) => p.includes(c.id) ? p.filter((x) => x !== c.id) : [...p, c.id])} style={{ ...pickBtn, opacity: disabled ? 0.4 : 1, background: on ? "#1e3a8a" : "#f1f5f9", color: on ? "white" : "#334155", borderColor: on ? "#1e3a8a" : "#e2e8f0" }}>{on ? "✓ " : ""}{c.name}</button>; })}
          </div>
          <button onClick={regenerate} disabled={pick.length !== 5} style={{ ...primaryBtn, width: "100%", marginTop: 12, marginBottom: 0, opacity: pick.length !== 5 ? 0.5 : 1 }}>{ready ? "Rebuild schedule" : "Generate schedule"}</button>
        </div>
      ) : null}

      {ready && !editLineup && (
        <>
          <div style={{ ...tcard, padding: "10px 12px", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5 }}>Standings</div>
              <button onClick={() => { setPick(ev.players); setEditLineup(true); }} style={{ ...smallBtn, background: "#f1f5f9", color: "#475569" }}>Lineup</button>
            </div>
            {standings.map((s, i) => (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0", borderTop: i ? "1px solid #f1f5f9" : "none" }}>
                <div style={{ width: 24, textAlign: "center", fontSize: 15 }}>{i < 3 && s.played ? ["🥇", "🥈", "🥉"][i] : <span style={{ fontWeight: 700, color: "#94a3b8" }}>{s.place}</span>}</div>
                <div style={{ flex: 1, fontWeight: 600 }}>{nameOf(s.id)}</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#334155" }}>{s.wins}-{s.losses}</div>
              </div>
            ))}
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 6 }}>Placement points count toward the overall board once you mark this event final.</div>
          </div>
          {ev.schedule.map((r, i) => {
            const m = matches[i] || {};
            return (
              <div key={i} style={{ ...tcard, padding: 12, marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ fontWeight: 800, fontSize: 13, color: "#334155" }}>Round {i + 1}</div>
                  <div style={{ fontSize: 11.5, color: "#94a3b8" }}>{nameOf(r.sitter)} sits</div>
                </div>
                <TeamRow label="A" names={r.teamA.map(nameOf)} win={m.winner === "A"} onWin={() => setWinner(i, "A")} />
                <div style={{ textAlign: "center", fontSize: 10, color: "#cbd5e1", fontWeight: 700, margin: "2px 0" }}>VS</div>
                <TeamRow label="B" names={r.teamB.map(nameOf)} win={m.winner === "B"} onWin={() => setWinner(i, "B")} />
              </div>
            );
          })}
        </>
      )}
    </>
  );

  return (
    <div>
      <EditorTopBar onBack={onBack} />
      {Backdrop ? (
        <div style={{ background: theme.panelBg, borderRadius: 20, padding: "20px 16px 18px", boxShadow: "0 10px 30px rgba(0,0,0,0.3), inset 0 0 60px rgba(0,0,0,0.22)", position: "relative", overflow: "hidden", minHeight: 520, border: "1px solid rgba(252,211,77,0.3)" }}>
          <Backdrop />
          <div style={{ position: "relative" }}>{content}</div>
        </div>
      ) : (
        <FeltShell theme={theme}>{content}</FeltShell>
      )}
      {ready && !editLineup && <button onClick={toggleDone} style={{ ...(done ? ghostBtn : primaryBtn), width: "100%", marginTop: 14, justifyContent: "center" }}>{done ? "Reopen event" : "Mark event final"}</button>}
    </div>
  );
}
function TeamRow({ label, names, win, onWin }) {
  return (
    <div onClick={onWin} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 9, cursor: "pointer", background: win ? "#ecfdf5" : "#f8fafc", border: win ? "1.5px solid #34d399" : "1.5px solid transparent" }}>
      <div style={{ width: 28, height: 28, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12, background: win ? "#10b981" : "#e2e8f0", color: win ? "white" : "#94a3b8", flexShrink: 0 }}>{win ? "✓" : label}</div>
      <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "#1e293b" }}>{names.join(" + ")}</div>
      {win && <span style={{ fontSize: 11, fontWeight: 800, color: "#16a34a", letterSpacing: 0.5 }}>WIN</span>}
    </div>
  );
}

// ============ PLACEMENT EVENT EDITOR ============
function EventEditor({ ev, competitors, teams, scheme, onBack, onSave }) {
  const [results, setResults] = useState(ev.results);
  const [done, setDone] = useState(ev.done);
  const theme = getTheme(ev.theme);
  const usedIds = new Set(results.map((r) => (ev.type === "team" ? r.teamId : r.competitorId)));
  const available = ev.type === "team" ? teams.filter((t) => !usedIds.has(t.id)) : competitors.filter((c) => !usedIds.has(c.id));
  const commit = async (nextResults, nextDone = done) => { setResults(nextResults); await onSave({ ...ev, results: nextResults, done: nextDone }); };
  const addPlacement = async (entityId) => {
    const place = results.length + 1; let row;
    if (ev.type === "team") { const team = teams.find((t) => t.id === entityId); row = { place, teamId: team.id, teamName: team.name, teamMembers: [...team.members] }; } else row = { place, competitorId: entityId };
    await commit([...results, row]);
  };
  const removePlacement = async (idx) => { await commit(results.filter((_, i) => i !== idx).map((r, i) => ({ ...r, place: i + 1 }))); };
  const move = async (idx, dir) => { const j = idx + dir; if (j < 0 || j >= results.length) return; const next = [...results]; [next[idx], next[j]] = [next[j], next[idx]]; await commit(next.map((r, i) => ({ ...r, place: i + 1 }))); };
  const nameFor = (r) => ev.type === "team" ? r.teamName : (competitors.find((x) => x.id === r.competitorId)?.name || "(removed)");
  const toggleDone = async () => { const nd = !done; setDone(nd); await onSave({ ...ev, results, done: nd }); };
  const tcard = { background: "#fff", border: `1px solid ${theme.dark ? theme.accent + "55" : "rgba(0,0,0,0.07)"}`, borderRadius: 13, boxShadow: "0 3px 10px rgba(0,0,0,0.12)" };
  const onFelt = { color: theme.text };

  return (
    <div>
      <EditorTopBar onBack={onBack} />
      <FeltShell theme={theme}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 3 }}>
          <span style={{ fontSize: 24 }}>{theme.emoji}</span><h2 style={{ margin: 0, fontSize: 22, ...onFelt }}>{ev.name}</h2>
          <span style={badge("rgba(0,0,0,0.18)", theme.text)}>{ev.type === "team" ? "TEAM" : "INDIVIDUAL"}</span>{done && <span style={badge("rgba(255,255,255,0.25)", theme.text)}>FINAL</span>}
        </div>
        <div style={{ fontSize: 12.5, opacity: 0.85, marginBottom: 14, ...onFelt }}>Add finishers in order. {ev.type === "team" ? "Each team member gets the placement points individually." : "Points are awarded by finishing place."}</div>

        {results.map((r, idx) => (
          <div key={idx} style={{ ...tcard, padding: "10px 12px", marginBottom: 8, display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 20, width: 28, textAlign: "center" }}>{idx < 3 ? ["🥇", "🥈", "🥉"][idx] : <span style={{ fontWeight: 700, color: "#94a3b8" }}>{idx + 1}</span>}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{nameFor(r)}</div>
              {ev.type === "team" && <div style={{ fontSize: 11, color: "#94a3b8" }}>{r.teamMembers.map((m) => competitors.find((c) => c.id === m)?.name).filter(Boolean).join(", ") || "no members"}</div>}
            </div>
            <div style={{ fontWeight: 800, color: theme.dark ? "#b45309" : theme.accent, fontSize: 14 }}>+{pointsForPlace(idx + 1, scheme)}</div>
            <div style={{ display: "flex", flexDirection: "column" }}><button onClick={() => move(idx, -1)} style={microBtn}>▲</button><button onClick={() => move(idx, 1)} style={microBtn}>▼</button></div>
            <button onClick={() => removePlacement(idx)} style={iconBtnGray}><X size={15} /></button>
          </div>
        ))}

        {available.length > 0 ? (
          <div style={{ ...tcard, padding: 13, marginTop: results.length ? 4 : 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 9, textTransform: "uppercase", letterSpacing: 0.5 }}>Add {ev.type === "team" ? "team" : "finisher"} · next: {ordinal(results.length + 1)}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{available.map((a) => <button key={a.id} onClick={() => addPlacement(a.id)} style={pickBtn}><Plus size={13} /> {a.name}</button>)}</div>
          </div>
        ) : (
          <div style={{ ...tcard, padding: 14, textAlign: "center", fontSize: 13, color: "#94a3b8" }}>{ev.type === "team" ? (teams.length === 0 ? "No teams yet — create teams in the Roster tab." : "All teams placed.") : (competitors.length === 0 ? "No competitors yet — add them in the Roster tab." : "All competitors placed.")}</div>
        )}
      </FeltShell>
      {results.length > 0 && <button onClick={toggleDone} style={{ ...(done ? ghostBtn : primaryBtn), width: "100%", marginTop: 14, justifyContent: "center" }}>{done ? "Reopen event" : "Mark event final"}</button>}
    </div>
  );
}

// ============ ROSTER ============
function Roster({ competitors, setCompetitors, teams, setTeams, scheme, setScheme }) {
  const [name, setName] = useState("");
  const [sub, setSub] = useState("people");
  const addPerson = async () => { if (!name.trim()) return; const next = [...competitors, { id: uid(), name: name.trim() }]; setCompetitors(next); await saveKey(KEYS.competitors, next); setName(""); };
  const removePerson = async (id) => {
    if (!confirm("Remove this competitor? Their event results stay but won't be attributed.")) return;
    const next = competitors.filter((c) => c.id !== id); setCompetitors(next); await saveKey(KEYS.competitors, next);
    const nt = teams.map((t) => ({ ...t, members: t.members.filter((m) => m !== id) })); setTeams(nt); await saveKey(KEYS.teams, nt);
  };
  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        <SubTab active={sub === "people"} onClick={() => setSub("people")} label={`People (${competitors.length})`} />
        <SubTab active={sub === "teams"} onClick={() => setSub("teams")} label={`Teams (${teams.length})`} />
        <SubTab active={sub === "scoring"} onClick={() => setSub("scoring")} label="Scoring" />
      </div>
      {sub === "people" && (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add competitor name" style={{ ...input, marginBottom: 0 }} onKeyDown={(e) => e.key === "Enter" && addPerson()} />
            <button onClick={addPerson} style={{ ...primaryBtn, marginBottom: 0, padding: "0 16px" }}><Plus size={18} /></button>
          </div>
          {competitors.length === 0 && <Empty icon={<Users size={28} />} title="No competitors" sub="Add everyone competing in the Games." />}
          {competitors.map((c) => (
            <div key={c.id} style={{ ...card, padding: "10px 14px", marginBottom: 8, display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#1e3a8a", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14 }}>{c.name.charAt(0).toUpperCase()}</div>
              <div style={{ flex: 1, fontWeight: 600 }}>{c.name}</div>
              <button onClick={() => removePerson(c.id)} style={iconBtnGray}><Trash2 size={15} /></button>
            </div>
          ))}
        </>
      )}
      {sub === "teams" && <TeamsManager teams={teams} setTeams={setTeams} competitors={competitors} />}
      {sub === "scoring" && <ScoringEditor scheme={scheme} setScheme={setScheme} />}
    </div>
  );
}

function TeamsManager({ teams, setTeams, competitors }) {
  const [tname, setTname] = useState("");
  const [building, setBuilding] = useState(null);
  const persist = async (next) => { setTeams(next); await saveKey(KEYS.teams, next); };
  const addTeam = async () => { if (!tname.trim()) return; const t = { id: uid(), name: tname.trim(), members: [] }; await persist([...teams, t]); setTname(""); setBuilding(t.id); };
  const toggleMember = async (teamId, cid) => { await persist(teams.map((t) => t.id === teamId ? { ...t, members: t.members.includes(cid) ? t.members.filter((m) => m !== cid) : [...t.members, cid] } : t)); };
  const deleteTeam = async (id) => { if (!confirm("Delete this team?")) return; await persist(teams.filter((t) => t.id !== id)); };
  return (
    <>
      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 12 }}>Teams are used for fixed-team events. For Spikeball-style rotating partners, use a Doubles RR event instead.</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <input value={tname} onChange={(e) => setTname(e.target.value)} placeholder="Team name" style={{ ...input, marginBottom: 0 }} onKeyDown={(e) => e.key === "Enter" && addTeam()} />
        <button onClick={addTeam} style={{ ...primaryBtn, marginBottom: 0, padding: "0 16px" }}><Plus size={18} /></button>
      </div>
      {teams.length === 0 && <Empty icon={<Users size={28} />} title="No teams" sub="Create fixed teams for team events." />}
      {teams.map((t) => (
        <div key={t.id} style={{ ...card, marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1, fontWeight: 700, fontSize: 15 }}>{t.name}</div>
            <span style={{ fontSize: 12, color: "#94a3b8" }}>{t.members.length} member{t.members.length !== 1 ? "s" : ""}</span>
            <button onClick={() => setBuilding(building === t.id ? null : t.id)} style={smallBtn}>{building === t.id ? "Done" : "Members"}</button>
            <button onClick={() => deleteTeam(t.id)} style={iconBtnGray}><Trash2 size={15} /></button>
          </div>
          {t.members.length > 0 && building !== t.id && <div style={{ fontSize: 13, color: "#475569", marginTop: 8 }}>{t.members.map((m) => competitors.find((c) => c.id === m)?.name).filter(Boolean).join(", ")}</div>}
          {building === t.id && (
            <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 7 }}>
              {competitors.length === 0 && <span style={{ fontSize: 13, color: "#94a3b8" }}>Add people first.</span>}
              {competitors.map((c) => { const on = t.members.includes(c.id); return <button key={c.id} onClick={() => toggleMember(t.id, c.id)} style={{ ...pickBtn, background: on ? "#1e3a8a" : "#f1f5f9", color: on ? "white" : "#334155", borderColor: on ? "#1e3a8a" : "#e2e8f0" }}>{on ? "✓ " : ""}{c.name}</button>; })}
            </div>
          )}
        </div>
      ))}
    </>
  );
}

function ScoringEditor({ scheme, setScheme }) {
  const [local, setLocal] = useState(scheme);
  const places = [1, 2, 3, 4, 5, 6];
  const update = (place, val) => setLocal({ ...local, [place]: val === "" ? 0 : parseInt(val) || 0 });
  const save = async () => { setScheme(local); await saveKey(KEYS.scheme, local); };
  return (
    <div>
      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 14 }}>Points awarded by finishing place. Anyone placing beyond 6th gets {PARTICIPATION} participation points. Changes apply to all events instantly.</div>
      {places.map((p) => (
        <div key={p} style={{ ...card, padding: "10px 14px", marginBottom: 8, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 18, width: 30 }}>{p <= 3 ? ["🥇", "🥈", "🥉"][p - 1] : <span style={{ fontWeight: 700, color: "#94a3b8" }}>{p}</span>}</div>
          <div style={{ flex: 1, fontWeight: 600 }}>{ordinal(p)} place</div>
          <input type="number" value={local[p] ?? 0} onChange={(e) => update(p, e.target.value)} style={{ width: 64, padding: "6px 8px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 15, textAlign: "center", fontWeight: 700 }} />
          <span style={{ fontSize: 12, color: "#94a3b8" }}>pts</span>
        </div>
      ))}
      <button onClick={save} style={{ ...primaryBtn, width: "100%", marginTop: 8, justifyContent: "center" }}>Save scoring</button>
    </div>
  );
}

// ============ GOLF EDITOR ============
function GolfEditor({ ev, competitors, scheme, onBack, onSave, showToast }) {
  const theme = getTheme("golf");
  const [scores, setScores] = useState(ev.scores || {});
  const [players] = useState(ev.players && ev.players.length ? ev.players : competitors.map((c) => c.id));
  const [done, setDone] = useState(ev.done);
  const [view, setView] = useState(null); // null = player list, playerId = that player's scorecard
  const nameOf = (id) => competitors.find((c) => c.id === id)?.name || "(removed)";
  const HOLES = Array.from({ length: 18 }, (_, i) => i + 1);

  // Load all per-player cards on mount and subscribe to realtime changes
  useEffect(() => {
    (async () => {
      const cards = await Promise.all(players.map((id) => loadKey(KEYS.golfCard(id), {})));
      const merged = {};
      players.forEach((id, i) => { if (Object.keys(cards[i]).length) merged[id] = cards[i]; });
      if (Object.keys(merged).length) setScores(merged);
    })();
    const unsub = subscribeToChanges((key) => {
      if (key && key.startsWith(`scco:${YEAR}:golf:`)) {
        const playerId = key.replace(`scco:${YEAR}:golf:`, "");
        loadKey(key, {}).then((card) => setScores((prev) => ({ ...prev, [playerId]: card })));
      }
    });
    return unsub;
  }, []);

  const setScore = async (playerId, hole, val) => {
    const cleaned = val === "" ? null : Math.max(1, parseInt(val) || 1);
    const nextCard = { ...(scores[playerId] || {}), [hole]: cleaned };
    const next = { ...scores, [playerId]: nextCard };
    setScores(next);
    const r1 = await saveKey(KEYS.golfCard(playerId), nextCard);
    await onSave({ ...ev, scores: next, players, done });
    if (showToast) showToast(r1?.ok === false ? "err" : "ok");
  };

  const toggleDone = async () => { const nd = !done; setDone(nd); await onSave({ ...ev, scores, players, done: nd }); };

  const standings = computeGolfStandings({ players, scores });
  const tcard = { background: "#fff", border: "1px solid rgba(22,101,52,0.2)", borderRadius: 13, boxShadow: "0 3px 10px rgba(0,0,0,0.1)" };

  // ---- Scorecard view ----
  if (view) {
    const card = scores[view] || {};
    const front = HOLES.slice(0, 9);
    const back = HOLES.slice(9, 18);
    const frontTotal = front.reduce((s, h) => s + (Number(card[h]) || 0), 0);
    const backTotal = back.reduce((s, h) => s + (Number(card[h]) || 0), 0);
    const grandTotal = frontTotal + backTotal;
    const holesPlayed = HOLES.filter((h) => card[h] != null).length;

    return (
      <div>
        <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => setView(null)} style={{ ...ghostBtn, padding: "6px 12px" }}>← Back</button>
          <div style={{ fontWeight: 800, fontSize: 17 }}>{nameOf(view)}</div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginLeft: "auto" }}>{holesPlayed}/18 holes</div>
        </div>
        <div style={{ background: theme.panelBg, borderRadius: 20, padding: "18px 14px", boxShadow: "0 8px 24px rgba(0,0,0,0.2)", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0, opacity: 0.06, fontSize: 120, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>⛳</div>
          <div style={{ position: "relative" }}>
            <div style={{ color: theme.text, fontWeight: 800, fontSize: 13, letterSpacing: 0.5, marginBottom: 10, opacity: 0.8 }}>FRONT NINE</div>
            {front.map((h) => {
              const val = Number(card[h]) || 0;
              return (
                <div key={h} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: h < 9 ? "1px solid rgba(255,255,255,0.1)" : "none" }}>
                  <div style={{ width: 22, fontSize: 12, fontWeight: 800, color: theme.text, opacity: 0.7 }}>H{h}</div>
                  <button onPointerDown={(e) => { e.preventDefault(); setScore(view, h, val > 1 ? val - 1 : ""); }} style={{ width: 38, height: 38, borderRadius: 10, border: "none", background: "rgba(255,255,255,0.15)", color: "#fff", fontSize: 22, fontWeight: 300, cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
                  <div style={{ flex: 1, textAlign: "center", fontWeight: 900, fontSize: 22, color: card[h] ? "#fde68a" : "rgba(255,255,255,0.4)" }}>{card[h] ?? "—"}</div>
                  <button onPointerDown={(e) => { e.preventDefault(); setScore(view, h, val + 1); }} style={{ width: 38, height: 38, borderRadius: 10, border: "none", background: "rgba(255,255,255,0.15)", color: "#fff", fontSize: 22, fontWeight: 300, cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
                </div>
              );
            })}
            <div style={{ display: "flex", justifyContent: "flex-end", margin: "10px 0 18px" }}>
              <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: "5px 12px", color: "#fff", fontWeight: 800, fontSize: 14 }}>
                Front: <span style={{ color: "#fde68a" }}>{frontTotal || "—"}</span>
              </div>
            </div>

            <div style={{ color: theme.text, fontWeight: 800, fontSize: 13, letterSpacing: 0.5, marginBottom: 10, opacity: 0.8 }}>BACK NINE</div>
            {back.map((h) => {
              const val = Number(card[h]) || 0;
              return (
                <div key={h} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: h < 18 ? "1px solid rgba(255,255,255,0.1)" : "none" }}>
                  <div style={{ width: 22, fontSize: 12, fontWeight: 800, color: theme.text, opacity: 0.7 }}>H{h}</div>
                  <button onPointerDown={(e) => { e.preventDefault(); setScore(view, h, val > 1 ? val - 1 : ""); }} style={{ width: 38, height: 38, borderRadius: 10, border: "none", background: "rgba(255,255,255,0.15)", color: "#fff", fontSize: 22, fontWeight: 300, cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
                  <div style={{ flex: 1, textAlign: "center", fontWeight: 900, fontSize: 22, color: card[h] ? "#fde68a" : "rgba(255,255,255,0.4)" }}>{card[h] ?? "—"}</div>
                  <button onPointerDown={(e) => { e.preventDefault(); setScore(view, h, val + 1); }} style={{ width: 38, height: 38, borderRadius: 10, border: "none", background: "rgba(255,255,255,0.15)", color: "#fff", fontSize: 22, fontWeight: 300, cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
                </div>
              );
            })}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
              <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: "5px 12px", color: "#fff", fontWeight: 800, fontSize: 14 }}>
                Back: <span style={{ color: "#fde68a" }}>{backTotal || "—"}</span>
              </div>
              <div style={{ background: "rgba(0,0,0,0.35)", borderRadius: 8, padding: "6px 14px", color: "#fde68a", fontWeight: 900, fontSize: 16 }}>
                Total: {grandTotal || "—"}
              </div>
            </div>
          </div>
        </div>
        <button onClick={() => setView(null)} style={{ ...ghostBtn, width: "100%", marginTop: 14, textAlign: "center" }}>← Back to scoreboard</button>
      </div>
    );
  }

  // ---- Player list view ----
  return (
    <div>
      <EditorTopBar onBack={onBack} />
      <div style={{ background: theme.panelBg, borderRadius: 20, padding: "18px 14px 16px", boxShadow: "0 8px 24px rgba(0,0,0,0.2)", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, opacity: 0.06, fontSize: 120, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>⛳</div>
        <div style={{ position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <span style={{ fontSize: 24 }}>⛳</span>
            <h2 style={{ margin: 0, fontSize: 22, color: theme.text }}>{ev.name}</h2>
            <span style={badge("rgba(0,0,0,0.18)", theme.text)}>STROKE PLAY</span>
            {done && <span style={badge("rgba(255,255,255,0.25)", theme.text)}>FINAL</span>}
          </div>
          <div style={{ fontSize: 12.5, color: theme.text, opacity: 0.8, marginBottom: 16 }}>18 holes · tap your name to enter your scorecard</div>

          {standings.map((s, i) => {
            const playerCard = scores[s.id] || {};
            const holesPlayed = HOLES.filter((h) => playerCard[h] != null).length;
            const front = HOLES.slice(0, 9).reduce((t, h) => t + (Number(playerCard[h]) || 0), 0);
            const back = HOLES.slice(9).reduce((t, h) => t + (Number(playerCard[h]) || 0), 0);
            const hasScores = holesPlayed > 0;
            return (
              <div key={s.id} onClick={() => setView(s.id)} style={{ ...tcard, padding: "12px 14px", marginBottom: 8, cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 28, textAlign: "center", fontSize: 16, fontWeight: 800, color: i < 3 && hasScores ? ["#b45309","#64748b","#92400e"][i] : "#94a3b8" }}>
                  {i < 3 && hasScores ? ["🥇","🥈","🥉"][i] : <span style={{ fontWeight: 700, color: "#94a3b8" }}>{i + 1}</span>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{nameOf(s.id)}</div>
                  {hasScores
                    ? <div style={{ fontSize: 11, color: "#64748b" }}>F9: {front || "—"} · B9: {back || "—"} · {holesPlayed}/18 holes</div>
                    : <div style={{ fontSize: 11, color: "#94a3b8" }}>Tap to enter scorecard</div>}
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  {hasScores && <div style={{ fontWeight: 900, fontSize: 22, color: "#14532d" }}>{s.total}</div>}
                  {!hasScores && <div style={{ fontSize: 22 }}>📝</div>}
                  <div style={{ fontSize: 10, color: "#94a3b8" }}>{hasScores ? "strokes" : ""}</div>
                </div>
                <ChevronRight size={16} color="#94a3b8" />
              </div>
            );
          })}
        </div>
      </div>
      {players.length > 0 && (
        <button onClick={toggleDone} style={{ ...(done ? ghostBtn : primaryBtn), width: "100%", marginTop: 14, justifyContent: "center" }}>
          {done ? "Reopen event" : "Mark event final"}
        </button>
      )}
    </div>
  );
}

// ============ ANALYTICS ============
function Analytics({ events, competitors, standings }) {
  const nameOf = (id) => competitors.find((c) => c.id === id)?.name || "(removed)";
  const firstName = (id) => nameOf(id).split(" ")[0];

  // ---- pair stats from all RR events (spikeball, beer die) ----
  const pairStats = {};
  const rrEvents = events.filter((e) => e.type === "roundrobin");
  rrEvents.forEach((ev) => {
    (ev.schedule || []).forEach((r, i) => {
      const m = (ev.matches || {})[i]; if (!m || !m.winner) return;
      const winPair = m.winner === "A" ? r.teamA : r.teamB;
      const losePair = m.winner === "A" ? r.teamB : r.teamA;
      const wk = pairKey(winPair[0], winPair[1]);
      const lk = pairKey(losePair[0], losePair[1]);
      if (!pairStats[wk]) pairStats[wk] = { ids: winPair, wins: 0, losses: 0 };
      if (!pairStats[lk]) pairStats[lk] = { ids: losePair, wins: 0, losses: 0 };
      pairStats[wk].wins++;
      pairStats[lk].losses++;
    });
  });
  const pairArr = Object.values(pairStats).filter((p) => p.wins + p.losses > 0).map((p) => ({ ...p, pct: p.wins / (p.wins + p.losses), games: p.wins + p.losses }));
  pairArr.sort((a, b) => b.pct - a.pct || b.games - a.games);
  const bestPair = pairArr[0] || null;
  const worstPair = pairArr[pairArr.length - 1] || null;

  // ---- individual win/loss across tennis + RR ----
  const indWins = {}, indLosses = {}, indGames = {};
  competitors.forEach((c) => { indWins[c.id] = 0; indLosses[c.id] = 0; indGames[c.id] = 0; });

  rrEvents.forEach((ev) => {
    (ev.schedule || []).forEach((r, i) => {
      const m = (ev.matches || {})[i]; if (!m || !m.winner) return;
      const winners = m.winner === "A" ? r.teamA : r.teamB;
      const losers = m.winner === "A" ? r.teamB : r.teamA;
      winners.forEach((id) => { if (indWins[id] != null) { indWins[id]++; indGames[id]++; } });
      losers.forEach((id) => { if (indLosses[id] != null) { indLosses[id]++; indGames[id]++; } });
    });
  });
  const tennisEvents = events.filter((e) => e.type === "tournament");
  tennisEvents.forEach((ev) => {
    tennisPairings(ev.players || []).forEach((m) => {
      const w = (ev.results || {})[m.key];
      if (!w) return;
      const loser = w === m.a ? m.b : m.a;
      if (indWins[w] != null) { indWins[w]++; indGames[w]++; }
      if (indLosses[loser] != null) { indLosses[loser]++; indGames[loser]++; }
    });
  });

  const indArr = competitors.map((c) => ({ id: c.id, wins: indWins[c.id] || 0, losses: indLosses[c.id] || 0, games: indGames[c.id] || 0, pct: indGames[c.id] ? indWins[c.id] / indGames[c.id] : 0 })).filter((x) => x.games > 0);
  indArr.sort((a, b) => b.pct - a.pct || b.wins - a.wins);
  const mostDominant = indArr[0] || null;
  const biggestChoker = [...indArr].sort((a, b) => a.pct - b.pct || b.losses - a.losses)[0] || null;

  // ---- poker ----
  const pokerEv = events.find((e) => e.type === "poker");
  let pokerKing = null, brokeboy = null;
  if (pokerEv) {
    const ls = computeLedgerStandings(pokerEv).filter((s) => s.buyIn > 0 || s.cashOut > 0);
    if (ls.length) { pokerKing = ls[0]; brokeboy = ls[ls.length - 1]; }
  }

  // ---- 9/9/9 ----
  const inningsEv = events.find((e) => e.type === "innings");
  let ironStomach = null, lightWeight = null;
  if (inningsEv) {
    const is = computeInningsStandings(inningsEv).filter((s) => s.innings > 0);
    if (is.length) { ironStomach = is[0]; lightWeight = is[is.length - 1]; }
  }

  // ---- head to head matrix (tennis 1v1 + RR: each winner beats both opponents) ----
  const h2h = {};
  competitors.forEach((a) => competitors.forEach((b) => { if (a.id !== b.id) h2h[a.id + "|" + b.id] = 0; }));
  tennisEvents.forEach((ev) => {
    tennisPairings(ev.players || []).forEach((m) => {
      const w = (ev.results || {})[m.key]; if (!w) return;
      const loser = w === m.a ? m.b : m.a;
      if (h2h[w + "|" + loser] != null) h2h[w + "|" + loser]++;
    });
  });
  rrEvents.forEach((ev) => {
    (ev.schedule || []).forEach((r, i) => {
      const m = (ev.matches || {})[i]; if (!m || !m.winner) return;
      const winners = m.winner === "A" ? r.teamA : r.teamB;
      const losers = m.winner === "A" ? r.teamB : r.teamA;
      winners.forEach((w) => losers.forEach((l) => { if (h2h[w + "|" + l] != null) h2h[w + "|" + l]++; }));
    });
  });

  // ---- nemesis: who beats you the most ----
  const nemesis = {};
  competitors.forEach((c) => {
    let worst = null, worstW = 0;
    competitors.forEach((o) => {
      if (o.id === c.id) return;
      const w = h2h[o.id + "|" + c.id] || 0;
      if (w > worstW) { worstW = w; worst = o.id; }
    });
    if (worst && worstW > 0) nemesis[c.id] = { id: worst, wins: worstW };
  });

  // ---- total hot dogs/beers ----
  const totalInnings = inningsEv ? (inningsEv.players || []).reduce((s, id) => s + Math.min(9, Number((inningsEv.progress || {})[id]) || 0), 0) : 0;

  // ---- points leader momentum (who's closest to 1st) ----
  const gap = standings.length >= 2 ? standings[0].total - standings[1].total : 0;

  const hasAnyData = indArr.length > 0 || pokerKing || ironStomach || bestPair;

  if (!hasAnyData) return (
    <div style={{ textAlign: "center", padding: "48px 20px", color: "#94a3b8" }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
      <div style={{ fontWeight: 700, color: "#64748b", marginBottom: 4 }}>No stats yet</div>
      <div style={{ fontSize: 13 }}>Play some games first — analytics will appear here.</div>
    </div>
  );

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 10 }}>Superlatives</div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
        {bestPair && <StatCard emoji="🤝" label="Best Duo" value={`${firstName(bestPair.ids[0])} + ${firstName(bestPair.ids[1])}`} sub={`${bestPair.wins}W-${bestPair.losses}L · ${Math.round(bestPair.pct * 100)}%`} color="#dcfce7" accent="#16a34a" />}
        {worstPair && bestPair !== worstPair && <StatCard emoji="💀" label="Worst Duo" value={`${firstName(worstPair.ids[0])} + ${firstName(worstPair.ids[1])}`} sub={`${worstPair.wins}W-${worstPair.losses}L · ${Math.round(worstPair.pct * 100)}%`} color="#fee2e2" accent="#dc2626" />}
        {mostDominant && <StatCard emoji="🔥" label="Most Dominant" value={firstName(mostDominant.id)} sub={`${mostDominant.wins}W-${mostDominant.losses}L · ${Math.round(mostDominant.pct * 100)}% win rate`} color="#fef3c7" accent="#d97706" />}
        {biggestChoker && biggestChoker.id !== mostDominant?.id && <StatCard emoji="🥶" label="Ice Cold" value={firstName(biggestChoker.id)} sub={`${biggestChoker.wins}W-${biggestChoker.losses}L · ${Math.round(biggestChoker.pct * 100)}% win rate`} color="#eff6ff" accent="#3b82f6" />}
        {pokerKing && pokerKing.net > 0 && <StatCard emoji="🃏" label="Poker King" value={firstName(pokerKing.id)} sub={`+$${pokerKing.net} net`} color="#fef9c3" accent="#ca8a04" />}
        {brokeboy && brokeboy.net < 0 && <StatCard emoji="💸" label="Broke Boy" value={firstName(brokeboy.id)} sub={`-$${Math.abs(brokeboy.net)} net`} color="#fce7f3" accent="#db2777" />}
        {ironStomach && <StatCard emoji="🌭" label="Iron Stomach" value={firstName(ironStomach.id)} sub={`${ironStomach.innings} innings · ${ironStomach.innings} hot dogs + ${ironStomach.innings} beers`} color="#fff7ed" accent="#ea580c" />}
        {lightWeight && lightWeight.id !== ironStomach?.id && <StatCard emoji="🥗" label="Light Weight" value={firstName(lightWeight.id)} sub={`Only ${lightWeight.innings} innings completed`} color="#f0fdf4" accent="#22c55e" />}
      </div>

      {Object.keys(nemesis).length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 10 }}>Nemeses</div>
          <div style={{ ...card, marginBottom: 14, padding: "12px 14px" }}>
            {competitors.filter((c) => nemesis[c.id]).map((c, i) => (
              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderTop: i ? "1px solid #f1f5f9" : "none" }}>
                <div style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>{c.name}</div>
                <div style={{ fontSize: 13, color: "#64748b" }}>loses to</div>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#dc2626" }}>{firstName(nemesis[c.id].id)}</div>
                <div style={{ fontSize: 11, color: "#94a3b8" }}>{nemesis[c.id].wins}× 😈</div>
              </div>
            ))}
          </div>
        </>
      )}

      {indArr.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 10 }}>Win Rate (All Events)</div>
          <div style={{ ...card, marginBottom: 14, padding: "12px 14px" }}>
            {[...indArr].sort((a, b) => b.pct - a.pct).map((s, i) => {
              const pct = Math.round(s.pct * 100);
              return (
                <div key={s.id} style={{ marginBottom: i < indArr.length - 1 ? 10 : 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{nameOf(s.id)}</span>
                    <span style={{ fontSize: 12, color: "#64748b" }}>{s.wins}W-{s.losses}L · <b style={{ color: pct >= 50 ? "#16a34a" : "#dc2626" }}>{pct}%</b></span>
                  </div>
                  <div style={{ height: 8, borderRadius: 4, background: "#f1f5f9", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, borderRadius: 4, background: pct >= 60 ? "#16a34a" : pct >= 40 ? "#f59e0b" : "#ef4444", transition: "width 0.4s" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {pairArr.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 10 }}>All Pair Records</div>
          <div style={{ ...card, marginBottom: 14, padding: "12px 14px" }}>
            {pairArr.map((p, i) => {
              const pct = Math.round(p.pct * 100);
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderTop: i ? "1px solid #f1f5f9" : "none" }}>
                  <div style={{ fontSize: 14 }}>{pct === 100 ? "🔥" : pct === 0 ? "💀" : pct >= 60 ? "✅" : "❌"}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{firstName(p.ids[0])} + {firstName(p.ids[1])}</div>
                  </div>
                  <div style={{ fontSize: 12, color: "#64748b", flexShrink: 0 }}>{p.wins}W-{p.losses}L</div>
                  <div style={{ fontWeight: 800, fontSize: 13, color: pct >= 50 ? "#16a34a" : "#dc2626", width: 36, textAlign: "right", flexShrink: 0 }}>{pct}%</div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {totalInnings > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 10 }}>9/9/9 Consumption</div>
          <div style={{ ...card, marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-around", padding: "10px 0" }}>
              <div style={{ textAlign: "center" }}><div style={{ fontSize: 28 }}>🌭</div><div style={{ fontWeight: 800, fontSize: 22, color: "#ea580c" }}>{totalInnings}</div><div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700 }}>HOT DOGS</div></div>
              <div style={{ textAlign: "center" }}><div style={{ fontSize: 28 }}>🍺</div><div style={{ fontWeight: 800, fontSize: 22, color: "#d97706" }}>{totalInnings}</div><div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700 }}>BEERS</div></div>
              <div style={{ textAlign: "center" }}><div style={{ fontSize: 28 }}>⚾</div><div style={{ fontWeight: 800, fontSize: 22, color: "#16a34a" }}>{competitors.length * 9 - totalInnings}</div><div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700 }}>REMAINING</div></div>
            </div>
          </div>
        </>
      )}

      {standings.length >= 2 && standings[0].total > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 10 }}>Points Gap</div>
          <div style={{ ...card, marginBottom: 14, padding: "12px 14px" }}>
            <div style={{ fontSize: 13, color: "#475569", marginBottom: 6 }}>
              <b style={{ color: "#1e3a8a" }}>{standings[0].name}</b> leads by <b style={{ color: gap > 5 ? "#dc2626" : "#d97706" }}>{gap} pts</b> over {standings[1].name}
            </div>
            {standings.map((s, i) => {
              const maxPts = standings[0].total || 1;
              return (
                <div key={s.id} style={{ marginBottom: i < standings.length - 1 ? 8 : 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{s.name.split(" ")[0]}</span>
                    <span style={{ fontSize: 12, fontWeight: 800, color: "#1e3a8a" }}>{s.total}</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 4, background: "#f1f5f9", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(s.total / maxPts) * 100}%`, borderRadius: 4, background: i === 0 ? "#fbbf24" : i === 1 ? "#94a3b8" : i === 2 ? "#c2773f" : "#cbd5e1" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ emoji, label, value, sub, color, accent }) {
  return (
    <div style={{ background: color, borderRadius: 14, padding: "12px 13px", border: `1px solid ${accent}33` }}>
      <div style={{ fontSize: 22, marginBottom: 4 }}>{emoji}</div>
      <div style={{ fontSize: 10, fontWeight: 800, color: accent, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 2 }}>{label}</div>
      <div style={{ fontWeight: 800, fontSize: 15, color: "#0f172a", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</div>
      <div style={{ fontSize: 11, color: "#64748b" }}>{sub}</div>
    </div>
  );
}

// ============ SHARED UI ============
const MEDAL_COLORS = ["#FFD54A", "#C7CDD6", "#D9914A"];
function TabBtn({ active, onClick, icon, label }) { return <button onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 10, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13, background: active ? "#1e3a8a" : "#f1f5f9", color: active ? "white" : "#64748b" }}>{icon} {label}</button>; }
function SubTab({ active, onClick, label }) { return <button onClick={onClick} style={{ flex: 1, padding: "8px 6px", borderRadius: 9, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 12.5, background: active ? "#ede9fe" : "transparent", color: active ? "#6d28d9" : "#94a3b8" }}>{label}</button>; }
function TypeChip({ active, onClick, icon, label }) { return <button onClick={onClick} style={{ flex: 1, minWidth: 84, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px", borderRadius: 9, cursor: "pointer", fontWeight: 600, fontSize: 12.5, border: active ? "1.5px solid #1e3a8a" : "1.5px solid #e2e8f0", background: active ? "#eff6ff" : "white", color: active ? "#1e3a8a" : "#64748b" }}>{icon} {label}</button>; }
function Empty({ icon, title, sub }) { return <div style={{ textAlign: "center", padding: "36px 20px", color: "#94a3b8" }}><div style={{ marginBottom: 10, display: "flex", justifyContent: "center" }}>{icon}</div><div style={{ fontWeight: 700, color: "#64748b", marginBottom: 4 }}>{title}</div><div style={{ fontSize: 13 }}>{sub}</div></div>; }
function ordinal(n) { const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }

const card = { background: "white", border: "1px solid #e8edf3", borderRadius: 14, padding: 14, boxShadow: "0 1px 2px rgba(15,23,42,0.04)" };
const input = { width: "100%", padding: "11px 13px", border: "1px solid #e2e8f0", borderRadius: 10, fontSize: 15, outline: "none", boxSizing: "border-box" };
const primaryBtn = { display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "11px 16px", background: "#1e3a8a", color: "white", border: "none", borderRadius: 11, fontWeight: 700, fontSize: 14, cursor: "pointer", marginBottom: 14, width: "100%" };
const ghostBtn = { padding: "11px 16px", background: "#f1f5f9", color: "#475569", border: "none", borderRadius: 11, fontWeight: 600, fontSize: 14, cursor: "pointer" };
const smallBtn = { padding: "6px 12px", background: "#eff6ff", color: "#1e3a8a", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer" };
const microBtn = { padding: "0 5px", background: "transparent", border: "none", cursor: "pointer", color: "#cbd5e1", fontSize: 10, lineHeight: 1.2 };
const stepBtn = { width: 24, height: 24, borderRadius: 7, border: "1px solid #e2e8f0", background: "#fff", cursor: "pointer", fontWeight: 800, fontSize: 15, color: "#64748b", lineHeight: 1 };
const pickBtn = { display: "flex", alignItems: "center", gap: 5, padding: "8px 12px", background: "#f1f5f9", color: "#334155", border: "1px solid #e2e8f0", borderRadius: 9, fontWeight: 600, fontSize: 13, cursor: "pointer" };
const iconBtn = { background: "rgba(255,255,255,0.15)", border: "none", color: "white", padding: 8, borderRadius: 9, cursor: "pointer", display: "flex" };
const iconBtnGray = { background: "transparent", border: "none", color: "#cbd5e1", padding: 6, borderRadius: 7, cursor: "pointer", display: "flex" };
const badge = (bg, c) => ({ background: bg, color: c, fontSize: 10, fontWeight: 800, padding: "2px 7px", borderRadius: 6, letterSpacing: 0.5 });
