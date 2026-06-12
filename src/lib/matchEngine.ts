import { Player, MatchEvent, MatchStats, Fixture } from "./types";
import { normalizeRating, isPositionSuitable, calculateTacticalMatchup, getPlayerAttribute } from "./tactics";

// ═══════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function weightedRandom<T>(items: { item: T; weight: number }[]): T {
  const total = items.reduce((s, i) => s + i.weight, 0);
  if (total === 0) return items[0].item;
  let roll = Math.random() * total;
  for (const { item, weight } of items) {
    roll -= weight;
    if (roll <= 0) return item;
  }
  return items[items.length - 1].item;
}

// ═══════════════════════════════════════════════════════════════
// OOP & ATTRIBUTE CALCULATIONS
// ═══════════════════════════════════════════════════════════════

function getOOPMultiplier(naturalPos: string, playingPos: string): number {
  const nat = naturalPos.toUpperCase();
  const play = playingPos.toUpperCase();
  if (nat.includes("GK") !== play.includes("GK")) {
    return 0.15; // GK playing outfield or vice-versa: massive penalty
  }
  if (isPositionSuitable(naturalPos, playingPos)) {
    return 1.0;
  }
  
  const isDef = (pos: string) => ["DC", "DR", "DL", "WBL", "WBR", "DM"].some(p => pos.includes(p));
  const isMid = (pos: string) => ["MC", "AMC", "ML", "MR"].some(p => pos.includes(p));
  const isAtt = (pos: string) => ["ST", "CF", "FW", "AMR", "AML"].some(p => pos.includes(p));
  
  if ((isDef(nat) && isAtt(play)) || (isAtt(nat) && isDef(play))) {
    return 0.60; // 40% penalty for direct extreme mismatch
  }
  return 0.82; // 18% penalty for minor mismatch
}

export interface SectorRatings {
  gk: number;
  def: number;
  mid: number;
  att: number;
  ovr: number;
}

export function calculateSectorRatings(squad: Player[]): SectorRatings {
  const gkPlayers = squad.filter(p => p.position.toUpperCase().includes("GK"));
  const defPlayers = squad.filter(p => ["DC", "DR", "DL", "WBL", "WBR"].some(pos => p.position.toUpperCase().includes(pos)));
  const midPlayers = squad.filter(p => ["MC", "DM", "AMC", "ML", "MR"].some(pos => p.position.toUpperCase().includes(pos)));
  const attPlayers = squad.filter(p => ["ST", "AMR", "AML", "CF", "FW"].some(pos => p.position.toUpperCase().includes(pos)));

  const getSectorAvg = (players: Player[], attrs: string[], fallback: number) => {
    if (players.length === 0) return fallback;
    const sum = players.reduce((playerSum, p) => {
      const pSum = attrs.reduce((attrSum, attr) => {
        let val = getPlayerAttribute(p, attr);
        if (p.playingPosition && !isPositionSuitable(p.position, p.playingPosition)) {
          val = val * getOOPMultiplier(p.position, p.playingPosition);
        }
        return attrSum + val;
      }, 0);
      return playerSum + (pSum / attrs.length);
    }, 0);
    return Math.round(sum / players.length);
  };

  return {
    gk: getSectorAvg(gkPlayers, ["Reflexes", "Handling", "One on Ones", "Aerial Reach"], 65),
    def: getSectorAvg(defPlayers, ["Tackling", "Marking", "Positioning", "Anticipation"], 65),
    mid: getSectorAvg(midPlayers, ["Passing", "Vision", "Technique", "Composure"], 65),
    att: getSectorAvg(attPlayers, ["Finishing", "Dribbling", "Off the Ball", "Technique"], 65),
    ovr: squad.length > 0
      ? Math.round(squad.reduce((sum, p) => sum + normalizeRating(p.rat), 0) / squad.length)
      : 65
  };
}

export function calculateSquadRating(squad: Player[]): number {
  if (squad.length === 0) return 50;
  return Math.round(squad.reduce((sum, p) => {
    let r = normalizeRating(p.rat);
    if (p.playingPosition && !isPositionSuitable(p.position, p.playingPosition)) {
      r = r * getOOPMultiplier(p.position, p.playingPosition);
    }
    return sum + r;
  }, 0) / squad.length);
}

// ═══════════════════════════════════════════════════════════════
// STATE STRUCTURES FOR IN-MATCH RESOLUTION
// ═══════════════════════════════════════════════════════════════

interface PlayerState {
  player: Player;
  stamina: number; // starts at 100
  role: string;
  passesAttempted: number;
  passesCompleted: number;
  tacklesAttempted: number;
  tacklesWon: number;
  dribblesAttempted: number;
  dribblesWon: number;
}

function getEffectiveStateAttribute(s: PlayerState, attrName: string): number {
  const base = getPlayerAttribute(s.player, attrName);
  const oop = getOOPMultiplier(s.player.position, s.role);
  
  let stamFactor = 1.0;
  if (s.stamina < 75) {
    const fatigue = (75 - s.stamina) / 75; // ranges 0 to 0.8
    const physicalAttrs = ["Acceleration", "Agility", "Balance", "Jumping Reach", "Natural Fitness", "Pace", "Stamina", "Strength"];
    const mentalAttrs = ["Anticipation", "Composure", "Concentration", "Decisions", "Determination", "Leadership", "Positioning", "Teamwork", "Vision", "Work Rate"];
    if (physicalAttrs.includes(attrName)) {
      stamFactor = 1.0 - fatigue * 0.35; // Physical drops up to 35%
    } else if (mentalAttrs.includes(attrName)) {
      stamFactor = 1.0 - fatigue * 0.12; // Mental drops up to 12%
    } else {
      stamFactor = 1.0 - fatigue * 0.22; // Technical/other drops up to 22%
    }
  }
  
  return base * oop * stamFactor;
}

function getAverageAttribute(s: PlayerState, attrs: string[]): number {
  const sum = attrs.reduce((acc, attr) => acc + getEffectiveStateAttribute(s, attr), 0);
  return sum / attrs.length;
}

// ═══════════════════════════════════════════════════════════════
// PLAYER SELECTION & WEIGHTS
// ═══════════════════════════════════════════════════════════════

function getPlayerScoringWeight(position: string): number {
  const pos = position.toUpperCase().trim();
  if (pos.includes("ST") || pos.includes("CF")) return 65;
  if (pos.includes("AMR") || pos.includes("AML") || pos.includes("AMC") || pos.includes("FW")) return 38;
  if (pos.includes("MR") || pos.includes("ML") || pos.includes("MC")) return 14;
  if (pos.includes("DM")) return 6;
  if (pos.includes("DC") || pos.includes("DR") || pos.includes("DL") || pos.includes("WBL") || pos.includes("WBR")) return 2;
  if (pos.includes("GK")) return 0;
  return 4;
}

function getAssistWeight(position: string): number {
  const pos = position.toUpperCase().trim();
  if (pos.includes("AMC") || pos.includes("AMR") || pos.includes("AML")) return 50;
  if (pos.includes("MC") || pos.includes("MR") || pos.includes("ML")) return 35;
  if (pos.includes("DM")) return 15;
  if (pos.includes("ST") || pos.includes("CF") || pos.includes("FW")) return 20;
  if (pos.includes("WBL") || pos.includes("WBR") || pos.includes("DR") || pos.includes("DL")) return 18;
  if (pos.includes("DC")) return 5;
  return 3;
}

function selectStateDefender(states: PlayerState[]): PlayerState {
  const defenders = states.filter(s => ["DC", "DR", "DL", "WBL", "WBR", "DM"].some(pos => s.role.toUpperCase().includes(pos)));
  if (defenders.length === 0) return selectStateOutfieldPlayer(states);
  return defenders[randomInt(0, defenders.length - 1)];
}

function selectStateMidfielder(states: PlayerState[]): PlayerState {
  const mids = states.filter(s => ["MC", "DM", "AMC", "ML", "MR"].some(pos => s.role.toUpperCase().includes(pos)));
  if (mids.length === 0) return selectStateOutfieldPlayer(states);
  return mids[randomInt(0, mids.length - 1)];
}

function selectStateAttacker(states: PlayerState[]): PlayerState {
  const atts = states.filter(s => ["ST", "CF", "FW", "AMR", "AML", "AMC"].some(pos => s.role.toUpperCase().includes(pos)));
  if (atts.length === 0) return selectStateOutfieldPlayer(states);
  return atts[randomInt(0, atts.length - 1)];
}

function selectStateOutfieldPlayer(states: PlayerState[]): PlayerState {
  const outfield = states.filter(s => !s.role.toUpperCase().includes("GK"));
  if (outfield.length === 0) return states[0];
  return outfield[randomInt(0, outfield.length - 1)];
}

function selectStateGoalscorer(states: PlayerState[]): PlayerState {
  const items = states.map(s => ({ item: s, weight: getPlayerScoringWeight(s.role) }));
  return weightedRandom(items);
}

function selectStateAssister(states: PlayerState[], scorerName: string): PlayerState {
  const eligible = states.filter(s => s.player.name !== scorerName && !s.role.toUpperCase().includes("GK"));
  if (eligible.length === 0) return states[0];
  const items = eligible.map(s => ({ item: s, weight: getAssistWeight(s.role) }));
  return weightedRandom(items);
}

function findStateGoalkeeper(states: PlayerState[]): PlayerState {
  return states.find(s => s.role.toUpperCase().includes("GK")) || states[0];
}

function getStateBestPlayer(states: PlayerState[]): PlayerState {
  const outfield = states.filter(s => !s.role.toUpperCase().includes("GK"));
  if (outfield.length === 0) return states[0];
  return outfield.reduce((best, s) => {
    const bestRat = normalizeRating(best.player.rat);
    const sRat = normalizeRating(s.player.rat);
    return sRat > bestRat ? s : best;
  }, outfield[0]);
}

// ═══════════════════════════════════════════════════════════════
// MOMENTUM SYSTEM
// ═══════════════════════════════════════════════════════════════

interface MomentumState {
  homeBoost: number; // -30 to +30
  awayBoost: number;
  lastGoalMinute: number | null;
  lastGoalTeam: 'home' | 'away' | null;
}

function calculateMomentum(
  minute: number,
  homeScore: number,
  awayScore: number,
  momentum: MomentumState
): MomentumState {
  let homeBoost = 0;
  let awayBoost = 0;
  const scoreDiff = homeScore - awayScore;

  if (momentum.lastGoalMinute !== null && momentum.lastGoalTeam !== null) {
    const minutesSinceGoal = minute - momentum.lastGoalMinute;
    if (minutesSinceGoal >= 0 && minutesSinceGoal <= 5) {
      const decayFactor = 1 - (minutesSinceGoal / 5);
      if (momentum.lastGoalTeam === 'home') {
        awayBoost += 20 * decayFactor;
        homeBoost -= 5 * decayFactor;
      } else {
        homeBoost += 20 * decayFactor;
        awayBoost -= 5 * decayFactor;
      }
    }
  }

  if (scoreDiff >= 2) {
    homeBoost += -15;
    awayBoost += 25;
  } else if (scoreDiff === 1) {
    awayBoost += 10;
  } else if (scoreDiff <= -2) {
    awayBoost += -15;
    homeBoost += 25;
  } else if (scoreDiff === -1) {
    homeBoost += 10;
  }

  if (minute >= 80) {
    if (scoreDiff > 0) {
      homeBoost += -20;
    } else if (scoreDiff < 0) {
      homeBoost += 25;
    } else {
      homeBoost += 8;
      awayBoost += 8;
    }

    if (awayScore > homeScore) {
      awayBoost += -20;
    } else if (awayScore < homeScore) {
      awayBoost += 25;
    }
  }

  if (minute > 90) {
    if (homeScore < awayScore) homeBoost += 30;
    if (awayScore < homeScore) awayBoost += 30;
  }

  return {
    homeBoost: clamp(homeBoost, -30, 35),
    awayBoost: clamp(awayBoost, -30, 35),
    lastGoalMinute: momentum.lastGoalMinute,
    lastGoalTeam: momentum.lastGoalTeam
  };
}

// ═══════════════════════════════════════════════════════════════
// xG SHOT QUALITY MODEL
// ═══════════════════════════════════════════════════════════════

type ShotSituation = 'insideBox' | 'outsideBox' | 'oneOnOne' | 'header' | 'penalty' | 'freeKick' | 'counter';

function getBaseXG(situation: ShotSituation): number {
  const map: Record<ShotSituation, number> = {
    insideBox: 0.42,
    outsideBox: 0.10,
    oneOnOne: 0.72,
    header: 0.15,
    penalty: 0.78,
    freeKick: 0.08,
    counter: 0.34,
  };
  return map[situation];
}

// ═══════════════════════════════════════════════════════════════
// COMMENTARY TEMPLATES
// ═══════════════════════════════════════════════════════════════

const BUILDUP_COMMENTS = [
  "{team} membangun serangan dari pertahanan. {passer} melihat pergerakan rekannya.",
  "Bola bergulir di lini belakang {team}. {passer} dengan tenang memimpin sirkulasi bola.",
  "Umpan pendek rapi diperagakan {team}, digerakkan oleh {passer}.",
];

const ZONE_ADVANCE_COMMENTS = [
  "{team} memajukan bola dengan cepat. {midfielder} mengirim operan terobosan cerdas.",
  "Bola dialirkan melintasi garis tengah oleh {midfielder}. Pertahanan lawan mulai tertekan.",
  "{midfielder} menguasai lini tengah dan mengarahkan bola ke sepertiga akhir pertahanan {opponent}.",
];

const INTERCEPT_COMMENTS = [
  "Intersep krusial! {presser} membaca arah umpan {passer} dan merebut bola untuk {team}!",
  "Serangan {opponent} kandas karena {presser} sukses memotong operan {passer}.",
  "{presser} memotong alur bola {opponent} yang dikirim oleh {passer}!"
];

const DRIBBLE_WIN_COMMENTS = [
  "Aksi menawan! {attacker} melewati {defender} dengan gerakan dribble memukau!",
  "{attacker} menunjukkan kontrol bola luar biasa, menusuk melewati hadangan {defender}.",
  "Dribble cepat dari {attacker}! {defender} tertinggal di belakang!",
];

const TACKLE_WIN_COMMENTS = [
  "Tekel bersih! {defender} menghentikan paksa pergerakan dribble {attacker}.",
  "{defender} menutup ruang dan menyapu bola langsung dari kaki {attacker}.",
  "Pertahanan solid! {defender} memenangi perebutan bola dari {attacker}!",
];

const FOUL_COMMENTS = [
  "Pelanggaran! {defender} menjatuhkan {attacker} dengan keras.",
  "Tekel terlambat dari {defender} menjatuhkan {attacker}! Wasit meniup peluit.",
  "{defender} mengganjal laju {attacker}. Tendangan bebas untuk {team}.",
];

const OFFSIDE_COMMENTS = [
  "Offside! Asisten wasit mengangkat bendera. {attacker} melangkah terlalu cepat.",
  "Serangan {team} terhenti karena posisi {attacker} berada di belakang bek terakhir."
];

const SHOT_COMMENTS = [
  "{attacker} melepaskan tembakan keras ke gawang!",
  "{attacker} berputar di dalam kotak penalti dan langsung menembak!",
  "Tembakan keras dilepaskan oleh {attacker}!",
  "Sundulan mematikan dari {attacker} setelah menyambut umpan lambung!",
  "{attacker} mencoba tendangan melengkung dari luar kotak penalti!",
];

const SAVE_COMMENTS = [
  "Penyelamatan luar biasa oleh {keeper}! Bola ditepis keluar!",
  "Refleks luar biasa! {keeper} menepis tembakan keras tersebut!",
  "Penyelamatan gemilang dari {keeper}! Mengamankan gawangnya dengan sempurna.",
];

const MISS_COMMENTS = [
  "Namun tendangannya masih melambung di atas mistar!",
  "Sayang sekali bola membentur tiang gawang!",
  "Tetapi bola melenceng tipis di samping tiang gawang.",
];

const GOAL_COMMENTS = [
  "GOOOL!!! {scorer} merobek jala gawang setelah menerima umpan matang dari {assister}!",
  "GOOOL!!! Eksekusi klinis dari {scorer} membawa pendukungnya bergemuruh!",
  "GOOOL!!! Sundulan tajam {scorer} gagal dihalau penjaga gawang!",
  "GOOOL SPEKTAKULER!!! Tendangan roket {scorer} meluncur ke pojok gawang!",
];

const GOAL_CONTEXT_COMMENTS: Record<string, string[]> = {
  opener: [
    "Pecah telur! {scorer} mencetak gol pembuka jalannya laga!",
    "Gol pertama pertandingan ini! {scorer} mengubah papan skor!",
  ],
  equalizer: [
    "GOL PENYAMA! {scorer} mencetak gol penyeimbang yang krusial!",
    "EQUALIZER! {scorer} membuat kedudukan kembali seimbang!",
  ],
  comeback: [
    "MOMEN COMEBACK! {scorer} mencetak gol yang membalikkan keadaan!",
    "GOL PEMBALIK KEADAAN! Tim {scorer} kini memimpin pertandingan!",
  ],
  lateWinner: [
    "DRAMA MENIT AKHIR! {scorer} mencetak gol kemenangan di sisa waktu laga!",
    "GOL KEMENANGAN DRAMATIS! {scorer} menjadi pahlawan di menit-menit akhir!",
  ],
  comfort: [
    "Gol tambahan! {scorer} memperlebar jarak kemenangan timnya.",
    "Semakin nyaman! {scorer} menambah pundi gol malam ini.",
  ],
};

const CARD_COMMENTS = [
  "Wasit menghadiahi kartu kuning untuk {player} akibat tekel kerasnya.",
  "Kartu kuning dikeluarkan wasit untuk {player} setelah pelanggaran disiplin.",
];

const PENALTY_SCORED_COMMENTS = [
  "GOL PENALTI! {scorer} mengeksekusi dengan dingin, mengecoh {keeper}!",
  "MASUK! {scorer} mengirim penjaga gawang ke arah salah dan mencetak gol penalti!",
];

const PENALTY_SAVED_COMMENTS = [
  "DITEPIS! {keeper} menebak dengan tepat arah tendangan penalti {attacker}!",
  "PENYELAMATAN PENALTI! {keeper} menepis eksekusi {attacker}!",
];

const COUNTER_COMMENTS = [
  "SERANGAN BALIK KILAT! {team} transisi cepat dipimpin oleh {attacker}!",
  "Counter attack berbahaya dari {team}! {attacker} menusuk ke ruang kosong pertahanan lawan!",
];

// ═══════════════════════════════════════════════════════════════
// POSSESSION CHAIN SYSTEM
// ═══════════════════════════════════════════════════════════════

interface PossessionChainResult {
  finalZone: BallZone;
  events: MatchEvent[];
  shotCreated: boolean;
  shotSituation: ShotSituation;
  counterTriggered: boolean;
  foulOccurred: boolean;
  offsideCaught: boolean;
  activeShooter: PlayerState | null;
}

type BallZone = 'defThird' | 'midfield' | 'attThird' | 'penaltyBox';

function simulatePossessionChain(
  minute: number,
  attName: string,
  defName: string,
  attTeam: 'home' | 'away',
  defTeam: 'home' | 'away',
  attStates: PlayerState[],
  defStates: PlayerState[],
  momentumBoost: number
): PossessionChainResult {
  const events: MatchEvent[] = [];
  let shotCreated = false;
  let shotSituation: ShotSituation = 'insideBox';
  let counterTriggered = false;
  let foulOccurred = false;
  let offsideCaught = false;
  let activeShooter: PlayerState | null = null;

  // ─── ZONE 1: BUILD-UP ───
  const passer = selectStateDefender(attStates);
  const presser = selectStateAttacker(defStates);

  // Calculate Build-up duel values
  let passVal = getAverageAttribute(passer, ["Passing", "Vision", "Composure"]);
  let pressVal = getAverageAttribute(presser, ["Work Rate", "Aggression", "Anticipation"]);

  // Apply momentum boost to attacker
  passVal *= (1 + momentumBoost / 250);

  passer.passesAttempted++;
  const buildUpRoll = Math.random();
  const buildUpSuccessRatio = passVal / (passVal + pressVal);

  if (buildUpRoll > buildUpSuccessRatio) {
    // Intercepted in def third
    const template = pickRandom(INTERCEPT_COMMENTS);
    events.push({
      minute,
      type: 'info',
      text: template
        .replace("{presser}", presser.player.name)
        .replace("{passer}", passer.player.name)
        .replace("{team}", defName)
        .replace("{opponent}", attName),
      team: defTeam,
      player: presser.player.name
    });

    // High chance of counter when intercepted deep
    if (Math.random() < 0.35) {
      counterTriggered = true;
    }
    return { finalZone: 'defThird', events, shotCreated, shotSituation, counterTriggered, foulOccurred, offsideCaught, activeShooter };
  }

  passer.passesCompleted++;
  // Narration 25% of build-ups
  if (Math.random() < 0.25) {
    const template = pickRandom(BUILDUP_COMMENTS);
    events.push({
      minute,
      type: 'buildup',
      text: template
        .replace("{team}", attName)
        .replace("{passer}", passer.player.name),
      team: attTeam,
      player: passer.player.name
    });
  }

  // ─── ZONE 2: MIDFIELD BATTLE ───
  const midCarrier = selectStateMidfielder(attStates);
  const midChallenger = selectStateMidfielder(defStates);

  const choosePass = Math.random() < 0.70;

  if (choosePass) {
    let carrierPass = getAverageAttribute(midCarrier, ["Passing", "Vision", "Technique", "Composure"]);
    let challengerMark = getAverageAttribute(midChallenger, ["Marking", "Anticipation", "Positioning"]);

    carrierPass *= (1 + momentumBoost / 250);
    midCarrier.passesAttempted++;

    const passRatio = carrierPass / (carrierPass + challengerMark);
    if (Math.random() > passRatio) {
      // Pass intercepted in midfield
      const template = pickRandom(INTERCEPT_COMMENTS);
      events.push({
        minute,
        type: 'info',
        text: template
          .replace("{presser}", midChallenger.player.name)
          .replace("{passer}", midCarrier.player.name)
          .replace("{team}", defName)
          .replace("{opponent}", attName),
        team: defTeam,
        player: midChallenger.player.name
      });
      
      if (Math.random() < 0.28) {
        counterTriggered = true;
      }
      return { finalZone: 'midfield', events, shotCreated, shotSituation, counterTriggered, foulOccurred, offsideCaught, activeShooter };
    }
    midCarrier.passesCompleted++;
  } else {
    // Dribble attempt
    let carrierDribble = getAverageAttribute(midCarrier, ["Dribbling", "Technique", "Agility", "Balance"]);
    let challengerTackle = getAverageAttribute(midChallenger, ["Tackling", "Anticipation", "Agility"]);

    carrierDribble *= (1 + momentumBoost / 250);
    midCarrier.dribblesAttempted++;

    const dribbleRatio = carrierDribble / (carrierDribble + challengerTackle);
    if (Math.random() > dribbleRatio) {
      // Dribble stopped
      midChallenger.tacklesAttempted++;
      midChallenger.tacklesWon++;
      const template = pickRandom(TACKLE_WIN_COMMENTS);
      events.push({
        minute,
        type: 'info',
        text: template
          .replace("{defender}", midChallenger.player.name)
          .replace("{attacker}", midCarrier.player.name),
        team: defTeam,
        player: midChallenger.player.name
      });

      if (Math.random() < 0.28) {
        counterTriggered = true;
      }
      return { finalZone: 'midfield', events, shotCreated, shotSituation, counterTriggered, foulOccurred, offsideCaught, activeShooter };
    }
    midCarrier.dribblesWon++;
  }

  // Show transition to attacking zone occasionally
  if (Math.random() < 0.25) {
    const template = pickRandom(ZONE_ADVANCE_COMMENTS);
    events.push({
      minute,
      type: 'info',
      text: template
        .replace("{team}", attName)
        .replace("{opponent}", defName)
        .replace("{midfielder}", midCarrier.player.name),
      team: attTeam,
      player: midCarrier.player.name
    });
  }

  // ─── ZONE 3: ATTACKING THIRD ───
  const attacker = selectStateAttacker(attStates);
  const defender = selectStateDefender(defStates);

  // Offside trap check (uses defender Positioning/Anticipation vs attacker Anticipation/Off the Ball)
  const defTrap = getAverageAttribute(defender, ["Positioning", "Anticipation"]);
  const attRun = getAverageAttribute(attacker, ["Off the Ball", "Anticipation"]);
  
  if (Math.random() < 0.05 * (defTrap / attRun)) {
    const template = pickRandom(OFFSIDE_COMMENTS);
    events.push({
      minute,
      type: 'info',
      text: template
        .replace("{attacker}", attacker.player.name)
        .replace("{team}", attName),
      team: attTeam,
      player: attacker.player.name
    });
    offsideCaught = true;
    return { finalZone: 'attThird', events, shotCreated, shotSituation, counterTriggered, foulOccurred, offsideCaught, activeShooter };
  }

  activeShooter = attacker;
  const attackChoice = Math.random();

  if (attackChoice < 0.40) {
    // Dribble / Winger run
    let attDribble = getAverageAttribute(attacker, ["Dribbling", "Pace", "Flair", "Acceleration"]);
    let defTackle = getAverageAttribute(defender, ["Tackling", "Pace", "Positioning", "Strength"]);

    attDribble *= (1 + momentumBoost / 250);
    attacker.dribblesAttempted++;

    const ratio = attDribble / (attDribble + defTackle);
    if (Math.random() < ratio) {
      attacker.dribblesWon++;
      shotCreated = true;
      shotSituation = Math.random() < 0.40 ? 'oneOnOne' : 'insideBox';
      const template = pickRandom(DRIBBLE_WIN_COMMENTS);
      events.push({
        minute,
        type: 'info',
        text: template
          .replace("{attacker}", attacker.player.name)
          .replace("{defender}", defender.player.name),
        team: attTeam,
        player: attacker.player.name
      });
    } else {
      // Defender intercepts/tackles or fouls
      defender.tacklesAttempted++;
      
      const aggression = getPlayerAttribute(defender.player, "Aggression");
      const decisions = getPlayerAttribute(defender.player, "Decisions");
      const foulChance = 0.15 + (aggression - decisions) / 150;

      if (Math.random() < clamp(foulChance, 0.08, 0.40)) {
        foulOccurred = true;
        const template = pickRandom(FOUL_COMMENTS);
        events.push({
          minute,
          type: 'freekick',
          text: template
            .replace("{defender}", defender.player.name)
            .replace("{attacker}", attacker.player.name)
            .replace("{team}", attName),
          team: attTeam,
          player: attacker.player.name
        });
        
        // Is it inside the box? (Penalty)
        if (Math.random() < 0.20) {
          shotSituation = 'penalty';
          shotCreated = true;
        } else if (Math.random() < 0.38) {
          // Dangerous direct free kick
          shotSituation = 'freeKick';
          shotCreated = true;
        }
      } else {
        // Clean tackle
        defender.tacklesWon++;
        const template = pickRandom(TACKLE_WIN_COMMENTS);
        events.push({
          minute,
          type: 'info',
          text: template
            .replace("{defender}", defender.player.name)
            .replace("{attacker}", attacker.player.name),
          team: defTeam,
          player: defender.player.name
        });
        if (Math.random() < 0.20) {
          counterTriggered = true;
        }
      }
    }
  } else if (attackChoice < 0.75) {
    // Key Pass / Thru-ball
    let attPass = getAverageAttribute(attacker, ["Passing", "Vision", "Decisions", "Composure"]);
    let defMark = getAverageAttribute(defender, ["Marking", "Anticipation", "Positioning"]);

    attPass *= (1 + momentumBoost / 250);
    attacker.passesAttempted++;

    const ratio = attPass / (attPass + defMark);
    if (Math.random() < ratio) {
      attacker.passesCompleted++;
      shotCreated = true;
      shotSituation = 'insideBox';
    } else {
      const template = pickRandom(INTERCEPT_COMMENTS);
      events.push({
        minute,
        type: 'info',
        text: template
          .replace("{presser}", defender.player.name)
          .replace("{passer}", attacker.player.name)
          .replace("{team}", defName)
          .replace("{opponent}", attName),
        team: defTeam,
        player: defender.player.name
      });
      if (Math.random() < 0.20) {
        counterTriggered = true;
      }
    }
  } else {
    // Cross
    let attCross = getAverageAttribute(attacker, ["Crossing", "Technique", "Pace"]);
    let defAerial = getAverageAttribute(defender, ["Heading", "Jumping Reach", "Positioning"]);

    attCross *= (1 + momentumBoost / 250);
    attacker.passesAttempted++;

    const ratio = attCross / (attCross + defAerial);
    if (Math.random() < ratio) {
      attacker.passesCompleted++;
      shotCreated = true;
      shotSituation = 'header';
    } else {
      events.push({
        minute,
        type: 'info',
        text: `Umpan silang dari ${attacker.player.name} berhasil disundul menjauh oleh ${defender.player.name}.`,
        team: defTeam,
        player: defender.player.name
      });
    }
  }

  return {
    finalZone: shotCreated ? 'penaltyBox' : 'attThird',
    events,
    shotCreated,
    shotSituation,
    counterTriggered,
    foulOccurred,
    offsideCaught,
    activeShooter
  };
}

// ═══════════════════════════════════════════════════════════════
// INDIVIDUAL BRILLIANCE CHECK
// ═══════════════════════════════════════════════════════════════

interface BrillianceResult {
  triggered: boolean;
  player: PlayerState | null;
  xgBonus: number;
  event: MatchEvent | null;
}

function checkBrilliance(
  minute: number,
  states: PlayerState[],
  teamName: string,
  team: 'home' | 'away',
  defStates: PlayerState[]
): BrillianceResult {
  const bestState = getStateBestPlayer(states);
  // Get technique, flair, and composure as elements of brilliance
  const skill = getAverageAttribute(bestState, ["Technique", "Flair", "Composure"]);

  // Count elite stars in the team
  const eliteCount = states.filter(s => normalizeRating(s.player.rat) >= 84).length;
  const eliteBonus = Math.min(eliteCount * 0.012, 0.08);

  let chance = 0;
  let xgBonus = 0;

  if (skill >= 85) {
    chance = 0.14 + eliteBonus;
    xgBonus = 0.16;
  } else if (skill >= 76) {
    chance = 0.08 + eliteBonus;
    xgBonus = 0.11;
  } else if (skill >= 68) {
    chance = 0.04 + eliteBonus * 0.5;
    xgBonus = 0.06;
  }

  if (Math.random() < chance) {
    const defender = selectStateDefender(defStates);
    const text = `AKSI INDIVIDU SPEKTAKULER! ${bestState.player.name} meliuk-liuk melewati pertahanan ${defender.player.name} berbekal teknik luar biasa!`;
    const event: MatchEvent = {
      minute,
      type: 'chance',
      text,
      team,
      player: bestState.player.name
    };
    bestState.dribblesAttempted++;
    bestState.dribblesWon++;
    return { triggered: true, player: bestState, xgBonus, event };
  }

  return { triggered: false, player: null, xgBonus: 0, event: null };
}

// ═══════════════════════════════════════════════════════════════
// GOAL CONTEXT DETECTION
// ═══════════════════════════════════════════════════════════════

function getGoalContext(
  homeScore: number,
  awayScore: number,
  scoringTeam: 'home' | 'away',
  minute: number,
  totalMinutes: number
): string {
  const prevHome = scoringTeam === 'home' ? homeScore - 1 : homeScore;
  const prevAway = scoringTeam === 'away' ? awayScore - 1 : awayScore;
  const prevTotal = prevHome + prevAway;

  if (prevTotal === 0) return 'opener';

  if (scoringTeam === 'home' && prevHome < prevAway && homeScore === awayScore) return 'equalizer';
  if (scoringTeam === 'away' && prevAway < prevHome && awayScore === homeScore) return 'equalizer';

  if (scoringTeam === 'home' && prevHome <= prevAway && homeScore > awayScore) return 'comeback';
  if (scoringTeam === 'away' && prevAway <= prevHome && awayScore > homeScore) return 'comeback';

  if (minute >= 85) {
    const diff = scoringTeam === 'home' ? homeScore - awayScore : awayScore - homeScore;
    if (diff === 1) return 'lateWinner';
  }

  return 'comfort';
}

// ═══════════════════════════════════════════════════════════════
// MAIN SIMULATION FUNCTION
// ═══════════════════════════════════════════════════════════════

export function simulateMatch(
  fixtureId: string,
  homeName: string,
  awayName: string,
  homeSquad: Player[],
  awaySquad: Player[],
  homeFormation?: string,
  awayFormation?: string
): Fixture {
  // 1. Initialize Stamina and Action-Resolution states for all 22 players
  const homeStates: PlayerState[] = homeSquad.map(p => ({
    player: p,
    stamina: 100,
    role: p.playingPosition || p.position,
    passesAttempted: 0,
    passesCompleted: 0,
    tacklesAttempted: 0,
    tacklesWon: 0,
    dribblesAttempted: 0,
    dribblesWon: 0
  }));

  const awayStates: PlayerState[] = awaySquad.map(p => ({
    player: p,
    stamina: 100,
    role: p.playingPosition || p.position,
    passesAttempted: 0,
    passesCompleted: 0,
    tacklesAttempted: 0,
    tacklesWon: 0,
    dribblesAttempted: 0,
    dribblesWon: 0
  }));

  // Calculations for sector rating (used as backdrop weights)
  const homeSectors = calculateSectorRatings(homeSquad);
  const awaySectors = calculateSectorRatings(awaySquad);

  const adjustedHomeSectors = { ...homeSectors, mid: homeSectors.mid + 3, att: homeSectors.att + 2 };

  const tacticalMods = calculateTacticalMatchup(homeFormation || "4-4-2", awayFormation || "4-4-2");
  
  adjustedHomeSectors.mid *= (1 + tacticalMods.homeMid);
  adjustedHomeSectors.att *= (1 + tacticalMods.homeAtt);
  adjustedHomeSectors.def *= (1 + tacticalMods.homeDef);
  
  awaySectors.mid *= (1 + tacticalMods.awayMid);
  awaySectors.att *= (1 + tacticalMods.awayAtt);
  awaySectors.def *= (1 + tacticalMods.awayDef);

  const homeMidRatio = adjustedHomeSectors.mid / (adjustedHomeSectors.mid + awaySectors.mid);

  // Injury Times
  const injuryTime1 = randomInt(1, 3);
  let injuryTime2 = randomInt(2, 5);

  // Generate highlights
  const numHighlights = randomInt(18, 28);
  const highlightMinutes: number[] = [];

  const firstHalfCount = Math.round(numHighlights * 0.40);
  const secondHalfCount = numHighlights - firstHalfCount;

  while (highlightMinutes.length < firstHalfCount) {
    const min = randomInt(2, 45 + injuryTime1);
    if (!highlightMinutes.includes(min)) highlightMinutes.push(min);
  }

  let secondHalfAdded = 0;
  while (secondHalfAdded < secondHalfCount) {
    const min = Math.random() < 0.4
      ? randomInt(75, 90 + injuryTime2)
      : randomInt(46, 90 + injuryTime2);
    if (!highlightMinutes.includes(min)) {
      highlightMinutes.push(min);
      secondHalfAdded++;
    }
  }

  highlightMinutes.sort((a, b) => a - b);
  const totalMatchMinutes = 90 + injuryTime2;

  // State stats variables
  let homeScore = 0, awayScore = 0;
  let homeShots = 0, awayShots = 0;
  let homeSOT = 0, awaySOT = 0;
  let homeCorners = 0, awayCorners = 0;
  let homeFouls = 0, awayFouls = 0;
  let homeOffsides = 0, awayOffsides = 0;
  let homeXG = 0, awayXG = 0;
  let homeCards = 0, awayCards = 0;

  const rawEvents: MatchEvent[] = [];
  let momentum: MomentumState = { homeBoost: 0, awayBoost: 0, lastGoalMinute: null, lastGoalTeam: null };

  const activeMatchYellowCards = new Set<string>(); // Keep track of double yellow -> red

  // Helper to decay stamina minute by minute for both teams
  const decayAllStamina = () => {
    const decaySquad = (states: PlayerState[]) => {
      states.forEach(s => {
        const isGK = s.role.toUpperCase().includes("GK") || s.player.position.toUpperCase().includes("GK");
        if (isGK) {
          const natFit = getPlayerAttribute(s.player, "Natural Fitness");
          s.stamina = Math.max(15, s.stamina - (0.05 + (100 - natFit) * 0.0015));
        } else {
          const stamAttr = getPlayerAttribute(s.player, "Stamina");
          const workRate = getPlayerAttribute(s.player, "Work Rate");
          let decay = 0.55 * (1 + (workRate - 50) / 120) * (1 + (100 - stamAttr) / 100);
          decay = Math.max(0.35, Math.min(1.05, decay));
          s.stamina = Math.max(15, s.stamina - decay);
        }
      });
    };
    decaySquad(homeStates);
    decaySquad(awayStates);
  };

  // ─── MINUTE BY MINUTE SIMULATION (1 to totalMatchMinutes) ───
  for (let min = 1; min <= totalMatchMinutes; min++) {
    // 1. Decay stamina at every single minute
    decayAllStamina();

    // 2. Only simulate events if it is a designated highlight minute
    if (!highlightMinutes.includes(min)) {
      continue;
    }

    // Update Momentum
    momentum = calculateMomentum(min, homeScore, awayScore, momentum);

    // Determine attacking team based on Midfield ratings + Momentum
    const momentumAdjustedRatio = clamp(
      homeMidRatio + (momentum.homeBoost - momentum.awayBoost) / 200,
      0.25, 0.75
    );
    const isHomeAttacking = Math.random() < momentumAdjustedRatio;

    const attName = isHomeAttacking ? homeName : awayName;
    const defName = isHomeAttacking ? awayName : homeName;
    const attTeam: 'home' | 'away' = isHomeAttacking ? 'home' : 'away';
    const defTeam: 'home' | 'away' = isHomeAttacking ? 'away' : 'home';
    const attStates = isHomeAttacking ? homeStates : awayStates;
    const defStates = isHomeAttacking ? awayStates : homeStates;
    const attMomentumBoost = isHomeAttacking ? momentum.homeBoost : momentum.awayBoost;

    // ─── Individual Brilliance Check ───
    const brilliance = checkBrilliance(min, attStates, attName, attTeam, defStates);
    let shotSituation: ShotSituation = 'insideBox';
    let brillianceXGBonus = 0;
    let skipToShot = false;
    let shooter: PlayerState | null = null;

    if (brilliance.triggered && brilliance.event) {
      rawEvents.push(brilliance.event);
      brillianceXGBonus = brilliance.xgBonus;
      skipToShot = true;
      shotSituation = Math.random() < 0.6 ? 'oneOnOne' : 'insideBox';
      shooter = brilliance.player;
    }

    if (!skipToShot) {
      // ─── Play out the micro Possession Chain ───
      const chain = simulatePossessionChain(
        min, attName, defName, attTeam, defTeam,
        attStates, defStates, attMomentumBoost
      );

      rawEvents.push(...chain.events);

      if (chain.offsideCaught) {
        if (isHomeAttacking) homeOffsides++; else awayOffsides++;
        continue;
      }

      if (chain.foulOccurred) {
        if (isHomeAttacking) awayFouls++; else homeFouls++;
      }

      // Check card risk for fouls
      if (chain.foulOccurred && Math.random() < 0.25) {
        const offender = selectStateDefender(defStates);
        const hasYellow = activeMatchYellowCards.has(offender.player.name);
        
        if (hasYellow) {
          rawEvents.push({
            minute: min,
            type: 'card',
            text: `PELANGGARAN KERAS! ${offender.player.name} mendapatkan kartu kuning kedua diikuti KARTU MERAH! {opponent} bermain dengan 10 pemain.`,
            team: defTeam,
            player: offender.player.name
          });
          activeMatchYellowCards.delete(offender.player.name);
        } else {
          const template = pickRandom(CARD_COMMENTS).replace("{player}", offender.player.name);
          rawEvents.push({
            minute: min,
            type: 'card',
            text: template,
            team: defTeam,
            player: offender.player.name
          });
          activeMatchYellowCards.add(offender.player.name);
        }

        if (defTeam === 'home') { homeCards++; } else { awayCards++; }
      }

      // ─── Counter-Attack ───
      if (chain.counterTriggered && !chain.shotCreated) {
        const counterAttStates = defStates; // defending team counters
        const counterDefStates = attStates;
        const counterAttName = defName;
        const counterAttTeam = defTeam;

        const counterAttacker = selectStateAttacker(counterAttStates);
        const template = pickRandom(COUNTER_COMMENTS).replace("{team}", counterAttName).replace("{attacker}", counterAttacker.player.name);

        rawEvents.push({
          minute: min,
          type: 'counter',
          text: template,
          team: counterAttTeam,
          player: counterAttacker.player.name
        });

        // Run counter transition duel: Attacker Pace vs Defender Pace
        const runPace = getEffectiveStateAttribute(counterAttacker, "Pace");
        const trackCB = selectStateDefender(counterDefStates);
        const trackPace = getEffectiveStateAttribute(trackCB, "Pace");

        if (Math.random() < runPace / (runPace + trackPace) + 0.1) {
          // Reached the box
          shotSituation = 'counter';
          const keeper = findStateGoalkeeper(counterDefStates);
          
          const shootVal = getAverageAttribute(counterAttacker, ["Finishing", "Composure", "Pace"]);
          const keepVal = getAverageAttribute(keeper, ["One on Ones", "Reflexes", "Agility"]);

          const xg = clamp(getBaseXG('counter') * (shootVal / keepVal), 0.04, 0.90);
          if (counterAttTeam === 'home') { homeShots++; homeXG += xg; } else { awayShots++; awayXG += xg; }

          const shotComment = pickRandom(SHOT_COMMENTS).replace("{attacker}", counterAttacker.player.name);

          // SOT check: Pace and Technique vs Keeper reflexes
          if (Math.random() > 0.40) {
            rawEvents.push({ minute: min, type: 'miss', text: `${shotComment} ${pickRandom(MISS_COMMENTS)}`, team: counterAttTeam, player: counterAttacker.player.name, xg });
          } else {
            if (counterAttTeam === 'home') homeSOT++; else awaySOT++;
            if (Math.random() < xg) {
              // Goal from counter!
              if (counterAttTeam === 'home') homeScore++; else awayScore++;
              const assister = selectStateAssister(counterAttStates, counterAttacker.player.name);
              const context = getGoalContext(homeScore, awayScore, counterAttTeam, min, totalMatchMinutes);
              const contextTemplates = GOAL_CONTEXT_COMMENTS[context] || GOAL_COMMENTS;
              let goalText = pickRandom([...GOAL_COMMENTS, ...contextTemplates])
                .replace("{scorer}", counterAttacker.player.name)
                .replace("{assister}", assister.player.name);
              goalText += ` Skor: ${homeName} ${homeScore} - ${awayScore} ${awayName}`;

              rawEvents.push({ minute: min, type: 'goal', text: goalText, team: counterAttTeam, player: counterAttacker.player.name, assist: assister.player.name, xg });
              momentum = { ...momentum, lastGoalMinute: min, lastGoalTeam: counterAttTeam };
            } else {
              // Saved
              rawEvents.push({ minute: min, type: 'save', text: `${shotComment} ${pickRandom(SAVE_COMMENTS).replace("{keeper}", keeper.player.name)}`, team: counterAttTeam, player: keeper.player.name, xg });
              if (Math.random() < 0.40) { if (counterAttTeam === 'home') homeCorners++; else awayCorners++; }
            }
          }
        } else {
          // Counter stopped
          rawEvents.push({
            minute: min,
            type: 'info',
            text: `Serangan balik ${counterAttName} berhasil dipatahkan oleh tekel disiplin ${trackCB.player.name}.`,
            team: attTeam,
            player: trackCB.player.name
          });
        }
        continue;
      }

      if (!chain.shotCreated) {
        continue;
      }

      shotSituation = chain.shotSituation;
      shooter = chain.activeShooter || selectStateAttacker(attStates);
    }

    if (!shooter) shooter = selectStateAttacker(attStates);

    // ─── Process Shot ───
    const keeper = findStateGoalkeeper(defStates);

    let shootScore = 50;
    let keepScore = 50;

    if (shotSituation === 'insideBox') {
      shootScore = getAverageAttribute(shooter, ["Finishing", "Composure", "Technique"]);
      keepScore = getAverageAttribute(keeper, ["Reflexes", "Handling", "Agility"]);
    } else if (shotSituation === 'outsideBox') {
      shootScore = getAverageAttribute(shooter, ["Long Shots", "Technique", "Composure"]);
      keepScore = getAverageAttribute(keeper, ["Reflexes", "Positioning", "Agility"]);
    } else if (shotSituation === 'header') {
      shootScore = getAverageAttribute(shooter, ["Heading", "Jumping Reach", "Strength"]);
      keepScore = getAverageAttribute(keeper, ["Aerial Reach", "Jumping Reach", "Reflexes"]);
    } else if (shotSituation === 'oneOnOne') {
      shootScore = getAverageAttribute(shooter, ["Finishing", "Composure", "Flair"]);
      keepScore = getAverageAttribute(keeper, ["One on Ones", "Reflexes", "Agility"]);
    } else if (shotSituation === 'penalty') {
      shootScore = getAverageAttribute(shooter, ["Penalty Taking", "Composure"]);
      keepScore = getAverageAttribute(keeper, ["Reflexes", "Anticipation"]);
    } else if (shotSituation === 'freeKick') {
      shootScore = getAverageAttribute(shooter, ["Free Kick Taking", "Technique", "Long Shots"]);
      keepScore = getAverageAttribute(keeper, ["Reflexes", "Positioning"]);
    }

    const baseXG = getBaseXG(shotSituation);
    const xg = clamp(baseXG * (shootScore / keepScore) + brillianceXGBonus, 0.03, 0.95);

    if (isHomeAttacking) { homeShots++; homeXG += xg; } else { awayShots++; awayXG += xg; }

    // Shot Resolution
    if (shotSituation === 'penalty') {
      if (isHomeAttacking) homeSOT++; else awaySOT++;
      const penaltyTaker = selectStateGoalscorer(attStates);
      
      const pTakerSkill = getAverageAttribute(penaltyTaker, ["Penalty Taking", "Composure"]);
      const pGKSkill = getAverageAttribute(keeper, ["Reflexes", "Anticipation"]);

      const pXG = clamp(0.78 * (pTakerSkill / pGKSkill), 0.50, 0.95);

      if (Math.random() < pXG) {
        if (isHomeAttacking) homeScore++; else awayScore++;
        const template = pickRandom(PENALTY_SCORED_COMMENTS).replace("{scorer}", penaltyTaker.player.name).replace("{keeper}", keeper.player.name);
        let goalText = `${template} GOL!`;
        
        const context = getGoalContext(homeScore, awayScore, attTeam, min, totalMatchMinutes);
        const contextComment = pickRandom(GOAL_CONTEXT_COMMENTS[context] || [""]);
        if (contextComment) goalText += ` ${contextComment.replace("{scorer}", penaltyTaker.player.name)}`;
        goalText += ` Skor: ${homeName} ${homeScore} - ${awayScore} ${awayName}`;

        rawEvents.push({ minute: min, type: 'goal', text: goalText, team: attTeam, player: penaltyTaker.player.name, xg: pXG });
        momentum = { ...momentum, lastGoalMinute: min, lastGoalTeam: attTeam };
      } else {
        const template = pickRandom(PENALTY_SAVED_COMMENTS).replace("{keeper}", keeper.player.name).replace("{attacker}", penaltyTaker.player.name);
        rawEvents.push({ minute: min, type: 'save', text: template, team: attTeam, player: keeper.player.name, xg: pXG });
        if (Math.random() < 0.45) { if (isHomeAttacking) homeCorners++; else awayCorners++; }
      }
      continue;
    }

    if (shotSituation === 'freeKick') {
      const fkTaker = getAverageAttribute(shooter, ["Free Kick Taking"]) > 55 ? shooter : getStateBestPlayer(attStates);
      const fkTakerSkill = getAverageAttribute(fkTaker, ["Free Kick Taking", "Technique"]);
      const fkGKSkill = getAverageAttribute(keeper, ["Reflexes", "Positioning"]);

      const fkXG = clamp(0.08 * (fkTakerSkill / fkGKSkill), 0.03, 0.35);

      if (Math.random() > 0.42) {
        rawEvents.push({
          minute: min, type: 'miss',
          text: `${fkTaker.player.name} mengeksekusi tendangan bebas mendatar... tetapi bola melenceng atau membentur pagar hidup.`,
          team: attTeam, player: fkTaker.player.name, xg: fkXG
        });
        if (Math.random() < 0.40) { if (isHomeAttacking) homeCorners++; else awayCorners++; }
      } else {
        if (isHomeAttacking) homeSOT++; else awaySOT++;
        if (Math.random() < fkXG) {
          if (isHomeAttacking) homeScore++; else awayScore++;
          const context = getGoalContext(homeScore, awayScore, attTeam, min, totalMatchMinutes);
          const contextComment = pickRandom(GOAL_CONTEXT_COMMENTS[context] || [""]);
          let goalText = `GOL TENDANGAN BEBAS INDAH! ${fkTaker.player.name} menembak melengkung melewati pagar betis dan menggetarkan jala gawang!`;
          if (contextComment) goalText += ` ${contextComment.replace("{scorer}", fkTaker.player.name)}`;
          goalText += ` Skor: ${homeName} ${homeScore} - ${awayScore} ${awayName}`;

          rawEvents.push({ minute: min, type: 'goal', text: goalText, team: attTeam, player: fkTaker.player.name, xg: fkXG });
          momentum = { ...momentum, lastGoalMinute: min, lastGoalTeam: attTeam };
        } else {
          rawEvents.push({
            minute: min, type: 'save',
            text: `Sepakan bebas melengkung dari ${fkTaker.player.name} berhasil ditepis gemilang oleh ${keeper.player.name}.`,
            team: attTeam, player: keeper.player.name, xg: fkXG
          });
        }
      }
      continue;
    }

    // Normal shot processing
    const shotTemplate = pickRandom(SHOT_COMMENTS).replace("{attacker}", shooter.player.name);
    
    // SOT roll influenced by Finishing and Technique
    const technique = getEffectiveStateAttribute(shooter, "Technique");
    const composure = getEffectiveStateAttribute(shooter, "Composure");
    
    const sotBaseChance = shotSituation === 'oneOnOne' ? 0.70
      : shotSituation === 'insideBox' ? 0.52
      : shotSituation === 'header' ? 0.43
      : 0.31;
    
    const sotChance = sotBaseChance * (technique + composure) / 110;

    if (Math.random() > clamp(sotChance, 0.20, 0.88)) {
      rawEvents.push({
        minute: min, type: 'miss',
        text: `${shotTemplate} ${pickRandom(MISS_COMMENTS)}`,
        team: attTeam, player: shooter.player.name, xg
      });
      if (Math.random() < 0.32) {
        if (isHomeAttacking) homeCorners++; else awayCorners++;
      }
    } else {
      if (isHomeAttacking) homeSOT++; else awaySOT++;

      if (Math.random() < xg) {
        if (isHomeAttacking) homeScore++; else awayScore++;
        const assister = selectStateAssister(attStates, shooter.player.name);

        const context = getGoalContext(homeScore, awayScore, attTeam, min, totalMatchMinutes);
        const contextTemplates = GOAL_CONTEXT_COMMENTS[context] || [];
        const goalTemplates = [...GOAL_COMMENTS, ...contextTemplates];
        
        let goalText = pickRandom(goalTemplates)
          .replace("{scorer}", shooter.player.name)
          .replace("{assister}", assister.player.name)
          .replace("{keeper}", keeper.player.name);
        goalText += ` Skor: ${homeName} ${homeScore} - ${awayScore} ${awayName}`;

        rawEvents.push({
          minute: min, type: 'goal', text: goalText,
          team: attTeam, player: shooter.player.name, assist: assister.player.name, xg
        });

        momentum = { ...momentum, lastGoalMinute: min, lastGoalTeam: attTeam };
      } else {
        // Saved
        rawEvents.push({
          minute: min, type: 'save',
          text: `${shotTemplate} ${pickRandom(SAVE_COMMENTS).replace("{keeper}", keeper.player.name)}`,
          team: attTeam, player: keeper.player.name, xg
        });
        if (Math.random() < 0.42) {
          if (isHomeAttacking) homeCorners++; else awayCorners++;
        }
      }
    }
  }

  // ─── Compile bottom-up statistics from playerState records ───
  let totHomePassesAttempted = homeStates.reduce((acc, s) => acc + s.passesAttempted, 0);
  let totHomePassesCompleted = homeStates.reduce((acc, s) => acc + s.passesCompleted, 0);
  let totAwayPassesAttempted = awayStates.reduce((acc, s) => acc + s.passesAttempted, 0);
  let totAwayPassesCompleted = awayStates.reduce((acc, s) => acc + s.passesCompleted, 0);

  // Pad baseline passes so stats feel realistic and match possession
  const baseHomePoss = Math.round(homeMidRatio * 100);
  const homePoss = clamp(baseHomePoss + randomInt(-3, 3), 28, 72);
  const awayPoss = 100 - homePoss;

  const paddedHomePasses = Math.round((homePoss / 100) * randomInt(380, 520));
  const paddedAwayPasses = Math.round((awayPoss / 100) * randomInt(380, 520));

  totHomePassesAttempted += paddedHomePasses;
  totAwayPassesAttempted += paddedAwayPasses;

  // Real bottom-up accuracy ratios applied to padded totals
  const homePassingSkill = homeStates.reduce((acc, s) => acc + getPlayerAttribute(s.player, "Passing"), 0) / homeStates.length;
  const awayPassingSkill = awayStates.reduce((acc, s) => acc + getPlayerAttribute(s.player, "Passing"), 0) / awayStates.length;

  const homePassAcc = clamp(Math.round(72 + (homePassingSkill - 55) * 0.45 + randomInt(-2, 2)), 64, 94);
  const awayPassAcc = clamp(Math.round(72 + (awayPassingSkill - 55) * 0.45 + randomInt(-2, 2)), 64, 94);

  totHomePassesCompleted += Math.round(paddedHomePasses * (homePassAcc / 100));
  totAwayPassesCompleted += Math.round(paddedAwayPasses * (awayPassAcc / 100));

  homeCorners += randomInt(2, 5);
  awayCorners += randomInt(2, 5);
  homeFouls += randomInt(5, 9);
  awayFouls += randomInt(5, 9);

  const stats: MatchStats = {
    possession: [homePoss, awayPoss],
    shots: [homeShots, awayShots],
    shotsOnTarget: [homeSOT, awaySOT],
    corners: [homeCorners, awayCorners],
    fouls: [homeFouls, awayFouls],
    passes: [totHomePassesAttempted, totAwayPassesAttempted],
    passAccuracy: [homePassAcc, awayPassAcc],
    offsides: [homeOffsides, awayOffsides],
    xg: [Math.round(homeXG * 100) / 100, Math.round(awayXG * 100) / 100]
  };

  // ─── COMPILE CHRONOLOGICAL EVENTS WITH SYSTEM LABELS ───
  const compiledEvents: MatchEvent[] = [];

  compiledEvents.push({
    minute: 0,
    type: 'kickoff',
    text: `Peluit babak pertama berbunyi! Pertandingan dimulai antara ${homeName} vs ${awayName}.`,
    team: 'system',
    player: null
  });

  const sortedRaw = [...rawEvents].sort((a, b) => a.minute - b.minute);

  let insertedHalftime = false;
  let insertedInjuryTime1 = false;
  let insertedInjuryTime2 = false;

  sortedRaw.forEach(ev => {
    if (ev.minute >= 45 && !insertedInjuryTime1) {
      compiledEvents.push({
        minute: 45,
        type: 'injury_time',
        text: `Papan tambahan waktu menunjukkan ${injuryTime1} menit di babak pertama.`,
        team: 'system',
        player: null
      });
      insertedInjuryTime1 = true;
    }

    if (ev.minute >= 45 + injuryTime1 && !insertedHalftime) {
      const goalsH = compiledEvents.filter(e => e.type === 'goal' && e.team === 'home').length;
      const goalsA = compiledEvents.filter(e => e.type === 'goal' && e.team === 'away').length;
      compiledEvents.push({
        minute: 45 + injuryTime1,
        type: 'halftime',
        text: `Babak pertama selesai. Skor sementara: ${homeName} ${goalsH} - ${goalsA} ${awayName}.`,
        team: 'system',
        player: null
      });
      insertedHalftime = true;
    }

    if (ev.minute >= 90 && !insertedInjuryTime2) {
      compiledEvents.push({
        minute: 90,
        type: 'injury_time',
        text: `Wasit memberikan waktu tambahan ${injuryTime2} menit di babak kedua!`,
        team: 'system',
        player: null
      });
      insertedInjuryTime2 = true;
    }

    compiledEvents.push(ev);
  });

  if (!insertedInjuryTime1) {
    compiledEvents.push({
      minute: 45,
      type: 'injury_time',
      text: `Papan tambahan waktu menunjukkan ${injuryTime1} menit di babak pertama.`,
      team: 'system',
      player: null
    });
  }
  if (!insertedHalftime) {
    const goalsH = compiledEvents.filter(e => e.type === 'goal' && e.team === 'home').length;
    const goalsA = compiledEvents.filter(e => e.type === 'goal' && e.team === 'away').length;
    compiledEvents.push({
      minute: 45 + injuryTime1,
      type: 'halftime',
      text: `Babak pertama selesai. Skor sementara: ${homeName} ${goalsH} - ${goalsA} ${awayName}.`,
      team: 'system',
      player: null
    });
  }
  if (!insertedInjuryTime2) {
    compiledEvents.push({
      minute: 90,
      type: 'injury_time',
      text: `Wasit memberikan waktu tambahan ${injuryTime2} menit di babak kedua!`,
      team: 'system',
      player: null
    });
  }

  compiledEvents.push({
    minute: totalMatchMinutes,
    type: 'fulltime',
    text: `Peluit panjang berbunyi! Laga seru berakhir dengan kedudukan ${homeName} ${homeScore} - ${awayScore} ${awayName}.`,
    team: 'system',
    player: null
  });

  // Sort compiled events
  compiledEvents.sort((a, b) => {
    if (a.minute !== b.minute) return a.minute - b.minute;
    const priority: Record<string, number> = { kickoff: 0, injury_time: 1, halftime: 2, fulltime: 3 };
    const aPri = priority[a.type] ?? 5;
    const bPri = priority[b.type] ?? 5;
    return aPri - bPri;
  });

  return {
    id: fixtureId,
    home: homeName,
    away: awayName,
    homeScore,
    awayScore,
    simulated: true,
    events: compiledEvents,
    stats,
    homeFormation,
    awayFormation
  };
}
