import { constants } from "@/app/constants";

/** Ambiguous chars (0/O, 1/l/I) omitted for readable lobby codes. */
export function generateLobbyCode() {
  const characters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(
    { length: constants.lobbyCodeLength },
    () => characters[Math.floor(Math.random() * characters.length)]
  ).join("");
}

export function makeLocalPlayerId(name: string, index: number): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "player";
  return `local_${slug}_${index}_${Math.random().toString(36).slice(2, 6)}`;
}
