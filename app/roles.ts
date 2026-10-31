export const ROLE = {
  RAJA: "raja",
  RANI: "rani",
  POLICE: "police",
  CHOR: "chor",
} as const;

export type RoleId = (typeof ROLE)[keyof typeof ROLE];

export const ROLE_ORDER: RoleId[] = [
  ROLE.RAJA,
  ROLE.RANI,
  ROLE.POLICE,
  ROLE.CHOR,
];

export const ROLE_META: Record<
  RoleId,
  { label: string; hindi: string; basePoints: number; blurb: string; accent: string }
> = {
  raja: {
    label: "Raja",
    hindi: "राजा",
    basePoints: 1000,
    blurb: "The king always scores. Stay calm.",
    accent: "#e8b84a",
  },
  rani: {
    label: "Rani",
    hindi: "रानी",
    basePoints: 800,
    blurb: "The queen scores unless someone else steals the show.",
    accent: "#f0a0c0",
  },
  police: {
    label: "Police",
    hindi: "पुलिस",
    basePoints: 500,
    blurb: "Find the Chor. One guess.",
    accent: "#5eb0ff",
  },
  chor: {
    label: "Chor",
    hindi: "चोर",
    basePoints: 0,
    blurb: "Don't get caught. Poker face on.",
    accent: "#ff6b5a",
  },
};

/**
 * Classic digital scoring (AkxH Chor Police):
 * - Raja 1000, Rani 800 always
 * - Police correct → Police 500, Chor 0
 * - Police wrong → Police 0, Chor takes 500
 */
export function scoreRound(args: {
  roles: Record<string, RoleId>;
  accusedId: string;
}): { scoresDelta: Record<string, number>; caught: boolean; chorId: string; policeId: string } {
  const entries = Object.entries(args.roles);
  const chorId = entries.find(([, r]) => r === ROLE.CHOR)?.[0];
  const policeId = entries.find(([, r]) => r === ROLE.POLICE)?.[0];
  if (!chorId || !policeId) {
    throw new Error("Incomplete roles");
  }

  const caught = args.accusedId === chorId;
  const scoresDelta: Record<string, number> = {};

  for (const [playerId, role] of entries) {
    if (role === ROLE.RAJA) scoresDelta[playerId] = ROLE_META.raja.basePoints;
    else if (role === ROLE.RANI) scoresDelta[playerId] = ROLE_META.rani.basePoints;
    else if (role === ROLE.POLICE) scoresDelta[playerId] = caught ? ROLE_META.police.basePoints : 0;
    else if (role === ROLE.CHOR) scoresDelta[playerId] = caught ? 0 : ROLE_META.police.basePoints;
  }

  return { scoresDelta, caught, chorId, policeId };
}

export function dealRoles(playerIds: string[]): Record<string, RoleId> {
  if (playerIds.length !== 4) {
    throw new Error("Chor Police deals exactly 4 roles");
  }
  const roles = [...ROLE_ORDER];
  for (let i = roles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [roles[i], roles[j]] = [roles[j], roles[i]];
  }
  const out: Record<string, RoleId> = {};
  playerIds.forEach((id, i) => {
    out[id] = roles[i];
  });
  return out;
}

export function findPlayerIdForRole(
  roles: Record<string, RoleId> | undefined,
  role: RoleId
): string | null {
  if (!roles) return null;
  const hit = Object.entries(roles).find(([, r]) => r === role);
  return hit?.[0] || null;
}
