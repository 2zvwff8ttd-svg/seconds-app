"use client";

import type { AiAnalyzeResult, AiEnhanceStatus } from "@/types/ai";

type AiEnhancePanelProps = {
  status: AiEnhanceStatus;
  aiMusicEnabled: boolean;
  onAiMusicChange: (enabled: boolean) => void;
  analyzeResult: AiAnalyzeResult | null;
  error: string | null;
  onRegenerate: () => void;
  disabled?: boolean;
};

export function AiEnhancePanel({
  status,
  aiMusicEnabled,
  onAiMusicChange,
  analyzeResult,
  error,
  onRegenerate,
  disabled = false,
}: AiEnhancePanelProps) {
  const busy = status === "analyzing" || status === "generating_music";

  return (
    <section className="mt-4 rounded-xl border border-violet-400/25 bg-violet-500/10 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-xs font-semibold text-violet-200">AI 投稿サポート</h3>
          <p className="mt-0.5 text-[10px] leading-relaxed text-muted">
            最初のフレームを Gemini が解析し、タイトルと BGM を提案します
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-violet-500/20 px-2 py-0.5 text-[9px] font-medium text-violet-300">
          Gemini
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-border bg-surface/80 px-3 py-2.5">
        <div>
          <p className="text-sm font-medium text-foreground">AI 音楽（BGM）</p>
          <p className="text-[10px] text-muted">
            ON で MusicGen / Suno による BGM を合成
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={aiMusicEnabled}
          disabled={disabled || busy}
          onClick={() => onAiMusicChange(!aiMusicEnabled)}
          className={`relative h-7 w-12 shrink-0 rounded-full transition ${
            aiMusicEnabled ? "bg-violet-500" : "bg-border"
          } disabled:opacity-40`}
        >
          <span
            className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition ${
              aiMusicEnabled ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      {busy && (
        <p className="mt-3 flex items-center gap-2 text-xs text-violet-200">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
          {status === "analyzing"
            ? "動画を解析してタイトルを生成中…"
            : "BGM を生成中…"}
        </p>
      )}

      {analyzeResult && !busy && (
        <div className="mt-3 space-y-2 rounded-lg border border-border/80 bg-black/30 px-3 py-2.5 text-xs">
          <p className="text-muted">
            <span className="text-foreground/70">シーン: </span>
            {analyzeResult.sceneDescription}
          </p>
          <p className="text-muted">
            <span className="text-foreground/70">BGM: </span>
            {analyzeResult.musicPrompt}
          </p>
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-lg bg-red-500/10 px-2.5 py-2 text-xs text-red-400">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={onRegenerate}
        disabled={disabled || busy}
        className="mt-3 w-full rounded-lg border border-border bg-surface py-2 text-xs font-medium text-foreground transition hover:bg-surface-elevated disabled:opacity-40"
      >
        AI 提案を再生成
      </button>
    </section>
  );
}
