import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.seconds.kai",
  // Android ビルド用の内部名（? は XML で ?attr/... と誤解釈される）。表示名は strings.xml の launcher_name
  appName: "Seconds",
  webDir: "capacitor-shell/www",
  server: {
    url: "https://getseconds.app",
    // ローカル検証時:
    // url: "http://localhost:3000",
    // cleartext: true,
  },
};

export default config;
