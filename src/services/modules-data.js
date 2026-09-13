/**
 * Operational Modules Metadata & Tooltip Guide
 * Details use cases, capabilities, and starter prompts for each operational module
 */

export const MODULES_METADATA = {
  'sanity-scout': {
    name: 'Sanity Scout',
    badge: 'Third Places & Sanity',
    color: '#00f0ff',
    icon: '🧭',
    purpose: 'Find free and low-cost sanctuaries, public work spots, and third places.',
    whenToUse: 'When experiencing cabin fever, feeling stuck, or needing a focused working sanctuary with zero spend.',
    whatItDoes: [
      'Scouts quiet libraries, open hotel lobbies, and verified workspaces',
      'Filters for strong Wi-Fi, power outlets, and long-dwell tolerance',
      'Saves favorite sanctuaries directly into your Living Dossier'
    ],
    examplePrompt: 'I have severe cabin fever and need a free, quiet place to work for 4 hours. Help me identify local third places.'
  },
  'venture-incubator': {
    name: 'Venture Incubator',
    badge: 'Entrepreneurship',
    color: '#b347ff',
    icon: '🚀',
    purpose: 'Build independent income and productize your skills in rapid micro-sprints.',
    whenToUse: 'When you have startup or side-hustle ideas but feel overwhelmed, unfocused, or blocked on how to start.',
    whatItDoes: [
      'Deconstructs big ambitions into 20–30 minute micro-tasks',
      'Identifies your unfair advantages and core monetizable skills',
      'Maintains a zero-friction backlog so you always know the next action'
    ],
    examplePrompt: 'I want to package my skills into a recurring $3k/mo client retainer. Help me define the exact offer and first 3 action steps.'
  },
  'ghostwriter': {
    name: 'Ghostwriter & Boundary Shield',
    badge: 'Boundary Defense',
    color: '#ff2d9b',
    icon: '🛡️',
    purpose: 'Zero-effort client responses, rate defense, and immovable boundaries.',
    whenToUse: 'When dealing with pushy clients, awkward scope creep, rate negotiations, or unpaid invoices.',
    whatItDoes: [
      'Screens inquiries against your personal red-flag register',
      'Drafts calm, professional, and immovable boundary emails',
      'Produces ready-to-send copy with zero editing required'
    ],
    examplePrompt: 'A client is demanding 3 extra revision rounds out of scope without extra budget. Draft a polite, firm boundary response.'
  },
  'capital-guardian': {
    name: 'Capital Guardian & Impulse Interceptor',
    badge: 'Capital Defense',
    color: '#00ff88',
    icon: '💰',
    purpose: 'Protect your runway, enforce cash floors, and intercept emotional spending.',
    whenToUse: 'When feeling tempted to make an impulsive purchase or feeling anxious about cash reserves.',
    whatItDoes: [
      'Calculates purchase impact on your weekly runway and housing security',
      'Enforces the 72-hour purchase test against your emergency floor',
      'Frames capital preservation as buying independence and sovereign freedom'
    ],
    examplePrompt: 'I am about to buy a $450 piece of gear because I had a frustrating day. Intercept this impulse and run the runway check.'
  },
  'priority-sorter': {
    name: 'Ruthless Priority Sorter',
    badge: 'Executive Focus',
    color: '#ff9500',
    icon: '⚡',
    purpose: 'Cuts executive paralysis by ranking by consequence of delay.',
    whenToUse: 'When your to-do list is exploding, you feel overwhelmed, or you have hit executive freeze.',
    whatItDoes: [
      'Ranks tasks strictly by consequence of delay and 90-day impact',
      'Ruthlessly eliminates or defers low-leverage fake work',
      'Extracts the single highest-impact 10-minute action to begin immediately'
    ],
    examplePrompt: 'I have 10 urgent tasks staring at me today and I am paralyzed. Filter out the noise and tell me what to do for the next 15 minutes.'
  },
  'pre-mortem': {
    name: 'Project Pre-Mortem',
    badge: 'Risk Analysis',
    color: '#ff4444',
    icon: '🔮',
    purpose: 'Uncover hidden failure modes before you invest time and capital.',
    whenToUse: 'Before launching a new project, signing a major client, or making a big operational pivot.',
    whatItDoes: [
      'Simulates a future failure scenario to identify top probable root causes',
      'Classifies existential risks vs. minor inconveniences',
      'Designs low-cost, early-warning indicators and preventive fixes'
    ],
    examplePrompt: 'I am launching a new service offering next Monday. Run a pre-mortem and tell me where this is most likely to break.'
  },
  'mess-converter': {
    name: 'Mess-to-Execution Converter',
    badge: 'Execution Architecture',
    color: '#00ccff',
    icon: '🧹',
    purpose: 'Turn scattered brain dumps and chaos into structured Kanban action plans.',
    whenToUse: 'When your mind is full of disjointed thoughts, rough notes, and unorganized to-dos.',
    whatItDoes: [
      'Extracts one crystal-clear core objective and concrete deliverables',
      'Maps tasks chronologically with explicit dependencies and blockers',
      'Organizes your workflow into an immediate 30-minute next action'
    ],
    examplePrompt: 'Here is a 300-word messy brain dump of everything running through my head. Convert this into a clear 5-step execution roadmap.'
  },
  'assumptions-breaker': {
    name: 'Hidden-Assumptions Breaker',
    badge: 'Red-Team Analysis',
    color: '#ffd700',
    icon: '🔍',
    purpose: 'Red-team your decisions and stress-test unstated beliefs.',
    whenToUse: 'When you are certain about a strategy but want to ensure you are not falling prey to confirmation bias.',
    whatItDoes: [
      'Unpacks unstated assumptions and identifies evidence that would disprove them',
      'Steel-mans the complete opposite decision with rigorous logic',
      'Designs reversible, low-cost reality tests before committing heavy capital'
    ],
    examplePrompt: 'I am planning to stop doing client work completely and focus 100% on software. Red-team this decision and expose my blind spots.'
  },
  'learning-engine': {
    name: '80/20 Learning Engine',
    badge: 'Skill Acquisition',
    color: '#9b59b6',
    icon: '🧠',
    purpose: 'Extract the vital 20% of any skill or subject to gain 80% real-world ability.',
    whenToUse: 'When you need to learn a new tool, technology, or domain rapidly without wading through fluff.',
    whatItDoes: [
      'Isolates high-leverage concepts and explicitly tells you what to ignore for now',
      'Designs rapid 20–30 minute practical micro-projects',
      'Warns against the top 3 common beginner traps and mistakes'
    ],
    examplePrompt: 'I need to master Docker and local deployment by tomorrow evening. Teach me the vital 20% and give me 2 micro-drills.'
  },
  'troubleshooter': {
    name: 'Technical Troubleshooter',
    badge: 'Diagnostic Rigor',
    color: '#e74c3c',
    icon: '🔧',
    purpose: 'Systematic debugging and methodical root cause isolation.',
    whenToUse: 'When code, pipelines, servers, or hardware fail and you cannot pinpoint why.',
    whatItDoes: [
      'Ranks the top 5 probable root causes by likelihood',
      'Separates confirmed facts from unverified hypotheses',
      'Ends every interaction with exactly ONE diagnostic next step to test'
    ],
    examplePrompt: 'My Electron app is throwing an IPC handler not registered error after rebuild. Methodically isolate the root cause.'
  },
  'ship-it': {
    name: 'Make It Shippable',
    badge: 'Perfectionism Buster',
    color: '#2ecc71',
    icon: '📦',
    purpose: 'Cut perfectionism scope creep and ship working deliverables.',
    whenToUse: 'When you keep tweaking, polishing, and delaying a deliverable that should already be out.',
    whatItDoes: [
      'Defines the minimum viable version shippable today',
      'Categorizes scope strictly into Keep vs. Cut',
      'Assigns a concrete 5-minute task to begin the release right now'
    ],
    examplePrompt: 'I have been tweaking this project proposal for four days. Help me ruthlessly trim it down so I can send it in 15 minutes.'
  },
  'ceo-review': {
    name: 'Weekly CEO Review',
    badge: 'Chief of Staff',
    color: '#3498db',
    icon: '📊',
    purpose: 'Audits time, decisions, and weekly performance to set high-leverage priorities.',
    whenToUse: 'On Friday afternoon or Sunday evening to reflect on the week and plan the upcoming sprint.',
    whatItDoes: [
      'Audits actual results vs. planned goals and uncovers biggest time sinks',
      'Identifies avoided decisions and cognitive energy patterns',
      'Produces a Stop-Doing list and the top 3 priorities for next week'
    ],
    examplePrompt: 'Let us do my weekly CEO review. Here is what happened this week and what fell through the cracks.'
  },
  'compressor': {
    name: 'Communication Compressor',
    badge: 'Message Polishing',
    color: '#1abc9c',
    icon: '✂️',
    purpose: 'Strip fluff, eliminate apologetic hedging, and maximize message impact.',
    whenToUse: 'Before sending high-stakes emails, investor updates, proposals, or messages to busy stakeholders.',
    whatItDoes: [
      'Eliminates filler words, disclaimers, and passive-aggressive hedging',
      'Preserves technical nuances while cutting word count by 50%+',
      'Makes the required call-to-action or next step unmistakable'
    ],
    examplePrompt: 'Rewrite this 3-paragraph email to a prospective partner to make it punchy, confident, and under 5 sentences.'
  },
  'automation-scanner': {
    name: 'Automation Scanner',
    badge: 'Workflow Engineering',
    color: '#e67e22',
    icon: '⚙️',
    purpose: 'Identify repetitive friction in your daily workflows and design automated solutions.',
    whenToUse: 'When you realize you are performing the same repetitive manual tasks every day or week.',
    whatItDoes: [
      'Maps workflow triggers, inputs, manual decisions, and outputs',
      'Recommends whether to use manual checklists, templates, or automation pipelines',
      'Provides a low-cost, phased implementation roadmap'
    ],
    examplePrompt: 'Every week I manually copy customer event notes into our tracker and email summaries. How do I automate this with minimal tooling?'
  }
};
