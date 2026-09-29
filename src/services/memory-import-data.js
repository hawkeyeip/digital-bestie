/**
 * Memory Consolidation & Multi-AI Import Engine
 * Providers, export prompts, intelligent parser, and dossier mapping matrix
 */

export const IMPORT_PROVIDERS = {
  claude: {
    id: 'claude',
    name: 'Claude',
    company: 'Anthropic',
    icon: '🟠',
    color: '#d97706',
    description: 'Export stored memories, custom instructions, and conversational preferences from Claude.',
    prompt: `Export all of my stored memories and any context you've learned about me from past conversations. Preserve my words verbatim where possible, especially for instructions and preferences.

## Categories (output in this order):

1. **Instructions**: Rules I've explicitly asked you to follow going forward — tone, format, style, "always do X", "never do Y", and corrections to your behavior. Only include rules from stored memories, not from conversations.

2. **Identity**: Name, age, location, education, family, relationships, languages, and personal interests.

3. **Career**: Current and past roles, companies, and general skill areas.

4. **Projects**: Projects I meaningfully built or committed to. Ideally ONE entry per project. Include what it does, current status, and any key decisions. Use the project name or a short descriptor as the first words of the entry.

5. **Preferences**: Opinions, tastes, and working-style preferences that apply broadly.

## Format:

Use section headers for each category. Within each category, list one entry per line, sorted by oldest date first. Format each line as:

[YYYY-MM-DD] - Entry content here.

If no date is known, use [unknown] instead.

## Output:
- Wrap the entire export in a single code block for easy copying.
- After the code block, state whether this is the complete set or if more remain.`
  },

  gemini: {
    id: 'gemini',
    name: 'Gemini',
    company: 'Google',
    icon: '🔵',
    color: '#3b82f6',
    description: 'Export demographic facts, confirmed projects, sustained relationships, and behavioral rules from Gemini.',
    prompt: `You are helping me import context from one AI assistant to another. Your job is to go through our past conversations and sum up what you know about me.

In the output, please avoid using any first-person pronouns (I, my, me, mine) and any second-person pronouns (you, your, yours). Instead, refer to the individual you have learned about as "the user" or use neutral phrasing.

Preserve the user's words verbatim where possible, especially for instructions and preferences.

Categories (output in this order):
1. Demographics Information: Preferred names, profession, education, and general residence.
2. Interests & Preferences: Sustained, active engagements (not just owning an object or a one-time purchase).
3. Relationships: Confirmed, sustained relationships.
4. Dated Events, Projects & Plans: A log of significant, recent activities.
5. Instructions: Rules I've explicitly asked you to follow going forward, "always do X", "never do Y", and corrections to your behavior. Only include rules from stored memories, not from conversations.

Format:
Divide the content into the labeled section using the categories above. Try to include verbatim quotes from my prompts that justify each entry. Structure each entry using this format:
* The user's name is <name>.
    * Evidence: User said "call me <name>". Date: [YYYY-MM-DD].

Output:
- Output ONLY the requested information. Do not include any conversational filler, intro text, or sign-offs.

Finally, complete the sentence "Imported from: <name>", where name is ChatGPT, Claude, Grok, etc. This must be the absolute final text in your response.`
  },

  venice: {
    id: 'venice',
    name: 'Venice AI',
    company: 'Venice',
    icon: '🟣',
    color: '#a855f7',
    description: 'Export privacy-focused facts, tools, recurring topics, and instructions from Venice AI.',
    prompt: `I'm switching to a new AI assistant and need to bring my context with me. Please compile everything you know about me into a single summary I can paste into my new assistant's memory.

Include:
- Personal details (name, location, occupation, etc.)
- Preferences and interests
- Communication style preferences
- Recurring topics or projects we've discussed
- Technical skills or tools I use
- Any instructions or rules I've given you
- Important context from our past conversations

Format the output as a markdown bulleted list. Each distinct fact or preference should be on its own line, prefixed with "- ". Keep each entry concise (1-2 sentences max). Do not include headers, sections, timestamps, metadata, or commentary -- just a flat list of facts.

Example format:
- Prefers concise, direct responses without unnecessary filler
- Works as a software engineer specializing in React and TypeScript
- Located in San Francisco, CA`
  },

  chatgpt: {
    id: 'chatgpt',
    name: 'ChatGPT',
    company: 'OpenAI',
    icon: '🟢',
    color: '#10b981',
    description: 'Export stored memories, custom instructions, and behavioral profile from ChatGPT.',
    prompt: `Please compile all of my stored memories, custom instructions, and persistent preferences into a structured summary for migration to another assistant.

Include:
- Personal details (Name, location, background, profession)
- Stored User Preferences & Communication style
- Core projects, ventures, or technical skills
- Hard boundaries, anti-goals, and rules I have asked you to follow

Format as a clean markdown bulleted list with category headings. Keep each entry atomic (one distinct fact or instruction per bullet). Do not include conversational filler.`
  },

  grok: {
    id: 'grok',
    name: 'Grok',
    company: 'xAI',
    icon: '⚡',
    color: '#ffffff',
    description: 'Export stored memories, user profile notes, and persistent instructions from Grok.',
    prompt: `Please compile all stored memories, custom instructions, and personal context you have learned about me from our conversations for migration into another assistant.

Categories to extract:
1. Demographics & Identity (Name, location, background, work)
2. Goals & Hard Boundaries (90-day outcomes, anti-goals, non-negotiables)
3. Financial Realities (Emergency cash floor, burn rate, minimum pricing)
4. Psychology & Triggers (Avoidance habits, procrastination traps, preferred tone)
5. Active Ventures & Skills (Projects, startups, technical advantages)
6. Operating Rules (Format, brevity, directness preferences)

Format as a markdown bulleted list with clear category headers. Keep each bullet atomic and factual.`
  },

  custom: {
    id: 'custom',
    name: 'Raw Notes / Other AI',
    company: 'Universal',
    icon: '📝',
    color: '#00f0ff',
    description: 'Import from any personal notes, Notion documents, or other LLMs (Grok, Perplexity, Cursor, Copilot).',
    prompt: `Please summarize everything you know about me into distinct, atomic bullet points grouped under:
1. Identity & Location (Name, where I live, work situation)
2. Goals & Hard Boundaries (What I want in 90 days vs. what I refuse to tolerate)
3. Financial Realities (Emergency cash floor, runway, pricing minimums)
4. Avoidance Triggers & Habits (Procrastination patterns, escape mechanisms)
5. Active Projects & Skills (What I'm building, core technical superpowers)
6. Communication Rules (How you must speak to me, format, and tone)`
  }
};

export const DOSSIER_TARGET_FIELDS = [
  { path: 'user_profile.goal_and_boundary_matrix.north_star_90_day', label: '🎯 90-Day North Star Goal', action: 'set', type: 'string' },
  { path: 'user_profile.goal_and_boundary_matrix.anti_goals', label: '🛡️ Anti-Goals & Refusals', action: 'append', type: 'array' },
  { path: 'user_profile.goal_and_boundary_matrix.client_red_flags', label: '⚠️ Client Red Flags', action: 'append', type: 'array' },
  { path: 'user_profile.goal_and_boundary_matrix.inflexible_rules', label: '🛑 Inflexible Rules & Boundaries', action: 'append', type: 'array' },
  { path: 'user_profile.goal_and_boundary_matrix.rate_floor', label: '💵 Rate & Pricing Floor', action: 'set', type: 'string' },
  { path: 'user_profile.identity_and_baseline.active_location', label: '📍 Current Location', action: 'set', type: 'string' },
  { path: 'user_profile.identity_and_baseline.current_living_situation', label: '🏠 Living & Workspace Setup', action: 'set', type: 'string' },
  { path: 'user_profile.identity_and_baseline.primary_acute_stressor', label: '⚡ Primary Acute Stressor', action: 'set', type: 'string' },
  { path: 'user_profile.identity_and_baseline.hard_cash_floor', label: '💰 Absolute Cash Floor ($)', action: 'set', type: 'number' },
  { path: 'user_profile.identity_and_baseline.burn_rate_weekly', label: '🔥 Weekly Burn Rate ($)', action: 'set', type: 'number' },
  { path: 'user_profile.identity_and_baseline.runway_run_out_date', label: '⏳ Runway Target / Deadline', action: 'set', type: 'string' },
  { path: 'user_profile.cognitive_and_behavioral_profile.primary_avoidance_triggers', label: '🛑 Avoidance Triggers', action: 'append', type: 'array' },
  { path: 'user_profile.cognitive_and_behavioral_profile.escape_mechanisms', label: '🌀 Escape & Numbing Traps', action: 'append', type: 'array' },
  { path: 'user_profile.cognitive_and_behavioral_profile.tone_preference', label: '🎙️ Operating Tone Preference', action: 'set', type: 'string' },
  { path: 'user_profile.cognitive_and_behavioral_profile.execution_style', label: '⚡ Execution Style', action: 'set', type: 'string' },
  { path: 'user_profile.secret_venture_incubator.active_project_name', label: '🚀 Active Venture / Project Name', action: 'set', type: 'string' },
  { path: 'user_profile.secret_venture_incubator.core_skills_leveraged', label: '🛠️ Core Skills & Advantages', action: 'append', type: 'array' },
  { path: 'user_profile.secret_venture_incubator.distribution_channels', label: '📢 Distribution Channels & GTM', action: 'append', type: 'array' },
  { path: 'user_profile.secret_venture_incubator.backlog_micro_tasks', label: '📌 High-Leverage Tasks', action: 'append', type: 'array' },
  { path: 'user_profile.high_leverage_methods_vault.custom_prompt_templates', label: '📋 Standing Instructions & Rules', action: 'append', type: 'array' }
];

/**
 * Intelligent Heuristic Parser: converts raw pasted text from any AI model into
 * structured, atomic candidate items with proposed Living Dossier paths
 */
export function parseExportedMemory(rawText, providerId = 'claude') {
  if (!rawText || !rawText.trim()) return [];

  // Strip code fences if the user copied code block from Claude
  let text = rawText.replace(/```(?:markdown|json|text)?/gi, '').replace(/```/g, '').trim();

  // Remove trailing "Imported from: ..." footer or intro filler
  text = text.replace(/Imported from:\s*[A-Za-z0-9_-]+/gi, '');
  text = text.replace(/^(Sure|Here is|Here are|Certainly|Below is)[\s\S]*?:/i, '');

  const lines = text.split('\n');
  const candidateItems = [];
  let currentSection = '';
  let idCounter = 1;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line) continue;

    // Detect markdown headings or numbered category lines
    const headingMatch = line.match(/^(?:#{1,4}|\d+\.)\s+\*?\*?([A-Za-z0-9\s&,/-]+?)\*?\*?:?$/i);
    if (headingMatch && line.length < 80) {
      currentSection = headingMatch[1].trim().toLowerCase();
      continue;
    }

    // Ignore secondary evidence lines (e.g. Gemini's "* Evidence: ...")
    if (/^\*?\s*Evidence:/i.test(line) || /^Evidence:/i.test(line)) {
      continue;
    }

    // Clean up list bullets, dates, numbering
    // e.g. [2026-07-17] - Entry text
    // e.g. * The user's name is Brandon
    // e.g. - Prefers concise answers
    let cleaned = line
      .replace(/^[-*•]\s+/, '')
      .replace(/^\d+[\.\)]\s+/, '')
      .replace(/^\[(?:[0-9]{4}-[0-9]{2}-[0-9]{2}|unknown)\]\s*[-—:]?\s*/i, '')
      .trim();

    if (!cleaned || cleaned.length < 4) continue;

    // Classify destination path and category based on section context & keywords
    const { path, label, action, category, cleanVal } = classifyMemoryItem(cleaned, currentSection);

    candidateItems.push({
      id: `item_${Date.now()}_${idCounter++}`,
      raw: line,
      value: cleanVal,
      path: path,
      label: label,
      action: action,
      category: category,
      checked: true,
      provider: providerId
    });
  }

  return candidateItems;
}

/**
 * Classifies an individual memory item into the appropriate Living Dossier dot-path
 */
function classifyMemoryItem(text, sectionContext = '') {
  const lower = text.toLowerCase();
  const sec = sectionContext.toLowerCase();

  // 1. Instructions & Standing Rules
  if (sec.includes('instruction') || lower.startsWith('always ') || lower.startsWith('never ') || lower.includes('do not ') || lower.includes('avoid using')) {
    if (lower.includes('never') || lower.includes('refuse') || lower.includes('no hourly') || lower.includes('won\'t do')) {
      return {
        path: 'user_profile.goal_and_boundary_matrix.anti_goals',
        label: '🛡️ Anti-Goals & Refusals',
        action: 'append',
        category: 'Goals & Boundaries',
        cleanVal: text.replace(/^(the user asks to|always|never)\s+/i, '').trim()
      };
    }
    return {
      path: 'user_profile.high_leverage_methods_vault.custom_prompt_templates',
      label: '📋 Standing Instructions & Rules',
      action: 'append',
      category: 'Instructions & Rules',
      cleanVal: text
    };
  }

  // 2. Client Red Flags & Boundaries
  if (lower.includes('red flag') || lower.includes('dealbreaker') || lower.includes('scope creep') || lower.includes('bad client')) {
    return {
      path: 'user_profile.goal_and_boundary_matrix.client_red_flags',
      label: '⚠️ Client Red Flags',
      action: 'append',
      category: 'Goals & Boundaries',
      cleanVal: text
    };
  }

  // 3. Location & Residence
  if (sec.includes('demographic') || sec.includes('identity') || lower.includes('lives in') || lower.includes('located in') || lower.includes('resides in') || lower.includes('residence') || lower.includes('location:')) {
    if (lower.includes('in ') || lower.includes('san francisco') || lower.includes('austin') || lower.includes('new york') || lower.includes('texas') || lower.includes('california') || lower.includes('living in')) {
      const locMatch = text.match(/(?:located in|lives in|resides in|location:?|in)\s+([^,.]+?(?:,\s*[A-Z]{2}|,\s*[A-Za-z]+)?)/i);
      const loc = locMatch ? locMatch[1].trim() : text;
      return {
        path: 'user_profile.identity_and_baseline.active_location',
        label: '📍 Current Location',
        action: 'set',
        category: 'Identity & Baseline',
        cleanVal: loc
      };
    }
    if (lower.includes('couch') || lower.includes('sublet') || lower.includes('apartment') || lower.includes('office') || lower.includes('living situation')) {
      return {
        path: 'user_profile.identity_and_baseline.current_living_situation',
        label: '🏠 Living & Workspace Setup',
        action: 'set',
        category: 'Identity & Baseline',
        cleanVal: text
      };
    }
  }

  // 4. Financials: Cash Floor, Burn Rate, Pricing
  if (lower.includes('cash floor') || lower.includes('emergency floor') || lower.includes('reserve floor')) {
    const num = text.match(/\$?([0-9,]+)/);
    return {
      path: 'user_profile.identity_and_baseline.hard_cash_floor',
      label: '💰 Absolute Cash Floor ($)',
      action: 'set',
      category: 'Capital & Financials',
      cleanVal: num ? Number(num[1].replace(/,/g, '')) : text
    };
  }
  if (lower.includes('burn rate') || lower.includes('weekly cost') || lower.includes('cost of survival')) {
    const num = text.match(/\$?([0-9,]+)/);
    return {
      path: 'user_profile.identity_and_baseline.burn_rate_weekly',
      label: '🔥 Weekly Burn Rate ($)',
      action: 'set',
      category: 'Capital & Financials',
      cleanVal: num ? Number(num[1].replace(/,/g, '')) : text
    };
  }
  if (lower.includes('rate floor') || lower.includes('pricing minimum') || lower.includes('minimum rate') || lower.includes('hourly rate')) {
    return {
      path: 'user_profile.goal_and_boundary_matrix.rate_floor',
      label: '💵 Rate & Pricing Floor',
      action: 'set',
      category: 'Capital & Financials',
      cleanVal: text
    };
  }

  // 5. 90-Day North Star & High-Stakes Goals
  if (sec.includes('goal') || lower.includes('north star') || lower.includes('90-day') || lower.includes('main goal') || lower.includes('priority outcome')) {
    return {
      path: 'user_profile.goal_and_boundary_matrix.north_star_90_day',
      label: '🎯 90-Day North Star Goal',
      action: 'set',
      category: 'Goals & Boundaries',
      cleanVal: text
    };
  }

  // 6. Avoidance Triggers & Traps
  if (sec.includes('avoidance') || lower.includes('avoid') || lower.includes('procrastinat') || lower.includes('freeze') || lower.includes('dread')) {
    return {
      path: 'user_profile.cognitive_and_behavioral_profile.primary_avoidance_triggers',
      label: '🛑 Avoidance Triggers',
      action: 'append',
      category: 'Psychology & Avoidance',
      cleanVal: text
    };
  }
  if (lower.includes('escape') || lower.includes('numbing') || lower.includes('impulse spend') || lower.includes('doomscroll')) {
    return {
      path: 'user_profile.cognitive_and_behavioral_profile.escape_mechanisms',
      label: '🌀 Escape & Numbing Traps',
      action: 'append',
      category: 'Psychology & Avoidance',
      cleanVal: text
    };
  }

  // 7. Tone & Communication Preferences
  if (sec.includes('preference') && (lower.includes('concise') || lower.includes('direct') || lower.includes('humor') || lower.includes('tone') || lower.includes('response style'))) {
    return {
      path: 'user_profile.cognitive_and_behavioral_profile.tone_preference',
      label: '🎙️ Operating Tone Preference',
      action: 'set',
      category: 'Preferences & Dynamic',
      cleanVal: text
    };
  }

  // 8. Projects & Ventures
  if (sec.includes('project') || sec.includes('career') || lower.includes('building') || lower.includes('founded') || lower.includes('working on') || lower.includes('venture')) {
    return {
      path: 'user_profile.secret_venture_incubator.active_project_name',
      label: '🚀 Active Venture / Project Name',
      action: 'set',
      category: 'Ventures & Skills',
      cleanVal: text
    };
  }

  // 9. Technical Skills & Superpowers
  if (sec.includes('skill') || lower.includes('engineer') || lower.includes('stack') || lower.includes('typescript') || lower.includes('python') || lower.includes('react') || lower.includes('developer')) {
    return {
      path: 'user_profile.secret_venture_incubator.core_skills_leveraged',
      label: '🛠️ Core Skills & Advantages',
      action: 'append',
      category: 'Ventures & Skills',
      cleanVal: text
    };
  }

  // Fallback default: Anti-goals / Boundaries or Instructions depending on phrasing
  if (lower.startsWith('no ') || lower.includes('refuse') || lower.includes('anti-goal')) {
    return {
      path: 'user_profile.goal_and_boundary_matrix.anti_goals',
      label: '🛡️ Anti-Goals & Refusals',
      action: 'append',
      category: 'Goals & Boundaries',
      cleanVal: text
    };
  }

  return {
    path: 'user_profile.high_leverage_methods_vault.custom_prompt_templates',
    label: '📋 Stored Context Fact',
    action: 'append',
    category: 'General Context',
    cleanVal: text
  };
}

export const DEMO_CLAUDE_EXPORT = `## Instructions
[2026-07-17] - Keep lists under five things and lead with high-leverage actions.
[2026-08-01] - Always be candid, direct, and zero fluff; challenge ungrounded pivots.
[2026-08-15] - Never accept low-ball hourly consulting under $150/hr or spec work.

## Identity
[2026-05-10] - Brandon is a founder and senior systems architect located in Austin, TX.
[2026-06-01] - Currently working out of a dynamic downtown workspace sanctuary.

## Career & Skills
[2026-04-12] - Deep expertise in Electron, Node.js, Ollama local AI, and TypeScript.
[2026-06-20] - Founder of Hawkeye IP and creator of Digital Bestie local AI companion.

## Projects
[2026-07-02] - Digital Bestie: 100% private, sovereign desktop AI companion with living memory dossier.
[2026-08-10] - Superbrain Hub: Unified resource tracker and Neon Brain local second brain.

## Preferences & Boundaries
[2026-07-22] - Hard cash floor of $12,000 to maintain sovereign creative independence.
[2026-08-04] - Primary avoidance trigger is context-switching and bureaucratic administrative chores.
[2026-08-18] - Red flags: Ambiguous client scopes, delayed milestones, and scope creep without budget adjustment.`;
