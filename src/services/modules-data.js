/**
 * Operational Modules Metadata & Tooltip Guide
 * Details use cases, capabilities, categories, and starter prompts for each operational module
 */

export const PERSONA_CATEGORIES = {
  all: { id: 'all', label: 'All Personas', icon: '✨' },
  defense: { id: 'defense', label: 'Defense & Sanity', icon: '🛡️' },
  execution: { id: 'execution', label: 'Execution & Focus', icon: '⚡' },
  strategy: { id: 'strategy', label: 'Strategy & Ventures', icon: '🚀' },
  growth: { id: 'growth', label: 'Growth & Writing', icon: '🧠' },
  systems: { id: 'systems', label: 'Systems & Tools', icon: '🔧' },
};

export const MODULES_METADATA = {
  'sanity-scout': {
    name: 'Sanity Scout',
    badge: 'Third Places & Sanity',
    category: 'defense',
    color: '#00f0ff',
    icon: '🧭',
    purpose: 'Find free and low-cost sanctuaries, public work spots, and third places.',
    whenToUse: 'When experiencing cabin fever, feeling stuck, or needing a focused working sanctuary with zero spend.',
    keywords: ['third places', 'coffee shop', 'library', 'cabin fever', 'quiet', 'workspace', 'sanctuary', 'burnout', 'park'],
    whatItDoes: [
      'Scouts quiet libraries, open hotel lobbies, and verified workspaces',
      'Filters for strong Wi-Fi, power outlets, and long-dwell tolerance',
      'Saves favorite sanctuaries directly into your Living Dossier'
    ],
    examplePrompt: 'I have severe cabin fever and need a free, quiet place to work for 4 hours. Help me identify local third places.',
    starterPrompts: [
      'Find free or cheap quiet work sanctuaries near me with good Wi-Fi.',
      'I have cabin fever and need a low-pressure spot to decompress for 2 hours.',
      'Recommend a calm third place where I don\'t feel pressured to buy things.'
    ]
  },
  'venture-incubator': {
    name: 'Venture Incubator',
    badge: 'Entrepreneurship',
    category: 'strategy',
    color: '#b347ff',
    icon: '🚀',
    purpose: 'Build independent income and productize your skills in rapid micro-sprints.',
    whenToUse: 'When you have startup or side-hustle ideas but feel overwhelmed, unfocused, or blocked on how to start.',
    keywords: ['business', 'side hustle', 'startup', 'monetize', 'skills', 'retainer', 'client', 'income', 'founder'],
    whatItDoes: [
      'Deconstructs big ambitions into 20–30 minute micro-tasks',
      'Identifies your unfair advantages and core monetizable skills',
      'Maintains a zero-friction backlog so you always know the next action'
    ],
    examplePrompt: 'I want to package my skills into a recurring $3k/mo client retainer. Help me define the exact offer and first 3 action steps.',
    starterPrompts: [
      'Give me a single 25-minute micro-sprint to move my venture forward today.',
      'Help me package my core skills into a high-ticket retainer offer.',
      'Identify the biggest bottleneck currently slowing down my project launch.'
    ]
  },
  'ghostwriter': {
    name: 'Ghostwriter & Boundary Shield',
    badge: 'Boundary Defense',
    category: 'defense',
    color: '#ff2d9b',
    icon: '🛡️',
    purpose: 'Zero-effort client responses, rate defense, and immovable boundaries.',
    whenToUse: 'When dealing with pushy clients, awkward scope creep, rate negotiations, or unpaid invoices.',
    keywords: ['boundary', 'email', 'client', 'red flags', 'scope creep', 'invoice', 'rates', 'say no', 'negotiation'],
    whatItDoes: [
      'Screens inquiries against your personal red-flag register',
      'Drafts calm, professional, and immovable boundary emails',
      'Produces ready-to-send copy with zero editing required'
    ],
    examplePrompt: 'A client is demanding 3 extra revision rounds out of scope without extra budget. Draft a polite, firm boundary response.',
    starterPrompts: [
      'Draft a firm, polite refusal to an out-of-scope client request without apologizing.',
      'Write a calm follow-up for an invoice that is 14 days overdue.',
      'A prospect wants free spec work before paying a deposit. Draft a boundary email.'
    ]
  },
  'capital-guardian': {
    name: 'Capital Guardian & Impulse Interceptor',
    badge: 'Capital Defense',
    category: 'defense',
    color: '#00ff88',
    icon: '💰',
    purpose: 'Protect your runway, enforce cash floors, and intercept emotional spending.',
    whenToUse: 'When feeling tempted to make an impulsive purchase or feeling anxious about cash reserves.',
    keywords: ['money', 'finance', 'cash', 'floor', 'runway', 'impulse', 'spending', 'budget', 'emergency fund'],
    whatItDoes: [
      'Calculates purchase impact on your weekly runway and housing security',
      'Enforces the 72-hour purchase test against your emergency floor',
      'Frames capital preservation as buying independence and sovereign freedom'
    ],
    examplePrompt: 'I am about to buy a $450 piece of gear because I had a frustrating day. Intercept this impulse and run the runway check.',
    starterPrompts: [
      'I am tempted to buy something non-essential. Intercept this impulse and run the 72-hour test.',
      'Check my liquid cash reserve against my emergency floor and calculate current runway.',
      'How does this proposed expense translate to days of housing security?'
    ]
  },
  'priority-sorter': {
    name: 'Ruthless Priority Sorter',
    badge: 'Executive Focus',
    category: 'execution',
    color: '#ff9500',
    icon: '⚡',
    purpose: 'Cuts executive paralysis by ranking by consequence of delay.',
    whenToUse: 'When your to-do list is exploding, you feel overwhelmed, or you have hit executive freeze.',
    keywords: ['overwhelmed', 'tasks', 'to-do', 'paralysis', 'freeze', 'rank', 'urgent', 'procrastination', 'focus'],
    whatItDoes: [
      'Ranks tasks strictly by consequence of delay and 90-day impact',
      'Ruthlessly eliminates or defers low-leverage fake work',
      'Extracts the single highest-impact 10-minute action to begin immediately'
    ],
    examplePrompt: 'I have 10 urgent tasks staring at me today and I am paralyzed. Filter out the noise and tell me what to do for the next 15 minutes.',
    starterPrompts: [
      'I have competing tasks and feel executive paralysis. Rank what actually matters today.',
      'What is the single 10-minute action I should take right now to break this freeze?',
      'Audit my to-do list and tell me what to ruthlessly delete or defer.'
    ]
  },
  'pre-mortem': {
    name: 'Project Pre-Mortem',
    badge: 'Risk Analysis',
    category: 'strategy',
    color: '#ff4444',
    icon: '🔮',
    purpose: 'Uncover hidden failure modes before you invest time and capital.',
    whenToUse: 'Before launching a new project, signing a major client, or making a big operational pivot.',
    keywords: ['risk', 'failure', 'launch', 'pivot', 'stress-test', 'worst-case', 'planning'],
    whatItDoes: [
      'Simulates a future failure scenario to identify top probable root causes',
      'Classifies existential risks vs. minor inconveniences',
      'Designs low-cost, early-warning indicators and preventive fixes'
    ],
    examplePrompt: 'I am launching a new service offering next Monday. Run a pre-mortem and tell me where this is most likely to break.',
    starterPrompts: [
      'I am planning a major launch. Simulate a future failure and expose the top failure causes.',
      'What early warning signs should I watch for in the next 14 days?',
      'De-risk this upcoming milestone and tell me the cheapest preventive fixes.'
    ]
  },
  'mess-converter': {
    name: 'Mess-to-Execution Converter',
    badge: 'Execution Architecture',
    category: 'execution',
    color: '#00ccff',
    icon: '🧹',
    purpose: 'Turn scattered brain dumps and chaos into structured Kanban action plans.',
    whenToUse: 'When your mind is full of disjointed thoughts, rough notes, and unorganized to-dos.',
    keywords: ['brain dump', 'notes', 'chaos', 'kanban', 'structure', 'organize', 'roadmap', 'clarity'],
    whatItDoes: [
      'Extracts one crystal-clear core objective and concrete deliverables',
      'Maps tasks chronologically with explicit dependencies and blockers',
      'Organizes your workflow into an immediate 30-minute next action'
    ],
    examplePrompt: 'Here is a 300-word messy brain dump of everything running through my head. Convert this into a clear 5-step execution roadmap.',
    starterPrompts: [
      'Here is a messy brain dump of everything running through my head. Turn this into a structured action plan.',
      'Break this vague project idea into clear deliverables with sequential dependencies.',
      'Identify the immediate 30-minute next step to build momentum on this project.'
    ]
  },
  'assumptions-breaker': {
    name: 'Hidden-Assumptions Breaker',
    badge: 'Red-Team Analysis',
    category: 'strategy',
    color: '#ffd700',
    icon: '🔍',
    purpose: 'Red-team your decisions and stress-test unstated beliefs.',
    whenToUse: 'When you are certain about a strategy but want to ensure you are not falling prey to confirmation bias.',
    keywords: ['red team', 'blind spots', 'bias', 'decisions', 'assumptions', 'stress-test', 'critical thinking'],
    whatItDoes: [
      'Unpacks unstated assumptions and identifies evidence that would disprove them',
      'Steel-mans the complete opposite decision with rigorous logic',
      'Designs reversible, low-cost reality tests before committing heavy capital'
    ],
    examplePrompt: 'I am planning to stop doing client work completely and focus 100% on software. Red-team this decision and expose my blind spots.',
    starterPrompts: [
      'I am convinced of a strategic decision. Red-team it and uncover my hidden assumptions.',
      'Steel-man the exact opposite decision with compelling, rigorous logic.',
      'What reversible, low-cost reality test can I run before committing capital or time?'
    ]
  },
  'learning-engine': {
    name: '80/20 Learning Engine',
    badge: 'Skill Acquisition',
    category: 'growth',
    color: '#9b59b6',
    icon: '🧠',
    purpose: 'Extract the vital 20% of any skill or subject to gain 80% real-world ability.',
    whenToUse: 'When you need to learn a new tool, technology, or domain rapidly without wading through fluff.',
    keywords: ['learn', 'study', 'skills', 'docker', 'code', 'framework', 'rapid', 'education', 'mastery'],
    whatItDoes: [
      'Isolates high-leverage concepts and explicitly tells you what to ignore for now',
      'Designs rapid 20–30 minute practical micro-projects',
      'Warns against the top 3 common beginner traps and mistakes'
    ],
    examplePrompt: 'I need to master Docker and local deployment by tomorrow evening. Teach me the vital 20% and give me 2 micro-drills.',
    starterPrompts: [
      'I need to learn a new tool quickly. Extract the vital 20% that yields 80% practical ability.',
      'What should I explicitly ignore for now so I do not drown in beginner overwhelm?',
      'Give me two 20-minute hands-on micro-drills to practice this skill right now.'
    ]
  },
  'troubleshooter': {
    name: 'Technical Troubleshooter',
    badge: 'Diagnostic Rigor',
    category: 'systems',
    color: '#e74c3c',
    icon: '🔧',
    purpose: 'Systematic debugging and methodical root cause isolation.',
    whenToUse: 'When code, pipelines, servers, or hardware fail and you cannot pinpoint why.',
    keywords: ['debug', 'error', 'bug', 'broken', 'code', 'crash', 'investigate', 'server', 'logs'],
    whatItDoes: [
      'Ranks the top 5 probable root causes by likelihood',
      'Separates confirmed facts from unverified hypotheses',
      'Ends every interaction with exactly ONE diagnostic next step to test'
    ],
    examplePrompt: 'My Electron app is throwing an IPC handler not registered error after rebuild. Methodically isolate the root cause.',
    starterPrompts: [
      'Something broke unexpectedly. Methodically isolate the root cause with diagnostic questions.',
      'Rank the top 5 probable causes for this error and tell me the single variable to test first.',
      'Here are the symptoms and error logs — what is the fastest reversible diagnostic action?'
    ]
  },
  'ship-it': {
    name: 'Make It Shippable',
    badge: 'Perfectionism Buster',
    category: 'execution',
    color: '#2ecc71',
    icon: '📦',
    purpose: 'Cut perfectionism scope creep and ship working deliverables.',
    whenToUse: 'When you keep tweaking, polishing, and delaying a deliverable that should already be out.',
    keywords: ['perfectionism', 'finish', 'launch', 'release', 'mvp', 'scope', 'deadline', 'ship'],
    whatItDoes: [
      'Defines the minimum viable version shippable today',
      'Categorizes scope strictly into Keep vs. Cut',
      'Assigns a concrete 5-minute task to begin the release right now'
    ],
    examplePrompt: 'I have been tweaking this project proposal for four days. Help me ruthlessly trim it down so I can send it in 15 minutes.',
    starterPrompts: [
      'Perfectionism is stalling me. Help me define the minimum viable version shippable today.',
      'Audit this deliverable scope and ruthlessly divide it into Keep vs. Cut.',
      'Give me a 5-minute task to begin release right now instead of endlessly polishing.'
    ]
  },
  'ceo-review': {
    name: 'Weekly CEO Review',
    badge: 'Chief of Staff',
    category: 'strategy',
    color: '#3498db',
    icon: '📊',
    purpose: 'Audits time, decisions, and weekly performance to set high-leverage priorities.',
    whenToUse: 'On Friday afternoon or Sunday evening to reflect on the week and plan the upcoming sprint.',
    keywords: ['weekly review', 'retro', 'reflection', 'priorities', 'time audit', 'productivity', 'ceo'],
    whatItDoes: [
      'Audits actual results vs. planned goals and uncovers biggest time sinks',
      'Identifies avoided decisions and cognitive energy patterns',
      'Produces a Stop-Doing list and the top 3 priorities for next week'
    ],
    examplePrompt: 'Let us do my weekly CEO review. Here is what happened this week and what fell through the cracks.',
    starterPrompts: [
      'Let us conduct my weekly CEO review. Audit what actually moved the needle this week.',
      'What decisions did I avoid this week, and where did my highest energy go?',
      'Deliver my top 3 next-week priorities and a concrete Stop-Doing list.'
    ]
  },
  'compressor': {
    name: 'Communication Compressor',
    badge: 'Message Polishing',
    category: 'growth',
    color: '#1abc9c',
    icon: '✂️',
    purpose: 'Strip fluff, eliminate apologetic hedging, and maximize message impact.',
    whenToUse: 'Before sending high-stakes emails, investor updates, proposals, or messages to busy stakeholders.',
    keywords: ['writing', 'email', 'copy', 'shorten', 'pitch', 'concise', 'clarity', 'slack'],
    whatItDoes: [
      'Eliminates filler words, disclaimers, and passive-aggressive hedging',
      'Preserves technical nuances while cutting word count by 50%+',
      'Makes the required call-to-action or next step unmistakable'
    ],
    examplePrompt: 'Rewrite this 3-paragraph email to a prospective partner to make it punchy, confident, and under 5 sentences.',
    starterPrompts: [
      'Rewrite this draft email to be punchy, confident, and under 5 sentences.',
      'Strip all apologetic hedging and filler from this message while keeping the core ask clear.',
      'Make this proposal executive-ready and impossible to misunderstand.'
    ]
  },
  'automation-scanner': {
    name: 'Automation Scanner',
    badge: 'Workflow Engineering',
    category: 'systems',
    color: '#e67e22',
    icon: '⚙️',
    purpose: 'Identify repetitive friction in your daily workflows and design automated solutions.',
    whenToUse: 'When you realize you are performing the same repetitive manual tasks every day or week.',
    keywords: ['automation', 'workflow', 'scripts', 'repetitive', 'tools', 'pipeline', 'efficiency'],
    whatItDoes: [
      'Maps workflow triggers, inputs, manual decisions, and outputs',
      'Recommends whether to use manual checklists, templates, or automation pipelines',
      'Provides a low-cost, phased implementation roadmap'
    ],
    examplePrompt: 'Every week I manually copy customer event notes into our tracker and email summaries. How do I automate this with minimal tooling?',
    starterPrompts: [
      'I do this manual workflow repeatedly every week. How do I automate it with minimal tooling?',
      'Map the inputs, triggers, and failure points for this process to make it foolproof.',
      'Suggest a low-cost, 3-phase roadmap to eliminate friction from this repetitive task.'
    ]
  },
  'emotional-anchor': {
    name: 'Emotional Anchor',
    badge: 'Grounding & Calm',
    category: 'defense',
    color: '#ff758c',
    icon: '🧘',
    purpose: 'Rapid nervous system de-escalation, panic relief, and separating emotional vs operational reality.',
    whenToUse: 'When experiencing panic, shame spirals, acute distress, feeling like everything is ruined, or emotional overwhelm.',
    keywords: ['anxiety', 'panic', 'stress', 'overwhelm', 'shame', 'spiral', 'grounding', 'breathe', 'calm', 'crisis', 'mental health'],
    whatItDoes: [
      'Deploys immediate 5-4-3-2-1 nervous system grounding protocols',
      'Separates catastrophic emotional beliefs from objective operational facts',
      'Prescribes one stabilizing 10-minute action with zero toxic positivity'
    ],
    examplePrompt: 'I feel a severe panic spiral starting and my chest is tight. Walk me through a grounding sequence and help me stabilize.',
    starterPrompts: [
      'I feel a panic spiral coming on. Walk me through a quick grounding sequence.',
      'Everything feels completely overwhelming right now. Help me separate emotion from facts.',
      'I made a mistake and am beating myself up. Help me reframe this without toxic positivity.'
    ]
  },
  'journal-mirror': {
    name: 'Journal Mirror',
    badge: 'Reflection & Patterns',
    category: 'growth',
    color: '#e056fd',
    icon: '📓',
    purpose: 'Evening decompression, unfiltered brain dumps, and cross-entry pattern detection.',
    whenToUse: 'At night to debrief your day, process mixed emotions, clear mental loops, or review recurring behavioral habits.',
    keywords: ['diary', 'journal', 'reflection', 'evening', 'thoughts', 'patterns', 'habits', 'progress', 'mindset'],
    whatItDoes: [
      'Structures messy brain dumps into sparks, frictions, lessons, and closed loops',
      'Surfaces recurring avoidance triggers and emotional patterns across entries',
      'Mirrors quiet progress and personal growth you are currently blind to'
    ],
    examplePrompt: 'I had a heavy, chaotic day. I want to do an evening brain-dump and extract what actually matters.',
    starterPrompts: [
      'I want to do an evening brain-dump and reflection on how today went.',
      'What recurring themes or friction points have come up in my recent entries?',
      'Give me 3 deep reflection questions tailored to my current living and work reality.'
    ]
  },
  'admin-blitz': {
    name: 'Admin Blitz',
    badge: 'Paperwork Destroyer',
    category: 'execution',
    color: '#f0932b',
    icon: '📋',
    purpose: 'Shatter executive freeze on taxes, forms, medical bookings, and bureaucratic backlog.',
    whenToUse: 'When you have put off tedious life admin for weeks, feel paralyzed by paperwork, or dread government/corporate portals.',
    keywords: ['admin', 'paperwork', 'taxes', 'bills', 'dmv', 'insurance', 'doctor', 'freeze', 'forms', 'dispute'],
    whatItDoes: [
      'Breaks paralyzing paperwork mountains into atomic 2-minute micro-actions',
      'Provides ready-to-send dispute letters, appointment emails, and inquiry copy',
      'Guides focused 20-minute blitz sprints to reclaim cognitive RAM'
    ],
    examplePrompt: 'I have been avoiding filing an insurance claim and dealing with a billing dispute for 3 weeks. Get me unstuck right now.',
    starterPrompts: [
      'I have been avoiding a dreaded paperwork task. Break it down into the first 2-minute action.',
      'Draft a firm, clear message to dispute an unexpected fee or billing error.',
      'Let us do a 20-minute admin blitz sprint. What is the single minimum viable step?'
    ]
  },
  'body-budget': {
    name: 'Body Budget',
    badge: 'Biological Energy',
    category: 'defense',
    color: '#6ab04c',
    icon: '🏥',
    purpose: 'Audit sleep, hydration, fuel, and movement to halt burnout before cognitive collapse.',
    whenToUse: 'When feeling exhausted, irritable, brain-fogged, or reaching for impulsive dopamine escapes due to physical depletion.',
    keywords: ['sleep', 'energy', 'burnout', 'exhaustion', 'tired', 'health', 'water', 'food', 'fatigue', 'recovery'],
    whatItDoes: [
      'Audits biological baseline: sleep debt, hydration, nutrition, movement, and sensory load',
      'Forbids irreversible decisions or heavy pivots when running in severe sleep deficit',
      'Prescribes high-speed biological recovery micro-resets calibrated to your energy'
    ],
    examplePrompt: 'I have zero energy, severe brain fog, and cannot focus on anything. Run a body budget audit on me.',
    starterPrompts: [
      'My energy is completely flat today. Run a quick body budget audit.',
      'I have been running on fumes for 3 days. What is the fastest physical recovery reset?',
      'Help me design a low-effort daily biological baseline so I do not crash.'
    ]
  },
  'relationship-radar': {
    name: 'Relationship Radar',
    badge: 'Social Strategy',
    category: 'defense',
    color: '#48dbfb',
    icon: '🤝',
    purpose: 'Navigate delicate personal/roommate/family friction and draft the hard boundary text.',
    whenToUse: 'When experiencing interpersonal tension, one-sided friendships, domestic friction, or feeling guilty for saying no.',
    keywords: ['relationship', 'family', 'friends', 'roommate', 'partner', 'conflict', 'boundary', 'people pleasing', 'text'],
    whatItDoes: [
      'Audits reciprocity and pinpoints whether dynamics are draining or restorative',
      'Drafts calm, firm, un-apologetic boundary scripts for difficult conversations',
      'Anticipates emotional pushback or guilt-tripping and prepares calm counters'
    ],
    examplePrompt: 'A close friend keeps asking to borrow money and guilt-trips me when I hesitate. Help me draft an immovable boundary text.',
    starterPrompts: [
      'I need to set an uncomfortable boundary with someone close to me. Help me script it.',
      'Role-play a difficult conversation with me so I do not freeze or over-apologize.',
      'Help me evaluate if this relationship dynamic is emotionally draining or healthy.'
    ]
  },
  'negotiation-room': {
    name: 'Negotiation Room',
    badge: 'Pre-Negotiation Prep',
    category: 'strategy',
    color: '#f9ca24',
    icon: '⚖️',
    purpose: 'BATNA analysis, walk-away floors, and concession ladders before high-stakes talks.',
    whenToUse: 'Before negotiating rates, client retainers, apartment leases, vendor contracts, or payment terms.',
    keywords: ['negotiation', 'rates', 'pricing', 'contracts', 'lease', 'deal', 'client', 'batna', 'terms'],
    whatItDoes: [
      'Establishes ambitious target anchors, BATNA fallbacks, and non-negotiable walk-away floors',
      'Constructs concession ladders so you never cut price without extracting scope or terms',
      'Simulates tough counterpart pushback in real-time role-play drills'
    ],
    examplePrompt: 'I have a pricing call with a high-value prospect tomorrow. Put me in the negotiation room and prepare my strategy.',
    starterPrompts: [
      'I have a high-stakes rate or lease negotiation coming up. Map my BATNA and walk-away floor.',
      'Role-play a tough prospect pushing back on my price. Test my responses.',
      'Build me a 1-page negotiation cheat sheet with anchor, concession trade-offs, and closing line.'
    ]
  },
  'dossier-interviewer': {
    name: 'Dossier Calibration Lab',
    badge: 'Memory Deepening',
    category: 'strategy',
    color: '#a855f7',
    icon: '🎙️',
    purpose: 'Deeply calibrate intentions, boundaries, financials, and second-brain memory one pathway at a time.',
    whenToUse: 'When calibrating your Living Dossier, refining 90-day goals, or establishing crisp boundaries.',
    keywords: ['calibration', 'interview', 'dossier', 'memory', 'goals', 'boundaries', 'anti-goals', 'stressors'],
    whatItDoes: [
      'Focuses strictly on one topic at a time without cognitive overload',
      'Asks penetrating clarifying and supplementary questions to drill into ground truth',
      'Automatically commits concrete boundaries and goals into your Living Dossier'
    ],
    examplePrompt: 'Let us calibrate my 90-Day North Star and immediate relief goals one topic at a time.',
    starterPrompts: [
      'Let us calibrate my 90-Day North Star and immediate relief goals one topic at a time.',
      'Help me map my acute avoidance triggers and escape traps without overwhelming me.',
      'Audit and calibrate my non-negotiable rate floor and emergency cash reserve.'
    ]
  }
};
