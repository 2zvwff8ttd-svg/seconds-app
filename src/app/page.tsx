import { HomeScreenDiag } from "@/components/home/HomeScreenDiag";

/**
 * iOS bisection — increment HOME_DIAG_STAGE after each test.
 * 0 = minimal | 1 = nav/notify only | 2 = BubbleField only
 * When done: replace body with `import { HomeScreen } from ...` + `<HomeScreen />`.
 */
/** TEMP hardcoded — change to 2, 3… as bisection proceeds. */
const HOME_DIAG_STAGE = 1;

export default function Home() {
  return <HomeScreenDiag stage={HOME_DIAG_STAGE} />;
}
