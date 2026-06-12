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
    if (val >= 80) return "text-emerald-700 bg-emerald-100 border-emerald-300 font-black";
    if (val >= 70) return "text-green-700 bg-green-100 border-green-300 font-bold";
    if (val >= 50) return "text-yellow-700 bg-yellow-100 border-yellow-300";
    return "text-slate-600 bg-slate-100 border-slate-200";
  };

  const getAttrVal = (name: string) => {
    return getPlayerAttribute(player, name);
  };

  const pRating = normalizeRating(player.rat);

  return (
    <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50 animate-fade-in backdrop-blur-sm">
      <div className="bg-white border-2 border-slate-200 rounded-[2rem] w-full max-w-4xl p-8 flex flex-col shadow-2xl relative max-h-[92vh] overflow-y-auto">
        
        {/* Glow effect background */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-48 bg-blue-50 rounded-full blur-3xl pointer-events-none" />

        {/* Modal Header */}
        <div className="flex items-center justify-between pb-6 border-b-2 border-slate-100 z-10 relative">
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 rounded-full overflow-hidden bg-white border-2 border-slate-200 flex items-center justify-center shadow-sm relative">
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
            <div>
              <div className="flex items-center gap-3">
                <h3 className="font-black text-slate-800 text-xl sm:text-2xl uppercase tracking-wider">
                  {player.name}
                </h3>
                <span className="text-xs font-mono font-black text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-200">
                  OVR {pRating}
                </span>
              </div>
              <p className="text-slate-500 text-sm mt-1 font-medium">
                {player.club} • {player.nationality} • {player.age ? `${player.age} tahun` : "Umur N/A"}
              </p>
              <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider mt-1 font-mono">
                {player.position} ({player.role})
              </p>
            </div>
          </div>

          <button 
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-white hover:bg-rose-50 text-slate-400 hover:text-rose-500 flex items-center justify-center transition-all duration-200 cursor-pointer border-2 border-slate-200 hover:border-rose-200 shadow-sm"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Attributes Columns Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 py-6 z-10 relative text-sm">
          
          {/* TECHNICAL or GOALKEEPING Column */}
          <div className="flex flex-col bg-slate-50 p-5 border-2 border-slate-100 rounded-2xl">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b-2 border-slate-200 text-slate-500 font-black uppercase tracking-wider text-[11px]">
              <Shield className="w-4 h-4 text-emerald-500" />
              <span>{isGK ? "Goalkeeping" : "Technical"}</span>
            </div>
            <div className="space-y-2.5">
              {(isGK ? gkAttrs : technicalAttrs).map((attr, idx) => {
                const val = getAttrVal(attr.name);
                return (
                  <div key={idx} className="flex justify-between items-center">
                    <span className="text-slate-600 font-bold text-xs">{attr.label}</span>
                    <span className={`w-9 text-center font-mono py-1 rounded-md text-xs border-2 shadow-sm ${getAttributeBadgeColor(val)}`}>
                      {val}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* MENTAL Column */}
          <div className="flex flex-col bg-slate-50 p-5 border-2 border-slate-100 rounded-2xl">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b-2 border-slate-200 text-slate-500 font-black uppercase tracking-wider text-[11px]">
              <Brain className="w-4 h-4 text-emerald-500" />
              <span>Mental</span>
            </div>
            <div className="space-y-2.5">
              {mentalAttrs.map((attr, idx) => {
                const val = getAttrVal(attr.name);
                return (
                  <div key={idx} className="flex justify-between items-center">
                    <span className="text-slate-600 font-bold text-xs">{attr.label}</span>
                    <span className={`w-9 text-center font-mono py-1 rounded-md text-xs border-2 shadow-sm ${getAttributeBadgeColor(val)}`}>
                      {val}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* PHYSICAL Column (+ Outfield tech attributes for Goalkeepers) */}
          <div className="flex flex-col bg-slate-50 p-5 border-2 border-slate-100 rounded-2xl">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b-2 border-slate-200 text-slate-500 font-black uppercase tracking-wider text-[11px]">
              <Zap className="w-4 h-4 text-emerald-500" />
              <span>Physical & Fitness</span>
            </div>
            <div className="space-y-2.5 mb-5">
              {physicalAttrs.map((attr, idx) => {
                const val = getAttrVal(attr.name);
                return (
                  <div key={idx} className="flex justify-between items-center">
                    <span className="text-slate-600 font-bold text-xs">{attr.label}</span>
                    <span className={`w-9 text-center font-mono py-1 rounded-md text-xs border-2 shadow-sm ${getAttributeBadgeColor(val)}`}>
                      {val}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* If Keeper, show some outfield technicals too as secondary */}
            {isGK && (
              <>
                <div className="flex items-center gap-2 mb-4 pb-3 border-b-2 border-slate-200 text-slate-400 font-bold uppercase tracking-wider text-[11px]">
                  <span>Outfield Technical</span>
                </div>
                <div className="space-y-2.5">
                  {[
                    { name: "Passing", label: "Passing" },
                    { name: "First Touch", label: "First Touch" },
                    { name: "Technique", label: "Technique" }
                  ].map((attr, idx) => {
                    const val = getAttrVal(attr.name);
                    return (
                      <div key={idx} className="flex justify-between items-center">
                        <span className="text-slate-500 font-bold text-xs">{attr.label}</span>
                        <span className={`w-9 text-center font-mono py-1 rounded-md text-xs border-2 shadow-sm ${getAttributeBadgeColor(val)}`}>
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
