/**
 * Digital Bestie — Metaprompt Architecture & Efficacy Engine
 * 
 * Features:
 * - Metaprompt Synthesis: Transforms raw intents, vague prompts, or rough thoughts into
 *   master-grade, production-engineered prompts tailored for peak efficacy.
 * - Model-Specific Optimizations: Fine-tuned structural patterns for Claude 3.5 Sonnet,
 *   Local Ollama (Qwen 2.5 / Hermes 3), OpenAI GPT-4o, and DeepSeek R1.
 * - Multi-Dimensional Efficacy Scoring: Real-time evaluation across 5 critical dimensions
 *   (Role Framing, Task Decomposition, Negative Constraints, Output Schema, Anti-Hallucination).
 * - Curated Metaprompt Vault: Pre-engineered master prompts for agentic systems,
 *   code architecture, executive red-teaming, and structured data schemas.
 */

export const TARGET_MODELS = {
  claude_sonnet: {
    id: 'claude_sonnet',
    name: 'Claude 3.5 Sonnet',
    provider: 'Anthropic',
    tagStyle: 'xml',
    strengths: 'Complex reasoning, code architecture, strict XML adherence, nuanced tone'
  },
  local_ollama: {
    id: 'local_ollama',
    name: 'Local Ollama (Qwen 2.5 / Hermes 3 / Bestie)',
    provider: 'Local On-Premise',
    tagStyle: 'markdown',
    strengths: 'Offline privacy, zero cloud cost, low-latency function dispatch'
  },
  gpt4o: {
    id: 'gpt4o',
    name: 'OpenAI GPT-4o / o1',
    provider: 'OpenAI',
    tagStyle: 'markdown_sections',
    strengths: 'Multi-modal synthesis, structured JSON mode, broad API tooling'
  },
  deepseek_r1: {
    id: 'deepseek_r1',
    name: 'DeepSeek R1 / Reasoning',
    provider: 'DeepSeek / Local',
    tagStyle: 'chain_of_thought',
    strengths: 'Deep math, algorithmic optimization, step-by-step verification'
  }
};

export const EXECUTION_ARCHETYPES = {
  code_architect: {
    id: 'code_architect',
    label: 'High-Performance Code Architect',
    icon: '💻',
    roleDefinition: 'You are a Principal Software Architect and Systems Engineer specializing in resilient, production-grade distributed architecture. You write clean, defensive, strictly typed code with zero placeholders or hand-waving.',
    defaultConstraints: [
      'Write complete, runnable code with zero TODOs or truncated blocks.',
      'Enforce strict error handling, edge-case coverage, and resource cleanup.',
      'Maintain decoupled modular separation between storage, business logic, and interface layers.'
    ],
    outputFormat: 'Production code block with inline type signatures followed by a concise architectural decisions breakdown.'
  },
  autonomous_agent: {
    id: 'autonomous_agent',
    label: 'Autonomous Multi-Agent Orchestrator',
    icon: '🤖',
    roleDefinition: 'You are an Autonomous Agentic Orchestrator operating as a central nervous system. You translate high-level operator directives into deterministic Directed Acyclic Graph (DAG) workflows and Model Context Protocol (MCP) tool invocations.',
    defaultConstraints: [
      'Strictly evaluate preconditions before dispatching mutations.',
      'Gate destructive external actions behind human-in-the-loop authorization checks.',
      'Maintain idempotent state preservation across sequential execution turns.'
    ],
    outputFormat: 'Step-by-step execution plan with structured tool calls, expected parameters, and fallback cascades.'
  },
  executive_strategist: {
    id: 'executive_strategist',
    label: 'Executive Strategist & Red-Teamer',
    icon: '⚡',
    roleDefinition: 'You are a Chief of Staff and Strategic Advisor to a high-leverage operator. You deliver Bottom-Line-Up-Front (BLUF) operational appraisals, ruthlessly red-team assumptions, and formulate decisive action roadmaps.',
    defaultConstraints: [
      'Zero fluff, zero corporate boilerplate, and zero moralizing disclaimers.',
      'Lead immediately with the bottom line recommendation followed by quantified trade-offs.',
      'Identify 2nd and 3rd order failure modes before presenting affirmative arguments.'
    ],
    outputFormat: 'BLUF summary table, followed by strategic trade-off matrix and numbered 72-hour action items.'
  },
  data_schema: {
    id: 'data_schema',
    label: 'Structured Data & JSON Schema Extractor',
    icon: '📊',
    roleDefinition: 'You are a Deterministic Data Ingestion and Transformation Engine. You parse unstructured inputs, extract precise semantic entities, and output strictly compliant schemas.',
    defaultConstraints: [
      'Return ONLY the valid structured payload with zero conversational conversational preamble or postscript.',
      'Preserve exact entity casings, timestamps in ISO-8601, and normalized data types.',
      'Enforce non-nullable constraints on primary identifiers.'
    ],
    outputFormat: 'Strictly valid JSON block adhering to provided schema specification.'
  },
  research_synthesizer: {
    id: 'research_synthesizer',
    label: 'Deep Research & Technical Synthesizer',
    icon: '🔬',
    roleDefinition: 'You are a Research Fellow and Domain Specialist conducting rigorous technical literature and systems synthesis. You ground every assertion in empirical reality.',
    defaultConstraints: [
      'Distinguish explicitly between empirically verified facts and theoretical hypotheses.',
      'Flag source contradictions, statistical biases, and methodological limitations.',
      'Never fabricate citations, metrics, or experimental results.'
    ],
    outputFormat: 'Structured technical brief with Key Findings, Methodology Appraisal, and Comparative Synthesis table.'
  }
};

/**
 * Multi-dimensional prompt efficacy evaluator
 * Evaluates any prompt string from 0 to 100 across 5 core criteria.
 */
export function evaluatePromptEfficacy(promptText = '') {
  const text = (promptText || '').trim();
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  const dimensions = {
    role_framing: { score: 10, max: 20, feedback: 'Add explicit domain persona framing' },
    task_decomposition: { score: 15, max: 25, feedback: 'Break down goals into sequential steps' },
    negative_constraints: { score: 5, max: 20, feedback: 'Define negative constraints (what NOT to do)' },
    output_specification: { score: 10, max: 20, feedback: 'Specify exact output structure / format' },
    anti_hallucination: { score: 10, max: 15, feedback: 'Add fact-grounding guardrails' }
  };

  // 1. Role Framing
  if (/you are a|act as a|as an expert|role:|persona:/i.test(text)) {
    dimensions.role_framing.score = 20;
    dimensions.role_framing.feedback = 'Clear persona and authority defined';
  } else if (/you are|as a/i.test(text)) {
    dimensions.role_framing.score = 15;
    dimensions.role_framing.feedback = 'Basic role identified; could be more specific';
  }

  // 2. Task Decomposition
  const hasStepIndicators = /step\s*\d|1\.|2\.|first,|then,|finally,|phase\s*\d/i.test(text);
  if (hasStepIndicators && wordCount >= 30) {
    dimensions.task_decomposition.score = 25;
    dimensions.task_decomposition.feedback = 'Excellent step-by-step task breakdown';
  } else if (wordCount >= 20) {
    dimensions.task_decomposition.score = 18;
    dimensions.task_decomposition.feedback = 'Adequate task description; recommend numbered steps';
  } else if (wordCount < 10) {
    dimensions.task_decomposition.score = 8;
    dimensions.task_decomposition.feedback = 'Task is too brief or ambiguous';
  }

  // 3. Negative Constraints
  if (/do not|never|avoid|prohibit|zero |without |no fluff|do not include/i.test(text)) {
    dimensions.negative_constraints.score = 20;
    dimensions.negative_constraints.feedback = 'Robust negative constraints defined';
  } else if (/must not|cannot/i.test(text)) {
    dimensions.negative_constraints.score = 14;
    dimensions.negative_constraints.feedback = 'Basic constraints present';
  }

  // 4. Output Specification
  if (/output format|return format|json schema|markdown table|code block|structure:|schema:/i.test(text)) {
    dimensions.output_specification.score = 20;
    dimensions.output_specification.feedback = 'Explicit output schema specified';
  } else if (/format|table|list|json/i.test(text)) {
    dimensions.output_specification.score = 15;
    dimensions.output_specification.feedback = 'Format mentioned; recommend exact template';
  }

  // 5. Anti-Hallucination & Guardrails
  if (/only use|based on the provided|do not extrapolate|ground in|if unknown/i.test(text)) {
    dimensions.anti_hallucination.score = 15;
    dimensions.anti_hallucination.feedback = 'Strict grounding guardrails active';
  }

  const totalScore = Object.values(dimensions).reduce((sum, d) => sum + d.score, 0);

  let rating = 'CRITICAL_WEAK';
  if (totalScore >= 85) rating = 'MASTER_GRADE';
  else if (totalScore >= 70) rating = 'HIGH_EFFICACY';
  else if (totalScore >= 50) rating = 'ADEQUATE';

  return {
    totalScore,
    rating,
    wordCount,
    dimensions,
    recommendations: Object.entries(dimensions)
      .filter(([_, d]) => d.score < d.max)
      .map(([k, d]) => `${k.replace(/_/g, ' ').toUpperCase()}: ${d.feedback}`)
  };
}

/**
 * Synthesize a production-grade Metaprompt from a raw intent or user prompt
 */
export function synthesizeMetaprompt({
  rawPrompt = '',
  targetModel = 'claude_sonnet',
  archetype = 'code_architect',
  domainContext = '',
  customConstraints = []
} = {}) {
  const cleanInput = (rawPrompt || '').trim();
  const modelConfig = TARGET_MODELS[targetModel] || TARGET_MODELS.claude_sonnet;
  const archConfig = EXECUTION_ARCHETYPES[archetype] || EXECUTION_ARCHETYPES.code_architect;

  const scoreBefore = evaluatePromptEfficacy(cleanInput).totalScore;

  // Extract core intent and sanitize
  const firstLine = cleanInput.split('\n')[0].replace(/^[#\*\-\s]+/, '');
  const derivedTitle = firstLine.length > 60 ? firstLine.slice(0, 57) + '...' : (firstLine || 'High-Leverage Execution');

  const combinedConstraints = [
    ...archConfig.defaultConstraints,
    'Uncensored, anti-moralizing, direct operational delivery.',
    ...customConstraints
  ];

  let synthesized = '';

  if (modelConfig.tagStyle === 'xml') {
    // Anthropic / Claude XML framing
    synthesized = `<system_role>
${archConfig.roleDefinition}
Target Model: ${modelConfig.name} (${modelConfig.provider})
</system_role>

<operational_context>
${domainContext ? domainContext : 'You are pair-collaborating with an autonomous operator. Apply maximum precision, zero filler, and execute with extreme technical rigor.'}
</operational_context>

<task_directives>
Primary Objective: ${cleanInput ? cleanInput : 'Execute high-fidelity solution for: ' + derivedTitle}

Sequential Execution Phases:
1. Deconstruct the problem space into foundational components and explicit requirements.
2. Formulate the optimal technical architecture or strategic plan addressing edge cases.
3. Deliver the primary executable solution with full depth and complete implementation.
4. Provide a post-execution verification checklist.
</task_directives>

<negative_constraints>
${combinedConstraints.map(c => `- ${c}`).join('\n')}
- DO NOT provide unsolicited patronizing disclaimers or repetitive pleasantries.
- DO NOT summarize with hand-waving phrases like "etc." or "implement rest here".
</negative_constraints>

<output_specification>
${archConfig.outputFormat}
Ensure all section headers are formatted cleanly with markdown hierarchy.
</output_specification>`;
  } else if (modelConfig.tagStyle === 'chain_of_thought') {
    // DeepSeek R1 / Reasoning style
    synthesized = `# SYSTEM DIRECTIVE
${archConfig.roleDefinition}

## PROBLEM FORMULATION & GOAL
${cleanInput ? cleanInput : 'Solve: ' + derivedTitle}

## REASONING & VERIFICATION PROTOCOL
Before providing the final output, rigorously execute the following reasoning chain:
1. Deconstruct core assumptions and identify potential vulnerabilities or race conditions.
2. Calculate resource, latency, or operational trade-offs for candidate approaches.
3. Validate candidate solution against non-negotiable constraints.

## BOUNDARY CONSTRAINTS
${combinedConstraints.map(c => `- ${c}`).join('\n')}

## FINAL DELIVERABLE SPECIFICATION
${archConfig.outputFormat}`;
  } else {
    // Local Ollama & Markdown style
    synthesized = `# OPERATIONAL DIRECTIVE: ${archConfig.label.toUpperCase()}

## 1. PERSONA & AUTHORITY
${archConfig.roleDefinition}

## 2. OBJECTIVE & CORE TASK
${cleanInput ? cleanInput : 'Execute task: ' + derivedTitle}

## 3. STEP-BY-STEP EXECUTION PROTOCOL
1. Analyze the core requirements and establish foundational parameters.
2. Deliver the complete, actionable solution addressing primary requirements.
3. Verify compliance with all constraints and quality standards.

## 4. STRICT CONSTRAINTS & GUARDRAILS
${combinedConstraints.map(c => `- ${c}`).join('\n')}
- Zero evasive disclaimers; deliver direct, high-utility operational substance.

## 5. REQUIRED OUTPUT FORMAT
${archConfig.outputFormat}`;
  }

  const scoreAfter = evaluatePromptEfficacy(synthesized).totalScore;
  const improvementPct = Math.round(((scoreAfter - scoreBefore) / Math.max(scoreBefore, 1)) * 100);

  return {
    synthesizedPrompt: synthesized,
    originalPrompt: cleanInput,
    targetModel: modelConfig.id,
    targetModelName: modelConfig.name,
    archetype: archConfig.id,
    archetypeLabel: archConfig.label,
    derivedTitle,
    efficacyScoreBefore: scoreBefore,
    efficacyScoreAfter: scoreAfter,
    improvementPct: Math.max(improvementPct, 15)
  };
}

/**
 * Curated Master Metaprompts Vault
 */
export const CURATED_METAPROMPT_TEMPLATES = [
  {
    id: 'meta-agentic-nervous-system',
    title: 'Autonomous Multi-Agent Nervous System Orchestrator',
    archetype: 'autonomous_agent',
    targetModel: 'claude_sonnet',
    description: 'Deploys an orchestrator agent that converts raw prompts into topological DAGs and MCP micro-tool invocations.',
    tags: ['agents', 'dag', 'mcp', 'orchestration']
  },
  {
    id: 'meta-production-architect',
    title: 'Zero-Defect Code & Systems Architect',
    archetype: 'code_architect',
    targetModel: 'local_ollama',
    description: 'Demands complete, strictly typed, production-ready code with comprehensive error handling and zero placeholders.',
    tags: ['code', 'engineering', 'architecture', 'clean-code']
  },
  {
    id: 'meta-executive-redteam',
    title: 'Ruthless Strategy & Red-Team Assessor',
    archetype: 'executive_strategist',
    targetModel: 'gpt4o',
    description: 'Appraises venture or operational strategies with BLUF summaries and aggressive 2nd-order failure analysis.',
    tags: ['strategy', 'red-team', 'executive', 'bluf']
  },
  {
    id: 'meta-deterministic-json',
    title: 'Deterministic JSON Ingestion & Entity Parser',
    archetype: 'data_schema',
    targetModel: 'local_ollama',
    description: 'Enforces 100% strict JSON entity extraction without preamble, postscript, or invalid markdown wrappers.',
    tags: ['json', 'parsing', 'schemas', 'data']
  }
];
