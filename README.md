# ⚡ Digital Bestie — The Sovereign Architect & Second-Brain OS

[![Version](https://img.shields.io/badge/version-2.5.0-00f0ff.svg)](package.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![User Guide](https://img.shields.io/badge/Documentation-User%20Guide%20(PDF)-b347ff.svg)](docs/USER_GUIDE.pdf)

An autonomous, local-first second-brain desktop application built on **Electron**, **Vite**, and **Ollama**. Powered locally by customized Apple Silicon models (**Hermes 3 70B**, **Qwen 2.5 14B/32B**), Digital Bestie combines the ride-or-die loyalty and grounded warmth of an authentic best friend with the uncompromising rigor of an elite operations manager.

📖 **Official Illustrated User Guide Available:** Download the complete [**docs/USER_GUIDE.pdf**](docs/USER_GUIDE.pdf) or view the [HTML Guide](docs/user-guide/guide.html) for a full visual walkthrough, hardware configurations, and printable keyboard cheatsheet.

---

## ✨ Features

- **Local & Sovereign**: Runs 100% locally on your machine via Ollama. No cloud dependencies, no tracking, complete privacy and data sovereignty.
- **Personal Theme Styling Studio (v2.5)**: 6 curated aesthetic palettes (*Neon Midnight*, *Cyberpunk*, *Obsidian*, *Aurora*, *Ember*, *Sakura*), custom primary accent color picker with automatic +60° HSL harmonically derived secondary accent, and 3-stop luminescence glow control (*Subtle*, *Balanced*, *Vivid*).
- **Vault Backup, Disaster Recovery & Data Portability (v2.5)**:
  - **Encrypted Portable Archives (`.bestie-backup`)**: Military-grade AES-256-GCM cipher with PBKDF2-SHA256 (310,000 iterations). Machine-bound macOS Keychain tokens are decrypted before packaging and safely re-keyed when migrating to a new Mac.
  - **7-Day Rolling Local Snapshots**: Automatic snapshots captured daily on startup and prior to every restore in `~/.digital-bestie/snapshots/` to enable instant rollbacks.
  - **Unattended Off-Device Mirroring**: Optional automatic encrypted export to iCloud Drive, Dropbox, or external USB drives whenever significant milestones are achieved.
  - **Milestone Backup Reminders**: Gentle, non-nagging toast alerts recommending an off-device backup after new credentials or high-value dossier entries are saved.
  - **Instant Onboarding Restore**: Seamless 1-click restore entry point on the new-user setup screen when setting up on a brand-new Mac.
- **Living Dossier Memory Engine**: Persistent second-brain state stored in `~/.digital-bestie/user_profile.json`. Injects your actual living situation, financial runway, and behavioral triggers dynamically into conversations.
- **5-Phase Interactive Intake & Calibration Lab**: Onboarding interview and scrollable Calibration Lab with targeted single-question 1-on-1 interviews, quick-saving (`⌘+Enter`), and status badges.
- **Multi-AI Memory Importer**: Generate tailor-made export prompts for Claude, ChatGPT, Gemini, Grok, or Venice and stage memories into your Living Dossier with approval gates.
- **16 Specialized Operational Modules**:
  1. 🛡️ **Inbound Inquiry Interceptor & Boundary Shield**: Screens client requests, enforces rate floors, flags scope creep, and drafts boundary responses.
  2. 💰 **Capital Guardian & Impulse Interceptor**: Protects runway, enforces 72-hour purchase buffers, and checks emergency cash floors.
  3. ⚡ **Ruthless Priority Sorter**: Cuts through executive paralysis by ranking by consequence of delay and extracting immediate 10-minute actions.
  4. 🔮 **Project Pre-Mortem**: Identifies top failure modes before launch and outlines preventive countermeasures.
  5. 🧹 **"Mess-to-Execution" Converter**: Turns raw brain-dumps into actionable Kanban boards and sequential checklists.
  6. 🔍 **Hidden-Assumptions Breaker**: Red-teams decisions and stress-tests beliefs against market realities.
  7. 🧠 **80/20 Learning Engine**: Strips fluff and outlines 20-30 minute micro-projects for rapid skill acquisition.
  8. 🔧 **Technical Troubleshooting Interrogator**: Methodically isolates variables and diagnoses technical issues.
  9. 💼 **Venture Incubator & Deal Architect**: Structures commercial ventures, equity splits, and pricing strategies.
  10. 🎙️ **Negotiation Strategist**: Real-time counter-tactics for contract renewals, rates, and disputes.
  11. ⚖️ **Contract Redline Auditor**: Highlights indemnity traps, aggressive IP assignment clauses, and payment term liabilities.
  12. 🧘 **Cognitive Decompression & Focus Defense**: Defends focus blocks against interruptions and cognitive fatigue.
  13. 📊 **Runway & Burn Projector**: Dynamic scenario modeling for capital reserves.
  14. 🎯 **Executive Decision Arbiter**: Multi-variable weighted decision matrices.
  15. 🚀 **Product Launch Sequencer**: Critical-path timeline planning.
  16. 🧭 **Strategic Visionary**: 90-day North Star alignment and pivot evaluation.
- **Prompts Vault & Metaprompt Architect**: Catalog of operator directives paired with an automated XML metaprompt synthesis engine that improves prompt efficacy by +50% to +120%.
- **Merits & Credentials Vault**: Encrypted repository for degrees, licenses, patents, publications, and security certifications with resume export and dossier integration.
- **Superbrain Hub & TaskFlow Checklist**: Visual resource tracking synced with task management, dynamic calendar shifting, and anti-fatigue decompression buffers.
- **Apple Keychain Hardware Encryption (`safeStorage`)**: Hardware-backed data-at-rest encryption with strict POSIX `0700`/`0600` file permissions.
- **Ollama Self-Healing Fallback & Health Diagnostics**: Dynamic failover if models are pruned, real-time connectivity diagnostics, and 1-click model pull tools.
- **Application Updater**: Automatic background check of GitHub Releases with in-app notification badges and 1-click downloads.

---

## 🛠️ Architecture

```
digital-bestie/
├── docs/
│   ├── USER_GUIDE.pdf         # Compiled 24-page illustrated operator user guide
│   └── user-guide/            # Source HTML, print CSS, and cheat sheets
├── scripts/
│   ├── build-guide.mjs        # Native Electron printToPDF compilation script
│   └── tokenize-colors.mjs    # CSS color tokenization engine
├── src/
│   ├── main.js                # Electron main process (IPC handlers, backup lifecycle, tray)
│   ├── preload.js             # Secure contextBridge API bridge
│   ├── renderer.js            # Frontend application logic, theme customizer, backup hub
│   ├── services/
│   │   ├── backup.js          # AES-256-GCM vault backup, snapshots & folder mirror engine
│   │   ├── memory.js          # Atomic file store & Living Dossier (~/.digital-bestie)
│   │   ├── metaprompt.js      # Metaprompt Architect & prompt efficacy scorer
│   │   ├── ollama.js          # Ollama streaming client & self-healing fallback
│   │   ├── output-governance.js # LLM-as-a-judge & Zero Data Retention cipher
│   │   ├── superbrain.js      # Resource tracker & Neon Brain synchronization
│   │   ├── taskflow.js        # TaskFlow Kanban board & Wear tile engine
│   │   ├── telemetry.js       # Local token counters & Apple Silicon load metrics
│   │   ├── time-defense.js    # Calendar shifting & cognitive buffer protection
│   │   └── updater.js         # GitHub Releases polling & version verification
│   └── styles/
│       ├── index.css          # Design system, 6 theme presets & glow luminescence
│       └── onboarding.css     # Onboarding modal & animation tokens
└── package.json
```

---

## 🚀 Getting Started

### Prerequisites

1. **macOS** on Apple Silicon (M1, M2, M3, M4)
2. **Node.js** (v20+ recommended)
3. **Ollama** installed and running:
   ```bash
   ollama serve
   ```
4. **Starter Models**:
   ```bash
   # Recommended for 64GB+ RAM (Mac Studio / M-Max / M-Ultra)
   ollama pull hermes3:70b
   ollama pull qwen2.5-coder:32b
   ollama pull nomic-embed-text

   # Recommended for 16GB–36GB RAM (MacBook Air / Pro)
   ollama pull qwen2.5:14b
   ollama pull llama3.1:8b
   ollama pull nomic-embed-text
   ```

### Quick Run & Build

```bash
# Install dependencies
npm install

# Run automated verification tests
npm test

# Build offline User Guide PDF
npm run guide

# Launch app locally
npm start

# Build packaged macOS application
npm run package

# Build signed distribution DMG
npm run make
```

---

## 🔒 Privacy & Data Storage

All data is stored strictly on your local machine:
- Profile & Living Dossier: `~/.digital-bestie/user_profile.json`
- Credentials Vault: `~/.digital-bestie/credentials_vault.json`
- Prompts Vault: `~/.digital-bestie/prompts_vault.json`
- Local Rolling Snapshots: `~/.digital-bestie/snapshots/`
- Settings: `~/.digital-bestie/settings.json`
- Chats & Sessions: `~/.digital-bestie/conversations.json`

Nothing ever leaves your hardware without your explicit passphrase and command.

---

## 📄 License

MIT License. Built for sovereign operators by hawkeyeip.
