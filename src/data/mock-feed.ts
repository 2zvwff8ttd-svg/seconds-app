import type { FeedVideo } from "@/types/feed";

const SAMPLE_VIDEOS = [
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMob.mp4",
] as const;

export const MOCK_FEED: FeedVideo[] = [
  {
    id: "viral-jp-1",
    videoUrl: SAMPLE_VIDEOS[0],
    title: "朝焼けの渋谷スカイライン",
    creatorName: "yuki_tokyo",
    isViralTop: true,
    countryCode: "JP",
  },
  {
    id: "feed-2",
    videoUrl: SAMPLE_VIDEOS[1],
    title: "Rainy window coffee ritual",
    creatorName: "maya_lens",
  },
  {
    id: "feed-3",
    videoUrl: SAMPLE_VIDEOS[2],
    title: "Midnight bike loop",
    creatorName: "kai_rides",
  },
  {
    id: "feed-4",
    videoUrl: SAMPLE_VIDEOS[3],
    title: "Studio light test",
    creatorName: "nova_edit",
  },
  {
    id: "feed-5",
    videoUrl: SAMPLE_VIDEOS[4],
    title: "Kitchen ASMR chop",
    creatorName: "chef_min",
  },
  {
    id: "feed-6",
    videoUrl: SAMPLE_VIDEOS[5],
    title: "Golden hour rooftop",
    creatorName: "leo_frames",
  },
];
