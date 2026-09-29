/**
 * Curated Model Registry & Version Upgrade Telemetry
 * Provides catalog of vetted uncensored and high-logic models
 * and detects when upgrades or superior foundations are available.
 */

export const CURATED_MODELS_CATALOG = [
  {
    id: 'hermes3-8b',
    name: 'Nous Hermes 3 (8B)',
    tag: 'hermes3:8b',
    family: 'hermes',
    category: 'agentic-uncensored',
    sizeEstimate: '4.9 GB',
    minRamGB: 8,
    recommendedFor: 'Balanced Agentic Workflows & Zero Preachiness',
    description: 'Premier uncensored instruction model by Nous Research. Features native function calling and zero moralizing disclaimers without weight degradation.',
    strengths: ['Function / Tool Calling', 'Deep Instruction Adherence', 'Zero Disclaimers', 'Low RAM Footprint'],
    vramTier: 'Lightweight / Balanced'
  },
  {
    id: 'hermes3-70b',
    name: 'Nous Hermes 3 (70B)',
    tag: 'hermes3:70b',
    family: 'hermes',
    category: 'flagship-uncensored',
    sizeEstimate: '39 GB',
    minRamGB: 48,
    recommendedFor: 'High-IQ Sovereign Confidante & Agentic Architecture',
    description: 'Flagship open-weights agentic model. Maximum depth of thought, sophisticated nuance, and flawless roleplay and structured tool execution.',
    strengths: ['State-of-the-Art Reasoning', 'Complex Architecture & Strategy', 'Total Sanctuary', 'Flawless Tools'],
    vramTier: 'High VRAM / Studio'
  },
  {
    id: 'dolphin-llama3-8b',
    name: 'Cognitive Computations Dolphin 2.9 (8B)',
    tag: 'dolphin-llama3:8b',
    family: 'dolphin',
    category: 'curated-uncensored',
    sizeEstimate: '4.7 GB',
    minRamGB: 8,
    recommendedFor: 'Conversational Empathy & Uncensored Candor',
    description: 'Curated by Eric Hartford, trained from the ground up on filtered-for-alignment-free datasets. High empathy and loyalty without mathematical abliteration flaws.',
    strengths: ['Ride-or-Die Candor', '0% Refusal Rate', 'Coding & Math Retained', 'Low Hallucination'],
    vramTier: 'Lightweight'
  },
  {
    id: 'qwen2.5-coder-32b',
    name: 'Qwen 2.5 Coder (32B Instruct)',
    tag: 'qwen2.5-coder:32b-instruct-q6_K',
    altTag: 'qwen2.5-coder:32b',
    family: 'qwen-coder',
    category: 'specialist-execution',
    sizeEstimate: '26 GB',
    minRamGB: 32,
    recommendedFor: 'Elite Tool Calling, Code Audits & Complex Logic',
    description: 'Trained on 5.5T tokens of code and math. Unrivaled local precision in structured JSON formatting, function calling, script writing, and data extraction.',
    strengths: ['Elite Tool Calling', 'Zero-Defect JSON Schemas', 'High Math & Logic IQ', 'Data Extraction'],
    vramTier: 'Medium / High VRAM'
  },
  {
    id: 'qwen2.5-coder-14b',
    name: 'Qwen 2.5 Coder (14B Instruct)',
    tag: 'qwen2.5-coder:14b',
    family: 'qwen-coder',
    category: 'specialist-execution',
    sizeEstimate: '9.0 GB',
    minRamGB: 16,
    recommendedFor: 'Fast Tool Calling & Efficient Systems',
    description: 'Fast, highly capable code and tool-calling specialist. Ideal for rapid JSON extraction and automation scripts with modest memory consumption.',
    strengths: ['Fast Execution', 'Tool Calling', 'JSON Extraction', 'Modest Memory'],
    vramTier: 'Balanced'
  }
];

/**
 * Check if the active model or installed set has an upgrade recommendation
 * @param {Array} installedModels - Models returned by Ollama
 * @param {string} activeModel - Currently configured model name
 * @returns {Object|null}
 */
export function checkForModelUpdates(installedModels = [], activeModel = '') {
  if (!activeModel) return null;

  const activeLower = activeModel.toLowerCase();
  const installedNames = (installedModels || []).map(m => m.name.toLowerCase());

  // 1. Check if user is running a mathematically abliterated model
  const isAbliterated = activeLower.includes('abliterated');
  if (isAbliterated) {
    // Check if user already has a curated uncensored or coder model installed
    const hasHermes = installedNames.some(n => n.startsWith('hermes3'));
    const hasQwenCoder = installedNames.some(n => n.startsWith('qwen2.5-coder:32b'));
    const hasDolphin = installedNames.some(n => n.startsWith('dolphin'));

    if (hasHermes) {
      const match = installedModels.find(m => m.name.toLowerCase().startsWith('hermes3'));
      return {
        hasUpdate: true,
        type: 'alignment-upgrade',
        badge: 'Recommended Upgrade',
        title: 'Upgrade to Curated Uncensored Foundation',
        currentModel: activeModel,
        recommendedTag: match.name,
        isInstalled: true,
        description: `Your active model "${activeModel}" uses mathematical weight abliteration which can cause tool-calling failures and hallucinations. You already have "${match.name}" installed, which provides curated zero-moralizing compliance with native function calling.`,
        actionLabel: 'Infuse & Activate Hermes Core ⚡'
      };
    } else if (hasQwenCoder) {
      const match = installedModels.find(m => m.name.toLowerCase().startsWith('qwen2.5-coder:32b'));
      return {
        hasUpdate: true,
        type: 'alignment-upgrade',
        badge: 'Recommended Upgrade',
        title: 'Upgrade to High-Logic Coder Foundation',
        currentModel: activeModel,
        recommendedTag: match.name,
        isInstalled: true,
        description: `You have "${match.name}" installed. You can infuse it into your Digital Bestie core to gain elite tool calling and mathematical reasoning without abliteration defects.`,
        actionLabel: 'Infuse & Activate Qwen Coder Core ⚡'
      };
    } else {
      return {
        hasUpdate: true,
        type: 'download-recommendation',
        badge: 'New Architecture Available',
        title: 'Curated Uncensored Model Available',
        currentModel: activeModel,
        recommendedTag: 'hermes3:8b',
        isInstalled: false,
        size: '4.9 GB',
        description: `Switch from mathematically abliterated weights to Nous Hermes 3 (8B) for reliable tool-calling, reduced hallucinations, and zero safety disclaimers.`,
        actionLabel: '📥 Download & Infuse Hermes 3 (8B)'
      };
    }
  }

  // 2. Check for missing curated models when running a generic or smaller model
  if (activeLower.startsWith('bestie-light') || activeLower === 'qwen2.5:14b') {
    const hasCoder32 = installedNames.some(n => n.startsWith('qwen2.5-coder:32b'));
    if (hasCoder32) {
      const match = installedModels.find(m => m.name.toLowerCase().startsWith('qwen2.5-coder:32b'));
      return {
        hasUpdate: true,
        type: 'tier-upgrade',
        badge: 'Performance Upgrade',
        title: 'Higher Intelligence Core Available',
        currentModel: activeModel,
        recommendedTag: match.name,
        isInstalled: true,
        description: `You have the 32B high-capacity "${match.name}" installed. Infusing it into your core will significantly boost reasoning depth and precision.`,
        actionLabel: 'Infuse & Upgrade Core ⚡'
      };
    }
  }

  return null;
}

/**
 * Return curated catalog annotated with local installation state
 */
export function getCuratedCatalog(installedModels = [], activeModel = '') {
  const activeLower = (activeModel || '').toLowerCase();
  const installedMap = new Map();

  for (const m of installedModels || []) {
    installedMap.set(m.name.toLowerCase(), m);
  }

  return CURATED_MODELS_CATALOG.map(entry => {
    const exactInstalled = installedMap.get(entry.tag.toLowerCase());
    const altInstalled = entry.altTag ? installedMap.get(entry.altTag.toLowerCase()) : null;
    const installed = exactInstalled || altInstalled;
    const isInstalled = !!installed;

    const isActive = isInstalled && (
      activeLower === entry.tag.toLowerCase() ||
      (entry.altTag && activeLower === entry.altTag.toLowerCase()) ||
      (activeLower.startsWith('bestie') && installed && installed.name.toLowerCase().includes(entry.family))
    );

    return {
      ...entry,
      isInstalled,
      installedName: installed ? installed.name : entry.tag,
      actualSizeBytes: installed ? installed.size : null,
      isActive
    };
  });
}
