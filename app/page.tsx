"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { constants, PLAY_MODE, CP } from "./constants";
import { useUser } from "@/hooks";
import {
  createLobby,
  leaveLobby,
  setDisplayName,
} from "@/utils/firebase/firebaseHelpers";
import { createLocalHotseat } from "@/utils/localLobby";
import { generateLobbyCode } from "@/utils";
import { trackLobbyCreated } from "@/utils/analytics";
import NameEditor from "./components/NameEditor";
import {
  clearSuppressRejoin,
  shouldSuppressRejoin,
} from "@/utils/lobbyLeave";

export default function HomePage() {
  const router = useRouter();
  const { playerName, userId, userFetched, playerLobbyCode, booted } = useUser();
  const [nameDraft, setNameDraft] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [needsName, setNeedsName] = useState(false);

  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem(CP.playerName) : "";
    if (stored) setNameDraft(stored);
    else if (playerName) setNameDraft(playerName);
    setNeedsName(!(stored || playerName));
  }, [playerName]);

  useEffect(() => {
    if (!booted || !userFetched) return;

    if (shouldSuppressRejoin()) {
      if (playerLobbyCode && userId) {
        void leaveLobby(playerLobbyCode, userId);
      }
      return;
    }

    if (playerLobbyCode) {
      router.replace(`/lobby/${playerLobbyCode}`);
    }
  }, [booted, userFetched, playerLobbyCode, userId, router]);

  const ensureName = async () => {
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      setNeedsName(true);
      setError("Enter a display name first.");
      return null;
    }
    await setDisplayName(trimmed);
    setNeedsName(false);
    return trimmed;
  };

  const onSaveName = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    await ensureName();
  };

  const createOnline = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const name = await ensureName();
      if (!name) return;
      const id = userId;
      if (!id) {
        setError("Could not create a local player id. Try refreshing.");
        return;
      }
      clearSuppressRejoin();
      const lobbyCode = generateLobbyCode();
      const result = await createLobby(lobbyCode, id, PLAY_MODE.ONLINE, name);
      if (!result.ok) {
        setError(
          "Could not create lobby. Deploy chorpolice Firestore rules on akxh-games (no Auth required)."
        );
        return;
      }
      trackLobbyCreated("online");
      router.push(`/lobby/${lobbyCode}`);
    } catch {
      setError("Online lobby needs Firebase project env + open chorpolice_* rules.");
    } finally {
      setBusy(false);
    }
  };

  const createPassPlay = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const name = await ensureName();
      if (!name) return;
      clearSuppressRejoin();
      const lobby = createLocalHotseat(name);
      trackLobbyCreated("pass_and_play");
      router.push(`/lobby/${lobby.lobbyCode}`);
    } catch {
      setError("Could not start pass & play.");
    } finally {
      setBusy(false);
    }
  };

  const joinGame = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length !== constants.lobbyCodeLength) return;
    const name = await ensureName();
    if (!name) return;
    clearSuppressRejoin();
    router.push(`/lobby/${trimmed}`);
  };

  return (
    <main className="flex flex-1 flex-col justify-center animate-riseIn">
      <header className="mb-8 text-center">
        <p className="mb-3 text-xs uppercase tracking-[0.35em] text-[var(--CP-muted)]">
          AkxH Games
        </p>
        <img
          src="/chorpolice-logo.svg"
          alt=""
          width={72}
          height={72}
          className="mx-auto mb-4 h-[72px] w-[72px] animate-scaleIn"
        />
        <h1 className="CP-brand text-6xl sm:text-7xl leading-none animate-scaleIn">
          Chor Police
        </h1>
        <p className="mt-4 text-[var(--CP-text)] text-lg max-w-sm mx-auto font-medium">
          Find the Chor.
        </p>
        <p className="mt-2 text-[var(--CP-muted)] text-sm max-w-sm mx-auto animate-pulseSoft">
          Secret roles. One Police guess. Classic parlor points.
        </p>
      </header>

      {(needsName || !playerName) && (
        <form onSubmit={onSaveName} className="CP-panel mb-5 rounded-2xl p-4 space-y-3">
          <label className="block text-sm text-[var(--CP-muted)]">Your name</label>
          <input
            className="CP-input"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value.slice(0, 24))}
            placeholder="What should we call you?"
            maxLength={24}
            autoFocus
          />
          <button type="submit" className="CP-btn w-full">
            Continue
          </button>
        </form>
      )}

      {playerName && !needsName && (
        <div className="mb-5 flex justify-center">
          <NameEditor name={playerName} />
        </div>
      )}

      <section className="CP-panel rounded-2xl p-5 space-y-4">
        <p className="text-center text-xs uppercase tracking-[0.25em] text-[var(--CP-muted)]">
          Have a code?
        </p>
        <form onSubmit={joinGame} className="flex flex-col gap-3">
          <input
            className="CP-input text-center tracking-[0.35em] uppercase"
            value={code}
            onChange={(e) =>
              setCode(
                e.target.value
                  .toUpperCase()
                  .replace(/[^A-Z0-9]/g, "")
                  .slice(0, constants.lobbyCodeLength)
              )
            }
            placeholder="Enter code"
            maxLength={constants.lobbyCodeLength}
            inputMode="text"
          />
          <button
            type="submit"
            className="CP-btn w-full"
            disabled={code.length !== constants.lobbyCodeLength || busy}
          >
            Join game
          </button>
        </form>

        <div className="flex items-center gap-3 py-1">
          <div className="h-px flex-1 bg-white/10" />
          <span className="text-xs uppercase tracking-widest text-[var(--CP-muted)]">or host</span>
          <div className="h-px flex-1 bg-white/10" />
        </div>

        <button
          type="button"
          className="CP-btn w-full"
          onClick={createPassPlay}
          disabled={busy}
        >
          {busy ? "Starting…" : "Pass & play"}
        </button>
        <button
          type="button"
          className="CP-btn-ghost w-full"
          onClick={createOnline}
          disabled={busy}
        >
          {busy ? "Creating…" : "Online lobby"}
        </button>
        <p className="text-center text-xs text-[var(--CP-muted)]">
          Exactly 4 players. No login — name stays on this device.
        </p>
      </section>

      {error && (
        <p className="mt-4 text-center text-sm text-[var(--CP-catch)]" role="alert">
          {error}
        </p>
      )}
    </main>
  );
}
