"use client";

import { useSyncExternalStore } from "react";
import {
  getStore,
  getStoreRevision,
  subscribeStore,
} from "@/utils/firebase/firebaseHelpers";
import type { Lobby } from "@/app/types";

let cachedRev = -1;
let cachedLobby: Lobby | null = null;

function snapshotLobby(): Lobby | null {
  const rev = getStoreRevision();
  if (rev !== cachedRev) {
    cachedRev = rev;
    cachedLobby = getStore().lobby;
  }
  return cachedLobby;
}

export default function useLobby() {
  return useSyncExternalStore(subscribeStore, snapshotLobby, snapshotLobby);
}
