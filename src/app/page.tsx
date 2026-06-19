import { HomeScreen } from "@/components/home/HomeScreen";

/** Vercel env: NEXT_PUBLIC_MINIMAL_HOME=1. TEMP: hardcoded for iOS isolation — revert after test. */
const MINIMAL_HOME =
  true || process.env.NEXT_PUBLIC_MINIMAL_HOME === "1";
export default function Home() {
  if (MINIMAL_HOME) {
    return (
      <main
        style={{
          padding: "1.5rem",
          fontFamily: "system-ui, sans-serif",
          color: "#eee",
          background: "#111",
          minHeight: "100dvh",
        }}
      >
        <h1>minimal home OK</h1>
        <p>NEXT_PUBLIC_MINIMAL_HOME=1 — HomeScreen / BubbleField なし</p>
      </main>
    );
  }

  return <HomeScreen />;
}
