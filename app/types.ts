import type { GameState, PlayMode, RevealMode } from "./constants";
import type { RoleId } from "./roles";

export type Player = {
  userId: string;
  name: string;
  isHost?: boolean;
};

export type CurrentRound = {
  /** playerId → secret role */
  roles: Record<string, RoleId>;
  /** Players who confirmed they peeked */
  peekedIds: string[];
  /** Pass-and-play: whose phone turn to peek */
  hotseatPeekId?: string | null;
  /** Police accusation target playerId */
  accusedId?: string | null;
  /** Round score delta after reveal */
  scoresDelta?: Record<string, number>;
  caught?: boolean | null;
  startedAt: number;
};

export type Lobby = {
  lobbyCode: string;
  playMode: PlayMode;
  hostId: string;
  gameState: GameState;
  players: Player[];
  revealMode?: RevealMode;
  targetRounds?: number;
  round?: number;
  currentRound?: CurrentRound | null;
  /** Cumulative points: playerId → score */
  scores?: Record<string, number>;
  createdAt?: unknown;
  lobbyFetched?: boolean;
  /** Snapshot finished but doc missing / permission failed */
  missing?: boolean;
};

export type UserData = {
  userId?: string;
  playerName?: string;
  playerLobbyCode?: string | null;
  userFetched?: boolean;
};
