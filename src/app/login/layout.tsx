export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-[100dvh] overflow-y-auto bg-black">{children}</div>
  );
}
