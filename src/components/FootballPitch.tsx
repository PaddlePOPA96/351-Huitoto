import React from "react";
import { DraftSlot } from "../lib/types";
import { normalizeRating } from "../lib/tactics";
import { User, Plus } from "lucide-react";

interface FootballPitchProps {
  draftSlots: DraftSlot[];
  onSlotClick: (slotId: number) => void;
  activeSlotId: number | null;
}

export default function FootballPitch({
  draftSlots,
  onSlotClick,
  activeSlotId
}: FootballPitchProps) {
  return (
    <div className="relative w-full aspect-[4/5] bg-emerald-950 border border-emerald-800/60 rounded-2xl overflow-hidden shadow-2xl shadow-black/40 select-none">
      {/* Pitch Grass Stripes */}
      <div className="absolute inset-0 flex flex-col">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className={`flex-1 w-full ${
              i % 2 === 0 ? "bg-emerald-900/10" : "bg-emerald-950/20"
            }`}
          />
        ))}
      </div>

      {/* Pitch Markings (White Lines with opacity) */}
      <div className="absolute inset-0 pointer-events-none opacity-20 border-[3px] border-white m-3 rounded-xl">
        {/* Center Line */}
        <div className="absolute top-1/2 left-0 right-0 h-[3px] bg-white transform -translate-y-1/2" />
        {/* Center Circle */}
        <div className="absolute top-1/2 left-1/2 w-24 h-24 border-[3px] border-white rounded-full transform -translate-x-1/2 -translate-y-1/2" />
        <div className="absolute top-1/2 left-1/2 w-1.5 h-1.5 bg-white rounded-full transform -translate-x-1/2 -translate-y-1/2" />

        {/* Penalty Box Top */}
        <div className="absolute top-0 left-1/2 w-48 h-24 border-[3px] border-t-0 border-white transform -translate-x-1/2" />
        <div className="absolute top-0 left-1/2 w-24 h-10 border-[3px] border-t-0 border-white transform -translate-x-1/2" />
        <div className="absolute top-[80px] left-1/2 w-1.5 h-1.5 bg-white rounded-full transform -translate-x-1/2" />
        {/* Top Penalty Arc */}
        <div className="absolute top-[68px] left-1/2 w-20 h-16 border-[3px] border-white rounded-full transform -translate-x-1/2 clip-bottom" />

        {/* Penalty Box Bottom */}
        <div className="absolute bottom-0 left-1/2 w-48 h-24 border-[3px] border-b-0 border-white transform -translate-x-1/2" />
        <div className="absolute bottom-0 left-1/2 w-24 h-10 border-[3px] border-b-0 border-white transform -translate-x-1/2" />
        <div className="absolute bottom-[80px] left-1/2 w-1.5 h-1.5 bg-white rounded-full transform -translate-x-1/2" />
        {/* Bottom Penalty Arc */}
        <div className="absolute bottom-[68px] left-1/2 w-20 h-16 border-[3px] border-white rounded-full transform -translate-x-1/2 clip-top" />
      </div>

      {/* Grid Overlay for Football Feel */}
      <div 
        className="absolute inset-0 bg-cover opacity-[0.03] pointer-events-none"
        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='none' stroke='%23fff' stroke-width='4'/%3E%3C/svg%3E")` }}
      />

      {/* Player Slots */}
      {draftSlots.map((slot) => {
        const hasPlayer = slot.player !== null;
        const isActive = activeSlotId === slot.id;
        const playerRating = hasPlayer ? normalizeRating(slot.player!.rat) : 0;
        
        // Color coding for rating tier
        let ratingColor = "bg-slate-500 text-white";
        if (playerRating >= 85) ratingColor = "bg-yellow-400 text-yellow-900 font-extrabold shadow-md";
        else if (playerRating >= 75) ratingColor = "bg-sky-400 text-sky-900 font-semibold";
        else if (playerRating >= 65) ratingColor = "bg-slate-200 text-slate-700";

        return (
          <button
            key={slot.id}
            onClick={() => onSlotClick(slot.id)}
            style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
            className={`absolute transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center group transition-all duration-300 focus:outline-none z-10`}
          >
            {hasPlayer ? (
              // Drafted Player Card Layout
              <div 
                className={`relative flex flex-col items-center p-1.5 w-16 sm:w-20 rounded-xl border-2 shadow-lg transition-all duration-300 ${
                  isActive 
                    ? "bg-white border-blue-500 shadow-blue-200 scale-110 z-20" 
                    : "bg-white border-slate-200 hover:border-blue-400 hover:shadow-md hover:scale-105"
                }`}
              >
                {/* Rating Badge */}
                <div className={`absolute -top-2 -right-2 px-1.5 py-0.5 rounded-md text-[10px] sm:text-xs z-20 font-sans tracking-tighter ${ratingColor}`}>
                  {playerRating}
                </div>

                {/* Player Face/Avatar */}
                <div className="relative w-8 h-8 sm:w-11 sm:h-11 rounded-full overflow-hidden bg-slate-50 border border-slate-200 flex items-center justify-center mt-1 shadow-sm">
                  {slot.player?.img_url && slot.player.img_url.includes("default") === false ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={slot.player.img_url}
                      alt={slot.player.name}
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = "none";
                      }}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User className="w-5 h-5 sm:w-7 sm:h-7 text-slate-400" />
                  )}
                </div>

                {/* Player Name */}
                <span className="mt-1.5 text-[9px] sm:text-[11px] font-bold text-slate-800 truncate max-w-full text-center px-0.5">
                  {slot.player?.name.split(" ").slice(-1)[0]}
                </span>
                
                {/* Player Role/Position */}
                <span className="text-[8px] font-black uppercase text-slate-400 scale-90 sm:scale-100">
                  {slot.position}
                </span>
              </div>
            ) : (
              // Empty Position Slot
              <div 
                className={`flex flex-col items-center justify-center w-12 h-12 sm:w-16 sm:h-16 rounded-full border-2 border-dashed transition-all duration-300 backdrop-blur-sm ${
                  isActive 
                    ? "border-white bg-white/40 shadow-lg scale-110" 
                    : "border-white/50 bg-white/20 hover:border-white hover:bg-white/30 hover:scale-105"
                }`}
              >
                <Plus className={`w-4 h-4 sm:w-5 sm:h-5 ${isActive ? "text-white animate-pulse" : "text-white/70 group-hover:text-white"}`} />
                <span className={`text-[8px] sm:text-[10px] font-bold ${isActive ? "text-white" : "text-white/80 group-hover:text-white"}`}>
                  {slot.position}
                </span>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
