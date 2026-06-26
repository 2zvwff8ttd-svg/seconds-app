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
    creatorId: "00000000-0000-0000-0000-000000000001",
    creatorName: "yuki_tokyo",
    creatorDisplayName: null,
    isViralTop: true,
    countryCode: "JP",
  },
  {
    id: "feed-2",
    videoUrl: SAMPLE_VIDEOS[1],
    title: "Rainy window coffee ritual",
    creatorId: "00000000-0000-0000-0000-000000000002",
    creatorName: "maya_lens",
    creatorDisplayName: null,
  },
  {
    id: "feed-3",
    videoUrl: SAMPLE_VIDEOS[2],
    title: "Midnight bike loop",
    creatorId: "00000000-0000-0000-0000-000000000003",
    creatorName: "kai_rides",
    creatorDisplayName: null,
  },
  {
    id: "feed-4",
    videoUrl: SAMPLE_VIDEOS[3],
    title: "Studio light test",
    creatorId: "00000000-0000-0000-0000-000000000004",
    creatorName: "nova_edit",
    creatorDisplayName: null,
  },
  {
    id: "feed-5",
    videoUrl: SAMPLE_VIDEOS[4],
    title: "Kitchen ASMR chop",
    creatorId: "00000000-0000-0000-0000-000000000005",
    creatorName: "chef_min",
    creatorDisplayName: null,
  },
  {
    id: "feed-6",
    videoUrl: SAMPLE_VIDEOS[5],
    title: "Golden hour rooftop",
    creatorId: "00000000-0000-0000-0000-000000000006",
    creatorName: "leo_frames",
    creatorDisplayName: null,
  },
];
