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
    <div className={`bg-white border-2 rounded-2xl overflow-hidden shadow-xl transition-all duration-300 ${
      isChampionsLeague 
        ? "border-blue-200 shadow-blue-100" 
        : "border-slate-200"
    }`}>
      {/* Standings Header */}
      <div className={`p-4 border-b-2 flex items-center justify-between ${
        isChampionsLeague 
          ? "bg-blue-50 border-blue-100" 
          : "bg-slate-50 border-slate-100"
      }`}>
        <div className="flex items-center gap-2">
          <Trophy className={`w-5 h-5 ${isChampionsLeague ? "text-blue-500 animate-pulse" : "text-yellow-500"}`} />
          <h3 className="font-bold text-slate-700 tracking-wide text-sm sm:text-base">
            {isChampionsLeague ? "Klasemen UEFA Champions League" : "Klasemen Liga Domestik"}
          </h3>
        </div>
        <span className={`text-[10px] sm:text-xs border-2 px-3 py-1 rounded-lg font-bold shadow-sm ${
          isChampionsLeague 
            ? "text-blue-600 bg-white border-blue-200" 
            : "text-slate-500 bg-white border-slate-200"
        }`}>
          Pekan {Math.min(currentRound + 1, totalRounds)} / {totalRounds}
        </span>
      </div>

      {/* Standings Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b-2 border-slate-100 text-[10px] sm:text-xs font-bold uppercase text-slate-500 tracking-wider bg-slate-50">
              <th className="py-4 px-4 text-center w-8">#</th>
              <th className="py-4 px-3">Klub</th>
              <th className="py-4 px-2 text-center w-10">P</th>
              <th className="py-4 px-2 text-center w-8">W</th>
              <th className="py-4 px-2 text-center w-8">D</th>
              <th className="py-4 px-2 text-center w-8">L</th>
              <th className="py-4 px-2 text-center w-12 hidden sm:table-cell">GF-GA</th>
              <th className="py-4 px-2 text-center w-10">GD</th>
              <th className="py-4 px-4 text-center w-12 font-black text-slate-700">PTS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {sortedStandings.map((team, index) => {
              const pos = index + 1;
              const isUser = team.isUser;
              
              // Top positions styling (Champions League slot, etc.)
              let posColor = "text-slate-400";
              if (isChampionsLeague) {
                if (pos === 1) posColor = "text-yellow-500 font-black animate-pulse";
                else if (pos <= 4) posColor = "text-blue-500 font-bold";
              } else {
                if (pos <= 2) posColor = "text-yellow-500 font-black";
                else if (pos <= 4) posColor = "text-sky-500 font-bold";
              }

              return (
                <tr
                  key={team.name}
                  className={`text-xs sm:text-sm transition-colors ${
                    isUser 
                      ? "bg-emerald-50 text-emerald-800 font-bold border-y-2 border-emerald-200" 
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {/* Position */}
                  <td className="py-3.5 px-4 text-center font-bold">
                    <span className={posColor}>{pos}</span>
                  </td>

                  {/* Team Name */}
                  <td className="py-3.5 px-3 font-bold text-slate-700">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {isUser ? (
                        <Shield className="w-5 h-5 text-emerald-500 shrink-0" />
                      ) : (
                        <div className={`w-5 h-5 border rounded-full flex items-center justify-center text-[8px] font-bold uppercase shrink-0 shadow-sm ${
                          isChampionsLeague 
                            ? "bg-blue-50 border-blue-200 text-blue-600" 
                            : "bg-white border-slate-200 text-slate-500"
                        }`}>
                          {team.name.substring(0, 2)}
                        </div>
                      )}
                      <span className={`truncate max-w-[120px] sm:max-w-[180px] ${isUser ? 'text-emerald-700' : ''}`}>
                        {team.name}
                      </span>
                    </div>
                  </td>

                  {/* Played */}
                  <td className="py-3.5 px-2 text-center text-slate-500 font-semibold">
                    {team.played}
                  </td>

                  {/* Won */}
                  <td className="py-3.5 px-2 text-center text-slate-500 hidden sm:table-cell">
                    {team.won}
                  </td>
                  <td className="py-3.5 px-2 text-center text-slate-500 sm:hidden">
                    {team.won}
                  </td>

                  {/* Drawn */}
                  <td className="py-3.5 px-2 text-center text-slate-500">
                    {team.drawn}
                  </td>

                  {/* Lost */}
                  <td className="py-3.5 px-2 text-center text-slate-500">
                    {team.lost}
                  </td>

                  {/* Goals For / Against (GF-GA) */}
                  <td className="py-3.5 px-2 text-center text-slate-400 text-[11px] hidden sm:table-cell font-medium">
                    {team.goalsFor}-{team.goalsAgainst}
                  </td>

                  {/* Goal Difference */}
                  <td className={`py-3.5 px-2 text-center font-bold ${
                    team.goalDifference > 0 
                      ? "text-emerald-500" 
                      : team.goalDifference < 0 
                      ? "text-rose-500" 
                      : "text-slate-400"
                  }`}>
                    {team.goalDifference > 0 ? `+${team.goalDifference}` : team.goalDifference}
                  </td>

                  {/* Points */}
                  <td className={`py-3.5 px-4 text-center font-black ${isUser ? "text-emerald-700 text-base" : "text-slate-800"}`}>
                    {team.points}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      
      {/* Standings Footer Legend */}
      <div className="p-4 bg-slate-50 border-t-2 border-slate-100 text-[10px] sm:text-xs text-slate-500 font-medium flex flex-wrap gap-4 justify-center">
        {isChampionsLeague ? (
          <>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-yellow-500" /> Juara Eropa (Peringkat 1)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Semifinalis UCL (Peringkat 2-4)
            </span>
          </>
        ) : (
          <>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-yellow-500" /> Lolos Liga Champions (Peringkat 1-2)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-sky-500" /> Lolos Europa League (Peringkat 3-4)
            </span>
          </>
        )}
      </div>
    </div>
  );
}
