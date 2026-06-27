"use client";

import { UserAvatar } from "@/components/search/UserAvatar";
import { hasCustomDisplayName } from "@/lib/profile/display-name";
import {
  searchUsersForMention,
  type MentionSearchResult,
} from "@/lib/search/users";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ChangeEvent,
} from "react";

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;

type ActiveMention = {
  start: number;
  query: string;
};

function getActiveMention(text: string, cursor: number): ActiveMention | null {
  const beforeCursor = text.slice(0, cursor);
  const atIndex = beforeCursor.lastIndexOf("@");
  if (atIndex === -1) return null;

  if (atIndex > 0) {
    const prev = beforeCursor[atIndex - 1];
    if (/[a-zA-Z0-9_]/.test(prev)) return null;
  }

  const query = beforeCursor.slice(atIndex + 1);
  if (/\s/.test(query)) return null;

  return { start: atIndex, query };
}

type MentionAutocompleteInputProps = {
  value: string;
  onChange: (value: string) => void;
  onMentionActiveChange?: (active: boolean) => void;
  disabled?: boolean;
  maxLength?: number;
  placeholder?: string;
  className?: string;
  variant?: "default" | "overlay";
};

export function MentionAutocompleteInput({
  value,
  onChange,
  onMentionActiveChange,
  disabled = false,
  maxLength = 500,
  placeholder = "コメントを追加…",
  className = "",
  variant = "default",
}: MentionAutocompleteInputProps) {
  const isOverlay = variant === "overlay";
  const inputRef = useRef<HTMLInputElement>(null);
  const requestId = useRef(0);
  const [cursor, setCursor] = useState(0);
  const [candidates, setCandidates] = useState<MentionSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const activeMention = getActiveMention(value, cursor);
  const mentionActive =
    dropdownOpen &&
    activeMention !== null &&
    activeMention.query.length >= MIN_QUERY_LENGTH;

  useEffect(() => {
    onMentionActiveChange?.(mentionActive);
  }, [mentionActive, onMentionActiveChange]);

  const runSearch = useCallback(async (query: string) => {
    const id = ++requestId.current;
    const trimmed = query.trim();

    if (trimmed.length < MIN_QUERY_LENGTH) {
      setCandidates([]);
      setLoading(false);
      setDropdownOpen(false);
      return;
    }

    setLoading(true);
    setDropdownOpen(true);

    try {
      const results = await searchUsersForMention(trimmed);
      if (requestId.current !== id) return;
      setCandidates(results);
      setHighlightIndex(0);
      setDropdownOpen(true);
    } catch {
      if (requestId.current !== id) return;
      setCandidates([]);
    } finally {
      if (requestId.current === id) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!activeMention) {
      setCandidates([]);
      setDropdownOpen(false);
      return;
    }

    const timer = window.setTimeout(() => {
      void runSearch(activeMention.query);
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [activeMention?.query, activeMention?.start, runSearch]);

  const syncCursor = () => {
    const pos = inputRef.current?.selectionStart ?? value.length;
    setCursor(pos);
  };

  const selectCandidate = (candidate: MentionSearchResult) => {
    if (!activeMention) return;

    const before = value.slice(0, activeMention.start);
    const after = value.slice(cursor);
    const insertion = `@${candidate.username} `;
    const next = `${before}${insertion}${after}`;
    onChange(next);

    const nextCursor = before.length + insertion.length;
    setCursor(nextCursor);
    setCandidates([]);
    setDropdownOpen(false);

    requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      input.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
    setCursor(e.target.selectionStart ?? e.target.value.length);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && mentionActive) {
      e.preventDefault();
      if (candidates.length > 0) {
        selectCandidate(candidates[highlightIndex]);
      }
      return;
    }

    if (!dropdownOpen || candidates.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => (i + 1) % candidates.length);
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => (i - 1 + candidates.length) % candidates.length);
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      setDropdownOpen(false);
      setCandidates([]);
      return;
    }
  };

  const showDropdown =
    dropdownOpen &&
    activeMention !== null &&
    (loading || candidates.length > 0 || activeMention.query.length >= MIN_QUERY_LENGTH);

  return (
    <div className="relative min-w-0 flex-1">
      {showDropdown && (
        <ul
          role="listbox"
          aria-label="メンション候補"
          className={`absolute bottom-full left-0 right-0 z-50 mb-1 max-h-44 overflow-y-auto overscroll-contain rounded-xl border shadow-lg ${
            isOverlay
              ? "border-white/20 bg-black/90 backdrop-blur-md"
              : "border-border bg-surface"
          }`}
        >
          {loading && candidates.length === 0 && (
            <li
              className={`px-3 py-2 text-xs ${isOverlay ? "text-white/60" : "text-muted"}`}
            >
              検索中…
            </li>
          )}
          {!loading && candidates.length === 0 && activeMention.query.length >= MIN_QUERY_LENGTH && (
            <li
              className={`px-3 py-2 text-xs ${isOverlay ? "text-white/60" : "text-muted"}`}
            >
              該当するユーザーがいません
            </li>
          )}
          {candidates.map((candidate, index) => (
            <li key={candidate.userId} role="option" aria-selected={index === highlightIndex}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectCandidate(candidate);
                }}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition touch-manipulation ${
                  index === highlightIndex
                    ? isOverlay
                      ? "bg-white/15 text-white"
                      : "bg-accent/10 text-foreground"
                    : isOverlay
                      ? "text-white/90 hover:bg-white/10"
                      : "text-foreground hover:bg-white/5"
                }`}
              >
                <UserAvatar
                  username={candidate.username}
                  avatarUrl={candidate.avatarUrl}
                  size="sm"
                />
                <span className="min-w-0 truncate">
                  {hasCustomDisplayName(candidate.displayName) ? (
                    <>
                      <span className="font-medium">{candidate.displayName!.trim()}</span>
                      <span className={isOverlay ? "text-white/55" : "text-muted"}>
                        {" "}
                        （@{candidate.username}）
                      </span>
                    </>
                  ) : (
                    <span className="font-medium">@{candidate.username}</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onKeyUp={syncCursor}
        onClick={syncCursor}
        onSelect={syncCursor}
        maxLength={maxLength}
        placeholder={placeholder}
        disabled={disabled}
        className={className}
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={showDropdown}
      />
    </div>
  );
}
