export interface Player {
  name: string;
  profile_url: string;
  position: string;
  age: string;
  nationality: string;
  rat: string; // Raw rating from JSON
  role: string;
  img_url: string;
  normalizedRating?: number; // Calculated rating
  club?: string; // Player club name
  playingPosition?: string; // Tactical slot assigned in match
  attributes?: Record<string, number>;
  team?: string;
}

export type PlayerDatabase = Record<string, Player[]>;

export interface DraftSlot {
  id: number;
  position: string; // e.g. "GK", "DC", "MC", "ST", etc.
  player: Player | null;
  x: number; // percentage X position on the 2D pitch (0 - 100)
  y: number; // percentage Y position on the 2D pitch (0 - 100)
  gachaCount: number; // number of gacha draws made for this slot (max 2)
  choices: Player[]; // cached 5 player choices
}

export interface FormationSlot {
  position: string;
  x: number;
  y: number;
}

export interface Formation {
  name: string;
  slots: FormationSlot[];
}

export interface ClubStanding {
  name: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  isUser: boolean;
  logoColor?: string; // Random visual helper
}

export interface MatchEvent {
  minute: number;
  type: 'goal' | 'save' | 'miss' | 'card' | 'kickoff' | 'halftime' | 'fulltime' | 'info' | 'counter' | 'freekick' | 'penalty' | 'chance' | 'buildup' | 'injury_time';
  text: string;
  team: 'home' | 'away' | 'system';
  player: string | null;
  assist?: string | null;
  xg?: number;
}

export interface MatchStats {
  possession: [number, number]; // [home, away]
  shots: [number, number];
  shotsOnTarget: [number, number];
  corners: [number, number];
  fouls: [number, number];
  passes: [number, number];
  passAccuracy: [number, number]; // percentage
  offsides: [number, number];
  xg: [number, number]; // expected goals
}

export interface Fixture {
  id: string;
  home: string;
  away: string;
  homeScore: number | null;
  awayScore: number | null;
  simulated: boolean;
  events?: MatchEvent[];
  stats?: MatchStats;
  homeFormation?: string;
  awayFormation?: string;
}

export interface ActiveMatchState {
  fixtureId: string;
  home: string;
  away: string;
  homeRating: number;
  awayRating: number;
  homeSquad: Player[];
  awaySquad: Player[];
  homeFormation?: string;
  awayFormation?: string;
}
