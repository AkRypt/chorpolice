import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  onSnapshot,
  runTransaction,
  deleteField,
} from "firebase/firestore";
import { db } from "./firebase";
import {
  constants,
  GAME_STATE,
  PLAY_MODE,
  PlayMode,
  CP,
  CP_TABLES,
  REVEAL_MODE,
  RevealMode,
} from "@/app/constants";
import type { CurrentRound, Lobby, Player, UserData } from "@/app/types";
import { dealRoles, scoreRound } from "@/app/roles";
import { modeFromPlayMode, trackLobbyJoined } from "@/utils/analytics";
import {
  getOrCreatePlayerId,
  getStoredPlayerName,
  setStoredPlayerName,
} from "@/utils/identity";
import { shouldSuppressRejoin } from "@/utils/lobbyLeave";

export type Store = {
  user: UserData;
  lobby: Lobby | null;
  error: string;
  loading: boolean;
};

type Listener = () => void;

const store: Store = {
  user: { userFetched: false },
  lobby: null,
  error: "",
  loading: false,
};

let revision = 0;
const listeners = new Set<Listener>();

function emit() {
  revision += 1;
  listeners.forEach((l) => l());
}

export function notifyStore() {
  emit();
}

export function getStore(): Store {
  return store;
}

export function getStoreRevision(): number {
  return revision;
}

export function getStoreError(): string {
  return store.error;
}

export function subscribeStore(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function patchStoreLobby(lobby: Lobby | null) {
  store.lobby = lobby;
  emit();
}

export function patchStoreUser(partial: Partial<UserData>) {
  store.user = { ...store.user, ...partial };
  emit();
}

function setUser(partial: Partial<UserData>) {
  store.user = { ...store.user, ...partial };
  emit();
}

function setLobby(lobby: Lobby | null) {
  store.lobby = lobby;
  emit();
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

/**
 * No Firebase Auth. Load local UUID + display name from localStorage only.
 */
export async function initializeUser() {
  const userId = getOrCreatePlayerId();
  const playerName = getStoredPlayerName();
  const storedLobby =
    typeof window !== "undefined" ? localStorage.getItem(CP.lobbyCode) : null;
  setUser({
    userId,
    playerName,
    userFetched: true,
    playerLobbyCode: store.user.playerLobbyCode ?? storedLobby ?? null,
  });
}

async function upsertUserDoc(userId: string, data: Partial<UserData>) {
  const payload: Record<string, unknown> = {
    userId,
    updatedAt: new Date().toISOString(),
    ...data,
  };
  if (data.playerLobbyCode === null) {
    payload.playerLobbyCode = deleteField();
  }
  await setDoc(doc(db, CP_TABLES.USERS, userId), payload, { merge: true });
}

export async function updateUserData(
  userId: string,
  newUserData: Partial<UserData>,
  opts?: { syncRemote?: boolean }
) {
  setUser(newUserData);
  if (newUserData.playerName) {
    setStoredPlayerName(newUserData.playerName);
  }
  if ("playerLobbyCode" in newUserData) {
    if (newUserData.playerLobbyCode) {
      localStorage.setItem(CP.lobbyCode, String(newUserData.playerLobbyCode));
    } else {
      localStorage.removeItem(CP.lobbyCode);
    }
  }
  if (opts?.syncRemote === false) return;
  try {
    await upsertUserDoc(userId, newUserData);
  } catch {
    // local identity is enough
  }
}

export async function setDisplayName(name: string) {
  const trimmed = name.trim().slice(0, 24);
  if (!trimmed) return { ok: false as const, error: "Name required" };
  setStoredPlayerName(trimmed);
  const userId = store.user.userId || getOrCreatePlayerId();
  setUser({ userId, playerName: trimmed });
  const lobby = store.lobby;
  if (lobby?.lobbyCode && lobby.playMode === PLAY_MODE.ONLINE) {
    try {
      const players = (lobby.players || []).map((p) =>
        p.userId === userId ? { ...p, name: trimmed } : p
      );
      await updateDoc(doc(db, CP_TABLES.LOBBIES, lobby.lobbyCode), { players });
      void updateUserData(userId, { playerName: trimmed });
    } catch (error) {
      console.error("setDisplayName lobby update", error);
    }
  }
  return { ok: true as const };
}

export async function createLobby(
  lobbyCode: string,
  hostId: string,
  playMode: PlayMode = PLAY_MODE.ONLINE,
  hostName = "Host"
) {
  try {
    const hostPlayer: Player = {
      userId: hostId,
      name: hostName.trim() || "Host",
      isHost: true,
    };
    const lobby: Lobby = {
      lobbyCode,
      playMode,
      hostId,
      gameState: GAME_STATE.LOBBY,
      players: [hostPlayer],
      revealMode: REVEAL_MODE.POLICE_ONLY,
      targetRounds: constants.defaultTargetRounds,
      round: 0,
      currentRound: null,
      scores: {},
      createdAt: new Date(),
    };
    await setDoc(doc(db, CP_TABLES.LOBBIES, lobbyCode), lobby);
    setLobby({ ...lobby, lobbyFetched: true });
    setUser({ playerLobbyCode: lobbyCode });
    if (typeof window !== "undefined") {
      localStorage.setItem(CP.lobbyCode, lobbyCode);
    }
    return { ok: true as const, data: { lobbyCode } };
  } catch (error) {
    console.error("createLobby", error);
    return {
      ok: false as const,
      error:
        "Failed to create lobby — deploy chorpolice Firestore rules (open, no Auth) on akxh-games",
    };
  }
}

export function patchLobbyFields(partial: Partial<Lobby>) {
  const current = store.lobby;
  if (!current) return;
  setLobby({ ...current, ...partial, lobbyFetched: true });
}

export async function joinLobby(lobbyCode: string, userId: string, playerName: string) {
  try {
    if (shouldSuppressRejoin()) {
      return { ok: false as const, message: "Left lobby; rejoin from the home screen." };
    }

    const code = String(lobbyCode).toUpperCase();
    const lobbyRef = doc(db, CP_TABLES.LOBBIES, code);
    const snap = await getDoc(lobbyRef);
    if (!snap.exists()) {
      return { ok: false as const, message: "Lobby not found." };
    }
    const existing = snap.data() as Lobby;

    if (existing.gameState !== GAME_STATE.LOBBY) {
      const alreadyIn = (existing.players || []).some((p) => p.userId === userId);
      if (!alreadyIn) {
        return { ok: false as const, message: "This game has already started." };
      }
      setLobby({ ...existing, lobbyCode: code, lobbyFetched: true });
      setUser({ playerLobbyCode: code });
      return { ok: true as const, data: existing };
    }

    const players = [...(existing.players || [])];
    const idx = players.findIndex((p) => p.userId === userId);
    if (idx === -1) {
      if (players.length >= constants.maxPlayers) {
        return { ok: false as const, message: "Lobby is full (4 players)." };
      }
      const name =
        playerName.trim() ||
        getStoredPlayerName() ||
        `Player ${players.length + 1}`;
      players.push({
        userId,
        name,
        isHost: existing.hostId === userId || players.length === 0,
      });
      await updateDoc(lobbyRef, { players });
      trackLobbyJoined(modeFromPlayMode(existing.playMode));
    }

    await updateUserData(userId, {
      playerLobbyCode: code,
      playerName: playerName.trim() || undefined,
    });
    const refreshed = (await getDoc(lobbyRef)).data() as Lobby;
    setLobby({ ...refreshed, lobbyCode: code, lobbyFetched: true });
    return { ok: true as const, data: refreshed };
  } catch (error) {
    console.error("joinLobby", error);
    return {
      ok: false as const,
      message:
        "Could not join lobby. Deploy chorpolice Firestore rules (no Auth) on akxh-games.",
    };
  }
}

export async function leaveLobby(lobbyCode: string, userId: string) {
  clearClientLobbyMembership();

  try {
    const lobbyRef = doc(db, CP_TABLES.LOBBIES, lobbyCode);
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(lobbyRef);
      if (!snap.exists()) return;
      const lobby = snap.data() as Lobby;
      const players = (lobby.players || []).filter((p) => p.userId !== userId);
      const patch: Record<string, unknown> = { players };
      if (lobby.hostId === userId && players.length) {
        patch.hostId = players[0].userId;
        players[0] = { ...players[0], isHost: true };
        patch.players = players;
      }
      tx.update(lobbyRef, patch);
    });
  } catch (error) {
    console.error("leaveLobby firestore", error);
  }

  void upsertUserDoc(userId, { playerLobbyCode: null }).catch(() => {});
}

export function clearClientLobbyMembership() {
  setUser({ playerLobbyCode: null });
  if (typeof window !== "undefined") {
    localStorage.removeItem(CP.lobbyCode);
  }
  setLobby(null);
}

export function subscribeLobby(lobbyCode: string) {
  const code = String(lobbyCode).toUpperCase();
  return onSnapshot(
    doc(db, CP_TABLES.LOBBIES, code),
    (snap) => {
      if (!snap.exists()) {
        store.error = "";
        setLobby({
          lobbyCode: code,
          playMode: PLAY_MODE.ONLINE,
          hostId: "",
          gameState: GAME_STATE.LOBBY,
          players: [],
          lobbyFetched: true,
          missing: true,
        });
        return;
      }
      store.error = "";
      setLobby({
        ...(snap.data() as Lobby),
        lobbyCode: code,
        lobbyFetched: true,
        missing: false,
      });
    },
    (error) => {
      console.error("subscribeLobby", error);
      store.error =
        "Could not connect to lobby. Deploy chorpolice Firestore rules on akxh-games (no Auth).";
      setLobby({
        lobbyCode: code,
        playMode: PLAY_MODE.ONLINE,
        hostId: "",
        gameState: GAME_STATE.LOBBY,
        players: [],
        lobbyFetched: true,
        missing: true,
      });
    }
  );
}

export async function setRevealMode(lobbyCode: string, revealMode: RevealMode) {
  await updateDoc(doc(db, CP_TABLES.LOBBIES, lobbyCode), { revealMode });
}

export async function setTargetRounds(lobbyCode: string, targetRounds: number) {
  const clamped = Math.min(
    constants.maxTargetRounds,
    Math.max(constants.minTargetRounds, Math.round(targetRounds))
  );
  await updateDoc(doc(db, CP_TABLES.LOBBIES, lobbyCode), { targetRounds: clamped });
}

function buildRound(players: Player[]): CurrentRound {
  const roles = dealRoles(players.map((p) => p.userId));
  return {
    roles,
    peekedIds: [],
    hotseatPeekId: players[0]?.userId || null,
    accusedId: null,
    scoresDelta: {},
    caught: null,
    startedAt: Date.now(),
  };
}

export async function startGame(lobbyCode: string) {
  const lobbyRef = doc(db, CP_TABLES.LOBBIES, lobbyCode);
  const snap = await getDoc(lobbyRef);
  if (!snap.exists()) return { ok: false as const, error: "Lobby not found" };
  const lobby = snap.data() as Lobby;
  const players = lobby.players || [];
  if (players.length !== constants.minPlayers) {
    return {
      ok: false as const,
      error: `Need exactly ${constants.minPlayers} players`,
    };
  }

  const round = buildRound(players);
  await updateDoc(lobbyRef, {
    gameState: GAME_STATE.PEEKING,
    round: 1,
    currentRound: round,
    scores: lobby.scores || {},
  });
  return { ok: true as const, playerCount: players.length };
}

export async function confirmPeek(lobbyCode: string, playerId: string) {
  const lobbyRef = doc(db, CP_TABLES.LOBBIES, lobbyCode);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(lobbyRef);
    if (!snap.exists()) throw new Error("Lobby missing");
    const lobby = snap.data() as Lobby;
    if (lobby.gameState !== GAME_STATE.PEEKING || !lobby.currentRound) {
      throw new Error("Not peeking");
    }
    const peeked = new Set(lobby.currentRound.peekedIds || []);
    peeked.add(playerId);
    const peekedIds = [...peeked];
    const players = lobby.players || [];
    const allPeeked = players.every((p) => peeked.has(p.userId));

    if (allPeeked) {
      tx.update(lobbyRef, {
        gameState: GAME_STATE.ACCUSING,
        currentRound: {
          ...lobby.currentRound,
          peekedIds,
          hotseatPeekId: null,
        },
      });
    } else {
      tx.update(lobbyRef, {
        currentRound: {
          ...lobby.currentRound,
          peekedIds,
        },
      });
    }
  });
  return { ok: true as const };
}

export async function hostSkipToAccuse(lobbyCode: string) {
  const lobbyRef = doc(db, CP_TABLES.LOBBIES, lobbyCode);
  const snap = await getDoc(lobbyRef);
  if (!snap.exists()) return { ok: false as const, error: "Lobby not found" };
  const lobby = snap.data() as Lobby;
  if (lobby.gameState !== GAME_STATE.PEEKING || !lobby.currentRound) {
    return { ok: false as const, error: "Not peeking" };
  }
  await updateDoc(lobbyRef, {
    gameState: GAME_STATE.ACCUSING,
    currentRound: {
      ...lobby.currentRound,
      hotseatPeekId: null,
    },
  });
  return { ok: true as const };
}

export async function accuseChor(lobbyCode: string, policeId: string, accusedId: string) {
  const lobbyRef = doc(db, CP_TABLES.LOBBIES, lobbyCode);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(lobbyRef);
    if (!snap.exists()) throw new Error("Lobby missing");
    const lobby = snap.data() as Lobby;
    if (lobby.gameState !== GAME_STATE.ACCUSING || !lobby.currentRound) {
      throw new Error("Not accusing");
    }
    const roles = lobby.currentRound.roles || {};
    if (roles[policeId] !== "police") {
      throw new Error("Only Police can accuse");
    }
    if (!accusedId || accusedId === policeId) {
      throw new Error("Invalid accusation");
    }
    const { scoresDelta, caught } = scoreRound({ roles, accusedId });
    const scores = mergeScores(lobby.scores, scoresDelta);
    const roundNum = lobby.round || 1;
    const target = lobby.targetRounds || constants.defaultTargetRounds;
    const finished = roundNum >= target;

    tx.update(lobbyRef, {
      gameState: finished ? GAME_STATE.FINISHED : GAME_STATE.REVEAL,
      scores,
      currentRound: {
        ...lobby.currentRound,
        accusedId,
        scoresDelta,
        caught,
        hotseatPeekId: null,
      },
    });
  });
  return { ok: true as const };
}

export async function hostNextRound(lobbyCode: string) {
  const lobbyRef = doc(db, CP_TABLES.LOBBIES, lobbyCode);
  const snap = await getDoc(lobbyRef);
  if (!snap.exists()) return { ok: false as const, error: "Lobby not found" };
  const lobby = snap.data() as Lobby;
  if (lobby.gameState !== GAME_STATE.REVEAL && lobby.gameState !== GAME_STATE.FINISHED) {
    return { ok: false as const, error: "Round not finished" };
  }
  if (lobby.gameState === GAME_STATE.FINISHED) {
    return { ok: false as const, error: "Match finished — return to lobby" };
  }

  const players = lobby.players || [];
  if (players.length !== 4) {
    return { ok: false as const, error: "Need 4 players" };
  }
  const round = buildRound(players);
  await updateDoc(lobbyRef, {
    gameState: GAME_STATE.PEEKING,
    round: (lobby.round || 0) + 1,
    currentRound: round,
  });
  return { ok: true as const };
}

export async function returnToLobby(lobbyCode: string) {
  await updateDoc(doc(db, CP_TABLES.LOBBIES, lobbyCode), {
    gameState: GAME_STATE.LOBBY,
    currentRound: null,
    round: 0,
    scores: {},
  });
}
