import { HomeScreenDiagStage4a1 } from "@/components/home/diag/HomeScreenDiagStage4a1";

/**
 * iOS bisection — STAGE 4a-1: feed.ts import only (no fetch)
 * Next if fails: 4a-1b display-mask, 4a-1c map-feed, 4a-1d video-schema
 * Next if passes: 4a-2 fetchHomeFeed, 4a-3 rec context, 4a-4 ipapi
 */
export default function Home() {
  return <HomeScreenDiagStage4a1 />;
}
