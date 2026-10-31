export const constants = {
  siteUrl: "https://chorpolice.vercel.app",
  lobbyCodeLength: 5,
  minPlayers: 4,
  maxPlayers: 4,
  defaultTargetRounds: 5,
  minTargetRounds: 1,
  maxTargetRounds: 12,
};

export const CP = {
  userId: "chorpolice_userId",
  playerName: "chorpolice_playerName",
  lobbyCode: "chorpolice_lobbyCode",
};

export const GAME_STATE = {
  LOBBY: "lobby",
  PEEKING: "peeking",
  ACCUSING: "accusing",
  REVEAL: "reveal",
  FINISHED: "finished",
} as const;

export type GameState = (typeof GAME_STATE)[keyof typeof GAME_STATE];

export const PLAY_MODE = {
  ONLINE: "online",
  HOTSEAT: "hotseat",
} as const;

export type PlayMode = (typeof PLAY_MODE)[keyof typeof PLAY_MODE];

/** Who is publicly known before the Police guess. */
export const REVEAL_MODE = {
  /** Only Police is public; guess among the other 3. */
  POLICE_ONLY: "police_only",
  /** Raja + Police public; classic paper narrowing to 2 suspects. */
  RAJA_AND_POLICE: "raja_and_police",
} as const;

export type RevealMode = (typeof REVEAL_MODE)[keyof typeof REVEAL_MODE];

/** Namespaced for shared Firebase project (akxh-games). */
export const CP_TABLES = {
  USERS: "chorpolice_users",
  LOBBIES: "chorpolice_lobbies",
} as const;
