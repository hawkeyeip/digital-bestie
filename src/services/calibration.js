/**
 * Memory Calibration Lab & Deepening Engine
 * Config, questions, inline editing, and 1-on-1 interview launcher
 */

export const CALIBRATION_PACKS = {
  intentions: {
    key: 'intentions',
    title: '90-Day North Star & High-Stakes Goals',
    emoji: '🎯',
    badge: 'Intentions & Focus',
    description: 'Calibrate your immediate 90-day focal point, what tangible relief looks like, and what sacrifices or anti-goals you enforce.',
    interviewPrompt: "Let's calibrate my 90-Day North Star & High-Stakes Goals. Stick strictly to one topic at a time so I don't get overloaded—start with just my 90-day concrete North Star, and ask clarifying or supplementary questions to really nail it down before moving on.",
    questions: [
      {
        path: 'user_profile.goal_and_boundary_matrix.north_star_90_day',
        title: '90-Day Concrete North Star',
        desc: 'If we could move the needle on ONE specific outcome in the next 90 days that gives you genuine relief, what is it?',
        examples: 'e.g., Hit $8,000 liquid savings floor, secure 2 recurring retainer clients at $3k/mo, launch MVP to first 50 paid users',
        type: 'string',
      },
      {
        path: 'user_profile.goal_and_boundary_matrix.anti_goals',
        title: 'Anti-Goals (What You Refuse to Do)',
        desc: 'Things you refuse to tolerate or spend time on, even if someone offered good money.',
        examples: 'e.g., No hourly rate work without minimum fee, no rush turnarounds without 50% surge fee, no 50+ hour work weeks',
        type: 'array',
      },
      {
        path: 'user_profile.identity_and_baseline.primary_acute_stressor',
        title: 'Primary Acute Stressor',
        desc: 'The dominant operational friction, worry, or environmental drain currently pulling your mental bandwidth.',
        examples: 'e.g., Unstable living situation, overdue invoice from NY client, dreading tax filings',
        type: 'string',
      },
    ],
  },
  triggers: {
    key: 'triggers',
    title: 'Avoidance Patterns & Freeze Traps',
    emoji: '⚡',
    badge: 'Psychology & Execution',
    description: 'Map the exact friction points that cause executive freeze, procrastination, or impulsive dopamine escapes.',
    interviewPrompt: "Let's calibrate my Avoidance Patterns & Freeze Traps. Stick strictly to one topic at a time so I don't get overloaded—start with my acute avoidance triggers, and ask clarifying or supplementary questions to really dial it in before moving on.",
    questions: [
      {
        path: 'user_profile.cognitive_and_behavioral_profile.primary_avoidance_triggers',
        title: 'Acute Avoidance Triggers',
        desc: 'What kinds of tasks or communications trigger that internal wall of dread?',
        examples: 'e.g., Disorganized client emails demanding estimates, checking declining bank balances, following up on unpaid invoices',
        type: 'array',
      },
      {
        path: 'user_profile.cognitive_and_behavioral_profile.escape_mechanisms',
        title: 'Default Escape & Numbing Traps',
        desc: 'When you are avoiding a difficult task or feeling, what is your go-to numbing mechanism?',
        examples: 'e.g., Compulsive impulse shopping, infinite social media rabbit holes, over-planning new projects without shipping',
        type: 'array',
      },
      {
        path: 'user_profile.cognitive_and_behavioral_profile.decision_bias',
        title: 'Decision-Making Bias Under Pressure',
        desc: 'When backed into a corner or faced with ambiguity, do you leap impulsively or freeze in analysis paralysis?',
        examples: 'e.g., Impulsive leap to relieve anxiety, over-analysis paralysis, perfectionism stall',
        type: 'string',
      },
    ],
  },
  financials: {
    key: 'financials',
    title: 'Runway & Capital Floors',
    emoji: '💰',
    badge: 'Capital Defense',
    description: 'Define your rock-bottom cash floor, weekly burn, and minimum pricing standards to protect your freedom.',
    interviewPrompt: "Let's calibrate my Runway & Capital Floors. Stick strictly to one topic at a time so I don't get overloaded—start with my absolute emergency cash floor, and ask clarifying or supplementary questions to lock it down before moving on.",
    questions: [
      {
        path: 'user_profile.identity_and_baseline.hard_cash_floor',
        title: 'Absolute Cash Floor ($)',
        desc: 'The emergency floor you never breach. If cash dips below this, all luxury/impulse spending halts immediately.',
        examples: 'e.g., 2500',
        type: 'number',
      },
      {
        path: 'user_profile.identity_and_baseline.burn_rate_weekly',
        title: 'Weekly Burn Rate ($)',
        desc: 'Bare-bones weekly cost of survival (food, rent/housing, core software, minimum debt payments).',
        examples: 'e.g., 650',
        type: 'number',
      },
      {
        path: 'user_profile.goal_and_boundary_matrix.rate_floor',
        title: 'Non-Negotiable Rate Floor',
        desc: 'Your absolute minimum hourly rate, project minimum, or retainer pricing.',
        examples: 'e.g., $100/hr or $2,500 minimum per project sprint',
        type: 'string',
      },
      {
        path: 'user_profile.goal_and_boundary_matrix.deposit_policy',
        title: 'Deposit & Payment Policy',
        desc: 'The required upfront deposit before any work starts.',
        examples: 'e.g., 50% upfront before any discovery or sprint commences, remaining 50% upon milestone review',
        type: 'string',
      },
    ],
  },
  boundaries: {
    key: 'boundaries',
    title: 'Red Flags & Hard Boundaries',
    emoji: '🛡️',
    badge: 'Boundary Shield',
    description: 'Teach Bestie to detect toxic client requests, scope creep, and disrespectful patterns early.',
    interviewPrompt: "Let's calibrate my Red Flags & Hard Boundaries. Stick strictly to one topic at a time so I don't get overloaded—start with client red flags and warning signs, and ask clarifying or supplementary questions to really get it down before moving on.",
    questions: [
      {
        path: 'user_profile.goal_and_boundary_matrix.client_red_flags',
        title: 'Client Red Flags & Warning Signs',
        desc: 'Behaviors or phrases from prospects that signal trouble ahead.',
        examples: "e.g., 'This should only take an hour', refusing to pay a deposit, asking for free spec work, texting late on weekends",
        type: 'array',
      },
      {
        path: 'user_profile.identity_and_baseline.current_living_situation',
        title: 'Current Living & Working Setup',
        desc: 'Where are you currently operating from? What is your physical baseline environment?',
        examples: 'e.g., Couch-surfing at a friends place, temporary sublet, home office in studio apartment',
        type: 'string',
      },
    ],
  },
  ventures: {
    key: 'ventures',
    title: 'Ventures & Superpowers',
    emoji: '🚀',
    badge: 'Sovereign Incubator',
    description: 'Document your high-conviction side ventures, core technical advantages, and micro-tasks that need execution.',
    interviewPrompt: "Let's calibrate my Ventures & Superpowers. Stick strictly to one topic at a time so I don't get overloaded—start with my active venture or project name, and ask clarifying or supplementary questions to lock it down before moving on.",
    questions: [
      {
        path: 'user_profile.secret_venture_incubator.active_project_name',
        title: 'Active Venture / Project Name',
        desc: 'What product, SaaS, or venture are you building or incubating?',
        examples: 'e.g., Digital Bestie sovereign OS, Automated Client Inbound Bot, Agency Revamp',
        type: 'string',
      },
      {
        path: 'user_profile.secret_venture_incubator.core_skills_leveraged',
        title: 'Unfair Advantages & Core Skills',
        desc: 'What are your top skills or leverage points that give you an edge?',
        examples: 'e.g., Full-stack TypeScript/Electron, rapid system architecture, automation workflows, copy & storytelling',
        type: 'array',
      },
      {
        path: 'user_profile.secret_venture_incubator.backlog_micro_tasks',
        title: 'High-Leverage Micro-Tasks',
        desc: '1-3 high-impact tasks (15-45 minutes each) ready to execute.',
        examples: 'e.g., Draft Stripe invoice email, push GitHub v1.0.1 tag, finalize landing page headline',
        type: 'array',
      },
    ],
  },
  tone: {
    key: 'tone',
    title: 'Tone & Accountability',
    emoji: '🎙️',
    badge: 'Partnership Dynamic',
    description: 'Calibrate how Bestie speaks, pushes back on excuses, and holds you to your standards.',
    interviewPrompt: "Let's calibrate our Communication & Accountability dynamic. Stick strictly to one topic at a time so I don't get overloaded—start with operating voice and tone, and ask clarifying or supplementary questions before moving on.",
    questions: [
      {
        path: 'user_profile.cognitive_and_behavioral_profile.tone_preference',
        title: 'Operating Voice & Tone',
        desc: 'How should Bestie communicate with you?',
        examples: 'e.g., digital_bestie (candid, warm, humorous, zero fluff), direct_and_factual (concise, tactical), gentle_exploratory',
        type: 'string',
      },
      {
        path: 'user_profile.cognitive_and_behavioral_profile.execution_style',
        title: 'Execution vs. Coaching Bias',
        desc: 'Do you want Bestie to coach you with diagnostic questions, or take the wheel and draft copy/actions first?',
        examples: 'e.g., execution_first (draft the answer immediately), coaching_first (ask 1 sharp question before drafting)',
        type: 'string',
      },
    ],
  },
};

/**
 * Get current value from profile by dot-path
 */
export function getDossierValue(profile, dotPath) {
  if (!profile) return null;
  const keys = dotPath.split('.');
  let curr = profile;
  for (const k of keys) {
    if (curr == null || curr[k] === undefined) return null;
    curr = curr[k];
  }
  return curr;
}
