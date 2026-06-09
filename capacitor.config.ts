import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.seconds.app",
  // Web / Capacitor 用。Android の strings.xml は ? を &#63; でエスケープすること
  appName: "?Seconds",
  webDir: "capacitor-shell/www",
  server: {
    url: "https://seconds-app-wheat.vercel.app",
    // ローカル検証時:
    // url: "http://localhost:3000",
    // cleartext: true,
  },
};

export default config;
