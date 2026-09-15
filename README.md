# ⚡ Digital Bestie — The Sovereign Architect & Second-Brain OS

An autonomous, local-first second-brain desktop application built on **Electron**, **Vite**, and **Ollama**. Powered locally by a customized **Hermes 3 (70B)** model, Digital Bestie combines the ride-or-die loyalty and grounded warmth of an authentic best friend with the uncompromising rigor of an elite operations manager.

---

## ✨ Features

- **Local & Sovereign**: Runs 100% locally on your machine via Ollama. No cloud dependencies, no tracking, complete privacy and data sovereignty.
- **Glassmorphism Neon UI**: Stunning midnight-dark theme with frosted glass panels, animated mesh gradients, and electric cyan/purple accents.
- **Living Dossier Memory Engine**: Persistent second-brain state stored in `~/.digital-bestie/user_profile.json`. Injects your actual living situation, financial runway, and behavioral triggers dynamically into conversations.
- **5-Phase Interactive Intake**: Onboarding interview that builds your baseline profile without boring questionnaires.
- **8 Specialized Operational Modules**:
  1. 🛡️ **Inbound Inquiry Interceptor & Boundary Shield**: Screens client requests, enforces rate floors, flags scope creep, and drafts ready-to-send boundary emails.
  2. 💰 **Capital Guardian & Impulse Interceptor**: Protects runway, enforces 72-hour purchase buffers, and checks emergency cash floors.
  3. ⚡ **Ruthless Priority Sorter**: Cuts through executive paralysis by ranking by consequence of delay and extracting the immediate 10-minute action.
  4. 🔮 **Project Pre-Mortem**: Identifies top failure modes before launch and outlines preventive counter-measures.
  5. 🧹 **"Mess-to-Execution" Converter**: Turns brain-dumps into Kanban-ready boards and sequential actions.
  6. 🔍 **Hidden-Assumptions Breaker**: Red-teams decisions and stress-tests beliefs.
  7. 🧠 **80/20 Learning Engine**: Strips fluff and outlines 20-30 minute micro-projects for rapid skill acquisition.
  8. 🔧 **Technical Troubleshooting Interrogator**: Methodically isolates variables and diagnoses technical issues.
- **Chat Vault & History Sidebar (v2.0)**: Multi-conversation persistence with collapsible sidebar (`⌘B` / `Ctrl+B`), real-time search filtering, instant chat switching, and smart auto-titling.
- **Category Folders & Sorting (v2.0)**: Organize conversations into custom strategic folders with custom emoji icons (Finances, Diary, Ventures, Strategy, and General).
- **Apple Keychain Hardware Encryption (`safeStorage`) (v2.0)**: Hardware-backed data-at-rest encryption protecting user profiles, chat vaults, and financial assets at rest with strict POSIX `0700`/`0600` file permissions.
- **Hardened Electron Security (v2.0)**: Chromium sandbox enforcement, strict Content Security Policy (CSP), link protocol sanitization (XSS defense), and safe external navigation handling.
- **Superbrain Hub & Resource Tracker**: Track SaaS subscriptions, physical hardware assets, and travel credits with real-time runway/burn-rate calculations synced into your Living Dossier.
- **Calibration Lab**: Deepen psychological profiles, review mental models, and calibrate tone/execution preferences interactively.
- **Markdown Streaming & Code Highlighting**: Real-time response streaming with formatted code blocks, tables, lists, and quotes.
- **Data Export & Import**: Easy single-click JSON backup and restore for your entire profile and conversation history.

---

## 🛠️ Architecture

```
digital-bestie/
├── Modelfile                  # Ollama Modelfile configured for Hermes 3 70B
├── index.html                 # Main Electron app layout & modals
├── forge.config.js            # Electron Forge packaging configuration
├── vite.*.config.mjs          # Vite configs for main, preload, and renderer
├── src/
│   ├── main.js                # Electron main process (IPC handlers, tray, windows)
│   ├── preload.js             # Secure contextBridge API bridge
│   ├── renderer.js            # Frontend logic, markdown parser, UI events
│   ├── services/
│   │   ├── memory.js          # Living Dossier file store (~/.digital-bestie)
│   │   ├── ollama.js          # Ollama streaming client with undici timeout defense
│   │   └── system-prompt.js   # Dynamic prompt builder & module instructions
│   └── styles/
│       ├── index.css          # Glassmorphism design system & neon theme
│       └── onboarding.css     # Onboarding modal & animations
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites

1. **Node.js** (v20+ recommended)
2. **Ollama** installed and running:
   ```bash
   ollama serve
   ```
3. **Model Setup**:
   Pull Hermes 3 (or your preferred local model) and build the `bestie` model:
   ```bash
   ollama pull hermes3:70b
   ollama create bestie -f Modelfile
   ```

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/hawkeyeip/digital-bestie.git
   cd digital-bestie
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start development mode:
   ```bash
   npm start
   ```

4. Build distributable package:
   ```bash
   npm run make
   ```

---

## 🔒 Privacy & Data Storage

All data is stored strictly on your local machine:
- Profile & Dossier: `~/.digital-bestie/user_profile.json`
- Settings: `~/.digital-bestie/settings.json`
- Conversations: `~/.digital-bestie/conversation.json`

Nothing ever leaves your hardware.

---

## 📄 License

MIT License. Crafted with precision for sovereign operators.
