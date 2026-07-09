"use client";

import {
  fetchPushNotificationPreferences,
  PREFERENCE_KEYS,
  PUSH_PREFERENCE_LABELS,
  upsertPushNotificationPreference,
  type PushNotificationPreferences,
  type PushPreferenceKey,
} from "@/lib/push/notification-preferences";
import { useCallback, useEffect, useState } from "react";

function PreferenceToggle({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition ${
        checked ? "bg-violet-500" : "bg-white/15"
      } ${disabled ? "opacity-50" : ""}`}
    >
      <span
        className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition ${
          checked ? "left-[22px]" : "left-0.5"
        }`}
      />
    </button>
  );
}

export function PushNotificationSettingsSection() {
  const [prefs, setPrefs] = useState<PushNotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<PushPreferenceKey | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPrefs(await fetchPushNotificationPreferences());
    } catch (err) {
      setError(err instanceof Error ? err.message : "読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleToggle = async (key: PushPreferenceKey, enabled: boolean) => {
    if (!prefs) return;
    const previous = prefs[key];
    setPrefs({ ...prefs, [key]: enabled });
    setSavingKey(key);
    setError(null);
    try {
      await upsertPushNotificationPreference(key, enabled);
    } catch (err) {
      setPrefs({ ...prefs, [key]: previous });
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <section className="mt-8">
      <h2 className="text-xs font-medium uppercase tracking-wider text-muted">
        プッシュ通知
      </h2>
      <p className="mt-2 text-xs text-muted">
        端末に届くプッシュ通知の種類ごとのオン/オフです。アプリ内の通知（ベル）は常に表示されます。
      </p>
      <div className="mt-3 overflow-hidden rounded-2xl border border-border bg-surface-elevated">
        {loading ? (
          <p className="px-4 py-3.5 text-sm text-muted">読み込み中…</p>
        ) : !prefs ? (
          <p className="px-4 py-3.5 text-sm text-muted">設定を読み込めませんでした</p>
        ) : (
          <ul>
            {PREFERENCE_KEYS.map((key, index) => {
              const meta = PUSH_PREFERENCE_LABELS[key];
              return (
                <li
                  key={key}
                  className={`flex items-center justify-between gap-3 px-4 py-3.5 ${
                    index > 0 ? "border-t border-border" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-sm text-foreground">{meta.title}</p>
                    {meta.description ? (
                      <p className="mt-0.5 text-xs text-muted">{meta.description}</p>
                    ) : null}
                  </div>
                  <PreferenceToggle
                    checked={prefs[key]}
                    disabled={savingKey === key}
                    label={meta.title}
                    onChange={(next) => void handleToggle(key, next)}
                  />
                </li>
              );
            })}
          </ul>
        )}
        {error ? (
          <p className="border-t border-border px-4 py-2 text-xs text-red-300/90">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}
