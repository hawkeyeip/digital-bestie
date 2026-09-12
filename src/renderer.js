/**
 * Digital Bestie — Renderer
 * Main application logic for the UI
 */

// ============================================================
// MARKDOWN PARSER (lightweight, no dependencies)
// ============================================================

function parseMarkdown(text) {
  if (!text) return '';
  
  let html = text
    // Escape HTML entities first
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Code blocks (must be first to prevent inner parsing)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre><code class="lang-${lang || 'text'}">${code.trim()}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Headers
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Bold + Italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Blockquotes
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr>');

  // Unordered lists
  html = html.replace(/^[\s]*[-*] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');

  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  // Tables
  html = html.replace(/^(\|.+\|)\n\|[\s:|-]+\|\n((?:\|.+\|\n?)*)/gm, (_, header, body) => {
    const headerCells = header.split('|').filter(c => c.trim()).map(c => `<th>${c.trim()}</th>`).join('');
    const bodyRows = body.trim().split('\n').map(row => {
      const cells = row.split('|').filter(c => c.trim()).map(c => `<td>${c.trim()}</td>`).join('');
      return `<tr>${cells}</tr>`;
    }).join('');
    return `<table><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table>`;
  });

  // Paragraphs (wrap remaining text blocks)
  html = html.replace(/^(?!<[hupoltb]|<li|<blockquote|<hr|<pre)(.+)$/gm, '<p>$1</p>');

  // Clean up extra newlines between block elements
  html = html.replace(/\n{2,}/g, '\n');

  return html;
}

// ============================================================
// STATE
// ============================================================

let state = {
  currentView: 'chat',
  activeModule: null,
  isGenerating: false,
  isConnected: false,
  profile: null,
  settings: null,
};

// ============================================================
// DOM REFERENCES
// ============================================================

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const els = {
  // Titlebar
  btnMinimize: $('#btn-minimize'),
  btnMaximize: $('#btn-maximize'),
  btnClose: $('#btn-close'),
  connectionStatus: $('#connection-status'),
  statusDot: $('.status-dot'),
  statusText: $('.status-text'),

  // Navigation
  navBtns: $$('.nav-btn'),
  views: $$('.view'),

  // Chat
  chatMessages: $('#chat-messages'),
  chatInput: $('#chat-input'),
  btnSend: $('#btn-send'),
  btnAbort: $('#btn-abort'),
  typingIndicator: $('#typing-indicator'),

  // Modules
  moduleCards: $$('.module-card'),
  activeModuleIndicator: $('#active-module-indicator'),
  activeModuleName: $('#active-module-name'),
  btnClearModule: $('#btn-clear-module'),

  // Memory
  memoryContent: $('#memory-content'),
  btnExport: $('#btn-export'),
  btnImport: $('#btn-import'),
  btnClearConversation: $('#btn-clear-conversation'),
  btnRerunOnboarding: $('#btn-rerun-onboarding'),

  // Settings
  settingOllamaUrl: $('#setting-ollama-url'),
  settingModelName: $('#setting-model-name'),
  settingNumCtx: $('#setting-num-ctx'),
  settingContextWindow: $('#setting-context-window'),
  btnSaveSettings: $('#btn-save-settings'),

  // Onboarding
  onboardingOverlay: $('#onboarding-overlay'),
  onboardingQuestion: $('#onboarding-question'),
  onboardingInput: $('#onboarding-input'),
  btnOnboardingSkip: $('#btn-onboarding-skip'),
  btnOnboardingNext: $('#btn-onboarding-next'),
  progressDots: $$('.progress-dot'),

  // Feedback & Bug Reporter
  btnQuickFeedback: $('#btn-quick-feedback'),
  persistentFeedbackBar: $('#persistent-feedback-bar'),
  feedbackOverlay: $('#feedback-overlay'),
  btnCloseFeedback: $('#btn-close-feedback'),
  feedbackBadge: $('#feedback-badge'),
  feedbackFloatingBadge: $('#feedback-floating-badge'),
  feedbackHeaderIcon: $('#feedback-header-icon'),
  feedbackModalTitle: $('#feedback-modal-title'),
  feedbackTabs: $$('.feedback-tab'),
  tabCount: $('#tab-count'),
  tabFeedbackNew: $('#tab-feedback-new'),
  tabFeedbackList: $('#tab-feedback-list'),
  typeBtns: $$('.type-btn'),
  feedbackTitle: $('#feedback-title'),
  feedbackSeverity: $('#feedback-severity'),
  feedbackDesc: $('#feedback-desc'),
  feedbackIncludeDiag: $('#feedback-include-diag'),
  btnViewDiag: $('#btn-view-diag'),
  diagPreview: $('#diagnostics-preview'),
  diagPreviewCode: $('#diag-preview-code'),
  btnSaveFeedbackLocal: $('#btn-save-feedback-local'),
  btnSaveAndGithub: $('#btn-save-and-github'),
  feedbackSearch: $('#feedback-search'),
  btnExportFeedbackMd: $('#btn-export-feedback-md'),
  btnExportFeedbackMdPage: $('#btn-export-feedback-md-page'),
  btnOpenNewFeedbackPage: $('#btn-open-new-feedback-page'),
  feedbackItemsContainer: $('#feedback-items-container'),
  feedbackItemsContainerPage: $('#feedback-items-container-page'),

  // Superbrain Hub
  btnSyncAllSuperbrain: $('#btn-sync-all-superbrain'),
  rtStatusPill: $('#rt-status-pill'),
  btnSyncRt: $('#btn-sync-rt'),
  rtSourceInput: $('#rt-source-input'),
  btnDetectRt: $('#btn-detect-rt'),
  rtWeeklyBurn: $('#rt-weekly-burn'),
  rtMonthlyBurn: $('#rt-monthly-burn'),
  rtSubCount: $('#rt-sub-count'),
  rtTravelCredits: $('#rt-travel-credits'),
  rtHardwareVal: $('#rt-hardware-val'),
  rtRenewalsList: $('#rt-renewals-list'),
  nbStatusPill: $('#nb-status-pill'),
  btnImportNb: $('#btn-import-nb'),
  btnExportNb: $('#btn-export-nb'),
  nbOpenTasks: $('#nb-open-tasks'),
  nbHighPriTasks: $('#nb-high-pri-tasks'),
  nbNotesCount: $('#nb-notes-count'),
  nbPromptsCount: $('#nb-prompts-count'),
  nbTasksList: $('#nb-tasks-list'),
  superbrainTelemetryPreview: $('#superbrain-telemetry-preview'),
};

// ============================================================
// INITIALIZATION
// ============================================================

async function init() {
  // Load profile and settings
  state.profile = await window.bestie.memory.getProfile();
  state.settings = await window.bestie.settings.load();

  // Apply settings to form
  if (state.settings) {
    els.settingOllamaUrl.value = state.settings.ollama_url || 'http://localhost:11434';
    els.settingModelName.value = state.settings.model_name || 'bestie';
    els.settingNumCtx.value = state.settings.num_ctx || 16384;
    els.settingContextWindow.value = state.settings.context_window || 50;
  }

  // Check Ollama connection
  checkConnection();
  setInterval(checkConnection, 30000); // Check every 30s

  // Register event listeners
  registerEventListeners();

  // Set up Ollama streaming listeners
  setupOllamaListeners();

  // Load existing conversation
  await loadExistingConversation();

  // Load feedback badge
  await refreshFeedbackBadge();

  // Auto-sync Superbrain telemetry if available
  autoSyncSuperbrain();

  // Check if onboarding is needed
  if (!state.profile?.onboarding_state?.completed) {
    startOnboarding();
  }
}

async function checkConnection() {
  try {
    const status = await window.bestie.ollama.checkStatus();
    state.isConnected = status.connected && status.modelAvailable;

    els.statusDot.className = `status-dot ${state.isConnected ? 'connected' : 'disconnected'}`;
    els.statusText.textContent = state.isConnected
      ? 'Connected'
      : (status.error || 'Disconnected');
  } catch (e) {
    state.isConnected = false;
    els.statusDot.className = 'status-dot disconnected';
    els.statusText.textContent = 'Disconnected';
  }
}

// ============================================================
// EVENT LISTENERS
// ============================================================

function registerEventListeners() {
  // Window controls
  els.btnMinimize.addEventListener('click', () => window.bestie.window.minimize());
  els.btnMaximize.addEventListener('click', () => window.bestie.window.maximize());
  els.btnClose.addEventListener('click', () => window.bestie.window.close());

  // Navigation
  els.navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      switchView(view);
      if (view === 'memory') refreshMemoryView();
    });
  });

  // Chat input
  els.chatInput.addEventListener('input', () => {
    autoResizeTextarea(els.chatInput);
    els.btnSend.disabled = !els.chatInput.value.trim() || state.isGenerating;
  });

  els.chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (els.chatInput.value.trim() && !state.isGenerating) {
        sendMessage();
      }
    }
  });

  els.btnSend.addEventListener('click', () => {
    if (els.chatInput.value.trim() && !state.isGenerating) {
      sendMessage();
    }
  });

  els.btnAbort.addEventListener('click', () => {
    window.bestie.ollama.abort();
  });

  // Modules
  els.moduleCards.forEach(card => {
    card.addEventListener('click', () => {
      const moduleName = card.dataset.module;
      activateModule(moduleName);
    });
  });

  els.btnClearModule?.addEventListener('click', () => {
    deactivateModule();
  });

  // Memory actions
  els.btnExport.addEventListener('click', async () => {
    const result = await window.bestie.data.export();
    if (result.success) showToast('Data exported successfully');
  });

  els.btnImport.addEventListener('click', async () => {
    const result = await window.bestie.data.import();
    if (result.success) {
      showToast('Data imported successfully');
      state.profile = await window.bestie.memory.getProfile();
      refreshMemoryView();
    }
  });

  els.btnClearConversation.addEventListener('click', async () => {
    if (confirm('Clear all chat history? This cannot be undone.')) {
      await window.bestie.conversation.clear();
      els.chatMessages.innerHTML = '';
      addWelcomeMessage();
      showToast('Chat history cleared');
    }
  });

  els.btnRerunOnboarding.addEventListener('click', () => {
    startOnboarding();
  });

  // Settings
  els.btnSaveSettings.addEventListener('click', async () => {
    const settings = {
      ollama_url: els.settingOllamaUrl.value,
      model_name: els.settingModelName.value,
      num_ctx: parseInt(els.settingNumCtx.value),
      context_window: parseInt(els.settingContextWindow.value),
      theme: 'neon-dark'
    };
    await window.bestie.settings.save(settings);
    state.settings = settings;
    showToast('Settings saved');
    checkConnection();
  });

  // Onboarding
  els.btnOnboardingNext.addEventListener('click', handleOnboardingNext);
  els.btnOnboardingSkip.addEventListener('click', handleOnboardingSkip);
  els.onboardingInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.metaKey) {
      handleOnboardingNext();
    }
  });

  // Feedback & Bug reporter
  els.btnQuickFeedback?.addEventListener('click', () => openFeedbackModal());
  els.persistentFeedbackBar?.addEventListener('click', () => openFeedbackModal());
  els.btnCloseFeedback?.addEventListener('click', () => closeFeedbackModal());

  els.feedbackTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      switchFeedbackTab(tab.dataset.tab);
    });
  });

  els.typeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      els.typeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFeedbackType = btn.dataset.type;
      if (els.feedbackHeaderIcon) els.feedbackHeaderIcon.textContent = activeFeedbackType === 'bug' ? '🐞' : '💡';
      if (els.feedbackModalTitle) els.feedbackModalTitle.textContent = activeFeedbackType === 'bug' ? 'Log Bug / Glitch' : 'Suggest Feature / Improvement';
    });
  });

  els.btnViewDiag?.addEventListener('click', async () => {
    if (els.diagPreview.classList.contains('hidden')) {
      const diag = await window.bestie.feedback.getDiagnostics();
      diag.activeModule = state.activeModule || 'None (General Chat)';
      els.diagPreviewCode.textContent = JSON.stringify(diag, null, 2);
      els.diagPreview.classList.remove('hidden');
      els.btnViewDiag.textContent = 'Hide Diagnostics';
    } else {
      els.diagPreview.classList.add('hidden');
      els.btnViewDiag.textContent = 'Preview Diagnostics';
    }
  });

  els.btnSaveFeedbackLocal?.addEventListener('click', () => handleSaveFeedback(false));
  els.btnSaveAndGithub?.addEventListener('click', () => handleSaveFeedback(true));

  els.btnExportFeedbackMd?.addEventListener('click', handleExportFeedbackMd);
  els.btnExportFeedbackMdPage?.addEventListener('click', handleExportFeedbackMd);
  els.btnOpenNewFeedbackPage?.addEventListener('click', () => openFeedbackModal());

  els.feedbackSearch?.addEventListener('input', () => {
    renderFeedbackList(cachedFeedback, els.feedbackSearch.value);
  });

  // Superbrain Hub
  els.btnSyncAllSuperbrain?.addEventListener('click', async () => {
    showToast('Synchronizing Superbrain data into Living Dossier...');
    await window.bestie.superbrain.syncResourceTracker(els.rtSourceInput?.value?.trim() || null);
    state.profile = await window.bestie.memory.getProfile();
    await refreshSuperbrainView();
    showToast('Superbrain telemetry synchronized into Dossier! ⚡');
  });

  els.btnSyncRt?.addEventListener('click', async () => {
    const inputPath = els.rtSourceInput?.value?.trim() || null;
    showToast('Connecting to Resource Tracker...');
    const res = await window.bestie.superbrain.syncResourceTracker(inputPath);
    if (res.success) {
      showToast(`Connected! Synced ${res.count} items. Weekly burn: $${res.metrics.weekly_burn_rate}`);
    } else {
      showToast(`Could not connect: ${res.error}`);
    }
    await refreshSuperbrainView();
  });

  els.btnDetectRt?.addEventListener('click', async () => {
    const detected = await window.bestie.superbrain.detectPath();
    if (detected) {
      if (els.rtSourceInput) els.rtSourceInput.value = detected;
      showToast(`Found Resource Tracker data at: ${detected}`);
      await window.bestie.superbrain.syncResourceTracker(detected);
      await refreshSuperbrainView();
    } else {
      showToast('No standard Resource Tracker data file found. Enter path or start local server.');
    }
  });

  els.btnImportNb?.addEventListener('click', async () => {
    const res = await window.bestie.superbrain.importNeonBrainDialog();
    if (res && res.success) {
      showToast(`Imported from Neon Brain: ${res.tasksCount} tasks, ${res.notesCount} notes, ${res.promptsCount} prompts! 🧠`);
      await refreshSuperbrainView();
    }
  });

  els.btnExportNb?.addEventListener('click', async () => {
    const sbData = await window.bestie.superbrain.getData();
    const tasks = (sbData.neon_brain?.tasks || []).concat([
      {
        id: `task-bestie-${Date.now()}`,
        title: 'Review 90-Day North Star with Digital Bestie',
        description: 'Living Dossier strategic calibration',
        priority: 'high',
        status: 'todo',
        createdAt: new Date().toISOString()
      }
    ]);
    const exportPayload = {
      exported_from: 'Digital Bestie',
      exported_at: new Date().toISOString(),
      tasks,
      notes: sbData.neon_brain?.notes || [],
      prompts: sbData.neon_brain?.prompts || []
    };
    const res = await window.bestie.superbrain.exportToNeonBrainDialog(exportPayload);
    if (res && res.success) {
      showToast(`Exported plan to: ${res.path} 🚀`);
    }
  });
}

// ============================================================
// VIEW MANAGEMENT
// ============================================================

function switchView(viewName) {
  state.currentView = viewName;

  els.navBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === viewName);
  });

  els.views.forEach(view => {
    view.classList.toggle('active', view.id === `view-${viewName}`);
  });

  if (viewName === 'memory') refreshMemoryView();
  if (viewName === 'feedback') refreshFeedbackView();
  if (viewName === 'superbrain') refreshSuperbrainView();
}

// ============================================================
// CHAT
// ============================================================

let currentStreamEl = null;
let removeTokenListener = null;
let removeDoneListener = null;
let removeErrorListener = null;

function setupOllamaListeners() {
  // These listeners stay active for the lifetime of the app
  removeTokenListener = window.bestie.ollama.onToken((token) => {
    if (currentStreamEl) {
      const contentEl = currentStreamEl.querySelector('.message-raw-content');
      if (contentEl) {
        contentEl.textContent += token;
        // Re-parse markdown
        const renderedEl = currentStreamEl.querySelector('.message-content');
        renderedEl.innerHTML = parseMarkdown(contentEl.textContent);
      }
      scrollToBottom();
    }
  });

  removeDoneListener = window.bestie.ollama.onDone((result) => {
    state.isGenerating = false;
    els.typingIndicator.classList.add('hidden');
    els.btnSend.disabled = !els.chatInput.value.trim();
    els.btnAbort.classList.add('hidden');
    els.btnSend.classList.remove('hidden');
    currentStreamEl = null;
    scrollToBottom();
  });

  removeErrorListener = window.bestie.ollama.onError((error) => {
    state.isGenerating = false;
    els.typingIndicator.classList.add('hidden');
    els.btnSend.disabled = !els.chatInput.value.trim();
    els.btnAbort.classList.add('hidden');
    els.btnSend.classList.remove('hidden');
    
    addSystemMessage(`Connection error: ${error}. Make sure Ollama is running.`);
    currentStreamEl = null;
  });
}

async function sendMessage() {
  const text = els.chatInput.value.trim();
  if (!text || state.isGenerating) return;

  // Clear input
  els.chatInput.value = '';
  autoResizeTextarea(els.chatInput);
  els.btnSend.disabled = true;

  // Add user message to UI
  addMessage('user', text);

  // Show typing indicator
  state.isGenerating = true;
  els.typingIndicator.classList.remove('hidden');
  els.btnSend.classList.add('hidden');
  els.btnAbort.classList.remove('hidden');
  scrollToBottom();

  // Create assistant message placeholder for streaming
  currentStreamEl = createMessageElement('assistant', '');
  els.chatMessages.appendChild(currentStreamEl);

  try {
    await window.bestie.ollama.chat(text, state.activeModule);
  } catch (err) {
    // Error handling is done via the onError listener
    console.error('Chat error:', err);
  }
}

function addMessage(role, content) {
  const el = createMessageElement(role, content);
  els.chatMessages.appendChild(el);
  scrollToBottom();
}

function createMessageElement(role, content) {
  const div = document.createElement('div');
  div.className = `message ${role}`;

  const avatarSvg = role === 'assistant'
    ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="url(#neonGrad2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`
    : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;

  div.innerHTML = `
    <div class="message-avatar">${avatarSvg}</div>
    <div class="message-content">${parseMarkdown(content)}</div>
    <span class="message-raw-content" style="display:none">${escapeHtml(content)}</span>
  `;

  return div;
}

function addSystemMessage(text) {
  const div = document.createElement('div');
  div.className = 'message assistant';
  div.innerHTML = `
    <div class="message-avatar">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ff6666" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>
    </div>
    <div class="message-content" style="border-color: rgba(255,68,68,0.2)"><p>${escapeHtml(text)}</p></div>
  `;
  els.chatMessages.appendChild(div);
  scrollToBottom();
}

function addWelcomeMessage() {
  const div = document.createElement('div');
  div.className = 'message assistant welcome-message';
  div.innerHTML = `
    <div class="message-avatar">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="url(#neonGrad2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
      </svg>
    </div>
    <div class="message-content">
      <p>Hey! I'm your Digital Bestie — your personal confidante, operational strategist, and second brain. 💜</p>
      <p>No judgment, no corporate fluff, just real talk and real help. What's on your mind?</p>
    </div>
  `;
  els.chatMessages.appendChild(div);
}

async function loadExistingConversation() {
  try {
    const conversation = await window.bestie.conversation.load();
    if (conversation?.messages?.length > 0) {
      // Clear the welcome message
      els.chatMessages.innerHTML = '';
      
      // Add all existing messages
      conversation.messages.forEach(msg => {
        addMessage(msg.role, msg.content);
      });
      
      scrollToBottom();
    }
  } catch (e) {
    console.error('Failed to load conversation:', e);
  }
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
  });
}

function autoResizeTextarea(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px';
}

// ============================================================
// MODULES
// ============================================================

function activateModule(moduleName) {
  state.activeModule = moduleName;
  
  // Update module cards
  els.moduleCards.forEach(card => {
    card.classList.toggle('active-module', card.dataset.module === moduleName);
  });

  // Show indicator
  els.activeModuleIndicator.classList.remove('hidden');
  els.activeModuleName.textContent = moduleName.replace(/-/g, ' ');

  // Switch to chat view
  switchView('chat');

  // Add system message about module activation
  const moduleNames = {
    'sanity-scout': 'Sanity Scout 🗺️',
    'venture-incubator': 'Venture Incubator 🚀',
    'ghostwriter': 'Ghostwriter ✍️',
    'capital-guardian': 'Capital Guardian 💰',
    'priority-sorter': 'Priority Sorter ⚡',
    'pre-mortem': 'Pre-Mortem 🎯',
    'mess-converter': 'Mess → Execution 📋',
    'assumptions-breaker': 'Assumptions Breaker 🔍',
    'learning-engine': '80/20 Learning 📚',
    'troubleshooter': 'Troubleshooter 🔧',
    'ship-it': 'Ship It ✅',
    'ceo-review': 'CEO Review 📊',
    'compressor': 'Communication Compressor 💬',
    'automation-scanner': 'Automation Scanner ⚙️',
  };

  addMessage('assistant', `**${moduleNames[moduleName] || moduleName}** module activated. I'm now focused on this mode. What do you need?`);
}

function deactivateModule() {
  state.activeModule = null;
  els.moduleCards.forEach(card => card.classList.remove('active-module'));
  els.activeModuleIndicator.classList.add('hidden');
  addMessage('assistant', 'Module deactivated. Back to general mode — what\'s on your mind?');
}

// ============================================================
// MEMORY VIEW
// ============================================================

async function refreshMemoryView() {
  state.profile = await window.bestie.memory.getProfile();
  const p = state.profile?.user_profile;
  
  if (!p) {
    els.memoryContent.innerHTML = '<div class="memory-loading">No profile data yet. Run onboarding to get started.</div>';
    return;
  }

  const renderField = (label, value) => {
    const displayVal = Array.isArray(value)
      ? (value.length ? value.join(', ') : null)
      : value;
    
    const isEmpty = !displayVal && displayVal !== 0;
    return `
      <div class="memory-field">
        <span class="memory-field-label">${label}</span>
        <span class="memory-field-value ${isEmpty ? 'memory-field-empty' : ''}">${isEmpty ? 'Not set' : escapeHtml(String(displayVal))}</span>
      </div>
    `;
  };

  const b = p.identity_and_baseline || {};
  const c = p.cognitive_and_behavioral_profile || {};
  const g = p.goal_and_boundary_matrix || {};
  const s = p.scout_index || {};
  const v = p.secret_venture_incubator || {};

  els.memoryContent.innerHTML = `
    <div class="memory-section">
      <h3>Identity & Baseline</h3>
      ${renderField('Living Situation', b.current_living_situation)}
      ${renderField('Cash Reserve', b.liquid_cash_reserve != null ? '$' + b.liquid_cash_reserve : null)}
      ${renderField('Cash Floor', b.hard_cash_floor != null ? '$' + b.hard_cash_floor : null)}
      ${renderField('Weekly Burn Rate', b.burn_rate_weekly != null ? '$' + b.burn_rate_weekly : null)}
      ${renderField('Primary Stressor', b.primary_acute_stressor)}
      ${renderField('Location', b.active_location)}
    </div>
    <div class="memory-section">
      <h3>Cognitive & Behavioral Profile</h3>
      ${renderField('Decision Bias', c.decision_bias)}
      ${renderField('Avoidance Triggers', c.primary_avoidance_triggers)}
      ${renderField('Escape Mechanisms', c.escape_mechanisms)}
      ${renderField('Tone Preference', c.tone_preference)}
      ${renderField('Execution Style', c.execution_style)}
    </div>
    <div class="memory-section">
      <h3>Goals & Boundaries</h3>
      ${renderField('90-Day North Star', g.north_star_90_day)}
      ${renderField('Anti-Goals', g.anti_goals)}
      ${renderField('Rate Floor', g.rate_floor)}
      ${renderField('Deposit Policy', g.deposit_policy)}
      ${renderField('Client Red Flags', g.client_red_flags)}
    </div>
    <div class="memory-section">
      <h3>Venture Incubator</h3>
      ${renderField('Active Project', v.active_project_name)}
      ${renderField('Core Skills', v.core_skills_leveraged)}
      ${renderField('Backlog Tasks', v.backlog_micro_tasks)}
    </div>
    <div class="memory-section">
      <h3>Third Places</h3>
      ${s.verified_third_places?.length 
        ? s.verified_third_places.map(p => renderField(p.name, `${p.type} — ${p.notes || 'No notes'}`)).join('')
        : '<div class="memory-field"><span class="memory-field-label">No places saved yet</span></div>'}
    </div>
  `;
}

// ============================================================
// ONBOARDING
// ============================================================

let onboardingPhase = 1;

async function startOnboarding() {
  onboardingPhase = 1;
  els.onboardingOverlay.classList.remove('hidden');
  updateOnboardingUI();
}

async function updateOnboardingUI() {
  const prompt = await window.bestie.onboarding.getPrompt(onboardingPhase);
  
  els.onboardingQuestion.innerHTML = `<p>${prompt}</p>`;
  els.onboardingInput.value = '';
  els.onboardingInput.focus();

  // Update progress dots
  els.progressDots.forEach(dot => {
    const phase = parseInt(dot.dataset.phase);
    dot.classList.remove('active', 'completed');
    if (phase === onboardingPhase) dot.classList.add('active');
    if (phase < onboardingPhase) dot.classList.add('completed');
  });

  // Update button text on last phase
  els.btnOnboardingNext.textContent = onboardingPhase === 5 ? 'Finish' : 'Continue';
}

async function handleOnboardingNext() {
  const response = els.onboardingInput.value.trim();
  if (!response) return;

  // Show processing state
  const card = document.querySelector('.onboarding-card');
  card.classList.add('processing');

  try {
    // Extract structured data from response
    const extracted = await window.bestie.ollama.extract(onboardingPhase, response);

    if (extracted && !extracted.parseError) {
      // Map extracted data to profile fields
      const fieldMap = {
        1: {
          'user_profile.identity_and_baseline.current_living_situation': extracted.current_living_situation,
          'user_profile.identity_and_baseline.primary_acute_stressor': extracted.primary_acute_stressor,
          'user_profile.identity_and_baseline.active_location': extracted.active_location,
        },
        2: {
          'user_profile.cognitive_and_behavioral_profile.primary_avoidance_triggers': extracted.primary_avoidance_triggers,
        },
        3: {
          'user_profile.cognitive_and_behavioral_profile.decision_bias': extracted.decision_bias,
          'user_profile.cognitive_and_behavioral_profile.escape_mechanisms': extracted.escape_mechanisms,
        },
        4: {
          'user_profile.goal_and_boundary_matrix.anti_goals': extracted.anti_goals,
          'user_profile.goal_and_boundary_matrix.north_star_90_day': extracted.north_star_90_day,
        },
        5: {
          'user_profile.cognitive_and_behavioral_profile.tone_preference': extracted.tone_preference,
          'user_profile.cognitive_and_behavioral_profile.execution_style': extracted.execution_style,
        },
      };

      const fields = fieldMap[onboardingPhase] || {};
      for (const [path, value] of Object.entries(fields)) {
        if (value !== undefined && value !== null && value !== '') {
          await window.bestie.memory.updateField(path, value);
        }
      }
    }

    // Save phase response
    state.profile = await window.bestie.memory.getProfile();
    if (!state.profile.onboarding_state) state.profile.onboarding_state = {};
    if (!state.profile.onboarding_state.phase_responses) state.profile.onboarding_state.phase_responses = {};
    state.profile.onboarding_state.phase_responses[onboardingPhase] = response;
    state.profile.onboarding_state.current_phase = onboardingPhase;
    await window.bestie.memory.saveProfile(state.profile);

  } catch (err) {
    console.error('Onboarding extraction error:', err);
    // Continue anyway — the raw response is saved
  }

  card.classList.remove('processing');

  if (onboardingPhase < 5) {
    onboardingPhase++;
    updateOnboardingUI();
  } else {
    // Complete onboarding
    state.profile.onboarding_state.completed = true;
    await window.bestie.memory.saveProfile(state.profile);
    els.onboardingOverlay.classList.add('hidden');
    
    addMessage('assistant', 'Onboarding complete! 🎉 I\'ve got your profile saved. I know your situation, your patterns, your goals, and how you want me to talk to you. Let\'s get to work — what\'s the most pressing thing on your plate right now?');
  }
}

function handleOnboardingSkip() {
  if (onboardingPhase < 5) {
    onboardingPhase++;
    updateOnboardingUI();
  } else {
    // Complete onboarding even if last phase is skipped
    if (state.profile) {
      state.profile.onboarding_state = state.profile.onboarding_state || {};
      state.profile.onboarding_state.completed = true;
      window.bestie.memory.saveProfile(state.profile);
    }
    els.onboardingOverlay.classList.add('hidden');
    addMessage('assistant', 'Got it — we can fill in the blanks as we go. What\'s on your mind?');
  }
}

// ============================================================
// FEEDBACK & BUG REPORTER
// ============================================================

let activeFeedbackType = 'bug';
let cachedFeedback = [];

async function refreshFeedbackBadge() {
  try {
    const items = await window.bestie.feedback.load();
    cachedFeedback = items || [];
    const count = cachedFeedback.length;
    
    if (els.feedbackBadge) {
      els.feedbackBadge.textContent = count;
      els.feedbackBadge.classList.toggle('hidden', count === 0);
    }
    if (els.feedbackFloatingBadge) {
      els.feedbackFloatingBadge.textContent = count;
      els.feedbackFloatingBadge.classList.toggle('hidden', count === 0);
    }
    if (els.tabCount) {
      els.tabCount.textContent = count;
    }
  } catch (err) {
    console.warn('Error loading feedback badge:', err);
  }
}

async function openFeedbackModal(type = 'bug') {
  activeFeedbackType = type;
  els.typeBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.type === type);
  });
  if (els.feedbackHeaderIcon) {
    els.feedbackHeaderIcon.textContent = type === 'bug' ? '🐞' : '💡';
  }
  if (els.feedbackModalTitle) {
    els.feedbackModalTitle.textContent = type === 'bug' ? 'Log Bug / Glitch' : 'Suggest Feature / Improvement';
  }
  els.feedbackTitle.value = '';
  els.feedbackDesc.value = '';
  els.diagPreview.classList.add('hidden');
  if (els.btnViewDiag) els.btnViewDiag.textContent = 'Preview Diagnostics';

  switchFeedbackTab('new');
  els.feedbackOverlay.classList.remove('hidden');
  els.feedbackTitle.focus();
}

function closeFeedbackModal() {
  els.feedbackOverlay.classList.add('hidden');
}

function switchFeedbackTab(tabName) {
  els.feedbackTabs.forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === tabName);
  });
  if (tabName === 'new') {
    els.tabFeedbackNew.classList.add('active');
    els.tabFeedbackList.classList.remove('active');
  } else {
    els.tabFeedbackNew.classList.remove('active');
    els.tabFeedbackList.classList.add('active');
    loadAndRenderFeedback();
  }
}

async function loadAndRenderFeedback() {
  const items = await window.bestie.feedback.load();
  cachedFeedback = items || [];
  renderFeedbackList(cachedFeedback, els.feedbackSearch?.value || '');
  await refreshFeedbackBadge();
}

function renderFeedbackList(items, filter = '') {
  const containers = [els.feedbackItemsContainer, els.feedbackItemsContainerPage].filter(Boolean);
  
  const query = filter.toLowerCase().trim();
  const filtered = query
    ? items.filter(it => (it.title || '').toLowerCase().includes(query) || (it.description || '').toLowerCase().includes(query))
    : items;

  containers.forEach(container => {
    if (!filtered || filtered.length === 0) {
      container.innerHTML = `
        <div class="empty-feedback-state">
          <p>No logged items yet.</p>
          <p style="margin-top: 4px; font-size: 11px; opacity: 0.7;">Click "New Entry" above to log a bug or suggest a feature.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = filtered.map(item => {
      const isBug = item.type === 'bug';
      const typeBadge = isBug 
        ? `<span class="badge-tag badge-bug">🐞 Bug</span>`
        : `<span class="badge-tag badge-feature">💡 Idea</span>`;
      
      const sevBadge = `<span class="badge-tag badge-sev-${item.severity || 'medium'}">${(item.severity || 'medium').toUpperCase()}</span>`;
      const dateStr = item.createdAt ? new Date(item.createdAt).toLocaleString() : '';

      return `
        <div class="feedback-item-card" data-id="${item.id}">
          <div class="feedback-item-header">
            <div class="feedback-item-tags">
              ${typeBadge}
              ${sevBadge}
            </div>
            <span class="feedback-item-time">${dateStr}</span>
          </div>
          <div class="feedback-item-title">${escapeHtml(item.title)}</div>
          ${item.description ? `<div class="feedback-item-desc">${escapeHtml(item.description)}</div>` : ''}
          <div class="feedback-item-actions">
            <button class="btn-glass btn-sm btn-delete-feedback" data-id="${item.id}">Delete</button>
            <button class="btn-glass btn-sm btn-github-issue" data-id="${item.id}">Open in GitHub</button>
          </div>
        </div>
      `;
    }).join('');

    // Attach listeners
    container.querySelectorAll('.btn-delete-feedback').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        await window.bestie.feedback.delete(id);
        showToast('Item deleted');
        loadAndRenderFeedback();
      });
    });

    container.querySelectorAll('.btn-github-issue').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const target = cachedFeedback.find(it => it.id === id);
        if (target) {
          const body = formatIssueBody(target);
          const labels = target.type === 'bug' ? ['bug'] : ['enhancement'];
          const res = await window.bestie.feedback.createGithubIssue({
            title: target.title,
            body,
            labels
          });
          if (res.success) {
            showToast('GitHub issue created / opened!');
          }
        }
      });
    });
  });
}

function formatIssueBody(item) {
  let body = `### Description\n${item.description || 'No description provided.'}\n\n`;
  body += `**Severity / Priority**: ${item.severity || 'medium'}\n`;
  body += `**Logged At**: ${item.createdAt}\n\n`;
  if (item.diagnostics) {
    body += `<details>\n<summary>System Diagnostics</summary>\n\n\`\`\`json\n${JSON.stringify(item.diagnostics, null, 2)}\n\`\`\`\n</details>\n`;
  }
  return body;
}

async function handleSaveFeedback(pushToGithub = false) {
  const title = els.feedbackTitle.value.trim();
  if (!title) {
    showToast('Please enter a title or summary');
    els.feedbackTitle.focus();
    return;
  }

  const description = els.feedbackDesc.value.trim();
  const severity = els.feedbackSeverity.value;
  const includeDiag = els.feedbackIncludeDiag.checked;

  let diagnostics = null;
  if (includeDiag) {
    diagnostics = await window.bestie.feedback.getDiagnostics();
    diagnostics.activeModule = state.activeModule || 'None (General Chat)';
  }

  const newItem = await window.bestie.feedback.add({
    type: activeFeedbackType,
    title,
    description,
    severity,
    diagnostics
  });

  if (pushToGithub) {
    showToast('Creating GitHub issue...');
    const body = formatIssueBody(newItem);
    const labels = activeFeedbackType === 'bug' ? ['bug'] : ['enhancement'];
    const res = await window.bestie.feedback.createGithubIssue({
      title,
      body,
      labels
    });
    if (res.success) {
      showToast('Logged & GitHub issue created! 🚀');
    }
  } else {
    showToast('Logged locally! 💾');
  }

  closeFeedbackModal();
  await refreshFeedbackBadge();
  if (state.currentView === 'feedback') {
    refreshFeedbackView();
  }
}

async function refreshFeedbackView() {
  await loadAndRenderFeedback();
}

async function handleExportFeedbackMd() {
  const items = await window.bestie.feedback.load();
  if (!items || items.length === 0) {
    showToast('No feedback items to export');
    return;
  }

  let md = `# Digital Bestie — Feedback & Bug Log\n*Exported: ${new Date().toLocaleString()}*\n\n`;
  items.forEach((it, idx) => {
    md += `## ${idx + 1}. [${it.type.toUpperCase()}] ${it.title}\n`;
    md += `- **Severity**: ${it.severity}\n`;
    md += `- **Date**: ${it.createdAt}\n`;
    md += `- **Status**: ${it.status}\n\n`;
    md += `${it.description || '*No description*'}\n\n`;
    if (it.diagnostics) {
      md += `\`\`\`json\n${JSON.stringify(it.diagnostics, null, 2)}\n\`\`\`\n\n`;
    }
    md += `---\n\n`;
  });

  await navigator.clipboard.writeText(md);
  showToast('Copied all feedback to clipboard as Markdown! 📋');
}

// ============================================================
// SUPERBRAIN HUB (RESOURCE TRACKER & NEON BRAIN)
// ============================================================

async function autoSyncSuperbrain() {
  try {
    const detected = await window.bestie.superbrain.detectPath();
    if (detected) {
      await window.bestie.superbrain.syncResourceTracker(detected);
    }
  } catch (_) {}
}

async function refreshSuperbrainView() {
  try {
    const data = await window.bestie.superbrain.getData();
    const rt = data.resource_tracker || {};
    const nb = data.neon_brain || {};

    // Resource Tracker UI
    const rtConnected = rt.connected;
    if (els.rtStatusPill) {
      els.rtStatusPill.className = `status-badge ${rtConnected ? 'connected' : 'disconnected'}`;
      els.rtStatusPill.textContent = rtConnected ? `Connected (${rt.source_type})` : 'Disconnected';
    }
    if (els.rtSourceInput && !els.rtSourceInput.value) {
      els.rtSourceInput.value = rt.source_path || '';
    }

    const rm = rt.metrics || {};
    if (els.rtWeeklyBurn) els.rtWeeklyBurn.textContent = `$${rm.weekly_burn_rate || 0}`;
    if (els.rtMonthlyBurn) els.rtMonthlyBurn.textContent = `$${rm.monthly_burn_rate || 0}`;
    if (els.rtSubCount) els.rtSubCount.textContent = rm.subscription_count || 0;
    if (els.rtTravelCredits) els.rtTravelCredits.textContent = `$${rm.total_travel_credits || 0}`;
    if (els.rtHardwareVal) els.rtHardwareVal.textContent = `$${rm.hardware_asset_value || 0}`;

    if (els.rtRenewalsList) {
      const renewals = rt.upcoming_renewals || [];
      if (renewals.length === 0) {
        els.rtRenewalsList.innerHTML = `<div class="empty-state-sm">No renewals tracked yet</div>`;
      } else {
        els.rtRenewalsList.innerHTML = renewals.map(r => `
          <div class="renewal-item">
            <div>
              <strong>${escapeHtml(r.title)}</strong>
              <div style="font-size: 10px; color: var(--text-dim);">${r.renewalDate}</div>
            </div>
            <div style="text-align: right;">
              <div style="color: var(--neon-cyan); font-weight: 600;">$${r.cost}</div>
              <div style="font-size: 10px; color: ${r.daysLeft <= 3 ? '#ff4d4d' : 'var(--text-muted)'};">${r.daysLeft} days left</div>
            </div>
          </div>
        `).join('');
      }
    }

    // Neon Brain UI
    const nbConnected = nb.connected;
    if (els.nbStatusPill) {
      els.nbStatusPill.className = `status-badge ${nbConnected ? 'connected' : 'disconnected'}`;
      els.nbStatusPill.textContent = nbConnected ? `Connected (${nb.source_type})` : 'Disconnected';
    }

    const nm = nb.metrics || {};
    if (els.nbOpenTasks) els.nbOpenTasks.textContent = nm.open_tasks_count || 0;
    if (els.nbHighPriTasks) els.nbHighPriTasks.textContent = nm.high_priority_tasks_count || 0;
    if (els.nbNotesCount) els.nbNotesCount.textContent = nm.notes_count || 0;
    if (els.nbPromptsCount) els.nbPromptsCount.textContent = nm.prompts_count || 0;

    if (els.nbTasksList) {
      const highTasks = (nb.tasks || []).filter(t => !t.completed && (t.priority === 'high' || t.priority === 'urgent'));
      if (highTasks.length === 0) {
        els.nbTasksList.innerHTML = `<div class="empty-state-sm">No high-priority tasks in vault</div>`;
      } else {
        els.nbTasksList.innerHTML = highTasks.slice(0, 5).map(t => `
          <div class="task-summary-item">
            <div>
              <span class="badge-tag badge-sev-high" style="font-size: 9px; margin-right: 6px;">${(t.priority || 'high').toUpperCase()}</span>
              <strong>${escapeHtml(t.title)}</strong>
            </div>
            <span style="font-size: 11px; color: var(--text-dim);">${t.status || 'todo'}</span>
          </div>
        `).join('');
      }
    }

    // Telemetry Snippet Preview
    if (els.superbrainTelemetryPreview) {
      let preview = '';
      if (rtConnected) {
        preview += `🌌 RESOURCE TRACKER:\n- Weekly Burn: $${rm.weekly_burn_rate} ($${rm.monthly_burn_rate}/mo)\n- Tracked Subscriptions: ${rm.subscription_count}\n- Travel Credits & Vouchers: $${rm.total_travel_credits}\n- Hardware Assets: $${rm.hardware_asset_value}\n\n`;
      }
      if (nbConnected) {
        preview += `⚡ NEON BRAIN:\n- Open Tasks: ${nm.open_tasks_count} (${nm.high_priority_tasks_count} urgent)\n- Thought Vault Notes: ${nm.notes_count}\n- Prompt Templates: ${nm.prompts_count}\n`;
      }
      els.superbrainTelemetryPreview.textContent = preview.trim() || 'No active telemetry yet. Connect Resource Tracker or import Neon Brain above.';
    }
  } catch (err) {
    console.error('Error refreshing superbrain view:', err);
  }
}

// ============================================================
// UTILITIES
// ============================================================

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showToast(message) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    padding: 10px 20px;
    background: rgba(0, 240, 255, 0.15);
    border: 1px solid rgba(0, 240, 255, 0.3);
    border-radius: 8px;
    color: var(--neon-cyan);
    font-size: 13px;
    z-index: 3000;
    backdrop-filter: blur(10px);
    animation: toastIn 0.3s ease;
  `;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Add toast animation to head
const toastStyle = document.createElement('style');
toastStyle.textContent = `
  @keyframes toastIn {
    from { opacity: 0; transform: translateX(-50%) translateY(10px); }
    to { opacity: 1; transform: translateX(-50%) translateY(0); }
  }
`;
document.head.appendChild(toastStyle);

// ============================================================
// BOOT
// ============================================================

document.addEventListener('DOMContentLoaded', init);
