export type AiAnalyzeResult = {
  title: string;
  sceneDescription: string;
  musicPrompt: string;
};

export type AiEnhanceStatus =
  | "idle"
  | "analyzing"
  | "generating_music"
  | "ready"
  | "error";
