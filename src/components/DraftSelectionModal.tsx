import React from "react";
import { Player } from "../lib/types";
import { normalizeRating } from "../lib/tactics";
import { X, Trophy, HelpCircle, Sparkles, RefreshCw } from "lucide-react";

interface DraftSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  slotPosition: string;
  choices: Player[];
  gachaCount: number;
  onReroll: () => void;
  onDraftPlayer: (player: Player) => void;
}

export default function DraftSelectionModal({
  isOpen,
  onClose,
  slotPosition,
  choices,
  gachaCount,
  onReroll,
  onDraftPlayer
}: DraftSelectionModalProps) {
  const [isOpeningPack, setIsOpeningPack] = React.useState<boolean>(true);

  // Reset pack opening animation timer when modal is opened or choices change (e.g. reroll)
  React.useEffect(() => {
    if (isOpen) {
      setIsOpeningPack(true);
      const timer = setTimeout(() => {
        setIsOpeningPack(false);
      }, 1000); // 1 second spinning animation
      return () => clearTimeout(timer);
    }
  }, [choices, isOpen]);

  if (!isOpen) return null;

  const rerollsLeft = Math.max(0, 2 - gachaCount);

  return (
    <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50 animate-fade-in backdrop-blur-sm">
      <div className="bg-white border-2 border-slate-200 rounded-[2rem] w-full max-w-5xl p-8 flex flex-col shadow-2xl relative max-h-[95vh] overflow-y-auto sm:overflow-visible">
        
        {/* Glow decoration */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-48 bg-emerald-100 rounded-full blur-3xl pointer-events-none" />

        {/* Modal Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b-2 border-slate-100 z-10 relative gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 border-2 border-emerald-200 flex items-center justify-center text-emerald-600 font-black text-lg uppercase shadow-sm">
              {slotPosition}
            </div>
            <div>
              <h3 className="font-black text-slate-800 text-xl sm:text-2xl uppercase tracking-wider">
                Draft Pilihan Pemain
              </h3>
              <p className="text-slate-500 text-xs sm:text-sm font-medium mt-1">
                Pilih salah satu pemain terbaik di bawah untuk menempati slot formasi Anda.
              </p>
            </div>
          </div>

          {/* Reroll & Close buttons in header */}
          <div className="flex items-center gap-3 ml-auto sm:ml-0 shrink-0">
            {rerollsLeft > 0 ? (
              <button
                onClick={onReroll}
                disabled={isOpeningPack}
                className="py-2 px-4 bg-emerald-50 text-emerald-700 border-2 border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300 active:scale-95 font-bold text-sm rounded-xl transition-all flex items-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <RefreshCw className="w-4 h-4 animate-spin-hover text-emerald-600" />
                Gacha Ulang ({rerollsLeft}x Sisa)
              </button>
            ) : (
              <span className="py-2 px-4 bg-slate-50 border-2 border-slate-200 text-slate-500 font-bold text-sm rounded-xl cursor-not-allowed">
                Batas Gacha Habis (0/2)
              </span>
            )}
            
            <button 
              onClick={onClose}
              disabled={isOpeningPack}
              className="w-10 h-10 rounded-full bg-white border-2 border-slate-200 text-slate-400 hover:text-rose-500 hover:border-rose-200 hover:bg-rose-50 flex items-center justify-center transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Main Content */}
        {isOpeningPack ? (
          /* Spin Card Pack Animation screen */
          <div className="flex flex-col items-center justify-center py-20 animate-fade-in w-full z-10">
            <div className="w-56 h-80 relative card-perspective">
              <div className="w-full h-full bg-gradient-to-b from-white via-slate-50 to-slate-100 border-4 border-emerald-300 rounded-3xl flex flex-col items-center justify-center p-6 shadow-xl animate-3d-spin overflow-hidden relative">
                <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/60 to-transparent -translate-x-full animate-pulse" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 bg-emerald-200 rounded-full blur-2xl pointer-events-none" />
                
                <Trophy className="w-16 h-16 text-emerald-500 animate-pulse mb-6 drop-shadow-md relative z-10" />
                
                <h4 className="text-lg font-black text-slate-800 uppercase tracking-widest leading-none relative z-10">
                  Draft Pack
                </h4>
                <span className="text-xs text-slate-500 font-bold mt-3 uppercase tracking-wider leading-none relative z-10">
                  Membuka Posisi {slotPosition}
                </span>
              </div>
            </div>
            <div className="mt-8 text-center flex flex-col gap-2 animate-pulse">
              <span className="text-slate-600 font-black uppercase tracking-wider text-sm">
                Mengacak Pemain Terbaik...
              </span>
              <span className="text-[10px] text-slate-400 font-bold uppercase">
                Menyaring Rating &ge; 50
              </span>
            </div>
          </div>
        ) : (
          /* Choices Grid */
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-5 py-8 z-10 relative">
            {choices.map((player, index) => {
              const pRating = normalizeRating(player.rat);
              
              // Tier styling
              let cardBg = "from-white to-slate-50 border-slate-200 hover:border-blue-300 hover:shadow-lg";
              let ratingColor = "text-slate-600";
              let glowEffect = "shadow-sm";
              let tierText = "Perunggu";
              let statTextColor = "text-slate-500";
              let statValueColor = "text-slate-800";
              let nameColor = "text-slate-800";
              let clubColor = "text-emerald-600";
              
              if (pRating >= 85) {
                cardBg = "from-yellow-100 via-yellow-50 to-white border-yellow-400 hover:border-yellow-500 hover:scale-105";
                ratingColor = "text-yellow-700 font-extrabold";
                glowEffect = "shadow-md shadow-yellow-200 hover:shadow-xl hover:shadow-yellow-300";
                tierText = "Emas Premium";
                statTextColor = "text-yellow-700/70";
                statValueColor = "text-yellow-900";
                nameColor = "text-yellow-900";
                clubColor = "text-yellow-700";
              } else if (pRating >= 75) {
                cardBg = "from-sky-100 via-sky-50 to-white border-sky-300 hover:border-sky-400 hover:scale-105";
                ratingColor = "text-sky-700 font-bold";
                glowEffect = "shadow-sm shadow-sky-100 hover:shadow-lg hover:shadow-sky-200";
                tierText = "Emas";
                statTextColor = "text-sky-700/70";
                statValueColor = "text-sky-900";
                nameColor = "text-sky-900";
                clubColor = "text-sky-700";
              } else if (pRating >= 65) {
                cardBg = "from-slate-100 to-white border-slate-300 hover:border-slate-400 hover:scale-105";
                ratingColor = "text-slate-700 font-medium";
                tierText = "Perak";
              }

              // Compute key attributes to display on card
              const isGK = slotPosition === "GK" || (player.position && player.position.toUpperCase().includes("GK"));
              const getAttr = (name: string) => player.attributes?.[name] ?? normalizeRating(player.rat);
              
              let keyStats: { label: string; value: number }[] = [];
              if (isGK) {
                keyStats = [
                  { label: "REF", value: getAttr("Reflexes") },
                  { label: "HAN", value: getAttr("Handling") },
                  { label: "1v1", value: getAttr("One on Ones") },
                  { label: "AER", value: getAttr("Aerial Reach") },
                  { label: "KIK", value: getAttr("Kicking") },
                  { label: "POS", value: getAttr("Positioning") },
                ];
              } else {
                keyStats = [
                  { label: "PAC", value: Math.round((getAttr("Pace") + getAttr("Acceleration")) / 2) },
                  { label: "SHO", value: Math.round((getAttr("Finishing") + getAttr("Long Shots")) / 2) },
                  { label: "PAS", value: Math.round((getAttr("Passing") + getAttr("Crossing")) / 2) },
                  { label: "DRI", value: Math.round((getAttr("Dribbling") + getAttr("Technique")) / 2) },
                  { label: "DEF", value: Math.round((getAttr("Tackling") + getAttr("Marking") + getAttr("Positioning")) / 3) },
                  { label: "PHY", value: Math.round((getAttr("Strength") + getAttr("Stamina") + getAttr("Jumping Reach")) / 3) },
                ];
              }

              return (
                <button
                  key={player.name + "-" + index}
                  onClick={() => {
                    onDraftPlayer(player);
                    onClose();
                  }}
                  style={{ animationDelay: `${index * 80}ms` }}
                  className={`bg-gradient-to-b ${cardBg} border-2 rounded-2xl flex flex-col items-center justify-between p-3 relative transition-all duration-300 focus:outline-none cursor-pointer text-left w-full h-[345px] ${glowEffect} animate-scale-up opacity-0 [animation-fill-mode:forwards] shrink-0`}
                >
                  {/* Shiny Sparkle on Gold Cards */}
                  {pRating >= 75 && (
                    <Sparkles className={`w-4 h-4 absolute top-2.5 right-2.5 animate-pulse opacity-60 pointer-events-none ${pRating >= 85 ? 'text-yellow-600' : 'text-sky-500'}`} />
                  )}

                  {/* Card Top: Rating & Position */}
                  <div className="w-full flex items-center justify-between mt-1">
                    <div className="flex flex-col items-center">
                      <span className={`text-2xl font-black ${ratingColor} leading-none font-mono`}>
                        {pRating}
                      </span>
                      <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md mt-1 ${pRating >= 85 ? 'bg-yellow-200 text-yellow-800' : pRating >= 75 ? 'bg-sky-200 text-sky-800' : 'bg-slate-200 text-slate-700'}`}>
                        {slotPosition}
                      </span>
                    </div>
                    <div className={`text-[9px] font-bold uppercase text-right leading-3 truncate max-w-[55px] ${statTextColor}`}>
                      {player.nationality.split(" ").slice(-1)[0]}
                    </div>
                  </div>

                  {/* Card Center: Player Face Image */}
                  <div className="w-18 h-18 rounded-full overflow-hidden bg-white border-2 border-white flex items-center justify-center mt-1.5 relative shrink-0 shadow-sm">
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
                      <HelpCircle className="w-8 h-8 text-slate-300" />
                    )}
                  </div>

                  {/* Card Bottom: Name & Club */}
                  <div className="w-full text-center flex flex-col items-center justify-end mt-2 min-w-0">
                    <h4 className={`text-xs font-black tracking-wide truncate max-w-full ${nameColor}`}>
                      {player.name}
                    </h4>
                    <span className={`text-[9px] font-bold uppercase tracking-wider truncate max-w-full mt-0.5 ${clubColor}`}>
                      {player.club}
                    </span>
                    <span className={`text-[8px] mt-0.5 italic leading-none truncate max-w-full ${statTextColor}`}>
                      {player.role || "Pemain Sepakbola"}
                    </span>
                  </div>

                  {/* Card Stats Grid */}
                  <div className={`grid grid-cols-3 gap-x-2 gap-y-1 w-full text-[9px] font-mono mt-2 px-1 border-t pt-2 shrink-0 ${pRating >= 85 ? 'border-yellow-200' : pRating >= 75 ? 'border-sky-200' : 'border-slate-200'}`}>
                    {keyStats.map((stat, sIdx) => (
                      <div key={sIdx} className="flex justify-between items-center">
                        <span className={`font-sans font-bold ${statTextColor}`}>{stat.label}</span>
                        <span className={`font-extrabold ${statValueColor}`}>{stat.value}</span>
                      </div>
                    ))}
                  </div>
                  
                  {/* Visual helper badge */}
                  <div className={`mt-2 text-[7px] px-2 py-0.5 rounded-full font-bold uppercase tracking-widest leading-none pointer-events-none ${pRating >= 85 ? 'bg-yellow-200 text-yellow-800' : pRating >= 75 ? 'bg-sky-200 text-sky-800' : 'bg-slate-200 text-slate-600'}`}>
                    {tierText}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Legend / Info */}
        <div className="flex items-center gap-1.5 justify-center text-[10px] text-slate-500 font-medium border-t-2 border-slate-100 pt-5 z-10 relative">
          <Trophy className="w-4 h-4 text-emerald-500" />
          <span>Klik pada salah satu kartu pemain untuk langsung mendrafnya ke dalam posisi tim.</span>
        </div>

      </div>
    </div>
  );
}
