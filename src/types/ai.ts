export type AiAnalyzeResult = {
  title: string;
  sceneDescription: string;
  musicPrompt: string;
};

export type AiEnhanceStatus =
  | "idle"
  | "extracting_frame"
  | "calling_gemini"
  | "analyzing"
  | "generating_music"
  | "ready"
  | "error";
