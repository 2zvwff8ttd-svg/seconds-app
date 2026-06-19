import { HomeScreenDiagStage2 } from "@/components/home/HomeScreenDiagStage2";

/**
 * iOS bisection — STAGE 2: BubbleField 系（本番同等・形マスク有効）
 * Next: STAGE 3 = masks disabled (circle only) if this fails
 */
export default function Home() {
  return <HomeScreenDiagStage2 />;
}
