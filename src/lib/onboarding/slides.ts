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
  {
    id: "viral",
    title: "王冠のシャボン玉",
    description:
      "王冠マークのついたシャボン玉は、その国で昨日いちばん視聴された動画（デイリーバイラル）です。各国の「いま話題」の一本を見つけてみましょう。",
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
