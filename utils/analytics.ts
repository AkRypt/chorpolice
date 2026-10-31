/**
 * Firebase Analytics (GA4) for Chor Police on shared akxh-games.
 * Every event includes `app: "chorpolice"`.
 */
import type { Analytics } from "firebase/analytics";

export const ANALYTICS_APP = "chorpolice";

export const ANALYTICS_EVENTS = {
  pageView: "page_view",
  lobbyCreated: "lobby_created",
  lobbyJoined: "lobby_joined",
  gameStarted: "game_started",
  rolePeeked: "role_peeked",
  accuseCast: "accuse_cast",
  roundFinished: "round_finished",
} as const;

export type AnalyticsMode = "online" | "pass_and_play";

type Params = Record<string, string | number>;

let loading: Promise<Analytics | null> | null = null;

function measurementId() {
  return process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID?.trim() || "";
}

async function analytics(): Promise<Analytics | null> {
  if (typeof window === "undefined") return null;
  if (!measurementId()) return null;
  if (!loading) {
    loading = (async () => {
      try {
        const { getAnalytics, initializeAnalytics, isSupported } = await import(
          "firebase/analytics"
        );
        const { app } = await import("@/utils/firebase/firebase");
        if (!(await isSupported())) return null;
        const config: Record<string, string | boolean> = { send_page_view: false };
        if (process.env.NODE_ENV === "development") config.debug_mode = true;
        try {
          return initializeAnalytics(app, { config });
        } catch {
          return getAnalytics(app);
        }
      } catch {
        return null;
      }
    })();
  }
  return loading;
}

export function claimOnce(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const full = `akxh_analytics:${ANALYTICS_APP}:${key}`;
    if (sessionStorage.getItem(full)) return false;
    sessionStorage.setItem(full, "1");
    return true;
  } catch {
    return true;
  }
}

export function modeFromPlayMode(playMode: string | undefined | null): AnalyticsMode {
  return playMode === "hotseat" ? "pass_and_play" : "online";
}

export function track(name: string, params: Params = {}) {
  void analytics().then(async (instance) => {
    if (!instance) return;
    const { logEvent } = await import("firebase/analytics");
    const send = logEvent as (
      analyticsInstance: Analytics,
      eventName: string,
      eventParams?: Params
    ) => void;
    send(instance, name, { app: ANALYTICS_APP, ...params });
  });
}

export function trackPageView(path: string) {
  const page_path = path || "/";
  const bucket = Math.floor(Date.now() / 1000);
  if (!claimOnce(`page:${page_path}:${bucket}`)) return;
  track(ANALYTICS_EVENTS.pageView, {
    page_path,
    page_title: typeof document !== "undefined" ? document.title : ANALYTICS_APP,
    page_location:
      typeof window !== "undefined" ? `${window.location.origin}${page_path}` : page_path,
  });
}

export function trackLobbyCreated(mode: AnalyticsMode) {
  track(ANALYTICS_EVENTS.lobbyCreated, { mode });
}

export function trackLobbyJoined(mode: AnalyticsMode) {
  track(ANALYTICS_EVENTS.lobbyJoined, { mode });
}

export function trackGameStarted(args: {
  mode: AnalyticsMode;
  playerCount: number;
  lobbyCode: string;
}) {
  if (!claimOnce(`game-start:${args.lobbyCode}`)) return;
  track(ANALYTICS_EVENTS.gameStarted, {
    mode: args.mode,
    player_count: Math.max(0, Math.round(args.playerCount)),
  });
}

export function trackRolePeeked(mode: AnalyticsMode) {
  track(ANALYTICS_EVENTS.rolePeeked, { mode });
}

export function trackAccuseCast(mode: AnalyticsMode, caught: boolean) {
  track(ANALYTICS_EVENTS.accuseCast, {
    mode,
    caught: caught ? 1 : 0,
  });
}

export function trackRoundFinished(args: {
  mode: AnalyticsMode;
  round: number;
  lobbyCode: string;
  caught: boolean;
}) {
  const round = Number.isFinite(args.round) ? args.round : 1;
  if (!claimOnce(`round-end:${args.lobbyCode}:${round}`)) return;
  track(ANALYTICS_EVENTS.roundFinished, {
    mode: args.mode,
    round,
    caught: args.caught ? 1 : 0,
  });
}
