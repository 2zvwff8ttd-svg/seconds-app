"use client";

import {
  daysInMonth,
  getDeviceLocale,
  getLocalizedDatePartOrder,
  getLocalizedMonthLabel,
  type DatePart,
} from "@/lib/auth/age";
import { useMemo, useState } from "react";

type BirthDateSelectsProps = {
  id?: string;
  value: string;
  onChange: (isoDate: string) => void;
  required?: boolean;
};

type Parts = { year: string; month: string; day: string };

function parseValue(iso: string): Parts {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return { year: "", month: "", day: "" };
  return { year: m[1]!, month: String(Number(m[2])), day: String(Number(m[3])) };
}

function toIso(parts: Parts): string {
  if (!parts.year || !parts.month || !parts.day) return "";
  const y = Number(parts.year);
  const mo = Number(parts.month);
  const d = Number(parts.day);
  if (![y, mo, d].every((n) => Number.isFinite(n))) return "";
  const maxDay = daysInMonth(y, mo);
  if (d < 1 || d > maxDay || mo < 1 || mo > 12) return "";
  return `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const selectClassName =
  "w-full min-w-0 rounded-xl border border-border bg-surface px-3 py-3 text-sm text-foreground outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30";

export function BirthDateSelects({
  id = "birthDate",
  value,
  onChange,
  required = false,
}: BirthDateSelectsProps) {
  const locale = useMemo(() => getDeviceLocale(), []);
  const order = useMemo(() => getLocalizedDatePartOrder(locale), [locale]);
  const [parts, setParts] = useState<Parts>(() => parseValue(value));

  const now = useMemo(() => new Date(), []);
  const maxYear = now.getFullYear();
  const minYear = 1900;
  const years = useMemo(() => {
    const list: number[] = [];
    for (let y = maxYear; y >= minYear; y -= 1) list.push(y);
    return list;
  }, [maxYear]);

  const monthOptions = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const month = i + 1;
        return {
          value: String(month),
          label: getLocalizedMonthLabel(locale, month),
        };
      }),
    [locale],
  );

  const dayCount = useMemo(() => {
    const y = Number(parts.year) || maxYear;
    const m = Number(parts.month) || 1;
    return daysInMonth(y, m);
  }, [parts.year, parts.month, maxYear]);

  const dayOptions = useMemo(
    () => Array.from({ length: dayCount }, (_, i) => String(i + 1)),
    [dayCount],
  );

  const labels = useMemo(() => {
    const isJa = locale.toLowerCase().startsWith("ja");
    return {
      year: isJa ? "年" : "Year",
      month: isJa ? "月" : "Month",
      day: isJa ? "日" : "Day",
      placeholder: isJa ? "選択" : "Select",
    };
  }, [locale]);

  const updatePart = (key: DatePart, next: string) => {
    setParts((prev) => {
      const merged: Parts = { ...prev, [key]: next };
      // Clamp day when month/year shrinks (e.g. Feb 30 → 28/29)
      if (merged.year && merged.month && merged.day) {
        const max = daysInMonth(Number(merged.year), Number(merged.month));
        if (Number(merged.day) > max) {
          merged.day = String(max);
        }
      }
      onChange(toIso(merged));
      return merged;
    });
  };

  const renderSelect = (part: DatePart) => {
    if (part === "year") {
      return (
        <label key="year" className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[11px] text-muted">{labels.year}</span>
          <select
            id={`${id}-year`}
            required={required}
            value={parts.year}
            onChange={(e) => updatePart("year", e.target.value)}
            autoComplete="bday-year"
            className={selectClassName}
          >
            <option value="">{labels.placeholder}</option>
            {years.map((y) => (
              <option key={y} value={String(y)}>
                {y}
              </option>
            ))}
          </select>
        </label>
      );
    }

    if (part === "month") {
      return (
        <label key="month" className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[11px] text-muted">{labels.month}</span>
          <select
            id={`${id}-month`}
            required={required}
            value={parts.month}
            onChange={(e) => updatePart("month", e.target.value)}
            autoComplete="bday-month"
            className={selectClassName}
          >
            <option value="">{labels.placeholder}</option>
            {monthOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      );
    }

    return (
      <label key="day" className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-[11px] text-muted">{labels.day}</span>
        <select
          id={`${id}-day`}
          required={required}
          value={parts.day}
          onChange={(e) => updatePart("day", e.target.value)}
          autoComplete="bday-day"
          className={selectClassName}
        >
          <option value="">{labels.placeholder}</option>
          {dayOptions.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </label>
    );
  };

  return (
    <div className="flex gap-2" role="group" aria-labelledby={`${id}-label`}>
      {order.map((part) => renderSelect(part))}
    </div>
  );
}
