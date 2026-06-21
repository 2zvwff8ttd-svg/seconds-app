"use client";

import { BottomNavButtons } from "@/components/home/BottomNavButtons";
import { fetchDmUnreadCount } from "@/lib/dm/unread";
import { subscribeDmUnreadCount } from "@/lib/dm/subscribe";
import { createClient } from "@/lib/supabase/client";
import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { createPortal } from "react-dom";

/** Visible handle height when the sheet is collapsed (excludes safe-area). */
export const POST_NAV_HANDLE_VISIBLE_PX = 36;
/** Layout inset to reserve at the bottom while collapsed (handle + gap). */
export const POST_NAV_COLLAPSED_INSET_PX = 44;

const SWIPE_EXPAND_THRESHOLD_PX = 40;
const SWIPE_COLLAPSE_THRESHOLD_PX = 48;

type PostBottomNavSheetProps = {
  onInsetChange?: (insetPx: number) => void;
};

function readSafeAreaBottomPx(): number {
  if (typeof window === "undefined") return 0;
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;bottom:0;left:0;height:env(safe-area-inset-bottom);pointer-events:none;visibility:hidden";
  document.body.appendChild(probe);
  const px = probe.getBoundingClientRect().height;
  probe.remove();
  return px;
}

export function PostBottomNavSheet({ onInsetChange }: PostBottomNavSheetProps) {
  const [mounted, setMounted] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [dmUnreadCount, setDmUnreadCount] = useState(0);
  const [dragOffsetPx, setDragOffsetPx] = useState(0);
  const dragStartYRef = useRef<number | null>(null);
  const draggingRef = useRef(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("post-nav-collapsed");
    root.classList.remove("post-nav-expanded");

    return () => {
      root.classList.remove("post-nav-collapsed", "post-nav-expanded");
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (expanded) {
      root.classList.add("post-nav-expanded");
      root.classList.remove("post-nav-collapsed");
    } else {
      root.classList.add("post-nav-collapsed");
      root.classList.remove("post-nav-expanded");
    }
  }, [expanded]);

  useEffect(() => {
    if (!onInsetChange) return;
    const safeBottom = readSafeAreaBottomPx();
    onInsetChange(POST_NAV_COLLAPSED_INSET_PX + safeBottom);
  }, [onInsetChange]);

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof subscribeDmUnreadCount> | null = null;

    const setup = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      try {
        const count = await fetchDmUnreadCount();
        setDmUnreadCount(count);
      } catch {
        setDmUnreadCount(0);
      }

      channel = subscribeDmUnreadCount(user.id, setDmUnreadCount);
    };

    void setup();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!expanded) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [expanded]);

  const collapse = useCallback(() => {
    setDragOffsetPx(0);
    setExpanded(false);
  }, []);

  const expand = useCallback(() => {
    setDragOffsetPx(0);
    setExpanded(true);
  }, []);

  const handleNavigate = useCallback((_href: string) => {
    collapse();
  }, [collapse]);

  const dragDistanceRef = useRef(0);

  const finishDrag = useCallback(
    (clientY: number) => {
      const startY = dragStartYRef.current;
      draggingRef.current = false;
      dragStartYRef.current = null;
      if (startY === null) return;

      const deltaY = clientY - startY;
      const wasDrag = dragDistanceRef.current > 8;
      dragDistanceRef.current = 0;
      setDragOffsetPx(0);

      if (!expanded && deltaY < -SWIPE_EXPAND_THRESHOLD_PX) {
        expand();
        return;
      }
      if (expanded && deltaY > SWIPE_COLLAPSE_THRESHOLD_PX) {
        collapse();
        return;
      }
      if (wasDrag) return;
    },
    [collapse, expand, expanded],
  );

  const onHandlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    draggingRef.current = true;
    dragStartYRef.current = event.clientY;
    dragDistanceRef.current = 0;
    setDragOffsetPx(0);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onHandlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current || dragStartYRef.current === null) return;
    event.preventDefault();
    const deltaY = event.clientY - dragStartYRef.current;
    dragDistanceRef.current = Math.max(dragDistanceRef.current, Math.abs(deltaY));
    if (!expanded) {
      setDragOffsetPx(Math.min(0, deltaY));
      return;
    }
    setDragOffsetPx(Math.max(0, deltaY));
  };

  const onHandlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    finishDrag(event.clientY);
  };

  const onHandleClick = () => {
    if (dragDistanceRef.current > 8) return;
    if (expanded) collapse();
    else expand();
  };

  if (!mounted) return null;

  const sheetTransform = expanded
    ? `translateY(${Math.max(0, dragOffsetPx)}px)`
    : `translateY(calc(100% - ${POST_NAV_HANDLE_VISIBLE_PX}px - env(safe-area-inset-bottom, 0px) + ${Math.min(0, dragOffsetPx)}px))`;

  return createPortal(
    <>
      <button
        type="button"
        className={`post-nav-scrim${expanded ? " post-nav-scrim--visible" : ""}`}
        aria-label="ナビゲーションを閉じる"
        aria-hidden={!expanded}
        tabIndex={expanded ? 0 : -1}
        onClick={collapse}
      />

      <div
        ref={sheetRef}
        className={`post-nav-sheet${expanded ? " post-nav-sheet--expanded" : ""}`}
        style={{ transform: sheetTransform }}
        role="dialog"
        aria-modal={expanded}
        aria-label="メインナビゲーション"
        aria-hidden={!expanded}
      >
        <div
          className="post-nav-sheet__handle-zone"
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerUp}
          onPointerCancel={onHandlePointerUp}
          onClick={onHandleClick}
          aria-label={expanded ? "下にスワイプして閉じる" : "上にスワイプしてナビを開く"}
        >
          <span className="post-nav-sheet__handle-bar" aria-hidden />
        </div>

        <nav
          className="post-nav-sheet__nav border-t border-border bg-surface/95 backdrop-blur-lg"
          aria-label="Main"
        >
          <BottomNavButtons
            dmUnreadCount={dmUnreadCount}
            onNavigate={handleNavigate}
          />
        </nav>
      </div>
    </>,
    document.body,
  );
}
