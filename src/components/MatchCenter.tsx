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
          container: "bg-emerald-50 text-emerald-700 border-emerald-200 font-bold animate-goal-glow shadow-sm",
          icon: "text-emerald-500",
          badge: "⚽"
        };
      case 'card':
        return {
          container: "bg-yellow-50 text-yellow-800 border-yellow-200 shadow-sm",
          icon: "text-yellow-600",
          badge: "🟨"
        };
      case 'save':
        return {
          container: "bg-teal-50 text-teal-700 border-teal-200 shadow-sm",
          icon: "text-teal-500",
          badge: "🧤"
        };
      case 'miss':
        return {
          container: "bg-slate-50 text-slate-500 border-slate-200 shadow-sm",
          icon: "text-slate-400",
          badge: "💨"
        };
      case 'counter':
        return {
          container: "bg-rose-50 text-rose-700 border-rose-200 shadow-sm",
          icon: "text-rose-500",
          badge: "⚡"
        };
      case 'penalty':
        return {
          container: "bg-rose-100 text-rose-800 border-rose-300 animate-penalty-drama shadow-sm",
          icon: "text-rose-600",
          badge: "🅿️"
        };
      case 'freekick':
        return {
          container: "bg-blue-50 text-blue-700 border-blue-200 shadow-sm",
          icon: "text-blue-500",
          badge: "🎯"
        };
      case 'chance':
        return {
          container: "bg-orange-50 text-orange-700 border-orange-200 shadow-sm",
          icon: "text-orange-500",
          badge: "💥"
        };
      case 'buildup':
        return {
          container: "bg-slate-50 text-slate-600 border-slate-200 text-[10px] shadow-sm",
          icon: "text-slate-400",
          badge: "🔄"
        };
      case 'injury_time':
        return {
          container: "bg-rose-50 text-rose-600 border-rose-200 text-center font-bold shadow-sm",
          icon: "text-rose-400",
          badge: "⏱️"
        };
      case 'halftime':
      case 'fulltime':
      case 'kickoff':
        return {
          container: "bg-slate-800 text-white border-slate-700 text-center font-bold italic shadow-md",
          icon: "",
          badge: event.type === 'kickoff' ? "📢" : event.type === 'halftime' ? "🏁" : "🔚"
        };
      default:
        return {
          container: "bg-white text-slate-600 border-slate-200 shadow-sm",
          icon: "text-slate-400",
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
        <div className="flex justify-between font-bold mb-1 text-slate-600">
          <span>{formatVal(home)}</span>
          <span className="text-slate-400 uppercase tracking-wider text-[10px]">{label}</span>
          <span>{formatVal(away)}</span>
        </div>
        <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden flex border border-slate-200 shadow-inner">
          {total > 0 ? (
            <>
              <div
                className="bg-emerald-400 h-full transition-all duration-500"
                style={{ width: `${homeWidth}%` }}
              />
              <div
                className="bg-blue-400 h-full transition-all duration-500"
                style={{ width: `${100 - homeWidth}%` }}
              />
            </>
          ) : (
            <div className="w-1/2 bg-slate-300 h-full" />
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white border-2 border-slate-200 rounded-[2rem] overflow-hidden shadow-2xl flex flex-col w-full max-w-3xl mx-auto h-[85vh] sm:h-[80vh] relative">

      {/* ═══ Goal Flash Overlay ═══ */}
      {goalFlashActive && (
        <div className="absolute inset-0 bg-emerald-500/20 z-50 pointer-events-none animate-goal-flash rounded-[2rem]" />
      )}

      {/* ═══ Scoreboard Panel ═══ */}
      <div className="bg-gradient-to-b from-slate-50 to-white p-5 border-b-2 border-slate-100 text-center relative shadow-sm z-10">
        <div className="absolute top-4 left-5 flex gap-1.5 items-center bg-white border border-slate-200 px-2 py-1 rounded-full shadow-sm">
          <span className={`w-2.5 h-2.5 rounded-full ${currentMinute >= totalMatchMinutes ? 'bg-slate-400' : isInInjuryTime ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500 animate-pulse'}`} />
          <span className={`text-[10px] uppercase font-bold tracking-widest ${currentMinute >= totalMatchMinutes ? 'text-slate-500' : isInInjuryTime ? 'text-rose-600' : 'text-emerald-600'}`}>
            {currentMinute >= totalMatchMinutes ? "Selesai" : isInInjuryTime ? "Injury Time" : "Live"}
          </span>
        </div>

        <div className="flex items-center justify-between max-w-md mx-auto mt-3">
          {/* Home Team */}
          <div className="flex flex-col items-center flex-1 min-w-0">
            <div className="w-14 h-14 bg-emerald-50 border-2 border-emerald-200 rounded-full flex items-center justify-center text-emerald-600 font-black text-lg uppercase mb-2 shadow-sm">
              {homeName.substring(0, 2)}
            </div>
            <span className="text-slate-800 text-xs sm:text-base font-black truncate w-full uppercase tracking-wide">
              {homeName}
            </span>
            {simulatedMatch.homeFormation && (
              <span className="text-[10px] text-slate-500 font-bold mt-1 bg-slate-100 px-2 py-0.5 rounded-full">
                {simulatedMatch.homeFormation}
              </span>
            )}
          </div>

          {/* Current Score */}
          <div className="flex flex-col items-center px-4 shrink-0">
            <div className="flex items-center justify-center gap-4 text-4xl sm:text-6xl font-black text-slate-800 font-mono tracking-tighter">
              <span className={scorePulseTeam === 'home' ? 'text-emerald-500 animate-score-pulse' : ''}>
                {currentHomeScore}
              </span>
              <span className="text-slate-300 text-3xl font-light">-</span>
              <span className={scorePulseTeam === 'away' ? 'text-blue-500 animate-score-pulse' : ''}>
                {currentAwayScore}
              </span>
            </div>
            <div className={`mt-2 text-xs font-bold px-4 py-1.5 rounded-full border-2 font-mono shadow-sm ${
              isInInjuryTime
                ? "text-rose-600 bg-rose-50 border-rose-200"
                : "text-emerald-700 bg-emerald-50 border-emerald-200"
            }`}>
              {currentMinute >= totalMatchMinutes ? 'FT' : `${currentMinute}'`}
            </div>
          </div>

          {/* Away Team */}
          <div className="flex flex-col items-center flex-1 min-w-0">
            <div className="w-14 h-14 bg-blue-50 border-2 border-blue-200 rounded-full flex items-center justify-center text-blue-600 font-black text-lg uppercase mb-2 shadow-sm">
              {awayName.substring(0, 2)}
            </div>
            <span className="text-slate-800 text-xs sm:text-base font-black truncate w-full uppercase tracking-wide">
              {awayName}
            </span>
            {simulatedMatch.awayFormation && (
              <span className="text-[10px] text-slate-500 font-bold mt-1 bg-slate-100 px-2 py-0.5 rounded-full">
                {simulatedMatch.awayFormation}
              </span>
            )}
          </div>
        </div>

        {/* ═══ Goalscorer Strip ═══ */}
        {(goalscorers.home.length > 0 || goalscorers.away.length > 0) && (
          <div className="flex justify-between max-w-md mx-auto mt-4 text-[11px] font-bold text-slate-500 gap-4">
            <div className="flex-1 text-left space-x-1 truncate">
              {goalscorers.home.map((g, i) => (
                <span key={i} className="text-emerald-600">
                  ⚽ {g.player} {g.minute}&apos;{i < goalscorers.home.length - 1 ? ',' : ''}
                </span>
              ))}
            </div>
            <div className="flex-1 text-right space-x-1 truncate">
              {goalscorers.away.map((g, i) => (
                <span key={i} className="text-blue-600">
                  ⚽ {g.player} {g.minute}&apos;{i < goalscorers.away.length - 1 ? ',' : ''}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ═══ Progress Bar with Markers ═══ */}
        <div className="w-full bg-slate-200 h-3 rounded-full mt-5 overflow-visible relative border border-slate-300 shadow-inner">
          {/* Halftime marker */}
          <div
            className="absolute top-0 bottom-0 w-px bg-slate-400 z-10"
            style={{ left: `${(45 / totalMatchMinutes) * 100}%` }}
          />

          {/* Injury time zone (after 90') */}
          {totalMatchMinutes > 90 && (
            <div
              className="absolute top-0 bottom-0 bg-rose-200 rounded-r-full animate-injury-pulse z-0"
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
                ? "bg-rose-500 shadow-sm"
                : "bg-emerald-400 shadow-sm"
            }`}
            style={{ width: `${progressPercentage}%` }}
          />

          {/* Goal markers */}
          {goalMarkers.map((g, i) => (
            <div
              key={i}
              className={`absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-white border-2 z-20 shadow-md ${g.team === 'home' ? 'border-emerald-500' : 'border-blue-500'}`}
              style={{ left: `${g.position}%`, marginLeft: '-7px' }}
              title={`Goal at ${g.minute}'`}
            />
          ))}
        </div>
      </div>

      {/* ═══ Simulator Control Toolbar ═══ */}
      <div className="bg-slate-50 p-4 border-b-2 border-slate-200 flex items-center justify-between text-xs px-6 shadow-sm">
        <div className="flex items-center gap-3">
          {currentMinute < totalMatchMinutes && (
            <>
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className="p-2.5 rounded-xl bg-white border-2 border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 font-black transition-all shadow-sm"
              >
                {isPlaying ? <Pause className="w-5 h-5 text-emerald-500" /> : <Play className="w-5 h-5 text-emerald-500" />}
              </button>
              <button
                onClick={handleSkipToEnd}
                className="p-2.5 rounded-xl bg-white border-2 border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-600 font-bold transition-all flex items-center gap-2 shadow-sm"
                title="Langsung ke Skor Akhir"
              >
                <FastForward className="w-5 h-5 text-blue-500" />
                <span className="hidden sm:inline">Lewati</span>
              </button>
            </>
          )}
        </div>

        {/* Speed Selector */}
        {currentMinute < totalMatchMinutes && (
          <div className="flex bg-slate-200 p-1 rounded-xl shadow-inner">
            {(['normal', 'fast'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className={`px-4 py-2 rounded-lg text-xs font-black uppercase transition-all ${
                  speed === s
                    ? "bg-white text-emerald-600 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
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
            className="py-2.5 px-6 bg-emerald-500 text-white font-black rounded-xl hover:bg-emerald-400 transition-all flex items-center gap-2 animate-pulse ml-auto shadow-md shadow-emerald-200"
          >
            <CheckCircle className="w-5 h-5" />
            Selesai Pertandingan
          </button>
        )}
      </div>

      {/* ═══ Main Panel: Commentary + Stats ═══ */}
      <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-5 bg-white">

        {/* Live Commentary Column */}
        <div className="md:col-span-3 border-r-2 border-slate-100 flex flex-col min-h-0 bg-slate-50/50">
          <div className="bg-white px-5 py-3 border-b-2 border-slate-100 flex items-center gap-2">
            <Flame className="w-4 h-4 text-orange-500" />
            <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-slate-600">
              Komentar Jalannya Laga
            </span>
            <span className="ml-auto text-[10px] text-slate-400 font-bold bg-slate-100 px-2 py-1 rounded-md">
              {visibleEvents.length} events
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-3 font-sans scrollbar-thin">
            {visibleEvents.map((event, idx) => {
              const style = getEventStyle(event);
              const isSystemEvent = ['kickoff', 'halftime', 'fulltime', 'injury_time'].includes(event.type);
              const isNewEvent = idx >= visibleEvents.length - 2;

              return (
                <div
                  key={idx}
                  className={`p-4 rounded-2xl border-2 text-sm leading-relaxed flex gap-3 transition-all duration-300 ${style.container} ${isNewEvent ? 'animate-slide-up shadow-md transform -translate-y-1' : 'opacity-80'}`}
                >
                  {/* Badge + Time */}
                  {!isSystemEvent && (
                    <div className="flex flex-col items-center shrink-0 gap-1 bg-white/50 rounded-xl p-2 min-w-[3rem]">
                      <span className="text-xl">{style.badge}</span>
                      <span className={`font-mono font-black text-xs ${style.icon}`}>
                        {event.minute}&apos;
                      </span>
                    </div>
                  )}
                  {isSystemEvent && (
                    <span className="text-xl shrink-0">{style.badge}</span>
                  )}
                  <div className="flex-1 pt-1 font-medium">
                    {event.text}
                    {/* Assist credit */}
                    {event.type === 'goal' && event.assist && (
                      <div className="mt-2 text-[11px] text-emerald-600 font-black bg-emerald-100/50 inline-block px-2 py-1 rounded-lg">
                        🅰️ Assist: {event.assist}
                      </div>
                    )}
                    {/* xG badge for shots */}
                    {event.xg !== undefined && event.xg > 0 && (
                      <span className="ml-2 text-[10px] text-slate-500 font-mono font-bold bg-white border border-slate-200 px-2 py-1 rounded-lg shadow-sm">
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
        <div className="md:col-span-2 p-6 flex flex-col justify-start bg-white overflow-y-auto scrollbar-thin">
          <div className="bg-slate-50 px-4 py-2.5 rounded-xl border-2 border-slate-100 mb-6 text-center shadow-sm">
            <span className="text-xs font-black uppercase tracking-widest text-slate-600">
              Statistik Laga
            </span>
          </div>

          <div className="space-y-5 text-sm font-sans">
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
