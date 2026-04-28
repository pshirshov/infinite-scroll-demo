import React, { useState, useEffect, useCallback } from "react";
import type { SearchHit } from "../backend/Message";
import type { MockBackend } from "../backend/MockBackend";
import type { ChatStore } from "../store/ChatStore";
import { SearchResults } from "./SearchResults";
import "./SearchBar.css";

export interface SearchBarProps {
  readonly backend: MockBackend;
  readonly store: ChatStore;
}

export function SearchBar(props: SearchBarProps): React.JSX.Element {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<readonly SearchHit[] | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed === "") {
      setResults(null);
      setPending(false);
      setError(null);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setPending(true);
      setError(null);
      props.backend
        .search(trimmed, controller.signal)
        .then((hits) => {
          if (controller.signal.aborted) return;
          setResults(hits);
          setOpen(true);
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          if (err instanceof Error && err.name === "AbortError") return;
          setError(err instanceof Error ? err.message : String(err));
        })
        .finally(() => {
          if (!controller.signal.aborted) setPending(false);
        });
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, props.backend]);

  const onResultClick = useCallback(
    (id: string) => {
      props.store.jumpToId(id).catch(() => {
        // JumpToIdInput surfaces errors; ignore here
      });
      setQuery("");
      setResults(null);
      setOpen(false);
    },
    [props.store],
  );

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
      (e.currentTarget as HTMLElement).blur();
    }
  }, []);

  return (
    <div className="search-bar">
      <input
        className="search-bar__input"
        type="search"
        placeholder="Search messages…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
      />
      {pending && <span className="search-bar__pending">…</span>}
      {error !== null && <span className="search-bar__error">{error}</span>}
      {open && results !== null && (
        <SearchResults results={results} onClick={onResultClick} />
      )}
    </div>
  );
}
