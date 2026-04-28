import React, { useState, useCallback } from "react";
import type { ChatStore } from "../store/ChatStore";
import "./JumpToIdInput.css";

export interface JumpToIdInputProps {
  readonly store: ChatStore;
}

export function JumpToIdInput(props: JumpToIdInputProps): React.JSX.Element {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (pending) return;
      setError(null);
      setPending(true);
      try {
        await props.store.jumpToId(value.trim());
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setPending(false);
      }
    },
    [props.store, value, pending],
  );

  return (
    <form className="jump-to-id" onSubmit={onSubmit}>
      <input
        type="text"
        placeholder="msg-00012345"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={pending}
      />
      <button type="submit" disabled={pending || value.trim() === ""}>
        Jump
      </button>
      {error !== null && <span className="jump-to-id__error">{error}</span>}
    </form>
  );
}
