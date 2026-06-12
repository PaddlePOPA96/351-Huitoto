import React, { useState, useMemo } from "react";
import { Player } from "../lib/types";
import { Search, Globe, Shield, User, HelpCircle, Trophy } from "lucide-react";
import { normalizeRating } from "../lib/tactics";
import PlayerAttributeModal from "./PlayerAttributeModal";

interface PlayerDatabaseBrowserProps {
  playersData: Record<string, Player[]>;
  clubsList: string[];
}

export default function PlayerDatabaseBrowser({
  playersData,
  clubsList
}: PlayerDatabaseBrowserProps) {
  const [selectedClub, setSelectedClub] = useState<string>(clubsList[0] || "");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);

  // Auto-correct selectedClub if it is empty but clubsList is not
  React.useEffect(() => {
    if (!selectedClub && clubsList.length > 0) {
      setSelectedClub(clubsList[0]);
    }
  }, [clubsList, selectedClub]);

  // Filter players based on selected club and query
  const filteredPlayers = useMemo(() => {
    if (!selectedClub) return [];
    const players = playersData[selectedClub] || [];
    
    if (!searchQuery.trim()) return players;

    const query = searchQuery.toLowerCase().trim();
    return players.filter(p => 
      p.name.toLowerCase().includes(query) ||
      p.position.toLowerCase().includes(query) ||
      p.role.toLowerCase().includes(query) ||
      p.nationality.toLowerCase().includes(query)
    );
  }, [playersData, selectedClub, searchQuery]);

  return (
    <div className="bg-zinc-950 border border-zinc-850 rounded-3xl overflow-hidden shadow-2xl p-6 w-full max-w-6xl mx-auto min-h-[75vh] flex flex-col relative">
      
      {/* Title Header */}
      <div className="border-b border-zinc-900 pb-5 mb-6">
        <h2 className="text-xl sm:text-2xl font-black text-white uppercase tracking-wider flex items-center gap-2">
          <Trophy className="w-6 h-6 text-saweria" />
          Database & Profil Pemain
        </h2>
        <p className="text-zinc-550 text-xs mt-1">
          Cari, saring, dan jelajahi seluruh detail atribut individual dari skuad top eropa secara lengkap.
        </p>
      </div>

      {/* Selectors Bar */}
      <div className="flex flex-col sm:flex-row gap-4 items-center mb-6 z-10 relative">
        {/* Dropdown Club */}
        <div className="flex flex-col w-full sm:w-64 gap-1.5">
          <label className="text-[10px] uppercase font-bold text-zinc-550 tracking-wider">Pilih Klub</label>
          <select
            value={selectedClub}
            onChange={(e) => setSelectedClub(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 text-white rounded-xl py-2 px-3 focus:outline-none focus:border-saweria text-xs sm:text-sm font-bold transition-all cursor-pointer"
          >
            {clubsList.map((club) => (
              <option key={club} value={club}>
                {club}
              </option>
            ))}
          </select>
        </div>

        {/* Text Search Bar */}
        <div className="flex flex-col w-full flex-1 gap-1.5">
          <label className="text-[10px] uppercase font-bold text-zinc-550 tracking-wider">Cari Pemain</label>
          <div className="relative w-full">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari nama, posisi (GK, ST, DC), peran, atau kebangsaan..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 text-white rounded-xl py-2.5 pl-10 pr-4 text-xs sm:text-sm placeholder-zinc-600 focus:outline-none focus:border-saweria transition-all"
            />
          </div>
        </div>
      </div>

      {/* Players Database Grid */}
      {filteredPlayers.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 overflow-y-auto max-h-[55vh] pr-2 scrollbar-thin">
          {filteredPlayers.map((player, idx) => {
            const rating = normalizeRating(player.rat);
            
            let cardBorder = "border-zinc-850 hover:border-zinc-700";
            let ratBg = "bg-zinc-800 text-zinc-300";

            if (rating >= 85) {
              cardBorder = "border-amber-500/40 hover:border-amber-400";
              ratBg = "bg-amber-500 text-zinc-950 font-black";
            } else if (rating >= 75) {
              cardBorder = "border-yellow-500/30 hover:border-yellow-400";
              ratBg = "bg-yellow-400 text-zinc-950 font-bold";
            } else if (rating >= 65) {
              cardBorder = "border-zinc-750 hover:border-zinc-550";
              ratBg = "bg-zinc-400 text-zinc-950";
            }

            return (
              <button
                key={player.name + "-" + idx}
                onClick={() => setSelectedPlayer(player)}
                className={`bg-zinc-900/30 border ${cardBorder} rounded-2xl p-3 flex flex-col items-center justify-between text-center transition-all duration-300 hover:scale-102 hover:bg-zinc-900/80 group cursor-pointer focus:outline-none h-[175px]`}
              >
                {/* Image Face */}
                <div className="w-12 h-12 rounded-full overflow-hidden bg-black/40 border border-zinc-800 flex items-center justify-center relative shadow-inner">
                  {player.img_url && player.img_url.includes("default") === false ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={player.img_url}
                      alt={player.name}
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = "none";
                      }}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User className="w-6 h-6 text-zinc-700" />
                  )}
                </div>

                {/* Rating & Position Badge */}
                <div className="flex gap-1.5 mt-2">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-bold ${ratBg}`}>
                    {rating}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800/80 text-white font-mono font-bold uppercase">
                    {player.position}
                  </span>
                </div>

                {/* Name */}
                <div className="mt-2 min-w-0 w-full">
                  <h4 className="text-xs font-black text-white group-hover:text-saweria transition-colors truncate">
                    {player.name}
                  </h4>
                  <span className="text-[9px] text-zinc-550 font-medium truncate block mt-0.5">
                    {player.role || "Pemain"}
                  </span>
                </div>

                {/* Country info */}
                <div className="flex items-center gap-1 text-[8px] text-zinc-500 mt-2 uppercase font-bold tracking-wider leading-none">
                  <Globe className="w-2.5 h-2.5 text-zinc-650" />
                  <span className="truncate max-w-[80px]">{player.nationality}</span>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        /* Empty Search screen */
        <div className="flex-1 flex flex-col items-center justify-center py-20 text-center">
          <HelpCircle className="w-12 h-12 text-zinc-750 mb-3 animate-pulse" />
          <h4 className="text-white font-bold text-sm uppercase">Pemain Tidak Ditemukan</h4>
          <p className="text-zinc-600 text-[11px] mt-1 max-w-xs mx-auto">
            Tidak ada pemain yang cocok dengan kata kunci &quot;{searchQuery}&quot; di klub {selectedClub}.
          </p>
        </div>
      )}

      {/* Helper text footer */}
      <div className="mt-auto border-t border-zinc-900/60 pt-4 text-center text-[10px] text-zinc-600">
        💡 Klik pada kartu profil pemain di atas untuk membuka lembar data atribut FM-nya secara terperinci.
      </div>

      {/* Attributes modal display details */}
      <PlayerAttributeModal
        isOpen={selectedPlayer !== null}
        onClose={() => setSelectedPlayer(null)}
        player={selectedPlayer}
      />
    </div>
  );
}
