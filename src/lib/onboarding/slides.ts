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
    id: "record",
    title: "撮影して投稿",
    description:
      "下の「投稿」タブから録画ボタンでクリップを撮影。割り当て時間を使い切るとタイトルやBGM、公開範囲を設定して投稿できます。",
    visualLabel: "REC",
  },
  {
    id: "publish",
    title: "翌朝7時に公開",
    description:
      "投稿した動画はすぐには見えません。翌日の朝7時（あなたのタイムゾーン）に公開され、みんなのシャボン玉に載ります。",
    visualLabel: "公開",
  },
];
