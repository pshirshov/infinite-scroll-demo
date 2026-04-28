import React from "react";
import type { SearchHit } from "../backend/Message";

export interface SearchResultsProps {
  readonly results: readonly SearchHit[];
  readonly onClick: (id: string) => void;
}

export function SearchResults(props: SearchResultsProps): React.JSX.Element {
  return (
    <ul className="search-results">
      {props.results.length === 0 && (
        <li className="search-results__empty">No results</li>
      )}
      {props.results.map((hit) => (
        <li key={hit.id}>
          <button
            onClick={() => props.onClick(hit.id)}
            className="search-results__hit"
          >
            <div className="search-results__hit-id">{hit.id}</div>
            <div className="search-results__hit-snippet">{hit.snippet}</div>
          </button>
        </li>
      ))}
    </ul>
  );
}
