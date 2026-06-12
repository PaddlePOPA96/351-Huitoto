import { Formation, Player } from "./types";

export const FORMATIONS: Record<string, Formation> = {
  "4-3-3": {
    name: "4-3-3",
    slots: [
      { position: "GK", x: 50, y: 88 },
      { position: "DL", x: 15, y: 68 },
      { position: "DC", x: 38, y: 72 },
      { position: "DC", x: 62, y: 72 },
      { position: "DR", x: 85, y: 68 },
      { position: "MC", x: 30, y: 48 },
      { position: "MC", x: 50, y: 52 },
      { position: "MC", x: 70, y: 48 },
      { position: "AML", x: 20, y: 25 },
      { position: "AMR", x: 80, y: 25 },
      { position: "ST", x: 50, y: 16 }
    ]
  },
  "4-4-2": {
    name: "4-4-2",
    slots: [
      { position: "GK", x: 50, y: 88 },
      { position: "DL", x: 15, y: 68 },
      { position: "DC", x: 38, y: 72 },
      { position: "DC", x: 62, y: 72 },
      { position: "DR", x: 85, y: 68 },
      { position: "ML", x: 15, y: 45 },
      { position: "MC", x: 38, y: 48 },
      { position: "MC", x: 62, y: 48 },
      { position: "MR", x: 85, y: 45 },
      { position: "ST", x: 35, y: 18 },
      { position: "ST", x: 65, y: 18 }
    ]
  },
  "3-5-2": {
    name: "3-5-2",
    slots: [
      { position: "GK", x: 50, y: 88 },
      { position: "DC", x: 25, y: 72 },
      { position: "DC", x: 50, y: 75 },
      { position: "DC", x: 75, y: 72 },
      { position: "DM", x: 50, y: 60 },
      { position: "ML", x: 15, y: 45 },
      { position: "MC", x: 32, y: 48 },
      { position: "MC", x: 68, y: 48 },
      { position: "MR", x: 85, y: 45 },
      { position: "ST", x: 35, y: 18 },
      { position: "ST", x: 65, y: 18 }
    ]
  },
  "4-2-3-1": {
    name: "4-2-3-1",
    slots: [
      { position: "GK", x: 50, y: 88 },
      { position: "DL", x: 15, y: 68 },
      { position: "DC", x: 38, y: 72 },
      { position: "DC", x: 62, y: 72 },
      { position: "DR", x: 85, y: 68 },
      { position: "DM", x: 35, y: 58 },
      { position: "DM", x: 65, y: 58 },
      { position: "AML", x: 20, y: 35 },
      { position: "AMC", x: 50, y: 35 },
      { position: "AMR", x: 80, y: 35 },
      { position: "ST", x: 50, y: 16 }
    ]
  },
  "5-3-2": {
    name: "5-3-2",
    slots: [
      { position: "GK", x: 50, y: 88 },
      { position: "DL", x: 15, y: 68 },
      { position: "DC", x: 32, y: 72 },
      { position: "DC", x: 50, y: 75 },
      { position: "DC", x: 68, y: 72 },
      { position: "DR", x: 85, y: 68 },
      { position: "MC", x: 30, y: 48 },
      { position: "MC", x: 50, y: 52 },
      { position: "MC", x: 70, y: 48 },
      { position: "ST", x: 35, y: 18 },
      { position: "ST", x: 65, y: 18 }
    ]
  }
};

// Maps tactical slot positions to player positions in JSON (case-insensitive)
export const POSITION_MAP: Record<string, string[]> = {
  'GK': ['gk'],
  'DC': ['dc'],
  'DR': ['dr', 'wbr'],
  'DL': ['dl', 'wbl'],
  'MC': ['mc', 'dm', 'amc'],
  'DM': ['dm', 'mc'],
  'AMC': ['amc', 'mc', 'aml', 'amr'],
  'MR': ['mr', 'amr', 'mc', 'ml'],
  'ML': ['ml', 'aml', 'mc', 'mr'],
  'AMR': ['amr', 'mr', 'st', 'amc'],
  'AML': ['aml', 'ml', 'st', 'amc'],
  'ST': ['st', 'aml', 'amr']
};

/**
 * Normalizes player rating from raw string to integer.
 * Defaults to 50 if invalid.
 */
export function normalizeRating(ratingStr: string): number {
  const r = parseInt(ratingStr, 10);
  if (isNaN(r) || r <= 0) return 50;
  return r;
}

/**
 * Gets a player's attribute value by name, falling back to normalized rating if attributes are missing.
 */
export function getPlayerAttribute(player: Player, attrName: string): number {
  if (player.attributes && player.attributes[attrName] !== undefined) {
    return player.attributes[attrName];
  }
  return normalizeRating(player.rat);
}

/**
 * Checks if a player's position is suitable for a slot position.
 */
export function isPositionSuitable(playerPos: string, slotPos: string): boolean {
  const allowed = POSITION_MAP[slotPos];
  if (!allowed) return false;
  const pPos = playerPos.toLowerCase();
  for (let i = 0; i < allowed.length; i++) {
    if (pPos.includes(allowed[i])) return true;
  }
  return false;
}

/**
 * Automatically builds the best 11-man squad for a given formation from a pool of players.
 * It assigns the player's `playingPosition` to match the formation slot.
 */
export function autoPickSquad(players: Player[], formationName: string): Player[] {
  const formation = FORMATIONS[formationName] || FORMATIONS["4-3-3"];
  const squad: Player[] = [];
  const availablePlayers = [...players].sort((a, b) => normalizeRating(b.rat) - normalizeRating(a.rat)); // sort highest to lowest

  for (const slot of formation.slots) {
    // 1. Try to find the best player whose natural position fits the slot
    let bestFitIdx = availablePlayers.findIndex(p => isPositionSuitable(p.position, slot.position));
    
    // 2. If no perfect fit, just pick the highest rated available player (Out-Of-Position penalty will apply later)
    if (bestFitIdx === -1) {
      bestFitIdx = 0; 
    }

    if (availablePlayers.length > 0) {
      const selected = availablePlayers.splice(bestFitIdx, 1)[0];
      squad.push({ ...selected, playingPosition: slot.position });
    }
  }

  return squad;
}

/**
 * Calculates rock-paper-scissors matchup modifiers between two formations.
 * Returns [homeMidBonus, awayMidBonus, homeAttBonus, awayAttBonus, homeDefBonus, awayDefBonus]
 */
export function calculateTacticalMatchup(homeFormation: string, awayFormation: string): {
  homeMid: number; awayMid: number;
  homeAtt: number; awayAtt: number;
  homeDef: number; awayDef: number;
} {
  const mods = { homeMid: 0, awayMid: 0, homeAtt: 0, awayAtt: 0, homeDef: 0, awayDef: 0 };
  
  if (!homeFormation || !awayFormation) return mods;

  // Midfield overload check (e.g. 3-5-2 beats 4-3-3 in midfield)
  const homeMidCount = FORMATIONS[homeFormation]?.slots.filter(s => ['MC', 'DM', 'AMC', 'ML', 'MR'].includes(s.position)).length || 0;
  const awayMidCount = FORMATIONS[awayFormation]?.slots.filter(s => ['MC', 'DM', 'AMC', 'ML', 'MR'].includes(s.position)).length || 0;
  
  if (homeMidCount > awayMidCount) mods.homeMid += 0.10;
  else if (awayMidCount > homeMidCount) mods.awayMid += 0.10;

  // Wing attack vs 3 at the back check (e.g. 4-3-3 wingers exploit 3-5-2)
  const hasWingers = (f: string) => FORMATIONS[f]?.slots.some(s => ['AML', 'AMR'].includes(s.position));
  const hasThreeAtBack = (f: string) => FORMATIONS[f]?.slots.filter(s => ['DC', 'DL', 'DR', 'WBL', 'WBR'].includes(s.position)).length === 3;

  if (hasWingers(homeFormation) && hasThreeAtBack(awayFormation)) mods.homeAtt += 0.10;
  if (hasWingers(awayFormation) && hasThreeAtBack(homeFormation)) mods.awayAtt += 0.10;

  // Park the bus (5 at the back gives def bonus but att penalty)
  const isParkBus = (f: string) => FORMATIONS[f]?.slots.filter(s => ['DC', 'DL', 'DR', 'WBL', 'WBR'].includes(s.position)).length >= 5;
  if (isParkBus(homeFormation)) { mods.homeDef += 0.15; mods.homeAtt -= 0.10; }
  if (isParkBus(awayFormation)) { mods.awayDef += 0.15; mods.awayAtt -= 0.10; }

  return mods;
}
