/**
 * Digital Bestie — Curated Prompt Library & Operator Directives
 * Master prompts designed for high-leverage execution, strategic planning,
 * red-teaming, systems debugging, and automated operations.
 */

export const PROMPT_CATEGORIES = [
  { id: 'favorites', name: 'Favorites', icon: '⭐' },
  { id: 'all', name: 'All Prompts', icon: '🌐' },
  { id: 'ops', name: 'Executive & Ops', icon: '⚡' },
  { id: 'strategy', name: 'Strategy & Red-Team', icon: '🔮' },
  { id: 'engineering', name: 'Diagnostics & Code', icon: '🔧' },
  { id: 'learning', name: 'Growth & Mastery', icon: '🧠' },
  { id: 'production', name: 'Shipping & Delivery', icon: '📦' },
  { id: 'communication', name: 'Writing & Compression', icon: '✍️' },
  { id: 'automation', name: 'Systems & Workflows', icon: '🤖' },
  { id: 'meta', name: 'Meta-Directives', icon: '🎯' },
];

export const DEFAULT_OPERATOR_PROMPTS = [
  {
    id: 'prompt_executive_priority',
    title: 'Executive Task Priority & Time-Blocking',
    subtitle: 'Rank to-do lists ruthlessly by delay consequence and isolate the immediate 10-minute action',
    category: 'ops',
    personaId: 'priority-sorter',
    favorite: true,
    favoriteReason: 'Use when paralyzed on Monday mornings or facing an overwhelming list of competing tasks.',
    tags: ['priority', 'executive', 'time-blocking', 'action', 'focus'],
    content: `I have [X hours] available today and these tasks:

[paste tasks]

Act as an operations-focused executive assistant. Rank them by:
1. Consequence of delay
2. Impact on my current goals
3. Dependencies/blockers
4. Effort required
5. Whether it can be delegated, automated, deferred, or deleted

Return:
- A ranked list
- My single highest-leverage task
- A time-blocked plan for today
- A “do not do today” list
- The first 10-minute action I should take immediately

Be decisive. Do not give generic productivity advice.`,
  },
  {
    id: 'prompt_project_premortem',
    title: 'Project Pre-Mortem & Failure Point Analysis',
    subtitle: 'Simulate bad failure in advance to uncover blind spots and cheapest preventive actions',
    category: 'strategy',
    personaId: 'pre-mortem',
    favorite: true,
    favoriteReason: 'Run 48 hours before committing budget, announcing a launch, or signing a critical agreement.',
    tags: ['risk', 'pre-mortem', 'strategy', 'failure-analysis', 'planning'],
    content: `I am planning this project:

[describe project]

Assume it is now [date] and the project failed badly. Act as a skeptical project reviewer and write the postmortem.

Identify:
- The 10 most probable reasons it failed
- Early warning signs for each
- The cheapest preventive action
- Which risks are existential versus merely inconvenient
- A revised plan that reduces the chance of failure

Do not reassure me. Be specific and practical.`,
  },
  {
    id: 'prompt_mess_to_execution',
    title: 'Mess-to-Execution Action System',
    subtitle: 'Convert chaotic brain dumps, open browser tabs, and half-thoughts into a structured Kanban board',
    category: 'ops',
    personaId: 'mess-converter',
    favorite: true,
    favoriteReason: 'Dump unfiltered thoughts here after an intense brainstorming session or chaotic client call.',
    tags: ['execution', 'brain-dump', 'kanban', 'tasks', 'clarity'],
    content: `Below are my rough notes, tabs, ideas, and half-finished thoughts:

[paste everything]

Convert this into an execution system.

Output exactly:
1. The actual objective in one sentence
2. Deliverables
3. Open questions and assumptions
4. Tasks, ordered by dependency
5. Owner for each task; use “me” when unknown
6. Suggested deadlines
7. Blockers
8. A 30-minute next action
9. A simple project board with: Backlog | Next | In Progress | Waiting | Done

Flag contradictions, duplicate work, and anything that should be cut.`,
  },
  {
    id: 'prompt_redteam_decision',
    title: 'Red-Team Decision & Assumption Stress-Tester',
    subtitle: 'Stress-test a major choice by hunting unstated assumptions and building the case for the opposite',
    category: 'strategy',
    personaId: 'assumptions-breaker',
    favorite: false,
    favoriteReason: 'Use before making big life, career, or financial allocation choices to avoid confirmation bias.',
    tags: ['decision', 'red-team', 'assumptions', 'critical-thinking', 'table'],
    content: `I am about to make this decision:

[decision and context]

Act as a red-team analyst. Do not help me justify the choice.

Instead:
- List my unstated assumptions
- Identify what evidence would disprove each assumption
- Give the strongest case for the opposite decision
- Name the three facts I should verify before acting
- Recommend a reversible, low-cost test
- Tell me whether I should decide now, research more, or avoid the decision entirely

Use a table.`,
  },
  {
    id: 'prompt_8020_learning_plan',
    title: '80/20 Accelerated Learning Roadmap',
    subtitle: 'Strip fluff and build a practical sequence of micro-projects to become functional fast',
    category: 'learning',
    personaId: 'learning-engine',
    favorite: false,
    favoriteReason: 'Use when picking up a new programming framework, business skill, or tool under tight deadlines.',
    tags: ['learning', '80/20', 'skills', 'projects', 'mastery'],
    content: `I need to become functional at [skill/topic] for this outcome:

[concrete outcome]

I have [time available] and my current level is [beginner/intermediate/etc.].

Build an 80/20 learning plan:
- The few concepts that unlock most practical ability
- What to ignore for now
- A sequence of small practice projects
- Common beginner mistakes
- A diagnostic test after each stage
- Free or low-cost tools/resources if appropriate
- A final real-world challenge that proves competence

Teach for application, not encyclopedic knowledge.`,
  },
  {
    id: 'prompt_senior_support_diagnostics',
    title: 'Senior Support Engineer Technical Diagnostics',
    subtitle: 'Methodically isolate variables, rank probable root causes, and run one test at a time',
    category: 'engineering',
    personaId: 'troubleshooter',
    favorite: true,
    favoriteReason: 'First line of defense when code, servers, local environments, or hardware crash.',
    tags: ['debugging', 'diagnostics', 'troubleshoot', 'engineering', 'root-cause'],
    content: `I have this technical problem:

[problem, error messages, hardware/software, what changed, what you tried]

Act as a senior support engineer. First, identify the 5 most likely causes, ranked by probability and impact.

Then:
- Ask only the minimum diagnostic questions needed
- Give me one test at a time
- Explain what each result would prove or rule out
- Prefer reversible, low-risk steps first
- Separate confirmed facts from hypotheses
- Do not recommend reinstalling, resetting, or buying hardware until simpler causes are eliminated

End each response with exactly one next action.`,
  },
  {
    id: 'prompt_pragmatic_producer_ship_it',
    title: 'Pragmatic Producer Minimum Shippable Deliverable',
    subtitle: 'Cut scope mercilessly to hit your deadline and beat perfectionism',
    category: 'production',
    personaId: 'ship-it',
    favorite: false,
    favoriteReason: 'Use when feature creep threatens a deadline and you need to get to "shippable" today.',
    tags: ['shipping', 'mvp', 'deadlines', 'scope-cut', 'producer'],
    content: `I want to produce this:

[deliverable]

My constraints are:
- Deadline: [date]
- Available time: [hours]
- Budget: [amount]
- Tools/resources: [list]
- Quality bar: [describe]
- Non-negotiables: [list]

Act as a pragmatic producer. Define the minimum viable version I can ship by the deadline.

Then give:
- Scope to keep
- Scope to cut
- A milestone schedule
- The highest-risk dependency
- A contingency plan
- A final quality-control checklist
- The exact first task to start now

Optimize for completion, not perfection.`,
  },
  {
    id: 'prompt_chief_of_staff_review',
    title: 'Chief of Staff Retrospective & Calibration Interview',
    subtitle: 'Seven-question interview on time vs. payoff, unfinished commitments, and next week priorities',
    category: 'ops',
    personaId: 'ceo-review',
    favorite: true,
    favoriteReason: 'Sunday evening or Friday afternoon weekly calibration routine.',
    tags: ['chief-of-staff', 'retrospective', 'weekly-review', 'alignment', 'systems'],
    content: `Act as my chief of staff. Interview me about the past week and next week.

Ask no more than 7 questions, one at a time. Your goal is to identify:
- What created meaningful results
- What consumed time without payoff
- Unfinished commitments
- Avoided decisions
- Energy patterns
- Opportunities to automate, delegate, or eliminate work
- The one outcome that would make next week successful

After I answer, produce:
1. A short retrospective
2. Lessons
3. Top 3 priorities for next week
4. A realistic calendar outline
5. A stop-doing list
6. One system improvement to implement`,
  },
  {
    id: 'prompt_communication_compressor',
    title: 'Communication Compressor & Executive Message Rewrite',
    subtitle: 'Eliminate corporate hedging, filler, and ambiguity while making the ask unmistakable',
    category: 'communication',
    personaId: 'compressor',
    favorite: true,
    favoriteReason: 'Use before sending delicate emails to investors, clients, bosses, or partners.',
    tags: ['writing', 'clarity', 'compression', 'email', 'executive-comm'],
    content: `Rewrite the following message for [recipient/audience]:

[paste draft]

Goal: [what you want them to do or understand]

Constraints:
- Keep it under [X] words
- Use a confident, human, non-corporate tone
- Preserve important technical details
- Remove repetition, hedging, and filler
- Make the ask or next step unmistakable

Return:
1. Final version
2. One-sentence summary
3. Suggested subject line or opening line
4. Any ambiguity I should resolve before sending`,
  },
  {
    id: 'prompt_automation_systems_audit',
    title: 'Automation Systems & Workflow Audit',
    subtitle: 'Map recurring tasks into triggers, decisions, and failure points with low-cost implementation plans',
    category: 'automation',
    personaId: 'automation-scanner',
    favorite: false,
    favoriteReason: 'Audit any painful repetitive weekly routine (e.g. invoicing, data formatting, content repurposing).',
    tags: ['automation', 'n8n', 'shortcuts', 'python', 'workflow'],
    content: `Here is how I currently complete this recurring task:

[paste detailed workflow]

Audit it like an automation consultant.

Map:
- Trigger
- Inputs
- Decisions
- Repetitive steps
- Outputs
- Failure points
- Sensitive data or security concerns

Then recommend:
- What should remain manual
- What can be templated
- What can be automated now
- What needs an API or integration
- A low-cost implementation using [tools I use, e.g. macOS Shortcuts, n8n, Python, Notion, Google Drive]
- Estimated setup time and ongoing maintenance
- A phased implementation plan

Prioritize reliability and simplicity over cleverness.`,
  },
  {
    id: 'prompt_high_precision_master_spec',
    title: 'High-Precision Directive Architecture (Master Spec)',
    subtitle: 'Standardized format specifying Role, Context, Objective, Constraints, Output, and Quality Bar',
    category: 'meta',
    personaId: null,
    favorite: true,
    favoriteReason: 'Foundational framework whenever prompting for complex deliverables or autonomous solutions.',
    tags: ['master-template', 'architecture', 'prompt-engineering', 'directives', 'standards'],
    content: `Role: Who should the AI act as?
Context: What does it need to know?
Objective: What outcome matters?
Constraints: Time, budget, audience, tools, limits.
Output: Exact format you want returned.
Quality bar: What should it avoid or verify?

(For example, instead of:
“Help me plan an automation.”

Use:
“Act as an n8n solutions architect. I need to automate intake of client media files from a form through cloud storage, transcription, and a Notion project page. I use macOS and can run Docker/Python. Optimize for low monthly cost, recoverable failures, and privacy. Give me a staged build plan, required credentials, workflow nodes, error handling, and a test checklist.”

Specific roles, constraints, and output formats tend to generate more actionable results than generic requests.)`,
  },
  {
    id: 'prompt_socratic_clarification_gatekeeper',
    title: 'Socratic Pre-Flight Clarification Protocol',
    subtitle: 'Force the AI to ask only high-impact questions before proposing any solution',
    category: 'meta',
    personaId: null,
    favorite: true,
    favoriteReason: 'Use on ambitious or ambiguous projects to prevent AI hallucinations and misaligned assumptions.',
    tags: ['gatekeeper', 'clarification', 'socratic', 'pre-flight', 'discovery'],
    content: `Before solving this, ask me the questions that would most improve the quality of your answer. Ask only questions that materially change the plan, and do not begin the solution until you have enough context.

Task: [paste task]
Desired outcome: [paste outcome]
Constraints: [paste constraints]`,
  },
];
