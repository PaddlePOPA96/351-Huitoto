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
  const [clubsList, setClubsList] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string>("");

  // --- Game State ---
  const [screen, setScreen] = useState<'welcome' | 'formation' | 'draft' | 'league' | 'match' | 'end'>('welcome');
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
        const byPosition: Record<string, Player[]> = {};
        
        data.players.forEach(p => {
          const clubName = p.team || "Free Agent";
          if (!loadedData[clubName]) {
            loadedData[clubName] = [];
          }
          const mappedPlayer = {
            ...p,
            club: clubName // Inject club name
          };
          loadedData[clubName].push(mappedPlayer);

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
        setClubsList(Object.keys(loadedData).sort());
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
            const choices = draw10ChoicesForPosition(playersByPosition[s.position] || [], draftedNames);
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
            const choices = draw10ChoicesForPosition(playersByPosition[s.position] || [], draftedNames);
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
    <div className="flex flex-col flex-1 bg-zinc-950 text-white font-sans select-none min-h-screen">
      {/* Header bar */}
      <header className={`sticky top-0 w-full border-b backdrop-blur-md p-4 flex items-center justify-between z-30 px-6 transition-all duration-300 ${
        tournamentType === 'champions' 
          ? "bg-blue-950/70 border-blue-900/40 shadow-[0_1px_15px_rgba(59,130,246,0.08)]" 
          : "bg-zinc-950/80 border-zinc-900"
      }`}>
        <div className="flex items-center gap-2 cursor-pointer" onClick={handleRestart}>
          <Flame className={`w-6 h-6 ${tournamentType === 'champions' ? "text-blue-400" : "text-saweria"}`} />
          <span className="font-black tracking-widest text-sm sm:text-base uppercase text-white">
            WEBSCORE
          </span>
        </div>
        <span className={`text-[10px] sm:text-xs font-bold uppercase tracking-widest border px-3 py-1 rounded-full ${
          tournamentType === 'champions' 
            ? "text-blue-300 border-blue-900/40 bg-blue-950/30" 
            : "text-zinc-500 border-zinc-850 bg-zinc-900/40"
        }`}>
          {tournamentType === 'champions' ? "UEFA Champions League" : `${LEAGUE_NAMES[domesticLeague] || "Liga Domestik"}`}
        </span>
      </header>

      {/* Main Container */}
      <main className="flex-1 flex flex-col p-4 sm:p-6 max-w-7xl w-full mx-auto justify-center">

        {/* SCREEN 1: WELCOME SCREEN */}
        {screen === 'welcome' && (
          <div className="flex flex-col items-center text-center max-w-2xl mx-auto py-12 gap-8 animate-fade-in">
            {/* Saweria Yellow Accent Badge */}
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-saweria/10 border border-saweria/20 rounded-full text-xs font-bold text-saweria uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5" />
              Soccer Simulation Game
            </div>

            {/* Title */}
            <div className="flex flex-col gap-2">
              <h1 className="text-4xl sm:text-6xl font-black uppercase tracking-tight text-white leading-none">
                BUILD YOUR <span className="text-saweria">DREAM SQUAD</span>
              </h1>
              <p className="text-zinc-500 text-sm sm:text-base leading-relaxed max-w-md mx-auto mt-2">
                Pilih formasi taktis, rekrut 11 pemain bintang, simulasikan jalannya pertandingan secara langsung, dan menangkan klasemen liga!
              </p>
            </div>

            {/* Action buttons / UI Input */}
            <div className="flex flex-col items-center gap-6 w-full max-w-md mt-2">
              <div className="w-full flex flex-col gap-2">
                <label className="text-left text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                  Nama Klub Anda
                </label>
                <input
                  type="text"
                  value={userTeamName}
                  onChange={(e) => setUserTeamName(e.target.value || "User FC")}
                  maxLength={15}
                  placeholder="Ketik nama klub... (default: User FC)"
                  className="w-full bg-zinc-900 border border-zinc-800 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-saweria transition-all"
                />
              </div>

              {/* League Selector Grid */}
              <div className="w-full flex flex-col gap-2">
                <label className="text-left text-[10px] font-bold uppercase tracking-wider text-zinc-500">
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
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between h-20 ${
                          isSelected
                            ? "bg-saweria/10 border-saweria text-white shadow-lg shadow-saweria/5"
                            : "bg-zinc-900 border-zinc-850 text-zinc-400 hover:border-zinc-700 hover:text-white"
                        }`}
                      >
                        <div className="flex justify-between items-center w-full">
                          <span className="text-lg leading-none">{lg.flag}</span>
                          <span className={`text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded leading-none ${
                            isSelected ? "bg-saweria text-black" : "bg-zinc-950 text-zinc-500"
                          }`}>
                            {lg.id}
                          </span>
                        </div>
                        <div className="flex flex-col mt-1 min-w-0">
                          <span className="text-xs font-black truncate">{lg.name}</span>
                          <span className="text-[9px] text-zinc-500 font-semibold">{lg.count}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                onClick={handleStartGame}
                className="w-full py-3.5 bg-saweria text-black font-black uppercase text-sm rounded-xl hover:bg-saweria-light hover:scale-[1.02] active:scale-95 transition-all shadow-xl shadow-saweria/15 flex items-center justify-center gap-2 mt-2"
              >
                <Play className="w-4 h-4 fill-black" />
                Mulai Game
              </button>
            </div>

            {/* Quick guide cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full mt-8 text-left">
              <div className="p-4 bg-zinc-900/40 border border-zinc-900 rounded-xl">
                <Star className="w-5 h-5 text-saweria mb-2" />
                <h4 className="text-xs font-bold uppercase text-white tracking-wider">1. Pilih Taktik</h4>
                <p className="text-zinc-500 text-[11px] leading-relaxed mt-1">
                  Tentukan formasi favorit Anda seperti 4-3-3, 4-4-2, atau 3-5-2 untuk memulai.
                </p>
              </div>
              <div className="p-4 bg-zinc-900/40 border border-zinc-900 rounded-xl">
                <User className="w-5 h-5 text-saweria mb-2" />
                <h4 className="text-xs font-bold uppercase text-white tracking-wider">2. Draft Pemain</h4>
                <p className="text-zinc-500 text-[11px] leading-relaxed mt-1">
                  Gunakan Gacha Klub acak atau saring posisi secara manual untuk mengisi slot formasi.
                </p>
              </div>
              <div className="p-4 bg-zinc-900/40 border border-zinc-900 rounded-xl">
                <Trophy className="w-5 h-5 text-saweria mb-2" />
                <h4 className="text-xs font-bold uppercase text-white tracking-wider">3. Puncaki Liga</h4>
                <p className="text-zinc-500 text-[11px] leading-relaxed mt-1">
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
              <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-wider text-white">
                PILIH FORMASI & STRATEGI
              </h2>
              <p className="text-zinc-500 text-xs sm:text-sm mt-1">
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
                    className="bg-zinc-900/50 border border-zinc-850 hover:border-saweria hover:bg-zinc-900 rounded-2xl p-5 text-left transition-all duration-300 group focus:outline-none flex flex-col gap-4 shadow-lg hover:shadow-saweria/5 hover:scale-[1.02]"
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-lg font-black tracking-wider text-white group-hover:text-saweria">
                        Taktik {name}
                      </span>
                      <ChevronRight className="w-5 h-5 text-zinc-600 group-hover:text-saweria" />
                    </div>

                    <div className="flex gap-4 text-xs font-semibold text-zinc-400">
                      <div className="flex flex-col">
                        <span className="text-[9px] uppercase text-zinc-600 font-bold">Defenders</span>
                        <span className="text-white mt-0.5">{defCount} Bek</span>
                      </div>
                      <div className="border-l border-zinc-800 h-6 shrink-0" />
                      <div className="flex flex-col">
                        <span className="text-[9px] uppercase text-zinc-600 font-bold">Midfielders</span>
                        <span className="text-white mt-0.5">{midCount} Gelandang</span>
                      </div>
                      <div className="border-l border-zinc-800 h-6 shrink-0" />
                      <div className="flex flex-col">
                        <span className="text-[9px] uppercase text-zinc-600 font-bold">Attackers</span>
                        <span className="text-white mt-0.5">{attCount} Striker</span>
                      </div>
                    </div>

                    {/* Small tactical text map */}
                    <div className="text-[10px] text-zinc-500 font-bold bg-black/40 p-2 rounded-lg truncate w-full">
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
            <div className="lg:col-span-7 flex flex-col items-center">
              <div className="w-full max-w-md lg:max-w-none">
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
              <div className="bg-zinc-900/40 border border-zinc-900 rounded-2xl p-5 flex flex-col gap-4">
                <h3 className="font-bold text-zinc-400 text-xs sm:text-sm uppercase tracking-wider">
                  Statistik Skuad Saya
                </h3>

                <div className="flex items-center justify-between gap-4">
                  {/* Average Rating Circle */}
                  <div className="flex items-center gap-3">
                    <div className="w-16 h-16 rounded-2xl bg-zinc-950 border border-zinc-800 flex flex-col items-center justify-center shrink-0">
                      <span className="text-2xl font-black text-saweria leading-none font-mono">
                        {userSquadRating}
                      </span>
                      <span className="text-[8px] font-bold uppercase text-zinc-500 mt-1">OVR RAT</span>
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white tracking-wide truncate max-w-[150px]">
                        {userTeamName}
                      </h4>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] font-bold text-zinc-500 uppercase">
                          Formasi: {selectedFormationName}
                        </span>
                        <span className="text-zinc-700">•</span>
                        <span className="text-[10px] font-bold text-saweria bg-saweria/10 px-1.5 rounded uppercase">
                          {totalDraftedCount} / 11 Pemain
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Stars indicators */}
                  <div className="flex flex-col items-end">
                    <div className="flex gap-0.5 text-saweria">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={`w-4 h-4 ${i < starRating ? "fill-saweria" : "text-zinc-800"}`}
                        />
                      ))}
                    </div>
                    <span className="text-[9px] font-black uppercase text-zinc-500 mt-1.5">
                      TIER: {starRating === 5 ? "SUPERIOR" : starRating === 4 ? "ELITE" : starRating === 3 ? "MEDIUM" : "UNDERDOG"}
                    </span>
                  </div>
                </div>

                {/* Confirm Squad Button */}
                <button
                  disabled={totalDraftedCount < 11}
                  onClick={handleGenerateLeague}
                  className="w-full py-3.5 bg-saweria text-black font-extrabold uppercase text-xs sm:text-sm rounded-xl hover:bg-saweria-light active:scale-95 disabled:bg-zinc-900 disabled:border disabled:border-zinc-850 disabled:text-zinc-600 disabled:scale-100 transition-all duration-200 shadow-xl shadow-saweria/10 mt-2 flex items-center justify-center gap-2"
                >
                  <Trophy className="w-4 h-4 fill-black" />
                  Kunci Skuad & Generate Liga
                </button>
              </div>

              {/* Slot list selection panel */}
              <div className="bg-zinc-900/20 border border-zinc-900 rounded-2xl flex flex-col flex-1 min-h-[300px] overflow-hidden">
                <div className="p-4 bg-zinc-900/40 border-b border-zinc-900 flex justify-between items-center">
                  <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                    Daftar Slot Formasi
                  </span>
                  <button
                    onClick={handleRestart}
                    className="text-[10px] font-bold text-zinc-500 hover:text-white transition-colors flex items-center gap-1 uppercase"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Ganti Formasi
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto max-h-[350px] p-4 space-y-2.5 divide-y divide-zinc-900/40">
                  {draftSlots.map((slot) => {
                    const hasPlayer = slot.player !== null;
                    return (
                      <div 
                        key={slot.id}
                        className={`flex items-center justify-between gap-4 pt-2.5 first:pt-0 ${
                          activeSlotId === slot.id ? "bg-zinc-900/20 p-2 rounded-lg border border-zinc-800" : ""
                        }`}
                      >
                        {/* Slot Position Title */}
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black uppercase tracking-wider shrink-0 ${
                            hasPlayer 
                              ? "bg-saweria/10 text-saweria border border-saweria/20" 
                              : "bg-zinc-900 text-zinc-500 border border-zinc-850"
                          }`}>
                            {slot.position}
                          </div>

                          <div className="min-w-0 flex flex-col">
                            {hasPlayer ? (
                              <>
                                <span className="text-xs font-bold text-white truncate max-w-[120px] sm:max-w-[180px]">
                                  {slot.player?.name}
                                </span>
                                <span className="text-[10px] text-zinc-500 truncate mt-0.5">
                                  {slot.player?.nationality} • OVR {normalizeRating(slot.player!.rat)}
                                </span>
                              </>
                            ) : (
                              <span className="text-xs text-zinc-500 italic">
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
                              className="text-[10px] font-bold text-zinc-400 hover:text-saweria border border-zinc-800 bg-zinc-900 hover:bg-zinc-950 px-3 py-1 rounded transition-all"
                            >
                              Ganti
                            </button>
                          ) : (
                            <button
                              onClick={() => handleSlotClick(slot.id)}
                              className="text-[10px] font-bold text-black bg-saweria hover:bg-saweria-light px-3 py-1 rounded transition-all shadow shadow-saweria/5"
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
                <div className="bg-zinc-900/40 border border-zinc-900 rounded-2xl p-5 flex flex-col gap-4 relative overflow-hidden">
                  
                  {/* Background glowing glow */}
                  <div className="absolute -top-12 -right-12 w-24 h-24 bg-saweria/5 rounded-full blur-2xl pointer-events-none" />

                  {/* Header info */}
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-zinc-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-saweria" />
                      Pekan Kompetisi {currentRoundIdx + 1}
                    </span>
                    <span className="text-[10px] text-saweria bg-saweria/10 px-2 py-0.5 rounded font-black">
                      NEXT MATCH
                    </span>
                  </div>

                  {/* Team vs Team Layout */}
                  <div className="flex items-center justify-between border-y border-zinc-900/60 py-4 mt-1 font-sans">
                    <div className="flex flex-col items-center flex-1 min-w-0">
                      <span className="text-white text-xs sm:text-sm font-bold truncate max-w-full">
                        {userFixtureInCurrentRound.home}
                      </span>
                      <span className="text-[10px] text-zinc-500 font-bold mt-1 uppercase">
                        {userFixtureInCurrentRound.home === userTeamName 
                          ? `OVR ${userSquadRating}` 
                          : `OVR ${calculateSquadRating(aiSquads[userFixtureInCurrentRound.home] || [])}`
                        }
                      </span>
                    </div>

                    <div className="px-4 text-center shrink-0">
                      <span className="text-xs font-black bg-zinc-950 border border-zinc-850 px-3 py-1.5 rounded-lg text-zinc-400">
                        VS
                      </span>
                    </div>

                    <div className="flex flex-col items-center flex-1 min-w-0">
                      <span className="text-white text-xs sm:text-sm font-bold truncate max-w-full">
                        {userFixtureInCurrentRound.away}
                      </span>
                      <span className="text-[10px] text-zinc-500 font-bold mt-1 uppercase">
                        {userFixtureInCurrentRound.away === userTeamName 
                          ? `OVR ${userSquadRating}` 
                          : `OVR ${calculateSquadRating(aiSquads[userFixtureInCurrentRound.away] || [])}`
                        }
                      </span>
                    </div>
                  </div>

                  {/* Simulation launcher */}
                  <div className="flex flex-col gap-2 mt-1">
                    <button
                      onClick={handleStartMatchSimulation}
                      disabled={isSimulatingSeason}
                      className="w-full py-3 bg-saweria disabled:bg-zinc-800 disabled:text-zinc-650 disabled:border disabled:border-zinc-850 disabled:cursor-not-allowed text-black font-black uppercase text-xs sm:text-sm rounded-xl hover:bg-saweria-light active:scale-95 transition-all shadow-xl shadow-saweria/10 flex items-center justify-center gap-2"
                    >
                      <Play className="w-4 h-4 fill-black" />
                      {isSimulatingSeason ? "Simulasi Sedang Berjalan..." : "Simulasikan Pertandingan"}
                    </button>
                    <button
                      onClick={handleSkipSeason}
                      disabled={isSimulatingSeason}
                      className="w-full py-2 bg-zinc-900 border border-zinc-800 hover:bg-zinc-850 disabled:bg-zinc-950 disabled:text-zinc-700 disabled:border-zinc-900 disabled:cursor-not-allowed text-white font-bold uppercase text-[10px] sm:text-xs rounded-xl active:scale-95 transition-all flex items-center justify-center gap-1.5"
                    >
                      <FastForward className="w-3.5 h-3.5" />
                      {isSimulatingSeason ? "Mensimulasikan Sisa Musim..." : "Simulasikan Sisa Musim (Skip)"}
                    </button>
                  </div>

                </div>
              ) : (
                // User has BYE in this round (since odd number of teams)
                <div className="bg-zinc-900/40 border border-zinc-900 rounded-2xl p-5 flex flex-col gap-4 text-center items-center justify-center">
                  <ShieldAlert className="w-10 h-10 text-saweria animate-pulse mb-1" />
                  <div className="flex flex-col">
                    <h4 className="text-sm font-bold text-white uppercase tracking-wide">
                      Pekan Istirahat (BYE)
                    </h4>
                    <p className="text-zinc-500 text-xs leading-relaxed max-w-xs mt-1">
                      Tim Anda tidak memiliki pertandingan pada pekan ini. Klik di bawah untuk mensimulasikan laga tim-tim AI lainnya secara instan.
                    </p>
                  </div>
                  <button
                    onClick={simulateByeRound}
                    disabled={isSimulatingSeason}
                    className="w-full py-3 bg-zinc-800 border border-zinc-700 hover:bg-zinc-750 text-white font-bold text-xs rounded-xl transition-all mt-2 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isSimulatingSeason ? "Mensimulasikan..." : "Simulasikan Pekan Ini"}
                  </button>
                </div>
              )}

              {/* Show other round fixtures in a list */}
              <div className="bg-zinc-900/20 border border-zinc-900 rounded-2xl overflow-hidden">
                <div className="p-3 bg-zinc-900/40 border-b border-zinc-900 flex justify-between items-center">
                  <span className="text-[10px] sm:text-xs font-bold text-zinc-400 uppercase tracking-wider">
                    Jadwal Pertandingan Lain Pekan Ini
                  </span>
                </div>

                <div className="p-4 space-y-3 divide-y divide-zinc-900/40 max-h-[200px] overflow-y-auto">
                  {fixtures[currentRoundIdx]?.map((fix, idx) => {
                    if (fix.home === userTeamName || fix.away === userTeamName) return null; // Skip user match
                    
                    return (
                      <div key={idx} className="flex justify-between items-center text-xs pt-3 first:pt-0">
                        <span className="truncate max-w-[120px] font-semibold text-zinc-400 text-left w-1/3">
                          {fix.home}
                        </span>
                        <div className="text-center w-1/3 shrink-0">
                          {fix.simulated ? (
                            <span className="bg-zinc-900 border border-zinc-850 px-2 py-0.5 rounded font-bold text-zinc-300 font-mono">
                              {fix.homeScore} - {fix.awayScore}
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-zinc-600 bg-zinc-950 px-2 py-0.5 rounded">
                              TBD
                            </span>
                          )}
                        </div>
                        <span className="truncate max-w-[120px] font-semibold text-zinc-400 text-right w-1/3">
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
                  className="w-full py-3.5 bg-white hover:bg-zinc-100 text-black font-extrabold uppercase text-xs rounded-xl active:scale-95 transition-all flex items-center justify-center gap-1.5 shadow"
                >
                  Lanjutkan ke Pekan Berikutnya
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}

            </div>

            {/* ROADMAP TIMELINE */}
            <div className="col-span-1 lg:col-span-12 mt-6 bg-zinc-900/40 border border-zinc-900 rounded-2xl p-5 relative overflow-hidden">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-white text-sm uppercase tracking-wider">
                    Roadmap Kompetisi Musim Ini
                  </h3>
                  <p className="text-[10px] text-zinc-500 mt-0.5">
                    Jalur perjalanan {userTeamName} dari pekan pertama hingga kualifikasi kompetisi Eropa
                  </p>
                </div>
                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-saweria/10 border border-saweria/20 rounded text-[10px] text-saweria font-bold">
                  <Star className="w-3 h-3 fill-saweria" />
                  Pekan {currentRoundIdx + 1} Aktif
                </div>
              </div>
              
              <div className="flex gap-4 overflow-x-auto pb-3 pt-1 scrollbar-thin select-none">
                {fixtures.map((round, rIdx) => {
                  const userFix = round.find(f => f.home === userTeamName || f.away === userTeamName) || null;
                  if (!userFix) {
                    return (
                      <div key={rIdx} className="flex-shrink-0 w-36 bg-zinc-950/60 border border-zinc-900 p-3 rounded-xl flex flex-col justify-between">
                        <span className="text-[9px] font-bold text-zinc-500 uppercase">Pekan {rIdx + 1}</span>
                        <span className="text-xs font-bold text-zinc-400 mt-2">Istirahat (BYE)</span>
                        <span className="text-[8px] text-zinc-650 mt-1 italic">Tidak ada laga</span>
                      </div>
                    );
                  }
                  
                  const isUserHome = userFix.home === userTeamName;
                  const oppName = isUserHome ? userFix.away : userFix.home;
                  const isCompleted = userFix.simulated;
                  const isActive = rIdx === currentRoundIdx;
                  
                  let nodeBg = "bg-zinc-950/40 border-zinc-900 text-zinc-500";
                  let scoreText = "Belum Main";
                  let statusBadge = null;
                  
                  if (isCompleted) {
                    const uScore = isUserHome ? (userFix.homeScore ?? 0) : (userFix.awayScore ?? 0);
                    const oScore = isUserHome ? (userFix.awayScore ?? 0) : (userFix.homeScore ?? 0);
                    
                    scoreText = `${uScore} - ${oScore}`;
                    if (uScore > oScore) {
                      nodeBg = "bg-emerald-950/20 border-emerald-900/60 text-emerald-400";
                      statusBadge = <span className="text-[7px] font-black bg-emerald-500 text-black px-1.5 py-0.5 rounded-sm uppercase leading-none">MENANG</span>;
                    } else if (uScore === oScore) {
                      nodeBg = "bg-yellow-950/20 border-yellow-900/60 text-yellow-300";
                      statusBadge = <span className="text-[7px] font-black bg-yellow-500 text-black px-1.5 py-0.5 rounded-sm uppercase leading-none">SERI</span>;
                    } else {
                      nodeBg = "bg-rose-950/20 border-rose-900/60 text-rose-400";
                      statusBadge = <span className="text-[7px] font-black bg-rose-500 text-white px-1.5 py-0.5 rounded-sm uppercase leading-none font-bold">KALAH</span>;
                    }
                  } else if (isActive) {
                    nodeBg = "bg-zinc-950 border-saweria shadow-[0_0_12px_rgba(255,203,5,0.2)] text-white animate-pulse-glow";
                    scoreText = "VS";
                  }
                  
                  return (
                    <div 
                      key={rIdx} 
                      className={`flex-shrink-0 w-36 border p-3 rounded-xl flex flex-col justify-between transition-all duration-300 relative ${nodeBg}`}
                    >
                      <div className="flex justify-between items-center w-full">
                        <span className="text-[9px] font-black uppercase tracking-wider">
                          Pekan {rIdx + 1}
                        </span>
                        {statusBadge}
                      </div>
                      
                      <div className="mt-3.5 flex flex-col">
                        <span className="text-[10px] text-zinc-400 font-bold uppercase truncate max-w-full">
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
                  className={`flex-shrink-0 w-44 border p-3 rounded-xl flex flex-col justify-between transition-all duration-350 relative overflow-hidden ${
                    currentRoundIdx >= fixtures.length - 1 && fixtures.every(r => r.every(f => f.simulated))
                      ? "bg-saweria/10 border-saweria text-saweria shadow-[0_0_15px_rgba(255,203,5,0.25)] animate-pulse" 
                      : "bg-zinc-950/40 border-zinc-900/60 text-zinc-650"
                  }`}
                >
                  <div className="flex justify-between items-center w-full">
                    <span className="text-[9px] font-black uppercase tracking-wider">
                      Kompetisi Eropa
                    </span>
                    <Trophy className="w-3.5 h-3.5 text-saweria" />
                  </div>
                  
                  <div className="mt-3.5 flex flex-col">
                    <span className="text-[10px] font-bold uppercase truncate text-zinc-400">
                      Kelolosan Skuad
                    </span>
                    <div className="flex items-center gap-1 mt-1">
                      {currentRoundIdx >= fixtures.length - 1 && fixtures.every(r => r.every(f => f.simulated)) ? (
                        <span className="text-xs font-black uppercase tracking-wide text-saweria">
                          DITENTUKAN!
                        </span>
                      ) : (
                        <>
                          <Lock className="w-3 h-3 text-zinc-600 shrink-0" />
                          <span className="text-xs font-black uppercase tracking-wide text-zinc-600">
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
                      <div className="w-full max-w-2xl bg-gradient-to-b from-blue-950 via-zinc-950 to-zinc-950 border-2 border-yellow-450 p-8 rounded-3xl relative overflow-hidden animate-holo-cl animate-scale-up shadow-[0_0_40px_rgba(255,203,5,0.25)] text-center">
                        <div className="absolute top-0 right-0 w-48 h-48 bg-yellow-400/5 rounded-full blur-3xl pointer-events-none" />
                        <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />
                        <div className="absolute -inset-x-20 top-0 h-[2px] bg-gradient-to-r from-transparent via-yellow-450 to-transparent animate-pulse" />
                        
                        <Trophy className="w-20 h-20 text-yellow-400 mx-auto animate-bounce mb-4 drop-shadow-[0_0_20px_rgba(250,204,21,0.6)]" />
                        <h2 className="text-3xl sm:text-4xl font-black uppercase tracking-widest text-white leading-none">
                          JUARA CHAMPIONS LEAGUE!
                        </h2>
                        <p className="text-xs text-yellow-450 font-extrabold uppercase tracking-widest mt-1.5 font-mono">
                          THE CHAMPIONS OF EUROPE
                        </p>
                        <p className="text-zinc-400 text-xs sm:text-sm mt-4 max-w-md mx-auto leading-relaxed">
                          Luar biasa! <b>{userTeamName}</b> berhasil mengalahkan raksasa-raksasa Eropa dan menjuarai UEFA Champions League! Anda adalah Raja Eropa yang sesungguhnya!
                        </p>
                      </div>
                    ) : (
                      <div className="w-full max-w-2xl bg-gradient-to-b from-blue-950 via-zinc-950 to-zinc-950 border border-blue-900 p-8 rounded-3xl relative overflow-hidden animate-scale-up text-center shadow-lg">
                        <ShieldAlert className="w-16 h-16 text-blue-400 mx-auto mb-4 animate-pulse" />
                        <h2 className="text-2xl font-black uppercase tracking-widest text-zinc-300 leading-none">
                          KAMPANYE EROPA SELESAI
                        </h2>
                        <p className="text-xs text-zinc-500 font-extrabold uppercase tracking-widest mt-1.5 font-mono">
                          Tim Anda Finis Peringkat Ke-{userPos}
                        </p>
                        <p className="text-zinc-400 text-xs sm:text-sm mt-4 max-w-md mx-auto leading-relaxed">
                          Tim Anda menyelesaikan turnamen UEFA Champions League di peringkat ke-<b>{userPos}</b>. Kancah Eropa sangat ketat, ayo persiapkan taktik yang lebih matang musim depan!
                        </p>
                      </div>
                    )
                  ) : (
                    // Domestic League Banners
                    isUserChampion ? (
                      <div className="w-full max-w-2xl bg-gradient-to-b from-emerald-950/40 via-zinc-950 to-zinc-950 border-2 border-saweria p-8 rounded-3xl relative overflow-hidden animate-scale-up shadow-[0_0_40px_rgba(255,203,5,0.2)] text-center">
                        <div className="absolute top-0 right-0 w-48 h-48 bg-saweria/5 rounded-full blur-3xl pointer-events-none" />
                        <Trophy className="w-20 h-20 text-saweria mx-auto animate-bounce mb-4 drop-shadow-[0_0_20px_rgba(255,203,5,0.4)]" />
                        <h2 className="text-3xl sm:text-4xl font-black uppercase tracking-widest text-white leading-none">
                          TIM ANDA JUARA LIGA!
                        </h2>
                        <p className="text-xs text-saweria font-extrabold uppercase tracking-widest mt-1.5 font-mono">
                          Domestic League Champion • Lolos Liga Champions
                        </p>
                        <p className="text-zinc-400 text-xs sm:text-sm mt-4 max-w-md mx-auto leading-relaxed">
                          Selamat atas pencapaian gemilang ini! <b>{userTeamName}</b> berhasil merajai klasemen liga domestik dan lolos otomatis ke UEFA Champions League musim depan!
                        </p>
                      </div>
                    ) : isUserQualifiedCL ? (
                      <div className="w-full max-w-2xl bg-gradient-to-b from-blue-950/30 via-zinc-950 to-zinc-950 border-2 border-blue-500/50 p-8 rounded-3xl relative overflow-hidden animate-holo-cl animate-scale-up shadow-[0_0_30px_rgba(59,130,246,0.15)] text-center">
                        <Trophy className="w-18 h-18 text-blue-400 mx-auto mb-4 animate-pulse" />
                        <h2 className="text-3xl font-black uppercase tracking-widest text-white leading-none">
                          LOLOS LIGA CHAMPIONS!
                        </h2>
                        <p className="text-xs text-blue-300 font-extrabold uppercase tracking-widest mt-1.5 font-mono">
                          Runner-Up Liga • Lolos Liga Champions
                        </p>
                        <p className="text-zinc-400 text-xs sm:text-sm mt-4 max-w-md mx-auto leading-relaxed">
                          Kerja keras terbayar! <b>{userTeamName}</b> finis di peringkat ke-<b>2</b> klasemen akhir liga domestik dan berhak melaju ke UEFA Champions League musim depan!
                        </p>
                      </div>
                    ) : userPos <= 4 ? (
                      <div className="w-full max-w-2xl bg-gradient-to-b from-sky-950/20 via-zinc-950 to-zinc-950 border-2 border-sky-500/50 p-8 rounded-3xl relative overflow-hidden animate-scale-up text-center shadow-lg">
                        <Star className="w-16 h-16 text-sky-400 mx-auto mb-4 animate-pulse" />
                        <h2 className="text-2xl font-black uppercase tracking-widest text-white leading-none">
                          LOLOS PIALA EROPA (UEL)
                        </h2>
                        <p className="text-xs text-sky-300 font-extrabold uppercase tracking-widest mt-1.5 font-mono">
                          Europa League Qualification (Peringkat {userPos})
                        </p>
                        <p className="text-zinc-400 text-xs sm:text-sm mt-4 max-w-md mx-auto leading-relaxed">
                          Tim Anda finis di peringkat ke-<b>{userPos}</b>. Meskipun tidak lolos ke Champions League (hanya peringkat 1-2), Anda berhasil mengamankan tiket kualifikasi UEFA Europa League!
                        </p>
                      </div>
                    ) : (
                      <div className="w-full max-w-2xl bg-gradient-to-b from-zinc-900 to-zinc-950 border-2 border-zinc-800 p-8 rounded-3xl relative overflow-hidden animate-scale-up text-center shadow-lg">
                        <ShieldAlert className="w-16 h-16 text-zinc-500 mx-auto mb-4" />
                        <h2 className="text-2xl font-black uppercase tracking-widest text-zinc-300 leading-none">
                          TETAP DI LIGA DOMESTIK
                        </h2>
                        <p className="text-xs text-zinc-500 font-extrabold uppercase tracking-widest mt-1.5 font-mono">
                          Tidak Lolos Kualifikasi Eropa (Peringkat {userPos})
                        </p>
                        <p className="text-zinc-400 text-xs sm:text-sm mt-4 max-w-md mx-auto leading-relaxed">
                          Musim berakhir kurang memuaskan karena tim finis di peringkat ke-<b>{userPos}</b>. Anda harus merombak taktik dan melakukan gacha baru musim depan!
                        </p>
                      </div>
                    )
                  )}

                  {/* Summary grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full mt-4 items-start">
                    
                    {/* Final Standings Column */}
                    <div className="flex flex-col gap-3">
                      <h3 className="font-bold text-zinc-400 text-xs uppercase tracking-wider text-left flex items-center gap-1.5">
                        <Trophy className="w-4 h-4 text-saweria" />
                        Klasemen Akhir Turnamen
                      </h3>
                      <div className={`w-full border rounded-2xl overflow-hidden ${
                        tournamentType === 'champions' ? "border-blue-900/60" : "border-zinc-900"
                      }`}>
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className={`border-b text-zinc-500 font-bold uppercase tracking-wider text-[9px] ${
                              tournamentType === 'champions' ? "bg-blue-950/20 border-blue-900/40" : "bg-zinc-900/60 border-zinc-900"
                            }`}>
                              <th className="py-2.5 px-3 text-center w-8">#</th>
                              <th className="py-2.5 px-3">Klub</th>
                              <th className="py-2.5 px-2 text-center">P</th>
                              <th className="py-2.5 px-2 text-center">GD</th>
                              <th className="py-2.5 px-3 text-center">PTS</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-900/40 bg-zinc-950/20">
                            {sorted.map((team, idx) => {
                              const pos = idx + 1;
                              let rowBg = "";
                              let posColor = "text-zinc-550";
                              
                              if (team.isUser) {
                                rowBg = "bg-saweria/10 font-bold text-saweria";
                                posColor = "text-saweria";
                              } else {
                                if (tournamentType === 'champions') {
                                  if (pos === 1) posColor = "text-yellow-400 font-bold";
                                  else if (pos <= 4) posColor = "text-blue-405";
                                } else {
                                  if (pos <= 2) posColor = "text-yellow-400 font-bold";
                                  else if (pos <= 4) posColor = "text-sky-400";
                                }
                              }
                              
                              return (
                                <tr key={team.name} className={`${rowBg} hover:bg-zinc-900/20 transition-colors`}>
                                  <td className={`py-2.5 px-3 text-center font-bold ${posColor}`}>{pos}</td>
                                  <td className="py-2.5 px-3 truncate max-w-[140px] font-semibold text-zinc-300">{team.name}</td>
                                  <td className="py-2.5 px-2 text-center text-zinc-400">{team.played}</td>
                                  <td className={`py-2.5 px-2 text-center font-bold ${team.goalDifference > 0 ? "text-emerald-450" : team.goalDifference < 0 ? "text-rose-450" : "text-zinc-550"}`}>
                                    {team.goalDifference > 0 ? `+${team.goalDifference}` : team.goalDifference}
                                  </td>
                                  <td className="py-2.5 px-3 text-center font-black text-white">{team.points}</td>
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
                      <h3 className="font-bold text-zinc-400 text-xs uppercase tracking-wider text-left flex items-center gap-1.5">
                        <Calendar className="w-4 h-4 text-saweria" />
                        Recap Perjalanan Musim
                      </h3>
                      
                      <div className="bg-zinc-900/40 border border-zinc-900 rounded-2xl p-4 max-h-[360px] overflow-y-auto scrollbar-thin">
                        <div className="space-y-4 relative border-l border-zinc-800 ml-2 pl-4 text-left">
                          {fixtures.map((round, rIdx) => {
                            const userFix = round.find(f => f.home === userTeamName || f.away === userTeamName) || null;
                            if (!userFix) return null;
                            
                            const isUserHome = userFix.home === userTeamName;
                            const oppName = isUserHome ? userFix.away : userFix.home;
                            const uScore = isUserHome ? (userFix.homeScore ?? 0) : (userFix.awayScore ?? 0);
                            const oScore = isUserHome ? (userFix.awayScore ?? 0) : (userFix.homeScore ?? 0);
                            
                            let outcomeColor = "bg-zinc-500";
                            let outcomeText = "S";
                            
                            if (uScore > oScore) {
                              outcomeColor = "bg-emerald-500 text-black";
                              outcomeText = "M";
                            } else if (uScore < oScore) {
                              outcomeColor = "bg-rose-500 text-white font-bold";
                              outcomeText = "K";
                            }

                            return (
                              <div key={rIdx} className="relative group">
                                {/* Bullet indicator on the line */}
                                <div className={`absolute -left-[22px] top-1 w-3.5 h-3.5 rounded-full border border-zinc-950 flex items-center justify-center text-[7px] font-black ${outcomeColor}`}>
                                  {outcomeText}
                                </div>
                                
                                <div className="flex justify-between items-center bg-zinc-950/30 border border-zinc-900/50 p-2.5 rounded-xl hover:border-zinc-800 transition-colors">
                                  <div className="flex flex-col">
                                    <span className="text-[9px] font-bold text-zinc-500 uppercase">Pekan {rIdx + 1}</span>
                                    <span className="text-[11px] text-white font-black uppercase mt-0.5">vs {oppName}</span>
                                  </div>
                                  <div className="text-xs font-black font-mono bg-zinc-950 border border-zinc-850 px-2.5 py-1 rounded text-zinc-300">
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
                    <div className="w-full mt-6 flex flex-col gap-6 items-center">
                      <div className="text-center">
                        <h3 className="text-lg font-black uppercase tracking-wider text-saweria animate-pulse">
                          APA LANGKAH ANDA SELANJUTNYA?
                        </h3>
                        <p className="text-zinc-500 text-xs mt-1 max-w-md mx-auto">
                          Anda berhak melaju ke UEFA Champions League atau tetap bersaing di liga domestik saat ini.
                        </p>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-3xl mt-2 text-left">
                        {/* Choice 1: Champions League */}
                        <div className="bg-gradient-to-b from-blue-950/60 to-zinc-950 border border-blue-900/50 p-6 rounded-2xl flex flex-col justify-between items-center text-center shadow-lg shadow-blue-950/15">
                          <Trophy className="w-12 h-12 text-blue-400 animate-pulse mb-3" />
                          <h4 className="text-sm font-black uppercase text-white tracking-wider">
                            UEFA Champions League
                          </h4>
                          <p className="text-zinc-400 text-[11px] leading-relaxed mt-2 h-12">
                            Hadapi klub-klub elite terkuat dari seluruh Eropa (Real Madrid, Man City, Milan, dll) untuk memperebutkan trofi Si Kuping Lebar!
                          </p>
                          <div className="flex flex-col gap-2 w-full mt-4">
                            <button
                              onClick={() => handleGoToChampionsLeague(true)}
                              className="w-full py-2.5 bg-blue-500 hover:bg-blue-600 text-white font-bold text-xs uppercase rounded-xl transition-all cursor-pointer"
                            >
                              Mainkan CL (Simpan Skuad)
                            </button>
                            <button
                              onClick={() => handleGoToChampionsLeague(false)}
                              className="w-full py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-850 text-zinc-300 font-semibold text-xs uppercase rounded-xl transition-all cursor-pointer"
                            >
                              Mainkan CL (Draft Ulang)
                            </button>
                          </div>
                        </div>

                        {/* Choice 2: Stay Domestic */}
                        <div className="bg-gradient-to-b from-zinc-900/40 to-zinc-950 border border-zinc-850 p-6 rounded-2xl flex flex-col justify-between items-center text-center shadow-lg">
                          <RotateCcw className="w-12 h-12 text-saweria mb-3" />
                          <h4 className="text-sm font-black uppercase text-white tracking-wider">
                            Tetap di Liga Domestik
                          </h4>
                          <p className="text-zinc-400 text-[11px] leading-relaxed mt-2 h-12">
                            Tetap berada di liga lokal saat ini untuk mempertahankan kejuaraan atau membalas dendam dengan dominasi mutlak.
                          </p>
                          <div className="flex flex-col gap-2 w-full mt-4">
                            <button
                              onClick={() => handleRestartDomesticLeague(true)}
                              className="w-full py-2.5 bg-saweria hover:bg-saweria-light text-black font-extrabold text-xs uppercase rounded-xl transition-all cursor-pointer"
                            >
                              Mulai Lagi (Simpan Skuad)
                            </button>
                            <button
                              onClick={() => handleRestartDomesticLeague(false)}
                              className="w-full py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-850 text-zinc-300 font-semibold text-xs uppercase rounded-xl transition-all cursor-pointer"
                            >
                              Mulai Lagi (Draft Ulang)
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Default Try Again / Reset Control */
                    <div className="mt-6 w-full flex flex-col items-center gap-3">
                      {tournamentType === 'champions' ? (
                        <button
                          onClick={handleResetGame}
                          className="w-full max-w-xs py-3.5 bg-blue-500 hover:bg-blue-600 text-white font-black uppercase text-xs sm:text-sm rounded-xl transition-all flex items-center justify-center gap-2 shadow-xl shadow-blue-950/15 cursor-pointer"
                        >
                          <RotateCcw className="w-4 h-4" />
                          Mulai Game Baru (Reset Total)
                        </button>
                      ) : (
                        <div className="flex flex-col gap-3 w-full max-w-md items-center">
                          <button
                            onClick={() => handleRestartDomesticLeague(true)}
                            className="w-full max-w-xs py-3 bg-saweria text-black font-black uppercase text-xs sm:text-sm rounded-xl hover:bg-saweria-light transition-all flex items-center justify-center gap-2 shadow-lg shadow-saweria/10 cursor-pointer"
                          >
                            <RotateCcw className="w-4 h-4" />
                            Main Lagi (Simpan Skuad)
                          </button>
                          <button
                            onClick={() => handleRestartDomesticLeague(false)}
                            className="w-full max-w-xs py-2.5 bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white font-bold uppercase text-[10px] sm:text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
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

      </main>

      {/* Footer banner */}
      <footer className="w-full border-t border-zinc-900 p-4 text-center text-[10px] text-zinc-600 mt-auto bg-zinc-950 px-6">
        &copy; 2026 Webscore Simulator. Dibuat menggunakan Next.js + Tailwind CSS.
      </footer>
    </div>
  );
}
