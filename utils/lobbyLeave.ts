/**
 * After Leave, block auto-rejoin until the player intentionally
 * creates / joins again (same pattern as siblings).
 */
export const CP_SUPPRESS_REJOIN_KEY = "chorpolice_suppress_rejoin";

export function markLeftLobby() {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(CP_SUPPRESS_REJOIN_KEY, "1");
  localStorage.setItem(CP_SUPPRESS_REJOIN_KEY, "1");
}

export function clearSuppressRejoin() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(CP_SUPPRESS_REJOIN_KEY);
  localStorage.removeItem(CP_SUPPRESS_REJOIN_KEY);
}

export function shouldSuppressRejoin(): boolean {
  if (typeof window === "undefined") return false;
  return (
    sessionStorage.getItem(CP_SUPPRESS_REJOIN_KEY) === "1" ||
    localStorage.getItem(CP_SUPPRESS_REJOIN_KEY) === "1"
  );
}
