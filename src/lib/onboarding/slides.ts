export type OnboardingSlide = {
  id: string;
  title: string;
  description: string;
  /** decorative label on illustration */
  visualLabel?: string;
};

export const ONBOARDING_SLIDES: OnboardingSlide[] = [
  {
    id: "intro",
    title: "?Seconds へようこそ",
    description:
      "毎日朝7時に、その日の撮影時間（5〜30秒）が割り当てられる短尺vlog SNSです。届いた秒数の中で、いつもの一日を切り取って残しましょう。",
    visualLabel: "7:00",
  },
  {
    id: "bubbles",
    title: "シャボン玉で世界をのぞく",
    description:
      "ホームのシャボン玉をタップすると動画が開きます。ふわふわ浮かぶUIで、各国のvlogがゆっくり流れてきます。",
    visualLabel: "Tap",
  },
  {
    id: "publish",
    title: "翌朝7時に公開",
    description:
      "投稿は翌朝7時に公開され、丸いシャボン玉として10日間だけ残ります。消えていくから、今日の瞬間が少し特別になります。",
    visualLabel: "公開",
  },
  {
    id: "save-share",
    title: "保存して、誰かに届ける",
    description:
      "お気に入りの動画は写真フォルダに保存できます。共有ボタンから、シェアシートですぐに届けることもできます。Webでは動画のダウンロードやリンク共有になります。",
    visualLabel: "Save",
  },
  {
    id: "viral",
    title: "王冠のシャボン玉",
    description:
      "毎朝、国ごとの注目動画から1本に王冠がつきます。あなたの動画が選ばれた日は、特別なお祝いが届きます。",
    visualLabel: "#1",
  },
  {
    id: "bonus",
    title: "ボーナスデー",
    description:
      "10日連続で投稿するたびに、ボーナスデーがやってくる特別な日です。通常は5〜30秒の撮影時間が、ボーナスデーは最大60秒に。いつもより長い瞬間を、たっぷり残せるワクワクする一日になります。",
    visualLabel: "60秒",
  },
];
