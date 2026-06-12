import React, { useState, useMemo } from "react";
import { Player } from "../lib/types";
import { Search, Globe, Shield, User, HelpCircle, Trophy, Flag, ChevronRight, ArrowLeft } from "lucide-react";
import { normalizeRating } from "../lib/tactics";
import { calculateSquadRating } from "../lib/matchEngine";
import PlayerAttributeModal from "./PlayerAttributeModal";
import clubLogos from "../lib/clubLogos.json";

interface PlayerDatabaseBrowserProps {
  playersData: Record<string, Player[]>;
  clubsList: string[];
  playersByNation: Record<string, Player[]>;
  nationsList: string[];
}

export const POSITION_MAP: Record<string, string> = {
  "GK": "Goalkeeper (Penjaga Gawang)",
  "CB": "Centre-Back (Bek Tengah)",
  "LB": "Left-Back (Bek Kiri)",
  "RB": "Right-Back (Bek Kanan)",
  "SW": "Sweeper (Penyapu Bola)",
  "LWB": "Left Wing-Back (Bek Sayap Kiri)",
  "RWB": "Right Wing-Back (Bek Sayap Kanan)",
  "CM": "Central Midfielder (Gelandang Tengah)",
  "CMF": "Central Midfielder (Gelandang Tengah)",
  "DM": "Defensive Midfielder (Gelandang Bertahan)",
  "DMF": "Defensive Midfielder (Gelandang Bertahan)",
  "AM": "Attacking Midfielder (Gelandang Serang)",
  "AMF": "Attacking Midfielder (Gelandang Serang)",
  "LM": "Left Midfielder (Gelandang Kiri)",
  "RM": "Right Midfielder (Gelandang Kanan)",
  "ST": "Striker (Penyerang Utama)",
  "CF": "Centre-Forward (Penyerang Tengah)",
  "LW": "Left Winger (Penyerang Sayap Kiri)",
  "RW": "Right Winger (Penyerang Sayap Kanan)",
  "SS": "Second Striker (Penyerang Bayangan)",
  "CAM": "Central Attacking Midfielder",
  "CDM": "Central Defensive Midfielder",
  "LCB": "Left Centre-Back",
  "RCB": "Right Centre-Back",
  "LCM": "Left Central Midfielder",
  "RCM": "Right Central Midfielder",
  "LAM": "Left Attacking Midfielder",
  "RAM": "Right Attacking Midfielder",
};

const getPositionDisplay = (pos: string) => {
  return POSITION_MAP[pos.toUpperCase()] || pos;
};

const normalizeString = (str: string) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

// Precompute keys mapping for performance
const logoKeys = Object.keys(clubLogos);
const normalizedLogoKeys = logoKeys.map(k => ({ original: k, normalized: normalizeString(k) }));

const getClubLogo = (clubName?: string) => {
  if (!clubName) return null;
  if ((clubLogos as any)[clubName]) return (clubLogos as any)[clubName];
  
  const normClub = normalizeString(clubName);
  const match = normalizedLogoKeys.find(k => k.normalized === normClub || k.normalized.includes(normClub) || normClub.includes(k.normalized));
  
  return match ? (clubLogos as any)[match.original] : null;
};

export default function PlayerDatabaseBrowser({
  playersData,
  clubsList,
  playersByNation,
  nationsList
}: PlayerDatabaseBrowserProps) {
  const [viewMode, setViewMode] = useState<'club' | 'nation' | 'player'>('club');
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [visibleCount, setVisibleCount] = useState<number>(20);
  
  // Sidebar filters
  const [positionFilter, setPositionFilter] = useState<string>('All');
  const [minRatingFilter, setMinRatingFilter] = useState<number>(0);

  // Reset pagination and selection when view mode changes
  const handleViewModeChange = (mode: 'club' | 'nation' | 'player') => {
    setViewMode(mode);
    setSelectedGroup(null);
    setSearchQuery("");
    setVisibleCount(20);
    setPositionFilter('All');
    setMinRatingFilter(0);
  };

  // Filter groups (clubs or nations)
  const filteredGroups = useMemo(() => {
    const list = viewMode === 'club' ? clubsList : nationsList;
    return list; // In this version, search query applies to players globally, not groups
  }, [clubsList, nationsList, viewMode]);

  // Sort groups by rating or count
  const sortedGroups = useMemo(() => {
    return [...filteredGroups].sort((a, b) => {
      const aPlayers = viewMode === 'club' ? playersData[a] : playersByNation[a];
      const bPlayers = viewMode === 'club' ? playersData[b] : playersByNation[b];
      
      const aRating = calculateSquadRating(aPlayers || []);
      const bRating = calculateSquadRating(bPlayers || []);
      
      if (bRating !== aRating) return bRating - aRating; // Sort by rating descending
      return (bPlayers?.length || 0) - (aPlayers?.length || 0);
    });
  }, [filteredGroups, viewMode, playersData, playersByNation]);

  const displayedGroups = sortedGroups.slice(0, visibleCount);

  // Filter players if a group is selected OR searchQuery is active OR viewMode is 'player'
  const filteredPlayers = useMemo(() => {
    let basePlayers: Player[] = [];
    
    if (selectedGroup) {
      basePlayers = viewMode === 'club' ? playersData[selectedGroup] : playersByNation[selectedGroup];
      basePlayers = basePlayers || [];
    } else if (searchQuery.trim() || viewMode === 'player') {
      // Global search across all players
      const allPlayers = Object.values(playersData).flat();
      const uniquePlayers = Array.from(new Map(allPlayers.map(p => [p.name + p.club, p])).values());
      basePlayers = uniquePlayers;
    } else {
      return [];
    }
    
    // Apply search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      basePlayers = basePlayers.filter(p => 
        p.name.toLowerCase().includes(query) ||
        p.position.toLowerCase().includes(query) ||
        p.role.toLowerCase().includes(query)
      );
    }
    
    // Apply position filter
    if (positionFilter !== 'All') {
      basePlayers = basePlayers.filter(p => {
        const pos = p.position.toUpperCase();
        if (positionFilter === 'GK') return pos.includes('GK');
        if (positionFilter === 'DEF') return pos.includes('CB') || pos.includes('LB') || pos.includes('RB') || pos.includes('SW') || pos.includes('WB');
        if (positionFilter === 'MID') return pos.includes('CM') || pos.includes('DM') || pos.includes('AM') || pos.includes('LM') || pos.includes('RM');
        if (positionFilter === 'ATT') return pos.includes('ST') || pos.includes('CF') || pos.includes('LW') || pos.includes('RW') || pos.includes('SS');
        return true;
      });
    }
    
    // Apply rating filter
    if (minRatingFilter > 0) {
      basePlayers = basePlayers.filter(p => normalizeRating(p.rat) >= minRatingFilter);
    }

    return basePlayers;
  }, [playersData, playersByNation, viewMode, selectedGroup, searchQuery, positionFilter, minRatingFilter]);

  // Load more handler
  const handleLoadMore = () => {
    setVisibleCount(prev => prev + 20);
  };

  const getRatStyle = (rating: number) => {
    if (rating >= 85) return "bg-yellow-400 text-yellow-950 font-black border-yellow-500";
    if (rating >= 75) return "bg-blue-500 text-white font-bold border-blue-600";
    if (rating >= 65) return "bg-emerald-500 text-white font-bold border-emerald-600";
    return "bg-slate-100 text-slate-600 border-slate-200 font-bold";
  };

  const isPlayersView = selectedGroup !== null || searchQuery.trim() !== "" || viewMode === 'player';
  const displayedPlayers = filteredPlayers.slice(0, visibleCount);

  return (
    <div className="bg-white border-2 border-slate-100 rounded-3xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.04)] w-full flex flex-col relative flex-1 min-h-[75vh]">
      
      {/* Title Header - Bright Banner */}
      <div className="bg-gradient-to-r from-blue-500 to-sky-400 p-6 sm:p-8 text-white shrink-0">
        <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-wider flex items-center gap-3 drop-shadow-sm">
          <Trophy className="w-8 h-8 text-yellow-300" />
          Database Pemain
        </h2>
        <p className="text-blue-50 font-medium text-sm mt-2 opacity-90 max-w-xl">
          Eksplorasi data, statistik, dan atribut tersembunyi dari ribuan pesepakbola top dunia!
        </p>
      </div>

      <div className="p-6 sm:p-8 flex flex-col flex-1 h-full overflow-hidden">
        
        {/* Navigation & Controls Bar */}
        <div className="flex flex-col md:flex-row gap-4 mb-6 items-start md:items-center justify-between z-10 relative bg-slate-50 p-4 rounded-2xl border border-slate-100 shrink-0">
          
          {selectedGroup !== null ? (
            // Back Button when viewing a specific club's players
            <button
              onClick={() => {
                setSelectedGroup(null);
                setSearchQuery("");
                setPositionFilter("All");
                setMinRatingFilter(0);
              }}
              className="px-4 py-2.5 rounded-lg font-bold text-sm text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 hover:text-slate-800 transition-all flex items-center gap-2 shadow-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              Kembali ke Daftar {viewMode === 'club' ? 'Klub' : 'Negara'}
            </button>
          ) : (
            // Toggle Mode when viewing directory or global players
            <div className="flex flex-col gap-2">
              <label className="text-[11px] uppercase font-bold text-slate-500 tracking-wider">Kategori Direktori</label>
              <div className="flex bg-slate-200/50 p-1 rounded-xl w-fit">
                <button
                  onClick={() => handleViewModeChange('club')}
                  className={`px-5 py-2.5 rounded-lg font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-2 ${
                    viewMode === 'club' 
                      ? "bg-white text-blue-600 shadow-sm" 
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  <Shield className="w-4 h-4" /> Klub
                </button>
                <button
                  onClick={() => handleViewModeChange('nation')}
                  className={`px-5 py-2.5 rounded-lg font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-2 ${
                    viewMode === 'nation' 
                      ? "bg-white text-emerald-600 shadow-sm" 
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  <Flag className="w-4 h-4" /> Negara
                </button>
                <button
                  onClick={() => handleViewModeChange('player')}
                  className={`px-5 py-2.5 rounded-lg font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-2 ${
                    viewMode === 'player' 
                      ? "bg-white text-purple-600 shadow-sm" 
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  <User className="w-4 h-4" /> Pemain
                </button>
              </div>
            </div>
          )}

          {/* Text Search Bar - Now always searches for Players globally or inside group */}
          <div className="flex flex-col w-full md:w-80 gap-2 shrink-0">
            <label className="text-[11px] uppercase font-bold text-slate-500 tracking-wider">
              {selectedGroup ? `Cari Pemain di ${selectedGroup}` : `Cari Nama Pemain Secara Global`}
            </label>
            <div className="relative w-full">
              <Search className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Ketik nama pemain..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white border-2 border-slate-200 text-slate-800 rounded-xl py-2.5 pl-12 pr-4 text-sm placeholder-slate-400 focus:outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50 transition-all shadow-sm font-medium"
              />
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden">
          {!isPlayersView ? (
            // DIRECTORY VIEW (Clubs/Nations)
            <div className="h-full overflow-y-auto pr-2 pb-6 scrollbar-thin">
              {displayedGroups.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {displayedGroups.map((group, idx) => {
                    const groupPlayers = viewMode === 'club' ? playersData[group] : playersByNation[group];
                    const rating = calculateSquadRating(groupPlayers || []);
                    const logoSrc = viewMode === 'club' ? getClubLogo(group) : null;
                    
                    return (
                      <button
                        key={group + "-" + idx}
                        onClick={() => {
                          setSelectedGroup(group);
                          setSearchQuery("");
                        }}
                        className="bg-white border-2 border-slate-200 hover:border-blue-300 rounded-2xl p-4 flex flex-col items-start justify-between text-left transition-all duration-300 hover:-translate-y-1 shadow-sm hover:shadow-md group cursor-pointer focus:outline-none w-full"
                      >
                        <div className="flex items-center justify-between w-full mb-3">
                          <div className={`w-12 h-12 flex items-center justify-center rounded-xl p-1.5 ${viewMode === 'club' ? 'bg-blue-50/50' : 'bg-emerald-50/50'}`}>
                            {viewMode === 'club' ? (
                              logoSrc ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={logoSrc} alt={group} className="max-w-full max-h-full object-contain drop-shadow-sm" />
                              ) : (
                                <Shield className="w-7 h-7 text-blue-400" />
                              )
                            ) : (
                              <Globe className="w-7 h-7 text-emerald-400" />
                            )}
                          </div>
                          <span className={`text-xs px-2.5 py-1 rounded-lg border shadow-sm font-mono ${getRatStyle(rating)}`}>
                            OVR {rating}
                          </span>
                        </div>
                        
                        <h4 className="text-sm font-black text-slate-800 group-hover:text-blue-600 transition-colors w-full line-clamp-2 leading-tight">
                          {group}
                        </h4>
                        
                        <div className="flex items-center justify-between w-full mt-4 text-[10px] uppercase font-bold text-slate-500">
                          <span className="flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5 text-slate-400" />
                            {groupPlayers?.length || 0} Pemain
                          </span>
                          <span className="flex items-center gap-1 text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity">
                            Lihat Skuad <ChevronRight className="w-3.5 h-3.5" />
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-20 text-center bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 h-full">
                  <Search className="w-10 h-10 text-slate-300 animate-bounce mb-4" />
                  <h4 className="text-slate-700 font-black text-lg uppercase mb-1">Direktori Kosong</h4>
                  <p className="text-slate-500 text-sm max-w-sm mx-auto">
                    Tidak ada data klub atau negara yang ditemukan.
                  </p>
                </div>
              )}

              {/* Load More Button */}
              {displayedGroups.length < sortedGroups.length && (
                <div className="flex justify-center mt-8">
                  <button
                    onClick={handleLoadMore}
                    className="py-3 px-8 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold uppercase text-xs rounded-xl transition-all border border-slate-200 shadow-sm"
                  >
                    Tampilkan Lebih Banyak ({sortedGroups.length - displayedGroups.length} tersisa)
                  </button>
                </div>
              )}
            </div>
          ) : (
            // PLAYERS VIEW WITH SIDEBAR
            <div className="flex flex-col lg:flex-row gap-6 h-full min-h-0">
              
              {/* Left Sidebar for Filters */}
              <div className="w-full lg:w-64 shrink-0 flex flex-col gap-6 bg-slate-50 p-5 rounded-2xl border border-slate-100 overflow-y-auto">
                <div>
                  <h4 className="text-xs font-black uppercase text-slate-500 tracking-wider mb-3">Filter Posisi</h4>
                  <div className="flex flex-col gap-2">
                    {['All', 'GK', 'DEF', 'MID', 'ATT'].map(pos => (
                      <button
                        key={pos}
                        onClick={() => setPositionFilter(pos)}
                        className={`text-left px-3 py-2.5 rounded-lg text-xs font-bold transition-all ${positionFilter === pos ? 'bg-blue-500 text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'}`}
                      >
                        {pos === 'All' ? 'Semua Posisi' : pos === 'GK' ? 'Penjaga Gawang (GK)' : pos === 'DEF' ? 'Pemain Bertahan (DEF)' : pos === 'MID' ? 'Gelandang (MID)' : 'Penyerang (ATT)'}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-black uppercase text-slate-500 tracking-wider mb-3">Minimal Rating</h4>
                  <div className="flex flex-col gap-2">
                    {[0, 65, 75, 85].map(rating => (
                      <button
                        key={rating}
                        onClick={() => setMinRatingFilter(rating)}
                        className={`text-left px-3 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-between ${minRatingFilter === rating ? 'bg-emerald-500 text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'}`}
                      >
                        {rating === 0 ? 'Semua Rating' : `${rating}+ OVR`}
                        {rating > 0 && <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-black ${rating === 85 ? 'bg-yellow-400 text-yellow-900' : rating === 75 ? 'bg-blue-200 text-blue-900' : 'bg-slate-200 text-slate-700'}`}>Tier</span>}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Main Players Grid */}
              <div className="flex-1 overflow-y-auto pr-2 pb-6 scrollbar-thin">
                <div className="flex items-center gap-4 mb-6 pb-4 border-b-2 border-slate-100 sticky top-0 bg-white/95 backdrop-blur z-10 pt-2">
                  <div className={`w-14 h-14 flex items-center justify-center rounded-2xl bg-white border-2 border-slate-100 shadow-sm p-2`}>
                    {selectedGroup ? (
                      viewMode === 'club' ? (
                        getClubLogo(selectedGroup) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={getClubLogo(selectedGroup)!} alt={selectedGroup} className="max-w-full max-h-full object-contain" />
                        ) : (
                          <Shield className="w-7 h-7 text-blue-500" />
                        )
                      ) : (
                        <Globe className="w-7 h-7 text-emerald-500" />
                      )
                    ) : viewMode === 'player' ? (
                      <User className="w-7 h-7 text-purple-500" />
                    ) : (
                      <Search className="w-7 h-7 text-blue-500" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-800 uppercase tracking-wide">
                      {selectedGroup ? `Skuad ${selectedGroup}` : viewMode === 'player' ? 'Semua Pemain Global' : `Hasil Pencarian: ${searchQuery}`}
                    </h3>
                    <p className="text-xs font-semibold text-slate-500">
                      Menampilkan {filteredPlayers.length} pemain
                    </p>
                  </div>
                </div>

                {displayedPlayers.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {displayedPlayers.map((player, idx) => {
                      const rating = normalizeRating(player.rat);
                      const logoSrc = getClubLogo(player.club);
                      
                      let cardStyle = "border-slate-200 hover:border-blue-300 hover:shadow-blue-100";
                      let ratBg = getRatStyle(rating);

                      if (rating >= 85) cardStyle = "border-yellow-200 bg-gradient-to-b from-white to-yellow-50/50 hover:border-yellow-400 hover:shadow-yellow-100";
                      else if (rating >= 75) cardStyle = "border-blue-100 hover:border-blue-400 hover:shadow-blue-100";
                      else if (rating >= 65) cardStyle = "border-slate-200 hover:border-slate-400 hover:shadow-slate-100";

                      return (
                        <button
                          key={player.name + "-" + idx}
                          onClick={() => setSelectedPlayer(player)}
                          className={`bg-white border-2 ${cardStyle} rounded-2xl p-4 flex flex-col items-center justify-between text-center transition-all duration-300 hover:-translate-y-1 shadow-sm hover:shadow-lg group cursor-pointer focus:outline-none h-[220px] relative overflow-hidden`}
                        >
                          {/* Subtle Top Accent */}
                          <div className={`absolute top-0 left-0 w-full h-1 ${rating >= 85 ? 'bg-yellow-400' : rating >= 75 ? 'bg-blue-500' : 'bg-slate-200'}`} />

                          {/* Image Face */}
                          <div className="w-14 h-14 rounded-full overflow-hidden bg-slate-100 border-2 border-white shadow-sm flex items-center justify-center relative mt-1 shrink-0">
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
                              <User className="w-7 h-7 text-slate-300" />
                            )}
                          </div>

                          {/* Rating & Position Badge */}
                          <div className="flex gap-1.5 mt-3 shrink-0">
                            <span className={`text-[11px] px-2 py-0.5 rounded-md border shadow-sm font-mono font-bold ${ratBg}`}>
                              {rating}
                            </span>
                            <span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-800 text-white shadow-sm font-mono font-bold uppercase tracking-wider">
                              {player.position}
                            </span>
                          </div>

                          {/* Name */}
                          <div className="mt-3 min-w-0 w-full flex-1 flex flex-col justify-end">
                            <h4 className="text-[13px] font-black text-slate-800 group-hover:text-blue-600 transition-colors truncate">
                              {player.name}
                            </h4>
                            <span className="text-[9px] text-slate-500 font-bold truncate block mt-1 uppercase">
                              {getPositionDisplay(player.position)}
                            </span>
                          </div>

                          {/* Nation/Club info */}
                          <div className="flex items-center justify-center gap-1.5 text-[9px] text-slate-500 mt-3 uppercase font-bold tracking-wider leading-none bg-slate-50 w-full py-2 rounded border border-slate-100 shrink-0">
                            {viewMode === 'club' && selectedGroup ? (
                              <>
                                <Globe className="w-3 h-3 text-emerald-500" />
                                <span className="truncate max-w-[90px]">{player.nationality}</span>
                              </>
                            ) : (
                              <>
                                {logoSrc ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={logoSrc} alt="" className="w-3.5 h-3.5 object-contain" />
                                ) : (
                                  <Shield className="w-3 h-3 text-blue-500" />
                                )}
                                <span className="truncate max-w-[90px]">{player.club}</span>
                              </>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 text-center bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                    <Search className="w-10 h-10 text-slate-300 animate-bounce mb-4" />
                    <h4 className="text-slate-700 font-black text-lg uppercase mb-1">Pemain Tidak Ditemukan</h4>
                    <p className="text-slate-500 text-sm max-w-sm mx-auto">
                      Tidak ada pemain yang cocok dengan pencarian dan filter Anda.
                    </p>
                  </div>
                )}

                {/* Load More Button for Players */}
                {displayedPlayers.length < filteredPlayers.length && (
                  <div className="flex justify-center mt-8">
                    <button
                      onClick={handleLoadMore}
                      className="py-3 px-8 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold uppercase text-xs rounded-xl transition-all border border-slate-200 shadow-sm"
                    >
                      Tampilkan Lebih Banyak ({filteredPlayers.length - displayedPlayers.length} tersisa)
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
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
