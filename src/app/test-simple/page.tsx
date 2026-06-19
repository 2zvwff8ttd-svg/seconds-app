export default function TestSimplePage() {
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
      <h1>test-simple OK</h1>
      <p>認証必須・layout + ClientAppGate あり・BubbleField / PostForm なし</p>
      <p style={{ marginTop: "1rem", fontSize: "0.875rem", opacity: 0.8 }}>
        このページが開ければ、原因はホーム系のページ専用チャンク側です。
      </p>
    </main>
  );
}
