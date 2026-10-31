import {
  constants,
  GAME_STATE,
  PLAY_MODE,
  CP,
  REVEAL_MODE,
  RevealMode,
} from "@/app/constants";
import type { CurrentRound, Lobby, Player } from "@/app/types";
import { dealRoles, scoreRound } from "@/app/roles";
import { generateLobbyCode, makeLocalPlayerId } from ".";
import {
  getStore,
  patchStoreLobby,
  patchStoreUser,
} from "@/utils/firebase/firebaseHelpers";
import { getOrCreatePlayerId } from "@/utils/identity";

const STORAGE_KEY = "chorpolice_hotseat_lobby";

export function loadLocalLobby(): Lobby | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Lobby;
  } catch {
    return null;
  }
}

export function clearLocalLobby() {
  if (typeof window !== "undefined") {
    sessionStorage.removeItem(STORAGE_KEY);
  }
}

function persist(lobby: Lobby) {
  if (typeof window !== "undefined") {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(lobby));
  }
  patchStoreLobby({ ...lobby, lobbyFetched: true });
}

export function isLocalHotseatCode(code: string): boolean {
  const lobby = loadLocalLobby();
  return !!(lobby && lobby.lobbyCode.toUpperCase() === code.toUpperCase());
}

export function createLocalHotseat(hostName: string): Lobby {
  const lobbyCode = generateLobbyCode();
  const hostId = getOrCreatePlayerId();
  const host: Player = {
    userId: hostId,
    name: hostName || "Host",
    isHost: true,
  };
  const lobby: Lobby = {
    lobbyCode,
    playMode: PLAY_MODE.HOTSEAT,
    hostId: host.userId,
    gameState: GAME_STATE.LOBBY,
    players: [host],
    revealMode: REVEAL_MODE.POLICE_ONLY,
    targetRounds: constants.defaultTargetRounds,
    round: 0,
    currentRound: null,
    scores: {},
  };
  patchStoreUser({
    userId: host.userId,
    playerName: host.name,
    playerLobbyCode: lobbyCode,
    userFetched: true,
  });
  if (typeof window !== "undefined") {
    localStorage.setItem(CP.playerName, host.name);
    localStorage.setItem(CP.lobbyCode, lobbyCode);
  }
  persist(lobby);
  return lobby;
}

export function hydrateLocalIfMatch(code: string): boolean {
  const lobby = loadLocalLobby();
  if (!lobby || lobby.lobbyCode.toUpperCase() !== code.toUpperCase()) return false;
  persist(lobby);
  const store = getStore();
  if (!store.user?.userId && lobby.hostId) {
    patchStoreUser({
      userId: lobby.hostId,
      playerName: lobby.players?.[0]?.name || "Host",
      playerLobbyCode: lobby.lobbyCode,
      userFetched: true,
    });
  }
  return true;
}

function getLobby(): Lobby {
  const fromState = getStore().lobby;
  if (fromState?.playMode === PLAY_MODE.HOTSEAT && fromState.lobbyCode) {
    return JSON.parse(JSON.stringify(fromState));
  }
  const stored = loadLocalLobby();
  if (!stored) throw new Error("No local lobby");
  return stored;
}

function mergeScores(
  scores: Record<string, number> | undefined,
  delta: Record<string, number>
): Record<string, number> {
  const next = { ...(scores || {}) };
  for (const [id, pts] of Object.entries(delta)) {
    next[id] = (next[id] || 0) + pts;
  }
  return next;
}

function buildRound(players: Player[]): CurrentRound {
  return {
    roles: dealRoles(players.map((p) => p.userId)),
    peekedIds: [],
    hotseatPeekId: players[0]?.userId || null,
    accusedId: null,
    scoresDelta: {},
    caught: null,
    startedAt: Date.now(),
  };
}

export function localAddPlayer(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false as const, message: "Name required" };
  const lobby = getLobby();
  if ((lobby.players || []).length >= constants.maxPlayers) {
    return { ok: false as const, message: "Lobby is full (4 players)" };
  }
  if ((lobby.players || []).some((p) => p.name.toLowerCase() === trimmed.toLowerCase())) {
    return { ok: false as const, message: "Name already taken" };
  }
  lobby.players = [
    ...(lobby.players || []),
    {
      userId: makeLocalPlayerId(trimmed, (lobby.players || []).length),
      name: trimmed,
      isHost: false,
    },
  ];
  persist(lobby);
  return { ok: true as const };
}

export function localRemovePlayer(userId: string) {
  const lobby = getLobby();
  lobby.players = (lobby.players || []).filter((p) => p.userId !== userId);
  persist(lobby);
  return { ok: true as const };
}

export function localSetRevealMode(revealMode: RevealMode) {
  const lobby = getLobby();
  lobby.revealMode = revealMode;
  persist(lobby);
}

export function localSetTargetRounds(targetRounds: number) {
  const lobby = getLobby();
  lobby.targetRounds = Math.min(
    constants.maxTargetRounds,
    Math.max(constants.minTargetRounds, Math.round(targetRounds))
  );
  persist(lobby);
}

export function localStartGame() {
  const lobby = getLobby();
  if ((lobby.players || []).length !== constants.minPlayers) {
    return {
      ok: false as const,
      error: `Need exactly ${constants.minPlayers} players`,
    };
  }
  lobby.scores = lobby.scores || {};
  lobby.gameState = GAME_STATE.PEEKING;
  lobby.round = 1;
  lobby.currentRound = buildRound(lobby.players || []);
  persist(lobby);
  return { ok: true as const, playerCount: lobby.players.length };
}

export function localConfirmPeek(playerId: string) {
  const lobby = getLobby();
  if (lobby.gameState !== GAME_STATE.PEEKING || !lobby.currentRound) {
    return { ok: false as const, error: "Not peeking" };
  }
  const peeked = new Set(lobby.currentRound.peekedIds || []);
  peeked.add(playerId);
  lobby.currentRound.peekedIds = [...peeked];

  const players = lobby.players || [];
  const idx = players.findIndex((p) => p.userId === playerId);
  const next = players[idx + 1];

  if (players.every((p) => peeked.has(p.userId))) {
    lobby.gameState = GAME_STATE.ACCUSING;
    lobby.currentRound.hotseatPeekId = null;
  } else {
    lobby.currentRound.hotseatPeekId = next?.userId || null;
  }
  persist(lobby);
  return { ok: true as const };
}

export function localSkipToAccuse() {
  const lobby = getLobby();
  if (lobby.gameState !== GAME_STATE.PEEKING || !lobby.currentRound) {
    return { ok: false as const, error: "Not peeking" };
  }
  lobby.gameState = GAME_STATE.ACCUSING;
  lobby.currentRound.hotseatPeekId = null;
  persist(lobby);
  return { ok: true as const };
}

export function localAccuseChor(policeId: string, accusedId: string) {
  const lobby = getLobby();
  if (lobby.gameState !== GAME_STATE.ACCUSING || !lobby.currentRound) {
    return { ok: false as const, error: "Not accusing" };
  }
  const roles = lobby.currentRound.roles || {};
  if (roles[policeId] !== "police") {
    return { ok: false as const, error: "Only Police can accuse" };
  }
  if (!accusedId || accusedId === policeId) {
    return { ok: false as const, error: "Pick someone else" };
  }

  const { scoresDelta, caught } = scoreRound({ roles, accusedId });
  lobby.currentRound.accusedId = accusedId;
  lobby.currentRound.scoresDelta = scoresDelta;
  lobby.currentRound.caught = caught;
  lobby.scores = mergeScores(lobby.scores, scoresDelta);

  const roundNum = lobby.round || 1;
  const target = lobby.targetRounds || constants.defaultTargetRounds;
  lobby.gameState = roundNum >= target ? GAME_STATE.FINISHED : GAME_STATE.REVEAL;
  persist(lobby);
  return { ok: true as const };
}

export function localHostNextRound() {
  const lobby = getLobby();
  if (lobby.gameState !== GAME_STATE.REVEAL) {
    return { ok: false as const, error: "Round not finished" };
  }
  const players = lobby.players || [];
  if (players.length !== 4) {
    return { ok: false as const, error: "Need 4 players" };
  }
  lobby.gameState = GAME_STATE.PEEKING;
  lobby.round = (lobby.round || 0) + 1;
  lobby.currentRound = buildRound(players);
  persist(lobby);
  return { ok: true as const };
}

export function localReturnToLobby() {
  const lobby = getLobby();
  lobby.gameState = GAME_STATE.LOBBY;
  lobby.currentRound = null;
  lobby.round = 0;
  lobby.scores = {};
  persist(lobby);
}

export const addHotseatPlayer = localAddPlayer;
export const localRemoveHotseatPlayer = localRemovePlayer;
