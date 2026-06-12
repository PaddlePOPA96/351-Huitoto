import React from "react";
import { ClubStanding } from "../lib/types";
import { Trophy, Shield } from "lucide-react";

interface LeagueTableProps {
  standings: ClubStanding[];
  currentRound: number;
  totalRounds: number;
  isChampionsLeague?: boolean;
}

export default function LeagueTable({
  standings,
  currentRound,
  totalRounds,
  isChampionsLeague = false
}: LeagueTableProps) {
  // Sort standings based on standard league rules:
  // 1. Points desc
  // 2. Goal Difference desc
  // 3. Goals For desc
  // 4. Name asc
  const sortedStandings = [...standings].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className={`bg-zinc-950 border rounded-2xl overflow-hidden shadow-xl transition-all duration-300 ${
      isChampionsLeague 
        ? "border-blue-900/60 shadow-[0_0_20px_rgba(59,130,246,0.1)]" 
        : "border-zinc-850"
    }`}>
      {/* Standings Header */}
      <div className={`p-4 border-b flex items-center justify-between ${
        isChampionsLeague 
          ? "bg-blue-955/20 border-blue-900/40" 
          : "bg-zinc-900/40 border-zinc-900"
      }`}>
        <div className="flex items-center gap-2">
          <Trophy className={`w-5 h-5 ${isChampionsLeague ? "text-blue-400 animate-pulse" : "text-saweria"}`} />
          <h3 className="font-bold text-white tracking-wide text-sm sm:text-base">
            {isChampionsLeague ? "Klasemen UEFA Champions League" : "Klasemen Liga Domestik"}
          </h3>
        </div>
        <span className={`text-[10px] sm:text-xs border px-2 py-0.5 rounded font-medium ${
          isChampionsLeague 
            ? "text-blue-300 bg-blue-950/20 border-blue-900/40" 
            : "text-zinc-400 bg-zinc-900 border-zinc-850"
        }`}>
          Pekan {Math.min(currentRound + 1, totalRounds)} / {totalRounds}
        </span>
      </div>

      {/* Standings Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-zinc-900 text-[10px] sm:text-xs font-semibold uppercase text-zinc-500 tracking-wider">
              <th className="py-3 px-3 text-center w-8">#</th>
              <th className="py-3 px-3">Klub</th>
              <th className="py-3 px-2 text-center w-10">P</th>
              <th className="py-3 px-2 text-center w-8">W</th>
              <th className="py-3 px-2 text-center w-8">D</th>
              <th className="py-3 px-2 text-center w-8">L</th>
              <th className="py-3 px-2 text-center w-12 hidden sm:table-cell">GF-GA</th>
              <th className="py-3 px-2 text-center w-10">GD</th>
              <th className="py-3 px-3 text-center w-12 font-bold text-white">PTS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-900/60">
            {sortedStandings.map((team, index) => {
              const pos = index + 1;
              const isUser = team.isUser;
              
              // Top positions styling (Champions League slot, etc.)
              let posColor = "text-zinc-500";
              if (isChampionsLeague) {
                if (pos === 1) posColor = "text-yellow-400 font-black animate-pulse";
                else if (pos <= 4) posColor = "text-blue-400 font-bold";
              } else {
                if (pos <= 2) posColor = "text-yellow-400 font-black";
                else if (pos <= 4) posColor = "text-sky-400 font-bold";
              }

              return (
                <tr
                  key={team.name}
                  className={`text-xs sm:text-sm transition-colors ${
                    isUser 
                      ? "bg-saweria/10 text-saweria font-bold border-y border-saweria/30" 
                      : "text-zinc-300 hover:bg-zinc-900/40"
                  }`}
                >
                  {/* Position */}
                  <td className="py-2.5 px-3 text-center font-bold">
                    <span className={posColor}>{pos}</span>
                  </td>

                  {/* Team Name */}
                  <td className="py-2.5 px-3 font-semibold">
                    <div className="flex items-center gap-2 min-w-0">
                      {isUser ? (
                        <Shield className="w-4 h-4 text-saweria shrink-0" />
                      ) : (
                        <div className={`w-4 h-4 border rounded-full flex items-center justify-center text-[7px] font-bold uppercase shrink-0 ${
                          isChampionsLeague 
                            ? "bg-blue-950/40 border-blue-900/60 text-blue-400" 
                            : "bg-zinc-900 border-zinc-800 text-zinc-500"
                        }`}>
                          {team.name.substring(0, 2)}
                        </div>
                      )}
                      <span className="truncate max-w-[120px] sm:max-w-[180px]">
                        {team.name}
                      </span>
                    </div>
                  </td>

                  {/* Played */}
                  <td className="py-2.5 px-2 text-center text-zinc-400 font-medium">
                    {team.played}
                  </td>

                  {/* Won */}
                  <td className="py-2.5 px-2 text-center text-zinc-400 hidden sm:table-cell">
                    {team.won}
                  </td>
                  <td className="py-2.5 px-2 text-center text-zinc-400 sm:hidden">
                    {team.won}
                  </td>

                  {/* Drawn */}
                  <td className="py-2.5 px-2 text-center text-zinc-400">
                    {team.drawn}
                  </td>

                  {/* Lost */}
                  <td className="py-2.5 px-2 text-center text-zinc-400">
                    {team.lost}
                  </td>

                  {/* Goals For / Against (GF-GA) */}
                  <td className="py-2.5 px-2 text-center text-zinc-550 text-[11px] hidden sm:table-cell">
                    {team.goalsFor}-{team.goalsAgainst}
                  </td>

                  {/* Goal Difference */}
                  <td className={`py-2.5 px-2 text-center font-semibold ${
                    team.goalDifference > 0 
                      ? "text-emerald-400" 
                      : team.goalDifference < 0 
                      ? "text-rose-500" 
                      : "text-zinc-505"
                  }`}>
                    {team.goalDifference > 0 ? `+${team.goalDifference}` : team.goalDifference}
                  </td>

                  {/* Points */}
                  <td className={`py-2.5 px-3 text-center font-extrabold ${isUser ? "text-saweria" : "text-white"}`}>
                    {team.points}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      
      {/* Standings Footer Legend */}
      <div className="p-3 bg-zinc-900/20 border-t border-zinc-900 text-[10px] text-zinc-500 flex flex-wrap gap-4 justify-center">
        {isChampionsLeague ? (
          <>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-yellow-400" /> Juara Eropa (Peringkat 1)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-400" /> Semifinalis UCL (Peringkat 2-4)
            </span>
          </>
        ) : (
          <>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-yellow-400" /> Lolos Liga Champions (Peringkat 1-2)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-sky-400" /> Lolos Europa League (Peringkat 3-4)
            </span>
          </>
        )}
      </div>
    </div>
  );
}
