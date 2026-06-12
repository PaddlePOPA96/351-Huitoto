import React from "react";
import { Player } from "../lib/types";
import { X, Shield, Brain, Zap, HelpCircle } from "lucide-react";
import { normalizeRating, getPlayerAttribute } from "../lib/tactics";

interface PlayerAttributeModalProps {
  isOpen: boolean;
  onClose: () => void;
  player: Player | null;
}

export default function PlayerAttributeModal({
  isOpen,
  onClose,
  player
}: PlayerAttributeModalProps) {
  if (!isOpen || !player) return null;

  const isGK = player.position.toUpperCase().includes("GK");
  
  const technicalAttrs = [
    { name: "Crossing", label: "Crossing" },
    { name: "Dribbling", label: "Dribbling" },
    { name: "Finishing", label: "Finishing" },
    { name: "First Touch", label: "First Touch" },
    { name: "Heading", label: "Heading" },
    { name: "Long Shots", label: "Long Shots" },
    { name: "Marking", label: "Marking" },
    { name: "Passing", label: "Passing" },
    { name: "Tackling", label: "Tackling" },
    { name: "Technique", label: "Technique" },
    { name: "Corners", label: "Corners" },
    { name: "Free Kick Taking", label: "Free Kick" },
    { name: "Long Throws", label: "Long Throws" },
    { name: "Penalty Taking", label: "Penalties" }
  ];

  const mentalAttrs = [
    { name: "Aggression", label: "Aggression" },
    { name: "Anticipation", label: "Anticipation" },
    { name: "Bravery", label: "Bravery" },
    { name: "Composure", label: "Composure" },
    { name: "Concentration", label: "Concentration" },
    { name: "Decisions", label: "Decisions" },
    { name: "Determination", label: "Determination" },
    { name: "Flair", label: "Flair" },
    { name: "Leadership", label: "Leadership" },
    { name: "Off the Ball", label: "Off the Ball" },
    { name: "Positioning", label: "Positioning" },
    { name: "Teamwork", label: "Teamwork" },
    { name: "Vision", label: "Vision" },
    { name: "Work Rate", label: "Work Rate" }
  ];

  const physicalAttrs = [
    { name: "Acceleration", label: "Acceleration" },
    { name: "Agility", label: "Agility" },
    { name: "Balance", label: "Balance" },
    { name: "Jumping Reach", label: "Jumping Reach" },
    { name: "Natural Fitness", label: "Natural Fitness" },
    { name: "Pace", label: "Pace" },
    { name: "Stamina", label: "Stamina" },
    { name: "Strength", label: "Strength" }
  ];

  const gkAttrs = [
    { name: "Aerial Reach", label: "Aerial Reach" },
    { name: "Command of Area", label: "Command of Area" },
    { name: "Communication", label: "Communication" },
    { name: "Eccentricity", label: "Eccentricity" },
    { name: "Handling", label: "Handling" },
    { name: "Kicking", label: "Kicking" },
    { name: "One on Ones", label: "One on Ones" },
    { name: "Punching (Tendency)", label: "Punching" },
    { name: "Reflexes", label: "Reflexes" },
    { name: "Rushing Out (Tendency)", label: "Rushing Out" },
    { name: "Throwing", label: "Throwing" }
  ];

  const getAttributeBadgeColor = (val: number) => {
    if (val >= 80) return "text-emerald-400 bg-emerald-950/40 border-emerald-800/40 font-black";
    if (val >= 70) return "text-green-300 bg-green-950/20 border-green-900/30 font-bold";
    if (val >= 50) return "text-yellow-300 bg-yellow-950/20 border-yellow-900/30";
    return "text-zinc-500 bg-zinc-900/40 border-zinc-800/40";
  };

  const getAttrVal = (name: string) => {
    return getPlayerAttribute(player, name);
  };

  const pRating = normalizeRating(player.rat);

  return (
    <div className="fixed inset-0 bg-black/95 flex items-center justify-center p-4 z-50 animate-fade-in backdrop-blur-md">
      <div className="bg-zinc-950 border border-zinc-850 rounded-3xl w-full max-w-4xl p-6 flex flex-col shadow-2xl relative max-h-[92vh] overflow-y-auto">
        
        {/* Glow effect background */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-80 h-32 bg-saweria/5 rounded-full blur-3xl pointer-events-none" />

        {/* Modal Header */}
        <div className="flex items-center justify-between pb-6 border-b border-zinc-900 z-10 relative">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full overflow-hidden bg-black/40 border border-zinc-800 flex items-center justify-center shadow-inner relative">
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
                <HelpCircle className="w-7 h-7 text-zinc-700" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-white text-lg sm:text-xl uppercase tracking-wider">
                  {player.name}
                </h3>
                <span className="text-[10px] font-mono font-black text-zinc-950 bg-saweria px-2 py-0.5 rounded-full">
                  OVR {pRating}
                </span>
              </div>
              <p className="text-zinc-400 text-xs mt-1">
                {player.club} • {player.nationality} • {player.age ? `${player.age} tahun` : "Umur N/A"}
              </p>
              <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mt-0.5 font-mono">
                {player.position} ({player.role})
              </p>
            </div>
          </div>

          <button 
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-zinc-900 hover:bg-zinc-850 text-zinc-400 hover:text-white flex items-center justify-center transition-all duration-200 cursor-pointer border border-zinc-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Attributes Columns Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 py-6 z-10 relative text-xs">
          
          {/* TECHNICAL or GOALKEEPING Column */}
          <div className="flex flex-col bg-zinc-950/40 p-4 border border-zinc-900 rounded-2xl">
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-zinc-900 text-zinc-400 font-bold uppercase tracking-wider text-[10px]">
              <Shield className="w-3.5 h-3.5 text-saweria" />
              <span>{isGK ? "Goalkeeping" : "Technical"}</span>
            </div>
            <div className="space-y-2">
              {(isGK ? gkAttrs : technicalAttrs).map((attr, idx) => {
                const val = getAttrVal(attr.name);
                return (
                  <div key={idx} className="flex justify-between items-center py-0.5">
                    <span className="text-zinc-400 font-medium">{attr.label}</span>
                    <span className={`w-8 text-center font-mono py-0.5 rounded text-[10px] border ${getAttributeBadgeColor(val)}`}>
                      {val}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* MENTAL Column */}
          <div className="flex flex-col bg-zinc-950/40 p-4 border border-zinc-900 rounded-2xl">
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-zinc-900 text-zinc-400 font-bold uppercase tracking-wider text-[10px]">
              <Brain className="w-3.5 h-3.5 text-saweria" />
              <span>Mental</span>
            </div>
            <div className="space-y-2">
              {mentalAttrs.map((attr, idx) => {
                const val = getAttrVal(attr.name);
                return (
                  <div key={idx} className="flex justify-between items-center py-0.5">
                    <span className="text-zinc-400 font-medium">{attr.label}</span>
                    <span className={`w-8 text-center font-mono py-0.5 rounded text-[10px] border ${getAttributeBadgeColor(val)}`}>
                      {val}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* PHYSICAL Column (+ Outfield tech attributes for Goalkeepers) */}
          <div className="flex flex-col bg-zinc-950/40 p-4 border border-zinc-900 rounded-2xl">
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-zinc-900 text-zinc-400 font-bold uppercase tracking-wider text-[10px]">
              <Zap className="w-3.5 h-3.5 text-saweria" />
              <span>Physical & Fitness</span>
            </div>
            <div className="space-y-2 mb-4">
              {physicalAttrs.map((attr, idx) => {
                const val = getAttrVal(attr.name);
                return (
                  <div key={idx} className="flex justify-between items-center py-0.5">
                    <span className="text-zinc-400 font-medium">{attr.label}</span>
                    <span className={`w-8 text-center font-mono py-0.5 rounded text-[10px] border ${getAttributeBadgeColor(val)}`}>
                      {val}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* If Keeper, show some outfield technicals too as secondary */}
            {isGK && (
              <>
                <div className="flex items-center gap-2 mb-2 pb-1.5 border-b border-zinc-900 text-zinc-500 font-bold uppercase tracking-wider text-[9px] mt-2">
                  <span>Outfield Technical</span>
                </div>
                <div className="space-y-2">
                  {[
                    { name: "Passing", label: "Passing" },
                    { name: "First Touch", label: "First Touch" },
                    { name: "Technique", label: "Technique" }
                  ].map((attr, idx) => {
                    const val = getAttrVal(attr.name);
                    return (
                      <div key={idx} className="flex justify-between items-center py-0.5">
                        <span className="text-zinc-500 font-medium">{attr.label}</span>
                        <span className={`w-8 text-center font-mono py-0.5 rounded text-[10px] border ${getAttributeBadgeColor(val)}`}>
                          {val}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

        </div>

      </div>
    </div>
  );
}
