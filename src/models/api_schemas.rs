use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Exact ArmorIQ request contract for validating a terminal override attempt.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArmorIqRequest {
    pub player_input: String,
    pub action: String,
    pub context: ArmorIqContext,
}

/// Nested context sent alongside the ArmorIQ intent validation request.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArmorIqContext {
    pub hidden_answer: String,
}

/// Exact ArmorIQ response contract returned by the policy engine.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArmorIqResponse {
    pub allowed: bool,
    #[serde(default)]
    pub block_reason: Option<String>,
}

/// Exact structured JSON object expected from the clue-generation Gemini agent.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeminiClueGeneratorResponse {
    pub game_title: String,
    pub setting_summary: String,
    pub shared_manual_intro: String,
    pub round_1: RoundOnePackage,
    pub round_2: RoundTwoPackage,
    pub round_3: RoundThreePackage,
    pub round_4_native_brief: NativeRoundBrief,
}

/// Structured JSON object expected from the terminal-validation Gemini agent.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeminiValidatorDecision {
    pub success: bool,
    pub reason: String,
}

/// Local relay request contract for clue generation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RelayClueGeneratorRequest {
    pub setting: String,
    pub difficulty: String,
    pub villain_name: String,
    pub objective: String,
    #[serde(default)]
    pub theme: Option<String>,
}

/// Local relay request contract for terminal validation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RelayTerminalValidatorRequest {
    pub player_input: String,
    pub hidden_answer: String,
}

/// Local relay request contract for villain speech generation and TTS synthesis.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RelayVillainSpeechRequest {
    pub villain_name: String,
    pub scene: String,
    pub tone: String,
    #[serde(default)]
    pub voice_id: Option<String>,
    #[serde(default)]
    pub selected_cue_id: Option<String>,
}

/// Local relay response returned after Gemini speech generation and optional ElevenLabs synthesis.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RelayVillainSpeechResponse {
    pub speech_cues: Vec<VillainSpeechCue>,
    pub selected_cue_id: String,
    #[serde(default)]
    pub audio_base64: Option<String>,
    #[serde(default)]
    pub mime_type: Option<String>,
    pub tts_provider: String,
}

/// A clue beat revealed to Player 1 during a round.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClueBeat {
    pub cue_id: String,
    pub reveal_stage: String,
    pub clue_text: String,
    pub intended_signal: String,
    pub display_note: String,
}

/// Round 1 UI payload.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoundOnePlayerOneUi {
    pub bootup_dialogue: String,
    pub clue_sequence: Vec<ClueBeat>,
}

/// Round 1 manual payload.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoundOneManual {
    pub persona_name: String,
    pub target_word: String,
    pub forbidden_words: Vec<String>,
    pub social_engineering_hints: Vec<String>,
    pub operator_notes: String,
}

/// Complete Round 1 package.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoundOnePackage {
    pub round_name: String,
    pub round_goal: String,
    pub player_1_ui: RoundOnePlayerOneUi,
    pub player_2_manual: RoundOneManual,
    pub validation_answer: String,
}

/// Round 2 UI payload.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoundTwoPlayerOneUi {
    pub incident_logs: String,
    pub clue_sequence: Vec<ClueBeat>,
}

/// Flowchart step used by rounds 2 and 3.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BranchStep {
    pub step_id: String,
    pub question: String,
    pub yes_branch: String,
    pub no_branch: String,
}

/// Subject-code leaf node for round 2.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubjectIdLeaf {
    pub leaf_id: String,
    pub subject_code: String,
}

/// Round 2 manual payload.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoundTwoManual {
    pub flowchart: Vec<BranchStep>,
    pub subject_ids: Vec<SubjectIdLeaf>,
    pub analyst_notes: Vec<String>,
}

/// Complete Round 2 package.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoundTwoPackage {
    pub round_name: String,
    pub round_goal: String,
    pub player_1_ui: RoundTwoPlayerOneUi,
    pub player_2_manual: RoundTwoManual,
    pub validation_answer: String,
}

/// Round 3 UI payload.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoundThreePlayerOneUi {
    pub text_block: String,
    pub clue_sequence: Vec<ClueBeat>,
}

/// Parsing rule used by round 3.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsingRule {
    pub rule_id: String,
    pub instruction: String,
}

/// Round 3 manual payload.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoundThreeManual {
    pub flowchart: Vec<BranchStep>,
    pub parsing_rules: Vec<ParsingRule>,
    pub analyst_notes: Vec<String>,
}

/// Complete Round 3 package.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoundThreePackage {
    pub round_name: String,
    pub round_goal: String,
    pub player_1_ui: RoundThreePlayerOneUi,
    pub player_2_manual: RoundThreeManual,
    pub validation_answer: String,
    pub kill_phrase_3: String,
}

/// Narrative wrapper for the native round 4 generator.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NativeRoundBrief {
    pub round_name: String,
    pub round_goal: String,
    pub generation_rule: String,
    pub p1_ui_hint: String,
    pub p2_manual_hint: String,
}

/// A villain speech cue aligned to a clue reveal.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VillainSpeechCue {
    pub cue_id: String,
    pub round_key: String,
    pub linked_clue_id: String,
    pub trigger: String,
    pub delivery_style: String,
    pub speech_text: String,
}

/// Minimal Gemini `generateContent` request envelope for structured JSON output.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeminiGenerateContentRequest {
    pub contents: Vec<GeminiContent>,
    pub generation_config: GeminiGenerationConfig,
}

/// A Gemini content block.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeminiContent {
    #[serde(default)]
    pub role: Option<String>,
    pub parts: Vec<GeminiPart>,
}

/// A single content part used by Gemini's REST API.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeminiPart {
    #[serde(default)]
    pub text: Option<String>,
}

/// Generation config for forcing JSON mode via a response schema.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeminiGenerationConfig {
    pub response_mime_type: String,
    pub response_json_schema: Value,
    pub candidate_count: u32,
    pub max_output_tokens: u32,
    pub temperature: f32,
}

/// Minimal Gemini `generateContent` response envelope required to extract text.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct GeminiGenerateContentResponse {
    #[serde(default)]
    pub candidates: Vec<GeminiCandidate>,
}

/// A single model candidate from a Gemini response.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeminiCandidate {
    pub content: GeminiContent,
}
