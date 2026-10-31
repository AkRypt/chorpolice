"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  getStore,
  getStoreRevision,
  initializeUser,
  subscribeStore,
} from "@/utils/firebase/firebaseHelpers";
import { getStoredPlayerName } from "@/utils/identity";

type UserSnap = {
  userId?: string;
  playerName?: string;
  playerLobbyCode?: string | null;
  userFetched?: boolean;
  loading: boolean;
};

let cachedRev = -1;
let cachedUser: UserSnap = { loading: false };

function snapshotUser(): UserSnap {
  const rev = getStoreRevision();
  if (rev !== cachedRev) {
    cachedRev = rev;
    const store = getStore();
    cachedUser = {
      userId: store.user.userId,
      playerName: store.user.playerName,
      playerLobbyCode: store.user.playerLobbyCode,
      userFetched: store.user.userFetched,
      loading: store.loading,
    };
  }
  return cachedUser;
}

export function useUser() {
  const snap = useSyncExternalStore(subscribeStore, snapshotUser, snapshotUser);
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    const localName = getStoredPlayerName();
    if (localName && !getStore().user.playerName) {
      getStore().user = { ...getStore().user, playerName: localName };
    }
    void initializeUser().finally(() => setBooted(true));
  }, []);

  return {
    userId: snap.userId,
    playerName: snap.playerName,
    playerLobbyCode: snap.playerLobbyCode,
    userFetched: snap.userFetched,
    loading: snap.loading,
    booted: booted || !!snap.userFetched,
  };
}
