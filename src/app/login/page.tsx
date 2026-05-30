import { AuthForm } from "@/components/auth/AuthForm";
import { Suspense } from "react";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[100dvh] items-center justify-center bg-black text-muted">
          読み込み中…
        </div>
      }
    >
      <AuthForm />
    </Suspense>
  );
}
