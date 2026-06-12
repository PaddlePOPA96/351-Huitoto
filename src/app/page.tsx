"use client";

import React, { useState, useEffect, useMemo } from "react";
import { 
  Player, 
  DraftSlot, 
  ClubStanding, 
  Fixture, 
  ActiveMatchState 
} from "../lib/types";
import { FORMATIONS, normalizeRating, isPositionSuitable, POSITION_MAP, autoPickSquad } from "../lib/tactics";
import { simulateMatch, calculateSquadRating } from "../lib/matchEngine";
import FootballPitch from "../components/FootballPitch";
import DraftSelectionModal from "../components/DraftSelectionModal";
import LeagueTable from "../components/LeagueTable";
import MatchCenter from "../components/MatchCenter";
import PlayerDatabaseBrowser from "../components/PlayerDatabaseBrowser";
import { 
  Play, 
  Flame, 
  Settings, 
  HelpCircle, 
  Trophy, 
  Star, 
  User, 
  RotateCcw, 
  ArrowRight, 
  Calendar, 
  Sparkles, 
  Search,
  ChevronRight,
  ShieldAlert,
  X,
  FastForward,
  Lock
} from "lucide-react";

// List of top AI opponent clubs to pick from database
const PRESET_AI_CLUBS = [
  "Arsenal",
  "Chelsea",
  "Liverpool",
  "Manchester City",
  "Manchester United",
  "Real Madrid",
  "Barcelona",
  "Milan",
  "Juventus",
  "Borussia Dortmund"
];

// Helper to draw random elements without sorting the whole array (Fisher-Yates)
function getRandomElements<T>(arr: T[], count: number): T[] {
  const result = [...arr];
  const n = result.length;
  const max = Math.min(count, n);
  for (let i = 0; i < max; i++) {
    const j = Math.floor(Math.random() * (n - i)) + i;
    const temp = result[i];
    result[i] = result[j];
    result[j] = temp;
  }
  return result.slice(0, max);
}

// Draw 10 random choices where at least 6 players are rating >= 70, and the rest are random (min rating 50, excludes drafted)
function draw10ChoicesForPosition(playersForPosition: Player[], draftedNames: string[] = []): Player[] {
  // Filter out any players who are already drafted in another slot
  const filteredMatching = playersForPosition.filter(p => 
    !draftedNames.includes(p.name)
  );

  const poolHigh = filteredMatching.filter(p => normalizeRating(p.rat) >= 70);
  const selected: Player[] = [];

  // Draw 6 high players (>= 70) if possible
  const highToDraw = Math.min(6, poolHigh.length);
  const shuffledHigh = getRandomElements(poolHigh, highToDraw);
  selected.push(...shuffledHigh);

  // Draw remaining from general pool (excluding already selected)
  const remainingCount = 10 - selected.length;
  const poolGeneralFiltered = filteredMatching.filter(p => !selected.some(s => s.name === p.name));
  const shuffledGeneral = getRandomElements(poolGeneralFiltered, remainingCount);
  selected.push(...shuffledGeneral);

  // Shuffle final 10
  return getRandomElements(selected, selected.length);
}

const LEAGUE_CLUBS: Record<string, string[]> = {
  EPL: [
    "Arsenal", "Aston Villa", "Chelsea", "Everton", "Leeds United", 
    "Liverpool", "Manchester City", "Manchester United", "Newcastle United", 
    "Nottingham Forest", "Sunderland", "Tottenham Hotspur"
  ],
  LaLiga: [
    "Athletic Club", "Atlético Madrid", "Barcelona", "Real Betis", 
    "Real Madrid", "Real Sociedad", "Sevilla", "Valencia"
  ],
  SerieA: [
    "Atalanta", "Bologna", "Fiorentina", "Juventus", "Lazio", 
    "Milan", "Napoli", "Parma", "Roma", "Torino"
  ],
  Bundesliga: [
    "Borussia Dortmund", "Bayer Leverkusen", "RB Leipzig", "Eintracht Frankfurt", 
    "SC Freiburg", "VfB Stuttgart", "Wolfsburg", "FC Köln", "Werder Bremen"
  ],
  Ligue1: [
    "Marseille", "Monaco", "Lille", "Lyon", "Nice", 
    "Strasbourg", "Lens", "Nantes", "Auxerre"
  ],
  PrimeiraLiga: [
    "Benfica", "Sporting CP", "FC Porto"
  ]
};

const LEAGUE_NAMES: Record<string, string> = {
  EPL: "English Premier League",
  LaLiga: "La Liga Santander",
  SerieA: "Serie A Enilive",
  Bundesliga: "Bundesliga",
  Ligue1: "Ligue 1 McDonald's",
  PrimeiraLiga: "Primeira Liga"
};



export default function GamePage() {
  // --- Loading State ---
  const [playersData, setPlayersData] = useState<Record<string, Player[]>>({});
  const [playersByNation, setPlayersByNation] = useState<Record<string, Player[]>>({});
  const [clubsList, setClubsList] = useState<string[]>([]);
  const [nationsList, setNationsList] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string>("");

  // --- Game State ---
  const [screen, setScreen] = useState<'welcome' | 'formation' | 'draft' | 'league' | 'match' | 'end'>('welcome');
  const [currentTab, setCurrentTab] = useState<'landing' | 'play' | 'database'>('landing');
  const [selectedFormationName, setSelectedFormationName] = useState<string>("4-3-3");
  const [draftSlots, setDraftSlots] = useState<DraftSlot[]>([]);
  
  // --- Modals State ---
  const [activeSlotId, setActiveSlotId] = useState<number | null>(null);

  // --- League & Tournament State ---
  const [domesticLeague, setDomesticLeague] = useState<string>("EPL");
  const [tournamentType, setTournamentType] = useState<'domestic' | 'champions'>('domestic');
  const [playersByPosition, setPlayersByPosition] = useState<Record<string, Player[]>>({});
  const [championsLeagueOpponents, setChampionsLeagueOpponents] = useState<string[]>([]);

  // --- League State ---
  const [userTeamName, setUserTeamName] = useState<string>("User FC");
  const [aiClubs, setAiClubs] = useState<string[]>([]);
  const [standings, setStandings] = useState<ClubStanding[]>([]);
  const [fixtures, setFixtures] = useState<Fixture[][]>([]);
  const [currentRoundIdx, setCurrentRoundIdx] = useState<number>(0);
  const [activeMatch, setActiveMatch] = useState<ActiveMatchState | null>(null);
  
  // Cache for AI squads to avoid re-calculating during match simulation
  const [aiSquads, setAiSquads] = useState<Record<string, Player[]>>({});
  const [aiFormations, setAiFormations] = useState<Record<string, string>>({});
  const [isSimulatingSeason, setIsSimulatingSeason] = useState<boolean>(false);

  // Helper to dynamically get the top 2 clubs from a league based on squad ratings + variance (natural and unbiased)
  const getTopTwoClubsForLeague = (leagueKey: string, excludeClub?: string): string[] => {
    const clubs = LEAGUE_CLUBS[leagueKey] || [];
    const filteredClubs = excludeClub 
      ? clubs.filter(c => c.toLowerCase() !== excludeClub.toLowerCase())
      : clubs;
    
    const clubStrengths = filteredClubs.map(clubName => {
      const pList = playersData[clubName] || [];
      const top11 = [...pList]
        .sort((a, b) => normalizeRating(b.rat) - normalizeRating(a.rat))
        .slice(0, 11);
      
      const avgRating = top11.length > 0 
        ? Math.round(top11.reduce((sum, p) => sum + normalizeRating(p.rat), 0) / top11.length)
        : 65;
      
      // Small random factor to simulate season variance naturally (-5 to +5)
      const variance = (Math.random() - 0.5) * 10;
      return {
        name: clubName,
        score: avgRating + variance
      };
    });

    // Sort descending by score
    clubStrengths.sort((a, b) => b.score - a.score);
    return clubStrengths.slice(0, 2).map(c => c.name);
  };

  // Fetch JSON data on mount
  useEffect(() => {
    fetch("/fix-player.json")
      .then((res) => {
        if (!res.ok) throw new Error("Gagal membaca database pemain.");
        return res.json();
      })
      .then((data: { players: Player[] }) => {
        const loadedData: Record<string, Player[]> = {};
        const byNation: Record<string, Player[]> = {};
        const byPosition: Record<string, Player[]> = {};
        
        data.players.forEach(p => {
          const clubName = p.team || "Free Agent";
          const nationName = p.nationality || "Unknown";
          
          if (!loadedData[clubName]) {
            loadedData[clubName] = [];
          }
          if (!byNation[nationName]) {
            byNation[nationName] = [];
          }
          
          const mappedPlayer = {
            ...p,
            club: clubName // Inject club name
          };
          loadedData[clubName].push(mappedPlayer);
          byNation[nationName].push(mappedPlayer);

          // Precompute playersByPosition directly in the single pass
          const ratVal = normalizeRating(p.rat);
          if (ratVal >= 50) {
            const keys = Object.keys(POSITION_MAP);
            for (let i = 0; i < keys.length; i++) {
              const slotPos = keys[i];
              if (isPositionSuitable(p.position, slotPos)) {
                if (!byPosition[slotPos]) {
                  byPosition[slotPos] = [];
                }
                byPosition[slotPos].push(mappedPlayer);
              }
            }
          }
        });

        setPlayersData(loadedData);
        setPlayersByNation(byNation);
        setClubsList(Object.keys(loadedData).sort());
        setNationsList(Object.keys(byNation).sort());
        setPlayersByPosition(byPosition);

        setIsLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoadError("Tidak dapat memuat database pemain. Pastikan server lokal Anda aktif.");
        setIsLoading(false);
      });
  }, []);

  // --- Draft Statistics ---
  const userSquad = useMemo(() => {
    return draftSlots.map(s => {
      if (!s.player) return null;
      return { ...s.player, playingPosition: s.position };
    }).filter(Boolean) as Player[];
  }, [draftSlots]);

  const userSquadRating = useMemo(() => {
    return calculateSquadRating(userSquad);
  }, [userSquad]);

  const totalDraftedCount = useMemo(() => {
    return userSquad.length;
  }, [userSquad]);

  const starRating = useMemo(() => {
    if (userSquadRating >= 85) return 5;
    if (userSquadRating >= 78) return 4;
    if (userSquadRating >= 70) return 3;
    if (userSquadRating >= 60) return 2;
    return 1;
  }, [userSquadRating]);

  // --- Handlers ---
  const handleStartGame = () => {
    setScreen('formation');
  };

  const handleSelectFormation = (name: string) => {
    setSelectedFormationName(name);
    // Initialize empty draft slots based on formation template
    const slotsTemplate = FORMATIONS[name].slots;
    const initialSlots: DraftSlot[] = slotsTemplate.map((s, idx) => ({
      id: idx,
      position: s.position,
      player: null,
      x: s.x,
      y: s.y,
      gachaCount: 0,
      choices: []
    }));
    setDraftSlots(initialSlots);
    setScreen('draft');
  };

  const handleSlotClick = (slotId: number) => {
    setActiveSlotId(slotId);
    
    // Generate initial choices if not already generated
    setDraftSlots(prev => {
      const draftedNames = prev.map(s => s.player?.name).filter((name): name is string => !!name);
      return prev.map(s => {
        if (s.id === slotId) {
          if (s.gachaCount === 0) {
            const leagueClubs = [...(LEAGUE_CLUBS[domesticLeague] || []), "Free Agent"];
            const pool = (playersByPosition[s.position] || []).filter(p => leagueClubs.includes(p.club || "Free Agent"));
            const choices = draw10ChoicesForPosition(pool, draftedNames);
            return { ...s, choices, gachaCount: 1 };
          }
        }
        return s;
      });
    });
  };
 
  const handleReroll = (slotId: number) => {
    setDraftSlots(prev => {
      const draftedNames = prev.map(s => s.player?.name).filter((name): name is string => !!name);
      return prev.map(s => {
        if (s.id === slotId) {
          if (s.gachaCount < 2) {
            const leagueClubs = [...(LEAGUE_CLUBS[domesticLeague] || []), "Free Agent"];
            const pool = (playersByPosition[s.position] || []).filter(p => leagueClubs.includes(p.club || "Free Agent"));
            const choices = draw10ChoicesForPosition(pool, draftedNames);
            return { ...s, choices, gachaCount: s.gachaCount + 1 };
          }
        }
        return s;
      });
    });
  };

  const handleDraftPlayer = (player: Player) => {
    if (activeSlotId === null) return;
    
    setDraftSlots(prev => prev.map(s => {
      if (s.id === activeSlotId) {
        return { ...s, player };
      }
      return s;
    }));

    // Close modals
    setActiveSlotId(null);
  };

  const handleGenerateLeague = () => {
    if (totalDraftedCount < 11) return;

    // 1. Select AI clubs depending on tournament type
    const selectedAI = tournamentType === 'champions'
      ? championsLeagueOpponents
      : (LEAGUE_CLUBS[domesticLeague] || PRESET_AI_CLUBS).filter(c => c.toLowerCase() !== userTeamName.toLowerCase());
    setAiClubs(selectedAI);

    // 2. Build AI squads (top 11 players by rating) and store squads & ratings
    const tempAiSquads: Record<string, Player[]> = {};
    const tempStandings: ClubStanding[] = [
      {
        name: userTeamName,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        points: 0,
        isUser: true
      }
    ];

    const tempAiFormations: Record<string, string> = {};
    const formationNames = Object.keys(FORMATIONS);

    selectedAI.forEach(clubName => {
      const pList = playersData[clubName] || [];
      
      // Assign random formation to AI
      const randomFormation = formationNames[Math.floor(Math.random() * formationNames.length)];
      tempAiFormations[clubName] = randomFormation;
      
      // Pick best 11 for that formation
      const top11 = autoPickSquad(pList, randomFormation);
      
      tempAiSquads[clubName] = top11;
      
      tempStandings.push({
        name: clubName,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        points: 0,
        isUser: false
      });
    });

    setAiSquads(tempAiSquads);
    setAiFormations(tempAiFormations);
    setStandings(tempStandings);

    // 3. Generate schedule
    const allTeams = [userTeamName, ...selectedAI];
    const generatedFixtures = generateLeagueFixtures(allTeams);
    setFixtures(generatedFixtures);
    setCurrentRoundIdx(0);
    setScreen('league');
  };

  // Berger tables or circle method round robin schedule generator
  const generateLeagueFixtures = (teams: string[]): Fixture[][] => {
    const list = [...teams];
    if (list.length % 2 !== 0) {
      list.push("BYE");
    }
    const numTeams = list.length;
    const numRounds = numTeams - 1; // 11 teams => 11 rounds
    const matchesPerRound = numTeams / 2;
    const rounds: Fixture[][] = [];

    for (let round = 0; round < numRounds; round++) {
      const roundFixtures: Fixture[] = [];
      for (let match = 0; match < matchesPerRound; match++) {
        const homeIdx = (round + match) % (numTeams - 1);
        let awayIdx = (numTeams - 1 - match + round) % (numTeams - 1);
        if (match === 0) {
          awayIdx = numTeams - 1;
        }
        
        const home = list[homeIdx];
        const away = list[awayIdx];
        
        if (home !== "BYE" && away !== "BYE") {
          roundFixtures.push({
            id: `${round}-${match}`,
            home,
            away,
            homeScore: null,
            awayScore: null,
            simulated: false
          });
        }
      }
      rounds.push(roundFixtures);
    }
    return rounds;
  };

  // Find the next match for the user in the current round
  const userFixtureInCurrentRound = useMemo(() => {
    if (fixtures.length === 0 || currentRoundIdx >= fixtures.length) return null;
    const round = fixtures[currentRoundIdx];
    return round.find(f => f.home === userTeamName || f.away === userTeamName) || null;
  }, [fixtures, currentRoundIdx, userTeamName]);

  const handleStartMatchSimulation = () => {
    const fix = userFixtureInCurrentRound;
    if (!fix) return;

    // Set up active match states
    const isUserHome = fix.home === userTeamName;
    const oppName = isUserHome ? fix.away : fix.home;

    const oppSquad = aiSquads[oppName] || [];
    const oppFormation = aiFormations[oppName] || "4-4-2";
    const oppRating = calculateSquadRating(oppSquad);

    // Pre-simulate the match engine
    const simResult = simulateMatch(
      fix.id,
      fix.home,
      fix.away,
      isUserHome ? userSquad : oppSquad,
      isUserHome ? oppSquad : userSquad,
      isUserHome ? selectedFormationName : oppFormation,
      isUserHome ? oppFormation : selectedFormationName
    );

    // Save simulation results to fixtures state so MatchCenter gets it!
    setFixtures(prev => prev.map((round, rIdx) => {
      if (rIdx === currentRoundIdx) {
        return round.map(f => f.id === fix.id ? simResult : f);
      }
      return round;
    }));

    setActiveMatch({
      fixtureId: fix.id,
      home: fix.home,
      away: fix.away,
      homeRating: isUserHome ? userSquadRating : oppRating,
      awayRating: isUserHome ? oppRating : userSquadRating,
      homeSquad: isUserHome ? userSquad : oppSquad,
      awaySquad: isUserHome ? oppSquad : userSquad,
      homeFormation: isUserHome ? selectedFormationName : oppFormation,
      awayFormation: isUserHome ? oppFormation : selectedFormationName
    });

    setScreen('match');
  };

  const handleMatchFinished = (finishedFixture: Fixture) => {
    // 1. Update fixtures in this round (simulated fixture + background matches)
    const updatedFixtures = fixtures.map((round, rIdx) => {
      if (rIdx === currentRoundIdx) {
        return round.map(f => {
          if (f.id === finishedFixture.id) return finishedFixture;
          
          // Background simulation
          const isHomeUser = f.home === userTeamName;
          const isAwayUser = f.away === userTeamName;
          
          const homeSquad = isHomeUser ? userSquad : (aiSquads[f.home] || []);
          const awaySquad = isAwayUser ? userSquad : (aiSquads[f.away] || []);
          
          const homeFormation = isHomeUser ? selectedFormationName : (aiFormations[f.home] || "4-4-2");
          const awayFormation = isAwayUser ? selectedFormationName : (aiFormations[f.away] || "4-4-2");
          
          return simulateMatch(f.id, f.home, f.away, homeSquad, awaySquad, homeFormation, awayFormation);
        });
      }
      return round;
    });

    setFixtures(updatedFixtures);

    // 2. Rebuild standings
    rebuildStandingsFromFixtures(updatedFixtures);

    // Close match view
    setActiveMatch(null);
    setScreen('league');
  };

  const rebuildStandingsFromFixtures = (allFixtures: Fixture[][]) => {
    setStandings(prev => {
      return prev.map(standing => {
        const teamName = standing.name;
        let p = 0;
        let w = 0;
        let d = 0;
        let l = 0;
        let gf = 0;
        let ga = 0;
        let pts = 0;

        allFixtures.flat().forEach(fix => {
          if (!fix.simulated) return;

          if (fix.home === teamName) {
            p += 1;
            gf += fix.homeScore ?? 0;
            ga += fix.awayScore ?? 0;
            if ((fix.homeScore ?? 0) > (fix.awayScore ?? 0)) {
              w += 1;
              pts += 3;
            } else if (fix.homeScore === fix.awayScore) {
              d += 1;
              pts += 1;
            } else {
              l += 1;
            }
          } else if (fix.away === teamName) {
            p += 1;
            gf += fix.awayScore ?? 0;
            ga += fix.homeScore ?? 0;
            if ((fix.awayScore ?? 0) > (fix.homeScore ?? 0)) {
              w += 1;
              pts += 3;
            } else if (fix.homeScore === fix.awayScore) {
              d += 1;
              pts += 1;
            } else {
              l += 1;
            }
          }
        });

        return {
          ...standing,
          played: p,
          won: w,
          drawn: d,
          lost: l,
          goalsFor: gf,
          goalsAgainst: ga,
          goalDifference: gf - ga,
          points: pts
        };
      });
    });
  };

  // Helper to simulate a specific round instantly
  const simulateRoundInstantly = (roundIdx: number, currentFixtures: Fixture[][]) => {
    return currentFixtures.map((round, rIdx) => {
      if (rIdx === roundIdx) {
        return round.map(f => {
          if (f.simulated) return f;
          const isHomeUser = f.home === userTeamName;
          const isAwayUser = f.away === userTeamName;
          
          const homeSquad = isHomeUser ? userSquad : (aiSquads[f.home] || []);
          const awaySquad = isAwayUser ? userSquad : (aiSquads[f.away] || []);
          
          const homeFormation = isHomeUser ? selectedFormationName : (aiFormations[f.home] || "4-4-2");
          const awayFormation = isAwayUser ? selectedFormationName : (aiFormations[f.away] || "4-4-2");
          
          return simulateMatch(f.id, f.home, f.away, homeSquad, awaySquad, homeFormation, awayFormation);
        });
      }
      return round;
    });
  };

  const handleSkipSeason = () => {
    if (isSimulatingSeason) return;
    setIsSimulatingSeason(true);
    
    let round = currentRoundIdx;
    let tempFixtures = [...fixtures];
    
    const runSimulationStep = () => {
      tempFixtures = simulateRoundInstantly(round, tempFixtures);
      setFixtures(tempFixtures);
      rebuildStandingsFromFixtures(tempFixtures);
      
      if (round + 1 < tempFixtures.length) {
        round++;
        setCurrentRoundIdx(round);
        setTimeout(runSimulationStep, 450);
      } else {
        setTimeout(() => {
          setIsSimulatingSeason(false);
          setScreen('end');
        }, 1200);
      }
    };
    
    runSimulationStep();
  };

  // Simulate an entire round instantly (used when user has a BYE)
  const simulateByeRound = () => {
    const simulatedRound = fixtures[currentRoundIdx].map(f => {
      const homeSquad = aiSquads[f.home] || [];
      const awaySquad = aiSquads[f.away] || [];
      const homeFormation = aiFormations[f.home] || "4-4-2";
      const awayFormation = aiFormations[f.away] || "4-4-2";
      return simulateMatch(f.id, f.home, f.away, homeSquad, awaySquad, homeFormation, awayFormation);
    });

    const updatedFixtures = fixtures.map((round, rIdx) => {
      if (rIdx === currentRoundIdx) return simulatedRound;
      return round;
    });

    setFixtures(updatedFixtures);
    rebuildStandingsFromFixtures(updatedFixtures);
    handleNextRound();
  };

  const handleNextRound = () => {
    if (currentRoundIdx + 1 >= fixtures.length) {
      setScreen('end');
    } else {
      setCurrentRoundIdx(prev => prev + 1);
    }
  };

  const handleRestart = () => {
    setScreen('welcome');
    setCurrentTab('landing');
    setDraftSlots([]);
    setSelectedFormationName("4-3-3");
    setActiveSlotId(null);
    setCurrentRoundIdx(0);
    setStandings([]);
    setFixtures([]);
    setAiSquads({});
  };

  const handleGoToChampionsLeague = (keepSquad: boolean) => {
    // 1. Calculate CL opponents based on the domestic standings before clearing them
    const sorted = [...standings].sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
      if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
      return a.name.localeCompare(b.name);
    });
    
    const userIdx = sorted.findIndex(t => t.isUser);
    // User is guaranteed to be in the top 2 here. If user is 1st, partner is 2nd. If user is 2nd, partner is 1st.
    const partnerTeam = userIdx === 0 ? sorted[1].name : sorted[0].name;

    const otherLeagues = Object.keys(LEAGUE_CLUBS).filter(l => l !== domesticLeague);
    const clOpponents: string[] = [partnerTeam];
    otherLeagues.forEach(l => {
      const chosen = getTopTwoClubsForLeague(l, userTeamName);
      clOpponents.push(...chosen);
    });

    setChampionsLeagueOpponents(clOpponents);

    // 2. Set tournament type and reset state
    setTournamentType('champions');
    setFixtures([]);
    setStandings([]);
    setCurrentRoundIdx(0);
    
    if (keepSquad) {
      setScreen('league');
      setTimeout(() => {
        setAiClubs(clOpponents);

        const tempAiSquads: Record<string, Player[]> = {};
        const tempStandings: ClubStanding[] = [
          {
            name: userTeamName,
            played: 0,
            won: 0,
            drawn: 0,
            lost: 0,
            goalsFor: 0,
            goalsAgainst: 0,
            goalDifference: 0,
            points: 0,
            isUser: true
          }
        ];

        clOpponents.forEach(clubName => {
          const pList = playersData[clubName] || [];
          const top11 = [...pList]
            .sort((a, b) => normalizeRating(b.rat) - normalizeRating(a.rat))
            .slice(0, 11);
          tempAiSquads[clubName] = top11;
          
          tempStandings.push({
            name: clubName,
            played: 0,
            won: 0,
            drawn: 0,
            lost: 0,
            goalsFor: 0,
            goalsAgainst: 0,
            goalDifference: 0,
            points: 0,
            isUser: false
          });
        });

        setAiSquads(tempAiSquads);
        setStandings(tempStandings);

        const allTeams = [userTeamName, ...clOpponents];
        const generatedFixtures = generateLeagueFixtures(allTeams);
        setFixtures(generatedFixtures);
        setCurrentRoundIdx(0);
      }, 50);
    } else {
      setDraftSlots([]);
      setScreen('formation');
    }
  };

  const handleRestartDomesticLeague = (keepSquad: boolean) => {
    setTournamentType('domestic');
    setFixtures([]);
    setStandings([]);
    setCurrentRoundIdx(0);

    if (keepSquad) {
      setScreen('league');
      setTimeout(() => {
        const leagueOpponents = LEAGUE_CLUBS[domesticLeague] || PRESET_AI_CLUBS;
        const selectedAI = leagueOpponents.filter(c => c.toLowerCase() !== userTeamName.toLowerCase());
        setAiClubs(selectedAI);

        const tempAiSquads: Record<string, Player[]> = {};
        const tempStandings: ClubStanding[] = [
          {
            name: userTeamName,
            played: 0,
            won: 0,
            drawn: 0,
            lost: 0,
            goalsFor: 0,
            goalsAgainst: 0,
            goalDifference: 0,
            points: 0,
            isUser: true
          }
        ];

        selectedAI.forEach(clubName => {
          const pList = playersData[clubName] || [];
          const top11 = [...pList]
            .sort((a, b) => normalizeRating(b.rat) - normalizeRating(a.rat))
            .slice(0, 11);
          tempAiSquads[clubName] = top11;
          
          tempStandings.push({
            name: clubName,
            played: 0,
            won: 0,
            drawn: 0,
            lost: 0,
            goalsFor: 0,
            goalsAgainst: 0,
            goalDifference: 0,
            points: 0,
            isUser: false
          });
        });

        setAiSquads(tempAiSquads);
        setStandings(tempStandings);

        const allTeams = [userTeamName, ...selectedAI];
        const generatedFixtures = generateLeagueFixtures(allTeams);
        setFixtures(generatedFixtures);
        setCurrentRoundIdx(0);
      }, 50);
    } else {
      setDraftSlots([]);
      setScreen('formation');
    }
  };

  const handleResetGame = () => {
    setTournamentType('domestic');
    setScreen('welcome');
    setCurrentTab('landing');
    setDraftSlots([]);
    setSelectedFormationName("4-3-3");
    setActiveSlotId(null);
    setCurrentRoundIdx(0);
    setStandings([]);
    setFixtures([]);
    setAiSquads({});
  };

  // Active slot object helper
  const activeSlot = draftSlots.find(s => s.id === activeSlotId);

  // --- Render Functions ---

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 bg-zinc-950 font-sans p-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <Flame className="w-16 h-16 text-saweria animate-pulse duration-700" />
          <h1 className="text-2xl font-black text-white uppercase tracking-widest">
            WEBSCORE SIMULATOR
          </h1>
          <p className="text-zinc-500 text-sm animate-pulse">
            Sedang membaca database pemain lokal...
          </p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 bg-zinc-950 font-sans p-8">
        <div className="flex flex-col items-center gap-4 text-center max-w-md p-6 bg-zinc-900 border border-zinc-800 rounded-2xl">
          <ShieldAlert className="w-16 h-16 text-rose-500" />
          <h1 className="text-lg font-black text-white uppercase tracking-wider">
            Koneksi Database Gagal
          </h1>
          <p className="text-zinc-400 text-xs leading-relaxed">
            {loadError}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 py-2 px-5 bg-zinc-800 border border-zinc-700 rounded-lg text-white font-bold text-xs hover:bg-zinc-750 transition-colors"
          >
            Muat Ulang Halaman
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 bg-slate-50 text-slate-900 font-sans select-none min-h-screen">
      {/* Header bar */}
      <header className={`sticky top-0 w-full border-b backdrop-blur-md p-4 flex items-center justify-between z-30 px-6 sm:px-10 transition-all duration-300 shadow-sm ${
        tournamentType === 'champions' 
          ? "bg-gradient-to-r from-blue-900 to-blue-800 border-blue-900 text-white" 
          : "bg-white border-slate-200"
      }`}>
        <div className="flex items-center gap-2 cursor-pointer" onClick={handleRestart}>
          <Flame className={`w-6 h-6 ${tournamentType === 'champions' ? "text-yellow-300" : "text-emerald-500"}`} />
          <span className={`font-black tracking-widest text-sm sm:text-base uppercase ${tournamentType === 'champions' ? "text-white" : "text-slate-800"}`}>
            WEBSCORE
          </span>
        </div>
        <span className={`text-[10px] sm:text-xs font-bold uppercase tracking-widest border px-3 py-1 rounded-full ${
          tournamentType === 'champions' 
            ? "text-yellow-100 border-yellow-500/40 bg-yellow-500/20" 
            : "text-emerald-700 border-emerald-200 bg-emerald-50"
        }`}>
          {tournamentType === 'champions' ? "UEFA Champions League" : `${LEAGUE_NAMES[domesticLeague] || "Liga Domestik"}`}
        </span>
      </header>

      {/* Main Container - Full Page Layout */}
      <main className="flex-1 flex flex-col p-4 sm:p-6 lg:p-8 w-full max-w-none mx-auto justify-start">

        {currentTab === 'landing' ? (
          <div className="flex flex-col items-center justify-center flex-1 py-12 animate-fade-in w-full max-w-6xl mx-auto">
            <Flame className="w-24 h-24 text-emerald-500 mb-6 animate-bounce" />
            <h1 className="text-4xl sm:text-7xl font-black uppercase tracking-tight text-slate-800 leading-none text-center mb-4 drop-shadow-sm">
              WEBSCORE <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-teal-400">SIMULATOR</span>
            </h1>
            <p className="text-slate-500 text-sm sm:text-lg mb-12 text-center max-w-2xl font-medium">
              Selamat datang di game manajer sepakbola mini! Pilih mode untuk memulai petualangan membangun klub, atau eksplorasi database pemain dari seluruh dunia.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full px-4">
              <div 
                onClick={() => setCurrentTab('play')}
                className="bg-white border-2 border-slate-200 hover:border-emerald-400 p-10 rounded-[2rem] flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-300 hover:-translate-y-2 hover:shadow-xl hover:shadow-emerald-100 group"
              >
                <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mb-6 border-4 border-emerald-100 group-hover:bg-emerald-100 group-hover:scale-110 transition-transform">
                  <Play className="w-10 h-10 text-emerald-500 ml-1" />
                </div>
                <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-wider text-slate-800 mb-4">Mulai Bermain</h2>
                <p className="text-slate-500 text-sm sm:text-base leading-relaxed font-medium">
                  Bentuk skuad impian lewat gacha interaktif, susun formasi taktis, dan bertanding di liga seru menghadapi klub-klub AI terkuat di Eropa.
                </p>
              </div>

              <div 
                onClick={() => setCurrentTab('database')}
                className="bg-white border-2 border-slate-200 hover:border-blue-400 p-10 rounded-[2rem] flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-300 hover:-translate-y-2 hover:shadow-xl hover:shadow-blue-100 group"
              >
                <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mb-6 border-4 border-blue-100 group-hover:bg-blue-100 group-hover:scale-110 transition-transform">
                  <Search className="w-10 h-10 text-blue-500" />
                </div>
                <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-wider text-slate-800 mb-4">Database Pemain</h2>
                <p className="text-slate-500 text-sm sm:text-base leading-relaxed font-medium">
                  Cari pemain berdasarkan klub atau negara. Lihat statistik menyeluruh layaknya Football Manager dan pelajari kekuatan pemain favoritmu.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* TOP LEVEL TABS */}
            <div className="flex justify-center gap-4 mb-6">
              <button
                onClick={() => setCurrentTab('play')}
                className={`px-6 py-2.5 rounded-xl font-bold uppercase text-xs tracking-wider transition-all flex items-center gap-2 ${
                  currentTab === 'play'
                    ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/30"
                    : "bg-white border border-slate-200 text-slate-500 hover:text-emerald-600 hover:border-emerald-200"
                }`}
              >
                <Play className="w-4 h-4" />
                Play
              </button>
              <button
                onClick={() => setCurrentTab('database')}
                className={`px-6 py-2.5 rounded-xl font-bold uppercase text-xs tracking-wider transition-all flex items-center gap-2 ${
                  currentTab === 'database'
                    ? "bg-blue-500 text-white shadow-lg shadow-blue-500/30"
                    : "bg-white border border-slate-200 text-slate-500 hover:text-blue-600 hover:border-blue-200"
                }`}
              >
                <Search className="w-4 h-4" />
                Database Pemain
              </button>
            </div>

            {currentTab === 'database' ? (
              <PlayerDatabaseBrowser 
                playersData={playersData} 
                clubsList={clubsList}
                playersByNation={playersByNation}
                nationsList={nationsList} 
              />
            ) : (
              <>
                {/* SCREEN 1: WELCOME SCREEN */}
                {screen === 'welcome' && (
                  <div className="flex flex-col items-center text-center max-w-2xl mx-auto py-12 gap-8 animate-fade-in">
                    {/* Theme Accent Badge */}
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-100 border border-emerald-200 rounded-full text-xs font-bold text-emerald-600 uppercase tracking-wider">
                      <Sparkles className="w-3.5 h-3.5" />
                      Soccer Simulation Game
                    </div>

                    {/* Title */}
                    <div className="flex flex-col gap-2">
                      <h1 className="text-4xl sm:text-6xl font-black uppercase tracking-tight text-slate-800 leading-none">
                        BUILD YOUR <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-teal-400">DREAM SQUAD</span>
                      </h1>
                      <p className="text-slate-500 text-sm sm:text-base leading-relaxed max-w-md mx-auto mt-2 font-medium">
                Pilih formasi taktis, rekrut 11 pemain bintang, simulasikan jalannya pertandingan secara langsung, dan menangkan klasemen liga!
              </p>
            </div>

            {/* Action buttons / UI Input */}
            <div className="flex flex-col items-center gap-6 w-full max-w-md mt-2">
              <div className="w-full flex flex-col gap-2">
                <label className="text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Nama Klub Anda
                </label>
                <input
                  type="text"
                  value={userTeamName}
                  onChange={(e) => setUserTeamName(e.target.value || "User FC")}
                  maxLength={15}
                  placeholder="Ketik nama klub... (default: User FC)"
                  className="w-full bg-white border-2 border-slate-200 text-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-50 transition-all font-bold shadow-sm"
                />
              </div>

              {/* League Selector Grid */}
              <div className="w-full flex flex-col gap-2">
                <label className="text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Pilih Liga Kompetisi Domestik
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 w-full">
                  {[
                    { id: "EPL", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", name: "Premier League", count: "12 Klub" },
                    { id: "LaLiga", flag: "🇪🇸", name: "La Liga", count: "8 Klub" },
                    { id: "SerieA", flag: "🇮🇹", name: "Serie A", count: "10 Klub" },
                    { id: "Bundesliga", flag: "🇩🇪", name: "Bundesliga", count: "9 Klub" },
                    { id: "Ligue1", flag: "🇫🇷", name: "Ligue 1", count: "9 Klub" },
                    { id: "PrimeiraLiga", flag: "🇵🇹", name: "Primeira Liga", count: "3 Klub" }
                  ].map((lg) => {
                    const isSelected = domesticLeague === lg.id;
                    return (
                      <button
                        key={lg.id}
                        onClick={() => setDomesticLeague(lg.id)}
                        type="button"
                        className={`p-3 rounded-2xl border-2 text-left transition-all cursor-pointer flex flex-col justify-between h-20 hover:-translate-y-1 ${
                          isSelected
                            ? "bg-emerald-50 border-emerald-400 text-slate-900 shadow-md shadow-emerald-100"
                            : "bg-white border-slate-200 text-slate-500 hover:border-emerald-300 hover:text-emerald-600 shadow-sm"
                        }`}
                      >
                        <div className="flex justify-between items-center w-full">
                          <span className="text-lg leading-none">{lg.flag}</span>
                          <span className={`text-[8px] font-bold uppercase tracking-widest px-2 py-0.5 rounded leading-none ${
                            isSelected ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-500"
                          }`}>
                            {lg.id}
                          </span>
                        </div>
                        <div className="flex flex-col mt-1 min-w-0">
                          <span className="text-xs font-black truncate">{lg.name}</span>
                          <span className="text-[9px] font-semibold opacity-70">{lg.count}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                onClick={handleStartGame}
                className="w-full py-3.5 bg-emerald-500 text-white font-black uppercase text-sm rounded-xl hover:bg-emerald-400 hover:-translate-y-1 active:translate-y-0 transition-all shadow-lg shadow-emerald-200 flex items-center justify-center gap-2 mt-4"
              >
                <Play className="w-5 h-5 fill-white" />
                Mulai Game
              </button>
            </div>

            {/* Quick guide cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full mt-8 text-left">
              <div className="p-5 bg-white border-2 border-slate-100 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
                <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center mb-3">
                  <Star className="w-5 h-5 text-amber-500" />
                </div>
                <h4 className="text-sm font-black uppercase text-slate-800 tracking-wider">1. Pilih Taktik</h4>
                <p className="text-slate-500 text-xs leading-relaxed mt-2 font-medium">
                  Tentukan formasi favorit Anda seperti 4-3-3, 4-4-2, atau 3-5-2 untuk memulai.
                </p>
              </div>
              <div className="p-5 bg-white border-2 border-slate-100 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center mb-3">
                  <User className="w-5 h-5 text-blue-500" />
                </div>
                <h4 className="text-sm font-black uppercase text-slate-800 tracking-wider">2. Draft Pemain</h4>
                <p className="text-slate-500 text-xs leading-relaxed mt-2 font-medium">
                  Gunakan Gacha Klub acak atau saring posisi secara manual untuk mengisi slot formasi.
                </p>
              </div>
              <div className="p-5 bg-white border-2 border-slate-100 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
                <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center mb-3">
                  <Trophy className="w-5 h-5 text-purple-500" />
                </div>
                <h4 className="text-sm font-black uppercase text-slate-800 tracking-wider">3. Puncaki Liga</h4>
                <p className="text-slate-500 text-xs leading-relaxed mt-2 font-medium">
                  Simulasikan 10 pertandingan secara interaktif dan bersaing dengan klub-klub top.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* SCREEN 2: STRATEGY / FORMATION SELECT */}
        {screen === 'formation' && (
          <div className="flex flex-col items-center py-6 gap-6 animate-fade-in max-w-4xl mx-auto w-full">
            <div className="text-center">
              <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-wider text-slate-800">
                PILIH FORMASI & STRATEGI
              </h2>
              <p className="text-slate-500 font-medium text-xs sm:text-sm mt-2">
                Formasi akan menentukan jumlah slot posisi yang harus Anda isi dalam squad draft.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5 w-full mt-4 justify-center">
              {Object.keys(FORMATIONS).map(name => {
                const form = FORMATIONS[name];
                
                // Count position breakdown (e.g. GK, DEF, MID, ATT)
                const defCount = form.slots.filter(s => ["DC", "DR", "DL", "WBL", "WBR"].includes(s.position)).length;
                const midCount = form.slots.filter(s => ["MC", "DM", "AMC", "ML", "MR"].includes(s.position)).length;
                const attCount = form.slots.filter(s => ["ST", "AMR", "AML", "CF"].includes(s.position)).length;

                return (
                  <button
                    key={name}
                    onClick={() => handleSelectFormation(name)}
                    className="bg-white border-2 border-slate-200 hover:border-emerald-400 rounded-2xl p-6 text-left transition-all duration-300 group focus:outline-none flex flex-col gap-5 shadow-sm hover:shadow-lg hover:shadow-emerald-100 hover:-translate-y-1"
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-lg font-black tracking-wider text-slate-800 group-hover:text-emerald-500">
                        Taktik {name}
                      </span>
                      <ChevronRight className="w-6 h-6 text-slate-400 group-hover:text-emerald-500 group-hover:translate-x-1 transition-transform" />
                    </div>

                    <div className="flex gap-4 text-xs font-semibold text-slate-600 w-full justify-between bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <div className="flex flex-col text-center w-full">
                        <span className="text-[9px] uppercase text-slate-400 font-bold mb-1">Defenders</span>
                        <span className="text-emerald-600 font-black text-sm">{defCount}</span>
                      </div>
                      <div className="border-l border-slate-200 shrink-0" />
                      <div className="flex flex-col text-center w-full">
                        <span className="text-[9px] uppercase text-slate-400 font-bold mb-1">Midfielders</span>
                        <span className="text-blue-500 font-black text-sm">{midCount}</span>
                      </div>
                      <div className="border-l border-slate-200 shrink-0" />
                      <div className="flex flex-col text-center w-full">
                        <span className="text-[9px] uppercase text-slate-400 font-bold mb-1">Attackers</span>
                        <span className="text-rose-500 font-black text-sm">{attCount}</span>
                      </div>
                    </div>

                    {/* Small tactical text map */}
                    <div className="text-[10px] text-slate-500 font-bold bg-slate-100 border border-slate-200 p-2.5 rounded-lg truncate w-full text-center tracking-widest">
                      {form.slots.map(s => s.position).join(" • ")}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* SCREEN 3: DRAFTING SQUAD */}
        {screen === 'draft' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 py-4 animate-fade-in w-full">
            
            {/* Left Column: visual interactive pitch */}
            <div className="lg:col-span-7 flex flex-col items-center justify-center">
              <div className="w-full max-w-[320px] sm:max-w-[400px] lg:max-w-[450px] mx-auto">
                <FootballPitch
                  draftSlots={draftSlots}
                  onSlotClick={handleSlotClick}
                  activeSlotId={activeSlotId}
                />
              </div>
            </div>

            {/* Right Column: statistics & control panel */}
            <div className="lg:col-span-5 flex flex-col gap-6">
              
              {/* Squad Rating Dashboard */}
              <div className="bg-white border-2 border-slate-200 shadow-sm rounded-2xl p-6 flex flex-col gap-5">
                <h3 className="font-bold text-slate-500 text-xs sm:text-sm uppercase tracking-wider">
                  Statistik Skuad Saya
                </h3>

                <div className="flex items-center justify-between gap-4">
                  {/* Average Rating Circle */}
                  <div className="flex items-center gap-3">
                    <div className="w-16 h-16 rounded-2xl bg-emerald-50 border-2 border-emerald-100 flex flex-col items-center justify-center shrink-0">
                      <span className="text-2xl font-black text-emerald-600 leading-none font-mono">
                        {userSquadRating}
                      </span>
                      <span className="text-[8px] font-bold uppercase text-emerald-500 mt-1">OVR RAT</span>
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-800 tracking-wide truncate max-w-[150px]">
                        {userTeamName}
                      </h4>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] font-bold text-slate-500 uppercase">
                          Formasi: {selectedFormationName}
                        </span>
                        <span className="text-slate-300">•</span>
                        <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded uppercase">
                          {totalDraftedCount} / 11 Pemain
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Stars indicators */}
                  <div className="flex flex-col items-end">
                    <div className="flex gap-0.5 text-yellow-400">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={`w-4 h-4 ${i < starRating ? "fill-yellow-400" : "text-slate-200"}`}
                        />
                      ))}
                    </div>
                    <span className="text-[9px] font-black uppercase text-slate-400 mt-1.5">
                      TIER: {starRating === 5 ? "SUPERIOR" : starRating === 4 ? "ELITE" : starRating === 3 ? "MEDIUM" : "UNDERDOG"}
                    </span>
                  </div>
                </div>

                {/* Confirm Squad Button */}
                <button
                  disabled={totalDraftedCount < 11}
                  onClick={handleGenerateLeague}
                  className="w-full py-3.5 bg-emerald-500 text-white font-extrabold uppercase text-xs sm:text-sm rounded-xl hover:bg-emerald-400 active:translate-y-0 hover:-translate-y-1 disabled:bg-slate-100 disabled:border disabled:border-slate-200 disabled:text-slate-400 disabled:scale-100 transition-all duration-200 shadow-lg shadow-emerald-200 mt-2 flex items-center justify-center gap-2"
                >
                  <Trophy className="w-5 h-5 fill-white" />
                  Kunci Skuad & Generate Liga
                </button>
              </div>

              {/* Slot list selection panel */}
              <div className="bg-white border-2 border-slate-200 shadow-sm rounded-2xl flex flex-col flex-1 min-h-[300px] overflow-hidden">
                <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Daftar Slot Formasi
                  </span>
                  <button
                    onClick={handleRestart}
                    className="text-[10px] font-bold text-slate-400 hover:text-emerald-500 transition-colors flex items-center gap-1 uppercase"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Ganti Formasi
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto max-h-[350px] p-4 space-y-2.5 divide-y divide-slate-100">
                  {draftSlots.map((slot) => {
                    const hasPlayer = slot.player !== null;
                    return (
                      <div 
                        key={slot.id}
                        className={`flex items-center justify-between gap-4 pt-2.5 first:pt-0 ${
                          activeSlotId === slot.id ? "bg-slate-50 p-2 rounded-lg border border-slate-200" : ""
                        }`}
                      >
                        {/* Slot Position Title */}
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black uppercase tracking-wider shrink-0 ${
                            hasPlayer 
                              ? "bg-emerald-50 text-emerald-600 border border-emerald-200" 
                              : "bg-slate-100 text-slate-400 border border-slate-200"
                          }`}>
                            {slot.position}
                          </div>

                          <div className="min-w-0 flex flex-col">
                            {hasPlayer ? (
                              <>
                                <span className="text-xs font-bold text-slate-800 truncate max-w-[120px] sm:max-w-[180px]">
                                  {slot.player?.name}
                                </span>
                                <span className="text-[10px] text-slate-500 font-medium truncate mt-0.5">
                                  {slot.player?.nationality} • OVR {normalizeRating(slot.player!.rat)}
                                </span>
                              </>
                            ) : (
                              <span className="text-xs text-slate-400 italic">
                                Belum dipilih
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Select/Modify buttons */}
                        <div className="shrink-0">
                          {hasPlayer ? (
                            <button
                              onClick={() => handleSlotClick(slot.id)}
                              className="text-[10px] font-bold text-slate-500 hover:text-blue-500 border border-slate-200 bg-white hover:bg-slate-50 px-3 py-1.5 rounded-lg transition-all shadow-sm"
                            >
                              Ganti
                            </button>
                          ) : (
                            <button
                              onClick={() => handleSlotClick(slot.id)}
                              className="text-[10px] font-bold text-white bg-emerald-500 hover:bg-emerald-400 px-3 py-1.5 rounded-lg transition-all shadow-sm"
                            >
                              Draft
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>

            {/* Draft Selection Modal wrapper */}
            <DraftSelectionModal
              isOpen={activeSlotId !== null}
              onClose={() => setActiveSlotId(null)}
              slotPosition={activeSlot?.position || ""}
              choices={activeSlot?.choices || []}
              gachaCount={activeSlot?.gachaCount || 0}
              onReroll={() => activeSlotId !== null && handleReroll(activeSlotId)}
              onDraftPlayer={handleDraftPlayer}
            />

          </div>
        )}

        {/* SCREEN 4: LEAGUE COMPETITION DASHBOARD */}
        {screen === 'league' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 py-4 animate-fade-in w-full items-start">
            
            {/* Standings Table Column */}
            <div className="lg:col-span-7 w-full">
              <LeagueTable
                standings={standings}
                currentRound={currentRoundIdx}
                totalRounds={fixtures.length}
                isChampionsLeague={tournamentType === 'champions'}
              />
            </div>

            {/* Fixture Matchday Column */}
            <div className="lg:col-span-5 flex flex-col gap-6">
              
              {/* User Matchday Match Fixture Card */}
              {userFixtureInCurrentRound ? (
                <div className="bg-white border-2 border-slate-200 shadow-sm rounded-2xl p-6 flex flex-col gap-4 relative overflow-hidden">
                  
                  {/* Background glowing glow */}
                  <div className="absolute -top-12 -right-12 w-32 h-32 bg-emerald-100 rounded-full blur-2xl pointer-events-none" />

                  {/* Header info */}
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-emerald-500" />
                      Pekan Kompetisi {currentRoundIdx + 1} / {fixtures.length}
                    </span>
                    <span className="text-[10px] text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded font-black">
                      NEXT MATCH
                    </span>
                  </div>

                  {/* Team vs Team Layout */}
                  <div className="flex items-center justify-between border-y border-slate-100 py-4 mt-1 font-sans">
                    <div className="flex flex-col items-center flex-1 min-w-0">
                      <span className="text-slate-800 text-xs sm:text-sm font-bold truncate max-w-full">
                        {userFixtureInCurrentRound.home}
                      </span>
                      <span className="text-[10px] text-slate-500 font-bold mt-1 uppercase">
                        {userFixtureInCurrentRound.home === userTeamName 
                          ? `OVR ${userSquadRating}` 
                          : `OVR ${calculateSquadRating(aiSquads[userFixtureInCurrentRound.home] || [])}`
                        }
                      </span>
                    </div>

                    <div className="px-4 text-center shrink-0">
                      <span className="text-xs font-black bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-lg text-slate-500">
                        VS
                      </span>
                    </div>

                    <div className="flex flex-col items-center flex-1 min-w-0">
                      <span className="text-slate-800 text-xs sm:text-sm font-bold truncate max-w-full">
                        {userFixtureInCurrentRound.away}
                      </span>
                      <span className="text-[10px] text-slate-500 font-bold mt-1 uppercase">
                        {userFixtureInCurrentRound.away === userTeamName 
                          ? `OVR ${userSquadRating}` 
                          : `OVR ${calculateSquadRating(aiSquads[userFixtureInCurrentRound.away] || [])}`
                        }
                      </span>
                    </div>
                  </div>

                  {/* Simulation launcher */}
                  <div className="flex flex-col gap-3 mt-2">
                    <button
                      onClick={handleSkipSeason}
                      disabled={isSimulatingSeason}
                      className="w-full py-3.5 bg-emerald-500 disabled:bg-slate-100 disabled:text-slate-400 disabled:border disabled:border-slate-200 disabled:cursor-not-allowed text-white font-black uppercase text-xs sm:text-sm rounded-xl hover:bg-emerald-400 active:translate-y-0 hover:-translate-y-1 transition-all shadow-lg shadow-emerald-200 flex items-center justify-center gap-2"
                    >
                      <Play className="w-4 h-4 fill-white" />
                      {isSimulatingSeason ? "Simulasi Sedang Berjalan..." : "Simulasikan 1 Musim"}
                    </button>
                  </div>

                </div>
              ) : (
                // User has BYE in this round (since odd number of teams)
                <div className="bg-white border-2 border-slate-200 shadow-sm rounded-2xl p-6 flex flex-col gap-4 relative overflow-hidden">
                  
                  {/* Background glowing glow */}
                  <div className="absolute -top-12 -right-12 w-32 h-32 bg-slate-100 rounded-full blur-2xl pointer-events-none" />

                  {/* Header info */}
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-slate-400" />
                      Pekan Kompetisi {currentRoundIdx + 1} / {fixtures.length}
                    </span>
                    <span className="text-[10px] text-slate-500 bg-slate-50 border border-slate-100 px-2 py-0.5 rounded font-black">
                      BYE WEEK
                    </span>
                  </div>

                  <div className="flex flex-col text-center items-center justify-center border-y border-slate-100 py-4 mt-1 font-sans">
                    <ShieldAlert className="w-8 h-8 text-slate-300 animate-bounce mb-1" />
                    <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
                      Pekan Istirahat (BYE)
                    </h4>
                    <p className="text-slate-500 font-medium text-[11px] leading-relaxed max-w-xs mt-1">
                      Tim Anda tidak memiliki pertandingan pada pekan ini.
                    </p>
                  </div>

                  {/* Simulation launcher */}
                  <div className="flex flex-col gap-3 mt-2">
                    <button
                      onClick={handleSkipSeason}
                      disabled={isSimulatingSeason}
                      className="w-full py-3.5 bg-emerald-500 disabled:bg-slate-100 disabled:text-slate-400 disabled:border disabled:border-slate-200 disabled:cursor-not-allowed text-white font-black uppercase text-xs sm:text-sm rounded-xl hover:bg-emerald-400 active:translate-y-0 hover:-translate-y-1 transition-all shadow-lg shadow-emerald-200 flex items-center justify-center gap-2"
                    >
                      <Play className="w-4 h-4 fill-white" />
                      {isSimulatingSeason ? "Simulasi Sedang Berjalan..." : "Simulasikan 1 Musim"}
                    </button>
                  </div>
                </div>
              )}

              {/* Show other round fixtures in a list */}
              <div className="bg-white border-2 border-slate-200 shadow-sm rounded-2xl overflow-hidden">
                <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                  <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Jadwal Pertandingan Lain Pekan Ini
                  </span>
                </div>

                <div className="p-4 space-y-3 divide-y divide-slate-100 max-h-[200px] overflow-y-auto">
                  {fixtures[currentRoundIdx]?.map((fix, idx) => {
                    if (fix.home === userTeamName || fix.away === userTeamName) return null; // Skip user match
                    
                    return (
                      <div key={idx} className="flex justify-between items-center text-xs pt-3 first:pt-0">
                        <span className="truncate max-w-[120px] font-semibold text-slate-600 text-left w-1/3">
                          {fix.home}
                        </span>
                        <div className="text-center w-1/3 shrink-0">
                          {fix.simulated ? (
                            <span className="bg-slate-100 border border-slate-200 px-2 py-0.5 rounded font-bold text-slate-700 font-mono">
                              {fix.homeScore} - {fix.awayScore}
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-slate-400 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded">
                              TBD
                            </span>
                          )}
                        </div>
                        <span className="truncate max-w-[120px] font-semibold text-slate-600 text-right w-1/3">
                          {fix.away}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Action: Next Round after simulation */}
              {fixtures[currentRoundIdx]?.every(f => f.simulated) && !isSimulatingSeason && (
                <button
                  onClick={handleNextRound}
                  className="w-full py-3.5 bg-blue-500 hover:bg-blue-600 text-white font-extrabold uppercase text-xs rounded-xl active:scale-95 transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-blue-200"
                >
                  Lanjutkan ke Pekan Berikutnya
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}

            </div>

            {/* ROADMAP TIMELINE */}
            <div className="col-span-1 lg:col-span-12 mt-6 bg-white border-2 border-slate-200 shadow-sm rounded-2xl p-6 relative overflow-hidden">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider">
                    Roadmap Kompetisi Musim Ini
                  </h3>
                  <p className="text-[10px] sm:text-xs font-medium text-slate-500 mt-1">
                    Jalur perjalanan {userTeamName} dari pekan pertama hingga kualifikasi kompetisi Eropa
                  </p>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg text-[10px] text-emerald-600 font-black tracking-wider uppercase">
                  <Star className="w-3.5 h-3.5 fill-emerald-500 text-emerald-500" />
                  Pekan {currentRoundIdx + 1} Aktif
                </div>
              </div>
              
              <div className="flex gap-4 overflow-x-auto pb-4 pt-1 scrollbar-thin select-none">
                {fixtures.map((round, rIdx) => {
                  const userFix = round.find(f => f.home === userTeamName || f.away === userTeamName) || null;
                  if (!userFix) {
                    return (
                      <div key={rIdx} className="flex-shrink-0 w-40 bg-slate-50 border-2 border-dashed border-slate-200 p-4 rounded-2xl flex flex-col justify-between">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Pekan {rIdx + 1}</span>
                        <span className="text-sm font-black text-slate-600 mt-3">Istirahat (BYE)</span>
                        <span className="text-[9px] font-semibold text-slate-400 mt-1.5 italic">Tidak ada laga</span>
                      </div>
                    );
                  }
                  
                  const isUserHome = userFix.home === userTeamName;
                  const oppName = isUserHome ? userFix.away : userFix.home;
                  const isCompleted = userFix.simulated;
                  const isActive = rIdx === currentRoundIdx;
                  
                  let nodeBg = "bg-white border-slate-200 text-slate-500 shadow-sm opacity-60";
                  let scoreText = "Belum Main";
                  let statusBadge = null;
                  
                  if (isCompleted) {
                    const uScore = isUserHome ? (userFix.homeScore ?? 0) : (userFix.awayScore ?? 0);
                    const oScore = isUserHome ? (userFix.awayScore ?? 0) : (userFix.homeScore ?? 0);
                    
                    scoreText = `${uScore} - ${oScore}`;
                    if (uScore > oScore) {
                      nodeBg = "bg-emerald-50 border-emerald-200 text-emerald-700 shadow-sm opacity-100";
                      statusBadge = <span className="text-[8px] font-black bg-emerald-500 text-white px-2 py-0.5 rounded-md uppercase tracking-wider">MENANG</span>;
                    } else if (uScore === oScore) {
                      nodeBg = "bg-yellow-50 border-yellow-200 text-yellow-700 shadow-sm opacity-100";
                      statusBadge = <span className="text-[8px] font-black bg-yellow-400 text-yellow-900 px-2 py-0.5 rounded-md uppercase tracking-wider">SERI</span>;
                    } else {
                      nodeBg = "bg-rose-50 border-rose-200 text-rose-700 shadow-sm opacity-100";
                      statusBadge = <span className="text-[8px] font-black bg-rose-500 text-white px-2 py-0.5 rounded-md uppercase tracking-wider">KALAH</span>;
                    }
                  } else if (isActive) {
                    nodeBg = "bg-white border-emerald-400 shadow-md shadow-emerald-100 text-slate-800 scale-105 transform z-10 opacity-100";
                    scoreText = "VS";
                  }
                  
                  return (
                    <div 
                      key={rIdx} 
                      className={`flex-shrink-0 w-40 border-2 p-4 rounded-2xl flex flex-col justify-between transition-all duration-300 relative ${nodeBg}`}
                    >
                      <div className="flex justify-between items-center w-full">
                        <span className="text-[10px] font-black uppercase tracking-wider">
                          Pekan {rIdx + 1}
                        </span>
                        {statusBadge}
                      </div>
                      
                      <div className="mt-4 flex flex-col">
                        <span className="text-[11px] text-slate-500 font-bold uppercase truncate max-w-full">
                          vs {oppName}
                        </span>
                        <span className="text-sm font-black mt-1 font-mono tracking-tight">
                          {scoreText}
                        </span>
                      </div>
                    </div>
                  );
                })}
                
                {/* FINAL GATE: Champions League / Europa League Gate */}
                <div 
                  className={`flex-shrink-0 w-48 border-2 p-4 rounded-2xl flex flex-col justify-between transition-all duration-350 relative overflow-hidden ${
                    currentRoundIdx >= fixtures.length - 1 && fixtures.every(r => r.every(f => f.simulated))
                      ? "bg-yellow-50 border-yellow-400 text-yellow-600 shadow-md shadow-yellow-100 animate-pulse" 
                      : "bg-white border-slate-200 border-dashed text-slate-400 opacity-60"
                  }`}
                >
                  <div className="flex justify-between items-center w-full">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-700">
                      Kompetisi Eropa
                    </span>
                    <Trophy className="w-4 h-4 text-yellow-500" />
                  </div>
                  
                  <div className="mt-4 flex flex-col">
                    <span className="text-[11px] font-bold uppercase truncate text-slate-400">
                      Kelolosan Skuad
                    </span>
                    <div className="flex items-center gap-1 mt-1.5">
                      {currentRoundIdx >= fixtures.length - 1 && fixtures.every(r => r.every(f => f.simulated)) ? (
                        <span className="text-xs font-black uppercase tracking-wide text-yellow-600">
                          DITENTUKAN!
                        </span>
                      ) : (
                        <>
                          <Lock className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="text-xs font-black uppercase tracking-wide text-slate-400">
                            TERKUNCI
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* SCREEN 5: LIVE MATCH SIMULATION */}
        {screen === 'match' && activeMatch && (
          <div className="py-4 animate-fade-in w-full">
            <MatchCenter
              homeName={activeMatch.home}
              awayName={activeMatch.away}
              simulatedMatch={fixtures[currentRoundIdx].find(f => f.id === activeMatch.fixtureId)!}
              onMatchFinished={handleMatchFinished}
            />
          </div>
        )}

        {/* SCREEN 6: END OF TOURNAMENT SCREEN */}
        {screen === 'end' && (
          <div className="flex flex-col items-center justify-center max-w-5xl mx-auto py-8 gap-8 animate-fade-in w-full">
            {/* Find user position */}
            {(() => {
              const sorted = [...standings].sort((a, b) => {
                if (b.points !== a.points) return b.points - a.points;
                if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
                if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
                return a.name.localeCompare(b.name);
              });
              const userIdx = sorted.findIndex(t => t.isUser);
              const userPos = userIdx + 1;
              const userStanding = sorted[userIdx];
              
              const isUserChampion = userPos === 1;
              const isUserQualifiedCL = userPos <= 2; // Rank 1 and 2 qualify for CL

              return (
                <>
                  {/* Hologram Banner */}
                  {tournamentType === 'champions' ? (
                    isUserChampion ? (
                      <div className="w-full max-w-2xl bg-white border-4 border-yellow-400 p-10 rounded-[2rem] relative overflow-hidden animate-holo-cl animate-scale-up shadow-[0_20px_60px_rgba(250,204,21,0.2)] text-center">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-yellow-100 rounded-full blur-3xl pointer-events-none" />
                        <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-50 rounded-full blur-3xl pointer-events-none" />
                        
                        <Trophy className="w-24 h-24 text-yellow-400 mx-auto animate-bounce mb-6 drop-shadow-md" />
                        <h2 className="text-3xl sm:text-5xl font-black uppercase tracking-tight text-slate-800 leading-none">
                          JUARA CHAMPIONS LEAGUE!
                        </h2>
                        <p className="text-sm text-yellow-600 font-extrabold uppercase tracking-widest mt-3 font-mono">
                          THE CHAMPIONS OF EUROPE
                        </p>
                        <p className="text-slate-500 text-sm sm:text-base mt-6 max-w-lg mx-auto leading-relaxed font-medium">
                          Luar biasa! <b>{userTeamName}</b> berhasil mengalahkan raksasa-raksasa Eropa dan menjuarai UEFA Champions League! Anda adalah Raja Eropa yang sesungguhnya!
                        </p>
                      </div>
                    ) : (
                      <div className="w-full max-w-2xl bg-white border-2 border-slate-200 p-10 rounded-[2rem] relative overflow-hidden animate-scale-up text-center shadow-lg">
                        <ShieldAlert className="w-20 h-20 text-slate-300 mx-auto mb-6 animate-pulse" />
                        <h2 className="text-3xl font-black uppercase tracking-tight text-slate-700 leading-none">
                          KAMPANYE EROPA SELESAI
                        </h2>
                        <p className="text-sm text-slate-500 font-extrabold uppercase tracking-widest mt-3 font-mono">
                          Tim Anda Finis Peringkat Ke-{userPos}
                        </p>
                        <p className="text-slate-500 text-sm sm:text-base mt-6 max-w-lg mx-auto leading-relaxed font-medium">
                          Tim Anda menyelesaikan turnamen UEFA Champions League di peringkat ke-<b>{userPos}</b>. Kancah Eropa sangat ketat, ayo persiapkan taktik yang lebih matang musim depan!
                        </p>
                      </div>
                    )
                  ) : (
                    // Domestic League Banners
                    isUserChampion ? (
                      <div className="w-full max-w-2xl bg-gradient-to-br from-emerald-50 to-teal-50 border-4 border-emerald-400 p-10 rounded-[2rem] relative overflow-hidden animate-scale-up shadow-xl text-center">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-200/50 rounded-full blur-3xl pointer-events-none" />
                        <Trophy className="w-24 h-24 text-emerald-500 mx-auto animate-bounce mb-6 drop-shadow-md" />
                        <h2 className="text-3xl sm:text-5xl font-black uppercase tracking-tight text-slate-800 leading-none">
                          TIM ANDA JUARA LIGA!
                        </h2>
                        <p className="text-sm text-emerald-600 font-extrabold uppercase tracking-widest mt-3 font-mono">
                          Domestic League Champion • Lolos Liga Champions
                        </p>
                        <p className="text-slate-600 text-sm sm:text-base mt-6 max-w-lg mx-auto leading-relaxed font-medium">
                          Selamat atas pencapaian gemilang ini! <b>{userTeamName}</b> berhasil merajai klasemen liga domestik dan lolos otomatis ke UEFA Champions League musim depan!
                        </p>
                      </div>
                    ) : isUserQualifiedCL ? (
                      <div className="w-full max-w-2xl bg-gradient-to-br from-blue-50 to-sky-50 border-4 border-blue-400 p-10 rounded-[2rem] relative overflow-hidden animate-holo-cl animate-scale-up shadow-xl text-center">
                        <Trophy className="w-20 h-20 text-blue-500 mx-auto mb-6 animate-pulse drop-shadow-md" />
                        <h2 className="text-3xl sm:text-4xl font-black uppercase tracking-tight text-slate-800 leading-none">
                          LOLOS LIGA CHAMPIONS!
                        </h2>
                        <p className="text-sm text-blue-600 font-extrabold uppercase tracking-widest mt-3 font-mono">
                          Runner-Up Liga • Lolos Liga Champions
                        </p>
                        <p className="text-slate-600 text-sm sm:text-base mt-6 max-w-lg mx-auto leading-relaxed font-medium">
                          Kerja keras terbayar! <b>{userTeamName}</b> finis di peringkat ke-<b>2</b> klasemen akhir liga domestik dan berhak melaju ke UEFA Champions League musim depan!
                        </p>
                      </div>
                    ) : userPos <= 4 ? (
                      <div className="w-full max-w-2xl bg-white border-2 border-slate-200 p-10 rounded-[2rem] relative overflow-hidden animate-scale-up text-center shadow-lg">
                        <Star className="w-20 h-20 text-sky-400 mx-auto mb-6 animate-pulse" />
                        <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-slate-800 leading-none">
                          LOLOS PIALA EROPA (UEL)
                        </h2>
                        <p className="text-sm text-sky-500 font-extrabold uppercase tracking-widest mt-3 font-mono">
                          Europa League Qualification (Peringkat {userPos})
                        </p>
                        <p className="text-slate-600 text-sm sm:text-base mt-6 max-w-lg mx-auto leading-relaxed font-medium">
                          Tim Anda finis di peringkat ke-<b>{userPos}</b>. Meskipun tidak lolos ke Champions League (hanya peringkat 1-2), Anda berhasil mengamankan tiket kualifikasi UEFA Europa League!
                        </p>
                      </div>
                    ) : (
                      <div className="w-full max-w-2xl bg-white border-2 border-slate-200 p-10 rounded-[2rem] relative overflow-hidden animate-scale-up text-center shadow-lg">
                        <ShieldAlert className="w-20 h-20 text-slate-300 mx-auto mb-6" />
                        <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-slate-700 leading-none">
                          TETAP DI LIGA DOMESTIK
                        </h2>
                        <p className="text-sm text-slate-500 font-extrabold uppercase tracking-widest mt-3 font-mono">
                          Tidak Lolos Kualifikasi Eropa (Peringkat {userPos})
                        </p>
                        <p className="text-slate-500 text-sm sm:text-base mt-6 max-w-lg mx-auto leading-relaxed font-medium">
                          Musim berakhir kurang memuaskan karena tim finis di peringkat ke-<b>{userPos}</b>. Anda harus merombak taktik dan melakukan gacha baru musim depan!
                        </p>
                      </div>
                    )
                  )}

                  {/* Summary grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full mt-4 items-start">
                    
                    {/* Final Standings Column */}
                    <div className="flex flex-col gap-3">
                      <h3 className="font-bold text-slate-600 text-xs uppercase tracking-wider text-left flex items-center gap-1.5">
                        <Trophy className="w-4 h-4 text-yellow-500" />
                        Klasemen Akhir Turnamen
                      </h3>
                      <div className={`w-full border-2 rounded-2xl overflow-hidden ${
                        tournamentType === 'champions' ? "border-blue-200" : "border-slate-200"
                      }`}>
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className={`border-b text-slate-500 font-bold uppercase tracking-wider text-[10px] ${
                              tournamentType === 'champions' ? "bg-blue-50 border-blue-200" : "bg-slate-50 border-slate-200"
                            }`}>
                              <th className="py-3 px-4 text-center w-8">#</th>
                              <th className="py-3 px-4">Klub</th>
                              <th className="py-3 px-2 text-center">P</th>
                              <th className="py-3 px-2 text-center">GD</th>
                              <th className="py-3 px-4 text-center">PTS</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 bg-white">
                            {sorted.map((team, idx) => {
                              const pos = idx + 1;
                              let rowBg = "";
                              let posColor = "text-slate-400";
                              
                              if (team.isUser) {
                                rowBg = "bg-emerald-50 font-bold text-emerald-800";
                                posColor = "text-emerald-600";
                              } else {
                                if (tournamentType === 'champions') {
                                  if (pos === 1) posColor = "text-yellow-500 font-black";
                                  else if (pos <= 4) posColor = "text-blue-500 font-bold";
                                } else {
                                  if (pos <= 2) posColor = "text-yellow-500 font-black";
                                  else if (pos <= 4) posColor = "text-sky-500 font-bold";
                                }
                              }
                              
                              return (
                                <tr key={team.name} className={`${rowBg} hover:bg-slate-50 transition-colors`}>
                                  <td className={`py-3 px-4 text-center font-bold ${posColor}`}>{pos}</td>
                                  <td className={`py-3 px-4 truncate max-w-[140px] font-semibold ${team.isUser ? 'text-emerald-800' : 'text-slate-700'}`}>{team.name}</td>
                                  <td className="py-3 px-2 text-center text-slate-500">{team.played}</td>
                                  <td className={`py-3 px-2 text-center font-bold ${team.goalDifference > 0 ? "text-emerald-500" : team.goalDifference < 0 ? "text-rose-500" : "text-slate-400"}`}>
                                    {team.goalDifference > 0 ? `+${team.goalDifference}` : team.goalDifference}
                                  </td>
                                  <td className="py-3 px-4 text-center font-black text-slate-800">{team.points}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      
                      {/* Qualification Legend */}
                      <div className="flex flex-wrap gap-3 text-[9px] text-zinc-500 justify-start px-1">
                        {tournamentType === 'champions' ? (
                          <>
                            <span className="flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" /> Juara Eropa (Peringkat 1)
                            </span>
                            <span className="flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-400" /> Semifinalis UCL (Peringkat 2-4)
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" /> Lolos UCL (Peringkat 1-2)
                            </span>
                            <span className="flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-sky-400" /> Lolos UEL (Peringkat 3-4)
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Match History Stepper Column */}
                    <div className="flex flex-col gap-3">
                      <h3 className="font-bold text-slate-600 text-xs uppercase tracking-wider text-left flex items-center gap-1.5">
                        <Calendar className="w-4 h-4 text-emerald-500" />
                        Recap Perjalanan Musim
                      </h3>
                      
                      <div className="bg-white border-2 border-slate-200 rounded-2xl p-5 max-h-[360px] overflow-y-auto scrollbar-thin shadow-sm">
                        <div className="space-y-4 relative border-l-2 border-slate-100 ml-2 pl-5 text-left">
                          {fixtures.map((round, rIdx) => {
                            const userFix = round.find(f => f.home === userTeamName || f.away === userTeamName) || null;
                            if (!userFix) return null;
                            
                            const isUserHome = userFix.home === userTeamName;
                            const oppName = isUserHome ? userFix.away : userFix.home;
                            const uScore = isUserHome ? (userFix.homeScore ?? 0) : (userFix.awayScore ?? 0);
                            const oScore = isUserHome ? (userFix.awayScore ?? 0) : (userFix.homeScore ?? 0);
                            
                            let outcomeColor = "bg-slate-200 text-slate-500";
                            let outcomeText = "S";
                            let cardColor = "border-slate-200 hover:border-slate-300";
                            
                            if (uScore > oScore) {
                              outcomeColor = "bg-emerald-500 text-white";
                              outcomeText = "M";
                              cardColor = "border-emerald-200 bg-emerald-50 hover:border-emerald-300";
                            } else if (uScore < oScore) {
                              outcomeColor = "bg-rose-500 text-white font-bold";
                              outcomeText = "K";
                              cardColor = "border-rose-200 bg-rose-50 hover:border-rose-300";
                            }

                            return (
                              <div key={rIdx} className="relative group">
                                {/* Bullet indicator on the line */}
                                <div className={`absolute -left-[27px] top-1.5 w-4 h-4 rounded-full border-2 border-white flex items-center justify-center text-[8px] font-black shadow-sm ${outcomeColor}`}>
                                  {outcomeText}
                                </div>
                                
                                <div className={`flex justify-between items-center bg-white border-2 p-3 rounded-xl transition-colors shadow-sm ${cardColor}`}>
                                  <div className="flex flex-col">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase">Pekan {rIdx + 1}</span>
                                    <span className="text-xs text-slate-800 font-black uppercase mt-0.5">vs {oppName}</span>
                                  </div>
                                  <div className="text-xs font-black font-mono bg-white border border-slate-200 px-3 py-1.5 rounded-lg text-slate-700 shadow-sm">
                                    {uScore} - {oScore}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                  </div>

                  {/* Play Again / Next Tournament Selection */}
                  {tournamentType === 'domestic' && isUserQualifiedCL ? (
                    <div className="w-full mt-10 flex flex-col gap-6 items-center">
                      <div className="text-center">
                        <h3 className="text-xl font-black uppercase tracking-wider text-emerald-500 animate-pulse">
                          APA LANGKAH ANDA SELANJUTNYA?
                        </h3>
                        <p className="text-slate-500 font-medium text-sm mt-2 max-w-lg mx-auto">
                          Anda berhak melaju ke UEFA Champions League atau tetap bersaing di liga domestik saat ini.
                        </p>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl mt-4 text-left">
                        {/* Choice 1: Champions League */}
                        <div className="bg-white border-4 border-blue-100 p-8 rounded-[2rem] flex flex-col justify-between items-center text-center shadow-xl hover:shadow-blue-200 transition-all hover:-translate-y-1">
                          <Trophy className="w-16 h-16 text-blue-500 animate-pulse mb-4 drop-shadow-md" />
                          <h4 className="text-lg font-black uppercase text-slate-800 tracking-wider">
                            UEFA Champions League
                          </h4>
                          <p className="text-slate-500 font-medium text-xs sm:text-sm leading-relaxed mt-3 h-16">
                            Hadapi klub-klub elite terkuat dari seluruh Eropa (Real Madrid, Man City, Milan, dll) untuk memperebutkan trofi Si Kuping Lebar!
                          </p>
                          <div className="flex flex-col gap-3 w-full mt-6">
                            <button
                              onClick={() => handleGoToChampionsLeague(true)}
                              className="w-full py-3.5 bg-blue-500 hover:bg-blue-600 text-white font-bold text-xs uppercase rounded-xl transition-all cursor-pointer shadow-md shadow-blue-200"
                            >
                              Mainkan CL (Simpan Skuad)
                            </button>
                            <button
                              onClick={() => handleGoToChampionsLeague(false)}
                              className="w-full py-3 bg-white hover:bg-blue-50 border-2 border-blue-200 text-blue-600 font-bold text-xs uppercase rounded-xl transition-all cursor-pointer"
                            >
                              Mainkan CL (Draft Ulang)
                            </button>
                          </div>
                        </div>

                        {/* Choice 2: Stay Domestic */}
                        <div className="bg-white border-4 border-slate-100 p-8 rounded-[2rem] flex flex-col justify-between items-center text-center shadow-xl hover:shadow-slate-200 transition-all hover:-translate-y-1">
                          <RotateCcw className="w-16 h-16 text-emerald-500 mb-4 drop-shadow-md" />
                          <h4 className="text-lg font-black uppercase text-slate-800 tracking-wider">
                            Tetap di Liga Domestik
                          </h4>
                          <p className="text-slate-500 font-medium text-xs sm:text-sm leading-relaxed mt-3 h-16">
                            Tetap berada di liga lokal saat ini untuk mempertahankan kejuaraan atau membalas dendam dengan dominasi mutlak.
                          </p>
                          <div className="flex flex-col gap-3 w-full mt-6">
                            <button
                              onClick={() => handleRestartDomesticLeague(true)}
                              className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-400 text-white font-extrabold text-xs uppercase rounded-xl transition-all cursor-pointer shadow-md shadow-emerald-200"
                            >
                              Mulai Lagi (Simpan Skuad)
                            </button>
                            <button
                              onClick={() => handleRestartDomesticLeague(false)}
                              className="w-full py-3 bg-white hover:bg-slate-50 border-2 border-slate-200 text-slate-500 font-bold text-xs uppercase rounded-xl transition-all cursor-pointer"
                            >
                              Mulai Lagi (Draft Ulang)
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Default Try Again / Reset Control */
                    <div className="mt-8 w-full flex flex-col items-center gap-4">
                      {tournamentType === 'champions' ? (
                        <button
                          onClick={handleResetGame}
                          className="w-full max-w-sm py-4 bg-blue-500 hover:bg-blue-600 text-white font-black uppercase text-sm rounded-xl transition-all flex items-center justify-center gap-2 shadow-xl shadow-blue-200 cursor-pointer hover:-translate-y-1"
                        >
                          <RotateCcw className="w-5 h-5" />
                          Mulai Game Baru (Reset Total)
                        </button>
                      ) : (
                        <div className="flex flex-col gap-4 w-full max-w-md items-center">
                          <button
                            onClick={() => handleRestartDomesticLeague(true)}
                            className="w-full max-w-sm py-4 bg-emerald-500 text-white font-black uppercase text-sm rounded-xl hover:bg-emerald-400 transition-all flex items-center justify-center gap-2 shadow-xl shadow-emerald-200 cursor-pointer hover:-translate-y-1"
                          >
                            <RotateCcw className="w-5 h-5" />
                            Main Lagi (Simpan Skuad)
                          </button>
                          <button
                            onClick={() => handleRestartDomesticLeague(false)}
                            className="w-full max-w-sm py-3.5 bg-white border-2 border-slate-200 text-slate-500 hover:text-emerald-600 hover:border-emerald-200 hover:bg-emerald-50 font-bold uppercase text-xs sm:text-sm rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
                          >
                            <RotateCcw className="w-4 h-4" />
                            Main Lagi (Draft Skuad Baru)
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}
              </>
            )}
          </>
        )}

      </main>

      {/* Footer banner */}
      <footer className="w-full border-t border-slate-200 p-6 text-center text-[10px] sm:text-xs text-slate-400 font-medium mt-auto bg-white">
        &copy; 2026 Webscore Simulator. Dibuat menggunakan Next.js + Tailwind CSS.
      </footer>
    </div>
  );
}
