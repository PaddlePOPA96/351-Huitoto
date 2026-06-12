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
    <div className="fixed inset-0 bg-black/95 flex items-center justify-center p-4 z-50 animate-fade-in backdrop-blur-md">
      <div className="bg-zinc-950 border border-zinc-850 rounded-3xl w-full max-w-5xl p-6 flex flex-col shadow-2xl relative max-h-[95vh] overflow-y-auto sm:overflow-visible">
        
        {/* Glow decoration */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-72 h-32 bg-saweria/5 rounded-full blur-3xl pointer-events-none" />

        {/* Modal Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-zinc-900 z-10 relative gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-saweria/10 border border-saweria/20 flex items-center justify-center text-saweria font-black text-sm uppercase">
              {slotPosition}
            </div>
            <div>
              <h3 className="font-black text-white text-base sm:text-lg uppercase tracking-wider">
                Draft Pilihan Pemain
              </h3>
              <p className="text-zinc-500 text-[10px] sm:text-xs">
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
                className="py-1.5 px-3 bg-saweria hover:bg-saweria-light active:scale-95 text-black font-extrabold text-xs rounded-xl transition-all flex items-center gap-1.5 shadow-md shadow-saweria/10 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5 animate-spin-hover" />
                Gacha Ulang ({rerollsLeft}x Sisa)
              </button>
            ) : (
              <span className="py-1.5 px-3 bg-zinc-900 border border-zinc-850 text-zinc-500 font-extrabold text-xs rounded-xl cursor-not-allowed">
                Batas Gacha Habis (0/2)
              </span>
            )}
            
            <button 
              onClick={onClose}
              disabled={isOpeningPack}
              className="w-8 h-8 rounded-full bg-zinc-900 border border-zinc-850 text-zinc-400 hover:text-white flex items-center justify-center transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Main Content */}
        {isOpeningPack ? (
          /* Spin Card Pack Animation screen */
          <div className="flex flex-col items-center justify-center py-20 animate-fade-in w-full z-10">
            <div className="w-56 h-80 relative card-perspective">
              <div className="w-full h-full bg-gradient-to-b from-zinc-900 via-zinc-950 to-zinc-950 border-2 border-saweria rounded-3xl flex flex-col items-center justify-center p-6 shadow-[0_0_35px_rgba(255,203,5,0.25)] animate-3d-spin overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent -translate-x-full animate-pulse" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 bg-saweria/10 rounded-full blur-2xl pointer-events-none" />
                
                <Trophy className="w-14 h-14 text-saweria animate-pulse mb-6 drop-shadow-[0_0_10px_rgba(255,203,5,0.4)]" />
                
                <h4 className="text-sm font-black text-white uppercase tracking-widest leading-none">
                  Draft Pack
                </h4>
                <span className="text-[10px] text-zinc-500 font-bold mt-2.5 uppercase tracking-wider leading-none">
                  Membuka Posisi {slotPosition}
                </span>
              </div>
            </div>
            <div className="mt-8 text-center flex flex-col gap-1 animate-pulse">
              <span className="text-zinc-400 font-black uppercase tracking-wider text-xs">
                Mengacak Pemain Terbaik...
              </span>
              <span className="text-[9px] text-zinc-650 font-bold uppercase">
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
              let cardBg = "from-zinc-900 to-zinc-950 border-zinc-800 hover:border-zinc-700 hover:shadow-zinc-500/5";
              let ratingColor = "text-zinc-400";
              let glowEffect = "";
              let tierText = "Perunggu";
              
              if (pRating >= 85) {
                cardBg = "from-amber-600/90 via-amber-500/80 to-zinc-950 border-amber-400 hover:border-saweria hover:scale-102";
                ratingColor = "text-amber-300 font-extrabold";
                glowEffect = "shadow-[0_0_20px_rgba(255,203,5,0.25)] hover:shadow-[0_0_30px_rgba(255,203,5,0.4)]";
                tierText = "Emas Premium";
              } else if (pRating >= 75) {
                cardBg = "from-yellow-600/50 via-yellow-500/30 to-zinc-950 border-yellow-500/60 hover:border-yellow-400 hover:scale-102";
                ratingColor = "text-yellow-300 font-bold";
                glowEffect = "shadow-[0_0_15px_rgba(255,203,5,0.12)] hover:shadow-[0_0_20px_rgba(255,203,5,0.22)]";
                tierText = "Emas";
              } else if (pRating >= 65) {
                cardBg = "from-zinc-800/80 to-zinc-950 border-zinc-700 hover:border-zinc-500 hover:scale-102";
                ratingColor = "text-zinc-200 font-medium";
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
                    <Sparkles className="w-4 h-4 text-saweria absolute top-2.5 right-2.5 animate-pulse opacity-60 pointer-events-none" />
                  )}

                  {/* Card Top: Rating & Position */}
                  <div className="w-full flex items-center justify-between mt-1">
                    <div className="flex flex-col items-center">
                      <span className={`text-2xl font-black ${ratingColor} leading-none font-mono`}>
                        {pRating}
                      </span>
                      <span className="text-[9px] font-black uppercase tracking-wider text-white bg-black/40 px-1 py-0.5 rounded-sm mt-1">
                        {slotPosition}
                      </span>
                    </div>
                    <div className="text-[9px] text-zinc-400 font-semibold uppercase text-right leading-3 truncate max-w-[55px]">
                      {player.nationality.split(" ").slice(-1)[0]}
                    </div>
                  </div>

                  {/* Card Center: Player Face Image */}
                  <div className="w-18 h-18 rounded-full overflow-hidden bg-black/30 border border-white/10 flex items-center justify-center mt-1.5 relative shrink-0 shadow-inner">
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
                      <HelpCircle className="w-8 h-8 text-zinc-700" />
                    )}
                  </div>

                  {/* Card Bottom: Name & Club */}
                  <div className="w-full text-center flex flex-col items-center justify-end mt-2 min-w-0">
                    <h4 className="text-xs font-black text-white tracking-wide truncate max-w-full drop-shadow">
                      {player.name}
                    </h4>
                    <span className="text-[9px] text-saweria font-bold uppercase tracking-wider truncate max-w-full mt-0.5">
                      {player.club}
                    </span>
                    <span className="text-[8px] text-zinc-500 mt-0.5 italic leading-none truncate max-w-full">
                      {player.role || "Pemain Sepakbola"}
                    </span>
                  </div>

                  {/* Card Stats Grid */}
                  <div className="grid grid-cols-3 gap-x-2 gap-y-1 w-full text-[9px] font-mono mt-2 px-1 border-t border-white/5 pt-2 shrink-0">
                    {keyStats.map((stat, sIdx) => (
                      <div key={sIdx} className="flex justify-between items-center text-zinc-350">
                        <span className="text-zinc-500 font-sans font-bold">{stat.label}</span>
                        <span className="font-extrabold text-white">{stat.value}</span>
                      </div>
                    ))}
                  </div>
                  
                  {/* Visual helper badge */}
                  <div className="mt-2 text-[7px] text-zinc-400 bg-black/40 px-2 py-0.5 rounded-full font-bold uppercase tracking-widest leading-none pointer-events-none">
                    {tierText}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Legend / Info */}
        <div className="flex items-center gap-1.5 justify-center text-[10px] text-zinc-500 border-t border-zinc-900 pt-4 z-10 relative">
          <Trophy className="w-3.5 h-3.5 text-saweria" />
          <span>Klik pada salah satu kartu pemain untuk langsung mendrafnya ke dalam posisi tim.</span>
        </div>

      </div>
    </div>
  );
}
