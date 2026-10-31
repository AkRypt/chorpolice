"use client";

import { useState } from "react";
import { setDisplayName } from "@/utils/firebase/firebaseHelpers";

export default function NameEditor({
  name,
  compact = false,
}: {
  name?: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(name || "");
  const [busy, setBusy] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    await setDisplayName(draft);
    setBusy(false);
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(name || "");
          setOpen(true);
        }}
        className={
          compact
            ? "text-sm text-[var(--CP-muted)] underline-offset-2 hover:underline"
            : "CP-btn-ghost text-sm py-2 px-3"
        }
      >
        {name ? `Playing as ${name}` : "Set name"} · change
      </button>
    );
  }

  return (
    <form onSubmit={save} className="flex w-full gap-2 items-center">
      <input
        className="CP-input py-2"
        value={draft}
        onChange={(e) => setDraft(e.target.value.slice(0, 24))}
        placeholder="Your name"
        autoFocus
        maxLength={24}
      />
      <button type="submit" className="CP-btn py-2 px-3 text-sm" disabled={busy || !draft.trim()}>
        Save
      </button>
    </form>
  );
}
