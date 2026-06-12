import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Fixture, MatchEvent, MatchStats } from "../lib/types";
import { Play, Pause, FastForward, Shield, CheckCircle, Flame, Zap, Target, AlertTriangle } from "lucide-react";

interface MatchCenterProps {
  homeName: string;
  awayName: string;
  simulatedMatch: Fixture;
  onMatchFinished: (finishedFixture: Fixture) => void;
}

export default function MatchCenter({
  homeName,
  awayName,
  simulatedMatch,
  onMatchFinished
}: MatchCenterProps) {
  const [currentMinute, setCurrentMinute] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [speed, setSpeed] = useState<'normal' | 'fast' | 'instant'>('normal');
  const [goalFlashActive, setGoalFlashActive] = useState<boolean>(false);
  const [scorePulseTeam, setScorePulseTeam] = useState<'home' | 'away' | null>(null);
  const [lastEventCount, setLastEventCount] = useState<number>(0);
  const commentaryEndRef = useRef<HTMLDivElement>(null);

  // Speed mapping in milliseconds per game-minute
  const SPEED_MAP = {
    normal: 350,
    fast: 80,
    instant: 0
  };

  const finalEvents = simulatedMatch.events || [];
  const defaultStats: MatchStats = {
    possession: [50, 50],
    shots: [0, 0],
    shotsOnTarget: [0, 0],
    corners: [0, 0],
    fouls: [0, 0],
    passes: [0, 0],
    passAccuracy: [0, 0],
    offsides: [0, 0],
    xg: [0, 0]
  };
  const finalStats = simulatedMatch.stats || defaultStats;

  // Determine total match minutes (including injury time)
  const totalMatchMinutes = useMemo(() => {
    if (finalEvents.length === 0) return 90;
    const fullTimeEvent = finalEvents.find(e => e.type === 'fulltime');
    return fullTimeEvent ? fullTimeEvent.minute : 90;
  }, [finalEvents]);

  // Run match simulation timer
  useEffect(() => {
    if (!isPlaying) return;

    if (speed === 'instant') {
      setCurrentMinute(totalMatchMinutes);
      setIsPlaying(false);
      return;
    }

    const intervalTime = SPEED_MAP[speed];
    const timer = setInterval(() => {
      setCurrentMinute((prev) => {
        if (prev >= totalMatchMinutes) {
          clearInterval(timer);
          setIsPlaying(false);
          return totalMatchMinutes;
        }
        return prev + 1;
      });
    }, intervalTime);

    return () => clearInterval(timer);
  }, [isPlaying, speed, totalMatchMinutes]);

  // Filter events that have occurred up to the current minute
  const visibleEvents = useMemo(() => {
    return finalEvents.filter(e => e.minute <= currentMinute);
  }, [finalEvents, currentMinute]);

  // Calculate scores up to the current minute
  const currentHomeScore = useMemo(() => {
    return finalEvents.filter(e => e.minute <= currentMinute && e.type === 'goal' && e.team === 'home').length;
  }, [finalEvents, currentMinute]);

  const currentAwayScore = useMemo(() => {
    return finalEvents.filter(e => e.minute <= currentMinute && e.type === 'goal' && e.team === 'away').length;
  }, [finalEvents, currentMinute]);

  // Goal flash trigger
  useEffect(() => {
    const goalEvents = visibleEvents.filter(e => e.type === 'goal');
    if (goalEvents.length > lastEventCount) {
      const latestGoal = goalEvents[goalEvents.length - 1];
      setGoalFlashActive(true);
      setScorePulseTeam(latestGoal.team as 'home' | 'away');
      setLastEventCount(goalEvents.length);

      setTimeout(() => setGoalFlashActive(false), 900);
      setTimeout(() => setScorePulseTeam(null), 800);
    }
  }, [visibleEvents, lastEventCount]);

  // Scroll to bottom of commentaries whenever a new event is shown
  useEffect(() => {
    commentaryEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [visibleEvents.length]);

  // Goalscorer strip data
  const goalscorers = useMemo(() => {
    const homeGoals: { player: string; minute: number }[] = [];
    const awayGoals: { player: string; minute: number }[] = [];

    finalEvents.forEach(e => {
      if (e.type === 'goal' && e.minute <= currentMinute) {
        const entry = { player: e.player || '?', minute: e.minute };
        if (e.team === 'home') homeGoals.push(entry);
        else if (e.team === 'away') awayGoals.push(entry);
      }
    });

    return { home: homeGoals, away: awayGoals };
  }, [finalEvents, currentMinute]);

  // Goal markers on progress bar
  const goalMarkers = useMemo(() => {
    return finalEvents
      .filter(e => e.type === 'goal' && e.minute <= currentMinute)
      .map(e => ({
        minute: e.minute,
        team: e.team,
        position: (e.minute / totalMatchMinutes) * 100
      }));
  }, [finalEvents, currentMinute, totalMatchMinutes]);

  // Interpolate statistics dynamically
  const currentStats = useMemo<MatchStats>(() => {
    if (currentMinute >= totalMatchMinutes) return finalStats;
    if (currentMinute === 0) return defaultStats;

    const ratio = currentMinute / totalMatchMinutes;
    const interpolated: MatchStats = {
      possession: finalStats.possession,
      shots: [
        Math.round(finalStats.shots[0] * ratio),
        Math.round(finalStats.shots[1] * ratio)
      ] as [number, number],
      shotsOnTarget: [
        Math.round(finalStats.shotsOnTarget[0] * ratio),
        Math.round(finalStats.shotsOnTarget[1] * ratio)
      ] as [number, number],
      corners: [
        Math.round(finalStats.corners[0] * ratio),
        Math.round(finalStats.corners[1] * ratio)
      ] as [number, number],
      fouls: [
        Math.round(finalStats.fouls[0] * ratio),
        Math.round(finalStats.fouls[1] * ratio)
      ] as [number, number],
      passes: [
        Math.round(finalStats.passes[0] * ratio),
        Math.round(finalStats.passes[1] * ratio)
      ] as [number, number],
      passAccuracy: finalStats.passAccuracy,
      offsides: [
        Math.round(finalStats.offsides[0] * ratio),
        Math.round(finalStats.offsides[1] * ratio)
      ] as [number, number],
      xg: [
        Math.round(finalStats.xg[0] * ratio * 100) / 100,
        Math.round(finalStats.xg[1] * ratio * 100) / 100
      ] as [number, number],
    };

    // Safety: SOT >= goals, shots >= SOT
    interpolated.shotsOnTarget[0] = Math.max(interpolated.shotsOnTarget[0], currentHomeScore);
    interpolated.shotsOnTarget[1] = Math.max(interpolated.shotsOnTarget[1], currentAwayScore);
    interpolated.shots[0] = Math.max(interpolated.shots[0], interpolated.shotsOnTarget[0]);
    interpolated.shots[1] = Math.max(interpolated.shots[1], interpolated.shotsOnTarget[1]);

    return interpolated;
  }, [finalStats, currentMinute, currentHomeScore, currentAwayScore, totalMatchMinutes]);

  const handleSkipToEnd = () => {
    setCurrentMinute(totalMatchMinutes);
    setIsPlaying(false);
  };

  const handleFinish = () => {
    onMatchFinished({
      ...simulatedMatch,
      homeScore: currentHomeScore,
      awayScore: currentAwayScore,
      simulated: true,
      stats: finalStats
    });
  };

  const progressPercentage = (currentMinute / totalMatchMinutes) * 100;
  const isInInjuryTime = currentMinute > 90;

  // Event type styling helper
  const getEventStyle = (event: MatchEvent) => {
    switch (event.type) {
      case 'goal':
        return {
          container: "bg-saweria/10 text-saweria border-saweria/30 font-bold animate-goal-glow",
          icon: "text-saweria",
          badge: "⚽"
        };
      case 'card':
        return {
          container: "bg-yellow-950/20 text-yellow-300 border-yellow-800/20",
          icon: "text-yellow-400",
          badge: "🟨"
        };
      case 'save':
        return {
          container: "bg-emerald-950/15 text-emerald-300 border-emerald-800/20",
          icon: "text-emerald-400",
          badge: "🧤"
        };
      case 'miss':
        return {
          container: "bg-zinc-900/40 text-zinc-400 border-zinc-800/30",
          icon: "text-zinc-500",
          badge: "💨"
        };
      case 'counter':
        return {
          container: "bg-red-950/15 text-red-300 border-red-800/20",
          icon: "text-red-400",
          badge: "⚡"
        };
      case 'penalty':
        return {
          container: "bg-red-950/20 text-red-200 border-red-700/30 animate-penalty-drama",
          icon: "text-red-400",
          badge: "🅿️"
        };
      case 'freekick':
        return {
          container: "bg-blue-950/15 text-blue-300 border-blue-800/20",
          icon: "text-blue-400",
          badge: "🎯"
        };
      case 'chance':
        return {
          container: "bg-amber-950/10 text-amber-300 border-amber-800/15",
          icon: "text-amber-400",
          badge: "💥"
        };
      case 'buildup':
        return {
          container: "bg-zinc-900/20 text-zinc-500 border-zinc-800/15 text-[10px]",
          icon: "text-zinc-600",
          badge: "🔄"
        };
      case 'injury_time':
        return {
          container: "bg-rose-950/20 text-rose-300 border-rose-800/30 text-center font-bold",
          icon: "text-rose-400",
          badge: "⏱️"
        };
      case 'halftime':
      case 'fulltime':
      case 'kickoff':
        return {
          container: "bg-zinc-900 text-white border-zinc-800/80 text-center font-bold italic",
          icon: "",
          badge: event.type === 'kickoff' ? "📢" : event.type === 'halftime' ? "🏁" : "🔚"
        };
      default:
        return {
          container: "bg-zinc-900/30 text-zinc-300 border-zinc-900/40",
          icon: "text-zinc-500",
          badge: "📋"
        };
    }
  };

  // Stat bar renderer helper
  const StatBar = ({ label, home, away, format = 'number' }: {
    label: string;
    home: number;
    away: number;
    format?: 'number' | 'percent' | 'decimal';
  }) => {
    const total = home + away;
    const homeWidth = total > 0 ? (home / total) * 100 : 50;
    const formatVal = (v: number) => {
      if (format === 'percent') return `${v}%`;
      if (format === 'decimal') return v.toFixed(2);
      return `${v}`;
    };

    return (
      <div className="flex flex-col">
        <div className="flex justify-between font-bold mb-1 text-zinc-300">
          <span>{formatVal(home)}</span>
          <span className="text-zinc-500 uppercase tracking-wider text-[10px]">{label}</span>
          <span>{formatVal(away)}</span>
        </div>
        <div className="w-full bg-zinc-900 h-2 rounded-full overflow-hidden flex border border-zinc-850">
          {total > 0 ? (
            <>
              <div
                className="bg-saweria h-full transition-all duration-500"
                style={{ width: `${homeWidth}%` }}
              />
              <div
                className="bg-zinc-700 h-full transition-all duration-500"
                style={{ width: `${100 - homeWidth}%` }}
              />
            </>
          ) : (
            <div className="w-1/2 bg-zinc-850 h-full" />
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-zinc-950 border border-zinc-850 rounded-2xl overflow-hidden shadow-2xl flex flex-col w-full max-w-3xl mx-auto h-[85vh] sm:h-[80vh] relative">

      {/* ═══ Goal Flash Overlay ═══ */}
      {goalFlashActive && (
        <div className="absolute inset-0 bg-saweria/30 z-50 pointer-events-none animate-goal-flash rounded-2xl" />
      )}

      {/* ═══ Scoreboard Panel ═══ */}
      <div className="bg-gradient-to-b from-zinc-900 to-zinc-950 p-5 border-b border-zinc-900 text-center relative">
        <div className="absolute top-3 left-4 flex gap-1.5 items-center">
          <span className={`w-2.5 h-2.5 rounded-full ${currentMinute >= totalMatchMinutes ? 'bg-zinc-500' : isInInjuryTime ? 'bg-red-500 animate-pulse' : 'bg-saweria animate-pulse'}`} />
          <span className={`text-[10px] uppercase font-bold tracking-widest ${currentMinute >= totalMatchMinutes ? 'text-zinc-500' : isInInjuryTime ? 'text-red-400' : 'text-saweria'}`}>
            {currentMinute >= totalMatchMinutes ? "Selesai" : isInInjuryTime ? "Injury Time" : "Simulasi Live"}
          </span>
        </div>

        <div className="flex items-center justify-between max-w-md mx-auto mt-2">
          {/* Home Team */}
          <div className="flex flex-col items-center flex-1 min-w-0">
            <div className="w-12 h-12 bg-zinc-850 border border-zinc-800 rounded-full flex items-center justify-center text-zinc-400 font-bold uppercase mb-2">
              {homeName.substring(0, 2)}
            </div>
            <span className="text-white text-xs sm:text-sm font-bold truncate w-full">
              {homeName}
            </span>
            {simulatedMatch.homeFormation && (
              <span className="text-[9px] text-zinc-500 font-mono mt-0.5">
                {simulatedMatch.homeFormation}
              </span>
            )}
          </div>

          {/* Current Score */}
          <div className="flex flex-col items-center px-4 shrink-0">
            <div className="flex items-center justify-center gap-4 text-4xl sm:text-5xl font-black text-white font-mono tracking-tighter">
              <span className={scorePulseTeam === 'home' ? 'animate-score-pulse' : ''}>
                {currentHomeScore}
              </span>
              <span className="text-zinc-700 text-3xl font-light">-</span>
              <span className={scorePulseTeam === 'away' ? 'animate-score-pulse' : ''}>
                {currentAwayScore}
              </span>
            </div>
            <div className={`mt-2 text-xs font-bold px-3 py-1 rounded-full border font-mono ${
              isInInjuryTime
                ? "text-red-400 bg-red-950/20 border-red-800/30"
                : "text-saweria bg-saweria/10 border-saweria/20"
            }`}>
              {currentMinute >= totalMatchMinutes ? 'FT' : `${currentMinute}'`}
            </div>
          </div>

          {/* Away Team */}
          <div className="flex flex-col items-center flex-1 min-w-0">
            <div className="w-12 h-12 bg-zinc-850 border border-zinc-800 rounded-full flex items-center justify-center text-zinc-400 font-bold uppercase mb-2">
              {awayName.substring(0, 2)}
            </div>
            <span className="text-white text-xs sm:text-sm font-bold truncate w-full">
              {awayName}
            </span>
            {simulatedMatch.awayFormation && (
              <span className="text-[9px] text-zinc-500 font-mono mt-0.5">
                {simulatedMatch.awayFormation}
              </span>
            )}
          </div>
        </div>

        {/* ═══ Goalscorer Strip ═══ */}
        {(goalscorers.home.length > 0 || goalscorers.away.length > 0) && (
          <div className="flex justify-between max-w-md mx-auto mt-3 text-[10px] text-zinc-400 gap-4">
            <div className="flex-1 text-left space-x-1 truncate">
              {goalscorers.home.map((g, i) => (
                <span key={i} className="text-saweria/80">
                  ⚽ {g.player} {g.minute}&apos;{i < goalscorers.home.length - 1 ? ',' : ''}
                </span>
              ))}
            </div>
            <div className="flex-1 text-right space-x-1 truncate">
              {goalscorers.away.map((g, i) => (
                <span key={i} className="text-saweria/80">
                  ⚽ {g.player} {g.minute}&apos;{i < goalscorers.away.length - 1 ? ',' : ''}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ═══ Progress Bar with Markers ═══ */}
        <div className="w-full bg-zinc-900 h-2 rounded-full mt-4 overflow-visible relative border border-zinc-850">
          {/* Halftime marker */}
          <div
            className="absolute top-0 bottom-0 w-px bg-zinc-600 z-10"
            style={{ left: `${(45 / totalMatchMinutes) * 100}%` }}
          />

          {/* Injury time zone (after 90') */}
          {totalMatchMinutes > 90 && (
            <div
              className="absolute top-0 bottom-0 bg-red-900/30 rounded-r-full animate-injury-pulse z-0"
              style={{
                left: `${(90 / totalMatchMinutes) * 100}%`,
                width: `${((totalMatchMinutes - 90) / totalMatchMinutes) * 100}%`
              }}
            />
          )}

          {/* Progress fill */}
          <div
            className={`h-full rounded-full transition-all duration-300 relative z-10 ${
              isInInjuryTime
                ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]"
                : "bg-saweria shadow-[0_0_8px_rgba(255,203,5,0.5)]"
            }`}
            style={{ width: `${progressPercentage}%` }}
          />

          {/* Goal markers */}
          {goalMarkers.map((g, i) => (
            <div
              key={i}
              className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white border-2 border-saweria z-20 shadow-[0_0_6px_rgba(255,203,5,0.6)]"
              style={{ left: `${g.position}%`, marginLeft: '-5px' }}
              title={`Goal at ${g.minute}'`}
            />
          ))}
        </div>
      </div>

      {/* ═══ Simulator Control Toolbar ═══ */}
      <div className="bg-zinc-900/40 p-3 border-b border-zinc-900 flex items-center justify-between text-xs px-6">
        <div className="flex items-center gap-2">
          {currentMinute < totalMatchMinutes && (
            <>
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className="p-1.5 rounded bg-zinc-800 hover:bg-zinc-750 text-white font-semibold transition-colors"
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>
              <button
                onClick={handleSkipToEnd}
                className="p-1.5 rounded bg-zinc-800 hover:bg-zinc-750 text-white font-semibold transition-colors flex items-center gap-1"
                title="Langsung ke Skor Akhir"
              >
                <FastForward className="w-4 h-4" />
                <span className="hidden sm:inline">Lewati</span>
              </button>
            </>
          )}
        </div>

        {/* Speed Selector */}
        {currentMinute < totalMatchMinutes && (
          <div className="flex bg-zinc-950 border border-zinc-850 rounded p-0.5">
            {(['normal', 'fast'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className={`px-3 py-1 rounded text-[10px] font-bold uppercase transition-all ${
                  speed === s
                    ? "bg-saweria text-black"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                {s === 'normal' ? '1x' : '4x'}
              </button>
            ))}
          </div>
        )}

        {currentMinute >= totalMatchMinutes && (
          <button
            onClick={handleFinish}
            className="py-1.5 px-4 bg-saweria text-black font-extrabold rounded-lg hover:bg-saweria-light transition-all flex items-center gap-1.5 animate-pulse ml-auto shadow-lg shadow-saweria/15"
          >
            <CheckCircle className="w-4 h-4" />
            Selesai Pertandingan
          </button>
        )}
      </div>

      {/* ═══ Main Panel: Commentary + Stats ═══ */}
      <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-5 bg-zinc-950">

        {/* Live Commentary Column */}
        <div className="md:col-span-3 border-r border-zinc-900 flex flex-col min-h-0">
          <div className="bg-zinc-900/20 px-4 py-2 border-b border-zinc-900/60 flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5 text-saweria" />
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-zinc-400">
              Komentar Jalannya Laga
            </span>
            <span className="ml-auto text-[9px] text-zinc-600 font-mono">
              {visibleEvents.length} events
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2.5 font-sans scrollbar-thin">
            {visibleEvents.map((event, idx) => {
              const style = getEventStyle(event);
              const isSystemEvent = ['kickoff', 'halftime', 'fulltime', 'injury_time'].includes(event.type);
              const isNewEvent = idx >= visibleEvents.length - 2;

              return (
                <div
                  key={idx}
                  className={`p-3 rounded-xl border text-xs leading-relaxed flex gap-2.5 transition-all duration-300 ${style.container} ${isNewEvent ? 'animate-slide-up' : ''}`}
                >
                  {/* Badge + Time */}
                  {!isSystemEvent && (
                    <div className="flex flex-col items-center shrink-0 gap-0.5">
                      <span className="text-sm">{style.badge}</span>
                      <span className={`font-mono font-bold text-[10px] ${style.icon}`}>
                        {event.minute}&apos;
                      </span>
                    </div>
                  )}
                  {isSystemEvent && (
                    <span className="text-sm shrink-0">{style.badge}</span>
                  )}
                  <div className="flex-1">
                    {event.text}
                    {/* Assist credit */}
                    {event.type === 'goal' && event.assist && (
                      <div className="mt-1 text-[10px] text-saweria/60 font-medium">
                        🅰️ Assist: {event.assist}
                      </div>
                    )}
                    {/* xG badge for shots */}
                    {event.xg !== undefined && event.xg > 0 && (
                      <span className="ml-2 text-[9px] text-zinc-500 font-mono bg-zinc-900/60 px-1.5 py-0.5 rounded">
                        xG {event.xg.toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={commentaryEndRef} />
          </div>
        </div>

        {/* ═══ Live Match Stats Column ═══ */}
        <div className="md:col-span-2 p-4 flex flex-col justify-start bg-zinc-950/40 overflow-y-auto scrollbar-thin">
          <div className="bg-zinc-900/20 px-2.5 py-1.5 rounded-lg border border-zinc-900/60 mb-4 text-center">
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-zinc-400">
              Statistik Laga
            </span>
          </div>

          <div className="space-y-3.5 text-xs font-sans">
            <StatBar label="Penguasaan Bola" home={currentStats.possession[0]} away={currentStats.possession[1]} format="percent" />
            <StatBar label="xG" home={currentStats.xg[0]} away={currentStats.xg[1]} format="decimal" />
            <StatBar label="Total Tembakan" home={currentStats.shots[0]} away={currentStats.shots[1]} />
            <StatBar label="Tepat Sasaran" home={currentStats.shotsOnTarget[0]} away={currentStats.shotsOnTarget[1]} />
            <StatBar label="Operan" home={currentStats.passes[0]} away={currentStats.passes[1]} />
            <StatBar label="Akurasi Operan" home={currentStats.passAccuracy[0]} away={currentStats.passAccuracy[1]} format="percent" />
            <StatBar label="Tendangan Sudut" home={currentStats.corners[0]} away={currentStats.corners[1]} />
            <StatBar label="Pelanggaran" home={currentStats.fouls[0]} away={currentStats.fouls[1]} />
            <StatBar label="Offside" home={currentStats.offsides[0]} away={currentStats.offsides[1]} />
          </div>
        </div>

      </div>
    </div>
  );
}
