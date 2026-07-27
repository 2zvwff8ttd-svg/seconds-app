"use client";

import { getTurnstileSiteKey } from "@/lib/auth/captcha";
import {
  Turnstile,
  type TurnstileInstance,
  type TurnstileProps,
} from "@marsidev/react-turnstile";
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
} from "react";

export type TurnstileFieldHandle = {
  /** Clear token and re-render challenge (call after each auth attempt). */
  reset: () => void;
};

type TurnstileFieldProps = {
  onTokenChange: (token: string | null) => void;
  className?: string;
};

/**
 * Renders Cloudflare Turnstile when NEXT_PUBLIC_TURNSTILE_SITE_KEY is set.
 * Otherwise renders nothing (auth continues without captchaToken).
 */
export const TurnstileField = forwardRef<
  TurnstileFieldHandle,
  TurnstileFieldProps
>(function TurnstileField({ onTokenChange, className }, ref) {
  const siteKey = getTurnstileSiteKey();
  const widgetRef = useRef<TurnstileInstance | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      reset: () => {
        onTokenChange(null);
        widgetRef.current?.reset();
      },
    }),
    [onTokenChange],
  );

  const onSuccess = useCallback<NonNullable<TurnstileProps["onSuccess"]>>(
    (token) => {
      onTokenChange(token);
    },
    [onTokenChange],
  );

  const onExpire = useCallback(() => {
    onTokenChange(null);
  }, [onTokenChange]);

  const onError = useCallback(() => {
    onTokenChange(null);
  }, [onTokenChange]);

  if (!siteKey) return null;

  return (
    <div className={className ?? "flex justify-center"}>
      <Turnstile
        ref={widgetRef}
        siteKey={siteKey}
        onSuccess={onSuccess}
        onExpire={onExpire}
        onError={onError}
        options={{
          theme: "dark",
          size: "flexible",
        }}
      />
    </div>
  );
});
