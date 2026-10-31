"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  constants,
  GAME_STATE,
  PLAY_MODE,
  CP,
  REVEAL_MODE,
} from "@/app/constants";
import { ROLE_META, findPlayerIdForRole, type RoleId } from "@/app/roles";
import { useLobby, useUser } from "@/hooks";
import {
  accuseChor,
  clearClientLobbyMembership,
  confirmPeek,
  hostNextRound,
  hostSkipToAccuse,
  joinLobby,
  leaveLobby,
  returnToLobby,
  setRevealMode,
  setTargetRounds,
  startGame,
  subscribeLobby,
} from "@/utils/firebase/firebaseHelpers";
import {
  clearLocalLobby,
  hydrateLocalIfMatch,
  isLocalHotseatCode,
  localAccuseChor,
  localAddPlayer,
  localConfirmPeek,
  localHostNextRound,
  localRemovePlayer,
  localReturnToLobby,
  localSetRevealMode,
  localSetTargetRounds,
  localSkipToAccuse,
  localStartGame,
} from "@/utils/localLobby";
import NameEditor from "@/app/components/NameEditor";
import {
  modeFromPlayMode,
  trackAccuseCast,
  trackGameStarted,
  trackRolePeeked,
  trackRoundFinished,
} from "@/utils/analytics";
import {
  clearSuppressRejoin,
  markLeftLobby,
  shouldSuppressRejoin,
} from "@/utils/lobbyLeave";

export default function LobbyPage() {
  const params = useParams();
  const router = useRouter();
  const lobbyCode = String(params.lobbyCode || "").toUpperCase();
  const lobby = useLobby();
  const { userId, playerName, userFetched, booted } = useUser();
  const [hotseatName, setHotseatName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [passCover, setPassCover] = useState(true);
  const [accusedDraft, setAccusedDraft] = useState<string | null>(null);
  const joinedRef = useRef(false);

  const local = lobby?.playMode === PLAY_MODE.HOTSEAT || isLocalHotseatCode(lobbyCode);
  const isHost = local || (!!userId && lobby?.hostId === userId);
  const players = lobby?.players || [];
  const round = lobby?.currentRound;
  const roles = round?.roles || {};
  const myRole = userId ? (roles[userId] as RoleId | undefined) : undefined;
  const policeId = findPlayerIdForRole(roles, "police");
  const rajaId = findPlayerIdForRole(roles, "raja");
  const iAmPolice = !!userId && userId === policeId;
  const revealMode = lobby?.revealMode || REVEAL_MODE.POLICE_ONLY;
  const scores = lobby?.scores || {};

  useEffect(() => {
    if (hydrateLocalIfMatch(lobbyCode)) return;
    if (shouldSuppressRejoin()) {
      clearClientLobbyMembership();
      router.replace("/");
      return;
    }
    if (!booted || !userFetched || !userId) return;
    const unsub = subscribeLobby(lobbyCode);
    return () => unsub();
  }, [lobbyCode, booted, userFetched, userId, router]);

  useEffect(() => {
    if (local || joinedRef.current || !userId || !userFetched) return;
    if (shouldSuppressRejoin()) return;
    joinedRef.current = true;
    clearSuppressRejoin();
    const name =
      playerName ||
      (typeof window !== "undefined" ? localStorage.getItem(CP.playerName) : "") ||
      "Player";
    void joinLobby(lobbyCode, userId, name).then((res) => {
      if (!res.ok) setError(res.message || "Could not join");
    });
  }, [local, userId, userFetched, lobbyCode, playerName]);

  useEffect(() => {
    setPassCover(true);
    setAccusedDraft(null);
  }, [lobby?.gameState, lobby?.round, lobby?.currentRound?.hotseatPeekId]);

  useEffect(() => {
    if (
      (lobby?.gameState === GAME_STATE.REVEAL || lobby?.gameState === GAME_STATE.FINISHED) &&
      lobby.round != null &&
      round
    ) {
      trackRoundFinished({
        mode: modeFromPlayMode(lobby.playMode),
        round: lobby.round,
        lobbyCode,
        caught: !!round.caught,
      });
    }
  }, [lobby?.gameState, lobby?.round, lobby?.playMode, lobbyCode, round?.caught]);

  const scoreboard = useMemo(() => {
    return [...players]
      .map((p) => ({
        ...p,
        score: scores[p.userId] || 0,
        delta: round?.scoresDelta?.[p.userId],
        role: roles[p.userId] as RoleId | undefined,
      }))
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  }, [players, scores, round?.scoresDelta, roles]);

  const policePlayer = players.find((p) => p.userId === policeId);
  const rajaPlayer = players.find((p) => p.userId === rajaId);

  const suspectIds = useMemo(() => {
    if (!policeId) return [];
    return players
      .filter((p) => p.userId !== policeId)
      .filter((p) => {
        if (revealMode === REVEAL_MODE.RAJA_AND_POLICE && rajaId && p.userId === rajaId) {
          return false;
        }
        return true;
      })
      .map((p) => p.userId);
  }, [players, policeId, rajaId, revealMode]);

  const onLeave = async () => {
    markLeftLobby();
    if (local) {
      clearLocalLobby();
      clearClientLobbyMembership();
    } else if (userId) {
      await leaveLobby(lobbyCode, userId);
    }
    router.replace("/");
  };

  const onAddHotseat = (e: FormEvent) => {
    e.preventDefault();
    const res = localAddPlayer(hotseatName);
    if (!res.ok) setError(res.message);
    else {
      setHotseatName("");
      setError("");
    }
  };

  const onStart = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = local ? localStartGame() : await startGame(lobbyCode);
      if (!res.ok) {
        setError(res.error || "Could not start");
        return;
      }
      trackGameStarted({
        mode: modeFromPlayMode(lobby?.playMode),
        playerCount: res.playerCount || players.length,
        lobbyCode,
      });
    } finally {
      setBusy(false);
    }
  };

  const onPeekConfirm = async () => {
    if (!userId && !local) return;
    const peekId = local
      ? lobby?.currentRound?.hotseatPeekId || players[0]?.userId
      : userId;
    if (!peekId) return;
    setBusy(true);
    try {
      if (local) localConfirmPeek(peekId);
      else await confirmPeek(lobbyCode, peekId);
      trackRolePeeked(modeFromPlayMode(lobby?.playMode));
      if (local) setPassCover(true);
    } finally {
      setBusy(false);
    }
  };

  const onAccuse = async () => {
    if (!accusedDraft || !policeId) return;
    setBusy(true);
    try {
      if (local) {
        const res = localAccuseChor(policeId, accusedDraft);
        if (!res.ok) {
          setError(res.error || "Could not accuse");
          return;
        }
      } else {
        await accuseChor(lobbyCode, policeId, accusedDraft);
      }
      const caught = accusedDraft === findPlayerIdForRole(roles, "chor");
      trackAccuseCast(modeFromPlayMode(lobby?.playMode), caught);
    } finally {
      setBusy(false);
    }
  };

  const onNext = async () => {
    setBusy(true);
    try {
      if (local) localHostNextRound();
      else await hostNextRound(lobbyCode);
    } finally {
      setBusy(false);
    }
  };

  const onReturnLobby = async () => {
    setBusy(true);
    try {
      if (local) localReturnToLobby();
      else await returnToLobby(lobbyCode);
    } finally {
      setBusy(false);
    }
  };

  if (!lobby?.lobbyFetched && !local) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-[var(--CP-muted)]">Loading lobby…</p>
      </main>
    );
  }

  if (lobby?.missing) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <p className="text-lg">Lobby not found</p>
        <p className="text-sm text-[var(--CP-muted)] max-w-xs">
          Check the code, or deploy chorpolice Firestore rules on akxh-games.
        </p>
        <button type="button" className="CP-btn" onClick={() => router.replace("/")}>
          Home
        </button>
      </main>
    );
  }

  const hotseatPeekId = round?.hotseatPeekId;
  const hotseatPeekPlayer = players.find((p) => p.userId === hotseatPeekId);
  const peekRoleId = local
    ? (hotseatPeekId ? (roles[hotseatPeekId] as RoleId | undefined) : undefined)
    : myRole;
  const alreadyPeeked =
    !!userId && (round?.peekedIds || []).includes(userId);

  return (
    <main className="flex flex-1 flex-col animate-riseIn gap-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-[var(--CP-muted)]">
            Chor Police
          </p>
          <h1 className="CP-brand text-3xl leading-none mt-1">{lobbyCode}</h1>
          <p className="text-sm text-[var(--CP-muted)] mt-1">
            {local ? "Pass & play" : "Online"} · Round {lobby?.round || 0}/
            {lobby?.targetRounds || constants.defaultTargetRounds}
          </p>
        </div>
        <button type="button" className="CP-btn-ghost text-sm py-2 px-3" onClick={onLeave}>
          Leave
        </button>
      </header>

      {error && (
        <p className="text-sm text-[var(--CP-catch)]" role="alert">
          {error}
        </p>
      )}

      {lobby?.gameState === GAME_STATE.LOBBY && (
        <section className="space-y-4">
          <div className="CP-panel rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl">Players</h2>
              <span className="text-sm text-[var(--CP-muted)]">
                {players.length}/{constants.maxPlayers}
              </span>
            </div>
            <ul className="space-y-2">
              {players.map((p) => (
                <li
                  key={p.userId}
                  className="flex items-center justify-between rounded-xl bg-black/20 px-3 py-2"
                >
                  <span>
                    {p.name}
                    {p.isHost || p.userId === lobby.hostId ? (
                      <span className="ml-2 text-xs text-[var(--CP-accent)]">host</span>
                    ) : null}
                    {p.userId === userId ? (
                      <span className="ml-2 text-xs text-[var(--CP-muted)]">you</span>
                    ) : null}
                  </span>
                  {local && p.userId !== lobby.hostId && (
                    <button
                      type="button"
                      className="text-xs text-[var(--CP-muted)] underline"
                      onClick={() => localRemovePlayer(p.userId)}
                    >
                      remove
                    </button>
                  )}
                </li>
              ))}
            </ul>

            {local && players.length < constants.maxPlayers && (
              <form onSubmit={onAddHotseat} className="flex gap-2">
                <input
                  className="CP-input py-2"
                  value={hotseatName}
                  onChange={(e) => setHotseatName(e.target.value.slice(0, 24))}
                  placeholder="Add player name"
                  maxLength={24}
                />
                <button type="submit" className="CP-btn py-2 px-3 text-sm shrink-0">
                  Add
                </button>
              </form>
            )}

            {!local && (
              <div className="pt-1">
                <NameEditor name={playerName} compact />
              </div>
            )}
          </div>

          <div className="CP-panel rounded-2xl p-4 space-y-3">
            <h2 className="font-display text-xl">Rules this match</h2>
            <p className="text-sm text-[var(--CP-muted)]">
              Roles: Raja 1000 · Rani 800 · Police 500 · Chor 0. Police finds Chor —
              wrong guess gives Chor the 500.
            </p>

            <div className="space-y-2">
              <p className="text-xs uppercase tracking-widest text-[var(--CP-muted)]">
                Before the guess
              </p>
              <button
                type="button"
                className={`CP-chip w-full ${revealMode === REVEAL_MODE.POLICE_ONLY ? "CP-chip-on" : ""}`}
                disabled={!isHost}
                onClick={() => {
                  if (local) localSetRevealMode(REVEAL_MODE.POLICE_ONLY);
                  else void setRevealMode(lobbyCode, REVEAL_MODE.POLICE_ONLY);
                }}
              >
                Police public · guess among 3 (default)
              </button>
              <button
                type="button"
                className={`CP-chip w-full ${revealMode === REVEAL_MODE.RAJA_AND_POLICE ? "CP-chip-on" : ""}`}
                disabled={!isHost}
                onClick={() => {
                  if (local) localSetRevealMode(REVEAL_MODE.RAJA_AND_POLICE);
                  else void setRevealMode(lobbyCode, REVEAL_MODE.RAJA_AND_POLICE);
                }}
              >
                Raja + Police public · classic 2 suspects
              </button>
            </div>

            <label className="block text-sm text-[var(--CP-muted)]">
              Rounds
              <input
                type="number"
                className="CP-input mt-1"
                min={constants.minTargetRounds}
                max={constants.maxTargetRounds}
                value={lobby.targetRounds || constants.defaultTargetRounds}
                disabled={!isHost}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (local) localSetTargetRounds(n);
                  else void setTargetRounds(lobbyCode, n);
                }}
              />
            </label>
          </div>

          {isHost ? (
            <button
              type="button"
              className="CP-btn w-full"
              disabled={busy || players.length !== 4}
              onClick={onStart}
            >
              {players.length !== 4 ? `Need 4 players (${players.length}/4)` : "Deal roles"}
            </button>
          ) : (
            <p className="text-center text-sm text-[var(--CP-muted)]">
              Waiting for host to deal…
            </p>
          )}
        </section>
      )}

      {lobby?.gameState === GAME_STATE.PEEKING && round && (
        <section className="space-y-4">
          {local && passCover ? (
            <div className="CP-panel rounded-2xl p-6 text-center space-y-4 animate-scaleIn">
              <p className="text-sm uppercase tracking-[0.25em] text-[var(--CP-muted)]">
                Pass the phone
              </p>
              <p className="font-display text-3xl">
                {hotseatPeekPlayer?.name || "Next player"}
              </p>
              <p className="text-[var(--CP-muted)] text-sm">
                Only this person should look — then hide the screen.
              </p>
              <button type="button" className="CP-btn w-full" onClick={() => setPassCover(false)}>
                I&apos;m {hotseatPeekPlayer?.name || "ready"} — show my role
              </button>
            </div>
          ) : (
            <div className="space-y-4 animate-scaleIn">
              <div
                className="CP-role"
                style={{ borderColor: peekRoleId ? ROLE_META[peekRoleId].accent : undefined }}
              >
                <p className="text-xs uppercase tracking-[0.3em] text-[var(--CP-muted)]">
                  Your secret role
                </p>
                {peekRoleId ? (
                  <>
                    <p
                      className="font-display text-5xl mt-2"
                      style={{ color: ROLE_META[peekRoleId].accent }}
                    >
                      {ROLE_META[peekRoleId].label}
                    </p>
                    <p className="text-sm text-[var(--CP-muted)] mt-1">
                      {ROLE_META[peekRoleId].hindi} · {ROLE_META[peekRoleId].basePoints} pts
                    </p>
                    <p className="mt-3 text-[var(--CP-text)]">{ROLE_META[peekRoleId].blurb}</p>
                  </>
                ) : (
                  <p className="mt-3 text-[var(--CP-muted)]">Waiting for your deal…</p>
                )}
              </div>

              {!local && alreadyPeeked ? (
                <p className="text-center text-sm text-[var(--CP-muted)]">
                  Role locked in. Waiting for everyone…
                </p>
              ) : (
                <button
                  type="button"
                  className="CP-btn w-full"
                  disabled={busy || !peekRoleId}
                  onClick={onPeekConfirm}
                >
                  {local ? "Hide & pass" : "Got it — hide my role"}
                </button>
              )}

              {isHost && (
                <button
                  type="button"
                  className="CP-btn-ghost w-full text-sm"
                  onClick={() => {
                    if (local) localSkipToAccuse();
                    else void hostSkipToAccuse(lobbyCode);
                  }}
                >
                  Everyone ready — start Police guess
                </button>
              )}
            </div>
          )}

          <p className="text-center text-xs text-[var(--CP-muted)]">
            Peeked {(round.peekedIds || []).length}/{players.length}
          </p>
        </section>
      )}

      {lobby?.gameState === GAME_STATE.ACCUSING && round && (
        <section className="space-y-4 animate-riseIn">
          <div className="CP-panel rounded-2xl p-4 text-center space-y-2">
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--CP-muted)]">
              Police on duty
            </p>
            <p className="font-display text-3xl" style={{ color: ROLE_META.police.accent }}>
              {policePlayer?.name || "Police"}
            </p>
            {revealMode === REVEAL_MODE.RAJA_AND_POLICE && rajaPlayer && (
              <p className="text-sm text-[var(--CP-muted)]">
                Raja revealed: <span className="text-[var(--CP-accent)]">{rajaPlayer.name}</span>
              </p>
            )}
            <p className="text-sm text-[var(--CP-text)]">
              One guess — who is the Chor?
            </p>
          </div>

          {(local || iAmPolice) ? (
            <div className="space-y-2">
              {suspectIds.map((id) => {
                const p = players.find((x) => x.userId === id);
                if (!p) return null;
                return (
                  <button
                    key={id}
                    type="button"
                    className={`CP-suspect ${accusedDraft === id ? "CP-suspect-on" : ""}`}
                    onClick={() => setAccusedDraft(id)}
                  >
                    {p.name}
                  </button>
                );
              })}
              <button
                type="button"
                className="CP-btn-danger w-full mt-2"
                disabled={!accusedDraft || busy}
                onClick={onAccuse}
              >
                Accuse
              </button>
            </div>
          ) : (
            <p className="text-center text-[var(--CP-muted)]">
              Waiting for {policePlayer?.name || "Police"} to accuse…
            </p>
          )}
        </section>
      )}

      {(lobby?.gameState === GAME_STATE.REVEAL || lobby?.gameState === GAME_STATE.FINISHED) &&
        round && (
          <section className="space-y-4 animate-scaleIn">
            <div className="CP-panel rounded-2xl p-5 text-center">
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--CP-muted)]">
                {round.caught ? "Pakda gaya" : "Chhoot gaya"}
              </p>
              <p
                className="font-display text-4xl mt-2"
                style={{ color: round.caught ? ROLE_META.police.accent : ROLE_META.chor.accent }}
              >
                {round.caught ? "Chor caught" : "Chor escaped"}
              </p>
              <p className="mt-2 text-sm text-[var(--CP-muted)]">
                Accused:{" "}
                {players.find((p) => p.userId === round.accusedId)?.name || "—"}
              </p>
            </div>

            <div className="CP-panel rounded-2xl p-4 space-y-2">
              <h2 className="font-display text-xl">Roles</h2>
              <ul className="space-y-2">
                {players.map((p) => {
                  const role = roles[p.userId] as RoleId | undefined;
                  const meta = role ? ROLE_META[role] : null;
                  const delta = round.scoresDelta?.[p.userId] ?? 0;
                  return (
                    <li
                      key={p.userId}
                      className="flex items-center justify-between rounded-xl bg-black/20 px-3 py-2"
                    >
                      <div>
                        <p className="font-medium">{p.name}</p>
                        <p className="text-xs" style={{ color: meta?.accent }}>
                          {meta?.label || "—"}
                        </p>
                      </div>
                      <p className="font-semibold tabular-nums">
                        +{delta}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="CP-panel rounded-2xl p-4 space-y-2">
              <h2 className="font-display text-xl">Scoreboard</h2>
              <ol className="space-y-2">
                {scoreboard.map((p, i) => (
                  <li key={p.userId} className="flex justify-between text-sm">
                    <span>
                      {i + 1}. {p.name}
                    </span>
                    <span className="tabular-nums font-semibold">{p.score}</span>
                  </li>
                ))}
              </ol>
            </div>

            {isHost && lobby.gameState === GAME_STATE.REVEAL && (
              <button type="button" className="CP-btn w-full" disabled={busy} onClick={onNext}>
                Next round
              </button>
            )}
            {isHost && (
              <button
                type="button"
                className="CP-btn-ghost w-full"
                disabled={busy}
                onClick={onReturnLobby}
              >
                {lobby.gameState === GAME_STATE.FINISHED ? "Back to lobby" : "End match → lobby"}
              </button>
            )}
            {!isHost && (
              <p className="text-center text-sm text-[var(--CP-muted)]">
                Waiting for host…
              </p>
            )}
          </section>
        )}
    </main>
  );
}
