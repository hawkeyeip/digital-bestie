/**
 * Digital Bestie — Renderer
 * Main application logic for the UI
 */

import { CALIBRATION_PACKS, getDossierValue } from './services/calibration.js';
import { MODULES_METADATA, PERSONA_CATEGORIES } from './services/modules-data.js';
import { PROMPT_CATEGORIES } from './services/prompts-data.js';
import { IMPORT_PROVIDERS, DOSSIER_TARGET_FIELDS, parseExportedMemory, DEMO_CLAUDE_EXPORT } from './services/memory-import-data.js';

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

  // Links (strictly sanitized: only http, https, and mailto allowed)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) => {
    const trimmed = (url || '').trim();
    if (/^(https?:\/\/|mailto:)/i.test(trimmed)) {
      const safeUrl = trimmed.replace(/"/g, '&quot;');
      return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${text}</a>`;
    }
    // Neutralize dangerous protocols (e.g. javascript:, file:, data:)
    return `<span class="insecure-link" title="Blocked untrusted protocol">${text}</span>`;
  });

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
  conversations: [],
  folders: [],
  activeConversationId: null,
  activeFolderFilter: 'all',
  historySearchQuery: '',
  selectedFolderEmoji: '📁',
  personaCategoryFilter: 'all',
  personaSearchQuery: '',
  modulesCategoryFilter: 'all',
  modulesSearchQuery: '',
  prompts: [],
  promptsCategoryFilter: 'all',
  promptsSearchQuery: '',
  credentials: [],
  credentialsCategoryFilter: 'all',
  credentialsSearchQuery: '',
  activeNbBank: 'tasks',
  activeSettingsPanel: 'panel-settings-memory',
  selectedImportProvider: 'claude',
  stagedMemories: [],
  stagedFilterCategory: 'all',
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

  // Chat History Sidebar & Folders
  chatHistorySidebar: $('#chat-history-sidebar'),
  btnCollapseHistory: $('#btn-collapse-history'),
  btnToggleHistorySidebar: $('#btn-toggle-history-sidebar'),
  btnNewChat: $('#btn-new-chat'),
  historySearchInput: $('#history-search-input'),
  foldersFilterList: $('#folders-filter-list'),
  btnAddFolder: $('#btn-add-folder'),
  historyConversationList: $('#history-conversation-list'),
  historyChatCount: $('#history-chat-count'),
  historyListHeading: $('#history-list-heading'),
  activeChatTitle: $('#active-chat-title'),
  activeChatFolderTag: $('#active-chat-folder-tag'),
  btnRenameActiveChat: $('#btn-rename-active-chat'),
  btnMoveActiveChat: $('#btn-move-active-chat'),
  btnClearActiveChat: $('#btn-clear-active-chat'),

  // Folder Modal
  folderModal: $('#folder-modal'),
  folderModalTitle: $('#folder-modal-title'),
  folderModalIconPreview: $('#folder-modal-icon-preview'),
  folderEditId: $('#folder-edit-id'),
  folderInputName: $('#folder-input-name'),
  folderEmojiPicker: $('#folder-emoji-picker'),
  btnCloseFolderModal: $('#btn-close-folder-modal'),
  btnCancelFolder: $('#btn-cancel-folder'),
  btnSaveFolder: $('#btn-save-folder'),

  // Move Chat Modal
  moveChatModal: $('#move-chat-modal'),
  moveChatId: $('#move-chat-id'),
  moveChatFolderSelect: $('#move-chat-folder-select'),
  btnCloseMoveModal: $('#btn-close-move-modal'),
  btnCancelMove: $('#btn-cancel-move'),
  btnConfirmMove: $('#btn-confirm-move'),

  // In-Chat Persona Selector & Dropdown
  btnPersonaSelector: $('#btn-persona-selector'),
  personaBtnIcon: $('#persona-btn-icon'),
  personaBtnLabel: $('#persona-btn-label'),
  personaBtnBadge: $('#persona-btn-badge'),
  personaDropdownMenu: $('#persona-dropdown-menu'),
  personaSearchInput: $('#persona-search-input'),
  btnClearPersonaSearch: $('#btn-clear-persona-search'),
  personaCategoryFilters: $('#persona-category-filters'),
  personaDropdownList: $('#persona-dropdown-list'),
  personaDropdownEmpty: $('#persona-dropdown-empty'),
  personaEmptyQuery: $('#persona-empty-query'),

  // Modules Hub
  moduleCards: $$('.module-card'),
  modulesSearchInput: $('#modules-search-input'),
  btnClearModulesSearch: $('#btn-clear-modules-search'),
  modulesCategoryFilters: $('#modules-category-filters'),
  modulesGrid: $('#modules-grid'),
  modulesEmptySearch: $('#modules-empty-search'),
  modulesEmptyQuery: $('#modules-empty-query'),
  activeModuleIndicator: $('#active-module-indicator'),
  activeModuleName: $('#active-module-name'),
  btnClearModule: $('#btn-clear-module'),
  moduleTooltip: $('#module-tooltip'),
  ttIcon: $('#tt-icon'),
  ttTitle: $('#tt-title'),
  ttBadge: $('#tt-badge'),
  ttWhen: $('#tt-when'),
  ttCaps: $('#tt-caps'),
  ttExample: $('#tt-example'),

  // Prompt Vault & Directives
  navBtnPrompts: $('[data-view="prompts"]'),
  viewPrompts: $('#view-prompts'),
  btnChatPromptVault: $('#btn-chat-prompt-vault'),
  promptsSearchInput: $('#prompts-search-input'),
  btnClearPromptsSearch: $('#btn-clear-prompts-search'),
  promptsCategoryFilters: $('#prompts-category-filters'),
  promptsGrid: $('#prompts-grid'),
  promptsEmptySearch: $('#prompts-empty-search'),
  promptsEmptyQuery: $('#prompts-empty-query'),
  btnCreatePrompt: $('#btn-create-prompt'),
  promptModal: $('#prompt-modal'),
  btnClosePromptModal: $('#btn-close-prompt-modal'),
  promptModalTitle: $('#prompt-modal-title'),
  promptFormId: $('#prompt-form-id'),
  promptFormTitle: $('#prompt-form-title'),
  promptFormCategory: $('#prompt-form-category'),
  promptFormPersona: $('#prompt-form-persona'),
  promptFormContent: $('#prompt-form-content'),
  promptFormReason: $('#prompt-form-reason'),
  promptFormFavorite: $('#prompt-form-favorite'),
  btnDeletePromptModal: $('#btn-delete-prompt-modal'),
  btnSavePromptModal: $('#btn-save-prompt-modal'),

  // Credentials & Merit Vault
  navBtnCredentials: $('[data-view="credentials"]'),
  viewCredentials: $('#view-credentials'),
  credentialsSearchInput: $('#credentials-search-input'),
  btnClearCredentialsSearch: $('#btn-clear-credentials-search'),
  btnCreateCredential: $('#btn-create-credential'),
  credentialsCategoryFilters: $('#credentials-category-filters'),
  credentialsGrid: $('#credentials-grid'),
  credentialsEmptySearch: $('#credentials-empty-search'),
  credCountAll: $('#cred-count-all'),
  credCountHighlight: $('#cred-count-highlight'),
  tabMemoryCredentials: $('#tab-memory-credentials'),
  credentialModal: $('#credential-modal'),
  btnCloseCredentialModal: $('#btn-close-credential-modal'),
  credentialModalTitle: $('#credential-modal-title'),
  credModalIconPreview: $('#cred-modal-icon-preview'),
  credFormId: $('#cred-form-id'),
  credFormTitle: $('#cred-form-title'),
  credFormIssuer: $('#cred-form-issuer'),
  credFormCategory: $('#cred-form-category'),
  credFormIssueDate: $('#cred-form-issue-date'),
  credFormExpiryDate: $('#cred-form-expiry-date'),
  credFormIdUrl: $('#cred-form-id-url'),
  credFormSkills: $('#cred-form-skills'),
  credFormDesc: $('#cred-form-desc'),
  credFormHighlight: $('#cred-form-highlight'),
  btnDeleteCredentialModal: $('#btn-delete-credential-modal'),
  btnSaveCredentialModal: $('#btn-save-credential-modal'),

  // Memory & Calibration Lab
  memoryContent: $('#memory-content'),
  tabMemoryDossier: $('#tab-memory-dossier'),
  tabMemoryCalibration: $('#tab-memory-calibration'),
  tabCalibDossier: $('#tab-calib-dossier'),
  tabCalibCredentials: $('#tab-calib-credentials'),
  tabCalibCalibration: $('#tab-calib-lab'),
  btnOpenCalibrationFromMemory: $('#btn-open-calibration-from-memory'),
  btnSwitchToDossier: $('#btn-switch-to-dossier'),
  calibrationCategories: $('#calibration-categories'),
  calibrationActiveCard: $('#calibration-active-card'),
  btnExport: $('#btn-export'),
  btnImport: $('#btn-import'),
  btnClearConversation: $('#btn-clear-conversation'),
  btnRerunOnboarding: $('#btn-rerun-onboarding'),

  // Titlebar / Header Model Selector
  headerModelSelect: $('#header-model-select'),

  // Model Switch Warning & Custom Selection Modal
  modelWarningModal: $('#model-warning-modal'),
  btnCloseModelWarning: $('#btn-close-model-warning'),
  btnCancelModelWarning: $('#btn-cancel-model-warning'),
  btnConfirmModelWarning: $('#btn-confirm-model-warning'),
  modelWarningSelectedPreview: $('#model-warning-selected-preview'),
  modelWarningCustomField: $('#model-warning-custom-field'),
  customModelInput: $('#custom-model-input'),

  // Base Model Infusion Tool
  infuseBaseModelSelect: $('#infuse-base-model-select'),
  infuseTargetNameInput: $('#infuse-target-name-input'),
  btnInfuseModel: $('#btn-infuse-model'),

  // Settings & System Health
  settingOllamaUrl: $('#setting-ollama-url'),
  settingModelName: $('#setting-model-name'),
  settingNumCtx: $('#setting-num-ctx'),
  settingContextWindow: $('#setting-context-window'),
  settingGithubToken: $('#setting-github-token'),
  settingPowerSaver: $('#setting-power-saver'),
  settingKeepAlive: $('#setting-keep-alive'),
  btnRefreshMemory: $('#btn-refresh-memory'),
  btnClearMemCache: $('#btn-clear-mem-cache'),
  memHeapUsed: $('#mem-heap-used'),
  memRss: $('#mem-rss'),
  memSysFree: $('#mem-sys-free'),
  btnSaveSettings: $('#btn-save-settings'),

  // Ollama Health & Self-Healing Elements
  btnRefreshHealth: $('#btn-refresh-health'),
  healthCardOllama: $('#health-card-ollama'),
  healthStatusOllama: $('#health-status-ollama'),
  healthDescOllama: $('#health-desc-ollama'),
  healthCardPersona: $('#health-card-persona'),
  healthStatusPersona: $('#health-status-persona'),
  healthDescPersona: $('#health-desc-persona'),
  btnRestorePersona: $('#btn-restore-persona'),
  btnRestorePersonaLight: $('#btn-restore-persona-light'),
  healthCardEmbeddings: $('#health-card-embeddings'),
  healthStatusEmbeddings: $('#health-status-embeddings'),
  healthDescEmbeddings: $('#health-desc-embeddings'),
  btnPullEmbeddings: $('#btn-pull-embeddings'),
  selfHealingBanner: $('#self-healing-banner'),
  selfHealingMsg: $('#self-healing-msg'),

  // Model Version Upgrade & Curated Catalog
  modelUpgradeBanner: $('#model-upgrade-banner'),
  modelUpgradeBadge: $('#model-upgrade-badge'),
  modelUpgradeTitle: $('#model-upgrade-title'),
  modelUpgradeDesc: $('#model-upgrade-desc'),
  btnApplyModelUpgrade: $('#btn-apply-model-upgrade'),
  btnRefreshCatalog: $('#btn-refresh-catalog'),
  curatedModelsList: $('#curated-models-list'),

  // Updater
  appVersionBadge: $('#app-version-badge'),
  updaterStatusBadge: $('#updater-status-badge'),
  updaterStatusText: $('#updater-status-text'),
  updaterReleaseDetails: $('#updater-release-details'),
  updaterReleaseTitle: $('#updater-release-title'),
  updaterReleaseSnippet: $('#updater-release-snippet'),
  btnCheckUpdates: $('#btn-check-updates'),
  btnDownloadUpdate: $('#btn-download-update'),
  updateNotificationBanner: $('#update-notification-banner'),
  updateBannerVersion: $('#update-banner-version'),
  updateBannerTitle: $('#update-banner-title'),
  btnUpdateBannerDownload: $('#btn-update-banner-download'),
  btnUpdateBannerDismiss: $('#btn-update-banner-dismiss'),

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
  btnAddResource: $('#btn-add-resource'),
  resourceModal: $('#resource-modal'),
  btnCloseResourceModal: $('#btn-close-resource-modal'),
  btnCancelResource: $('#btn-cancel-resource'),
  btnSubmitResource: $('#btn-submit-resource'),
  resInputTitle: $('#res-input-title'),
  resInputCategory: $('#res-input-category'),
  resInputCost: $('#res-input-cost'),
  resInputCycle: $('#res-input-cycle'),
  resInputDate: $('#res-input-date'),
  resInputNotes: $('#res-input-notes'),
  rtItemsList: $('#rt-items-list'),
  rtItemsCount: $('#rt-items-count'),
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
  btnAddNbItem: $('#btn-add-nb-item'),
  nbBankTabs: $$('.nb-bank-tab'),
  nbTabTasksCount: $('#nb-tab-tasks-count'),
  nbTabNotesCount: $('#nb-tab-notes-count'),
  nbTabPromptsCount: $('#nb-tab-prompts-count'),
  nbBankItemsContainer: $('#nb-bank-items-container'),
  neonBrainModal: $('#neon-brain-modal'),
  btnCloseNbModal: $('#btn-close-nb-modal'),
  btnCancelNb: $('#btn-cancel-nb'),
  btnSubmitNb: $('#btn-submit-nb'),
  nbTypeBtns: $$('#neon-brain-modal .type-btn'),
  nbTypeTask: $('#nb-type-task'),
  nbTypeNote: $('#nb-type-note'),
  nbTypePrompt: $('#nb-type-prompt'),
  nbInputTitle: $('#nb-input-title'),
  nbLabelTitle: $('#nb-label-title'),
  nbGroupPriority: $('#nb-group-priority'),
  nbInputPriority: $('#nb-input-priority'),
  nbInputContent: $('#nb-input-content'),
  nbLabelContent: $('#nb-label-content'),
  nbInputTags: $('#nb-input-tags'),
  superbrainTelemetryPreview: $('#superbrain-telemetry-preview'),

  // Topbar User Menu & Location
  btnUserMenu: $('#btn-user-menu'),
  userMenuDropdown: $('#user-menu-dropdown'),
  topbarUserLocation: $('#topbar-user-location'),
  menuCurrentLocationText: $('#menu-current-location-text'),
  userMenuLocationPreview: $('#user-menu-location-preview'),

  // Memory View & Import Hub Enhancements
  btnOpenImportHub: $('#btn-open-import-hub'),
  btnImportMemoryHeader: $('#btn-import-memory-header'),
  btnImportMemoryCalib: $('#btn-import-memory-calib'),
  btnLaunchImportFromSettings: $('#btn-launch-import-from-settings'),
  importMemoryModal: $('#import-memory-modal'),
  btnCloseImportModal: $('#btn-close-import-modal'),

  // Settings Hub & Memory Consolidation
  settingsSearchInput: $('#settings-search-input'),
  settingsNavSections: $('#settings-nav-sections'),
  settingsNavBtns: $$('.settings-nav-btn'),
  settingsPanels: $$('.settings-panel'),
  importProviderPills: $$('.provider-pill'),
  importSelectedProviderTitle: $('#import-selected-provider-title'),
  importPromptDisplay: $('#import-prompt-display'),
  btnCopyImportPrompt: $('#btn-copy-import-prompt'),
  importMemoryInput: $('#import-memory-input'),
  btnParseMemory: $('#btn-parse-memory'),
  btnLoadSampleMemory: $('#btn-load-sample-memory'),
  btnClearImportInput: $('#btn-clear-import-input'),
  importStagingArea: $('#import-staging-area'),
  stagedSelectedCount: $('#staged-selected-count'),
  stagedTotalCount: $('#staged-total-count'),
  stagedFilterChips: $$('#staged-filter-chips .staging-chip'),
  btnStageSelectAll: $('#btn-stage-select-all'),
  btnStageDeselectAll: $('#btn-stage-deselect-all'),
  btnAddStagedCustom: $('#btn-add-staged-custom'),
  importStagedItems: $('#import-staged-items'),
  btnCancelStagedMemory: $('#btn-cancel-staged-memory'),
  btnCommitStagedMemory: $('#btn-commit-staged-memory'),
  settingInjectDossier: $('#setting-inject-dossier'),
  settingAutoCommit: $('#setting-auto-commit'),
  btnSettingsJumpCalibration: $('#btn-settings-jump-calibration'),
  settingsDossierSummaryGrid: $('#settings-dossier-summary-grid'),
  settingThemeSelect: $('#setting-theme-select'),
  btnSettingsClearChat: $('#btn-settings-clear-chat'),
  settingUserLocation: $('#setting-user-location'),
  settingLivingSetup: $('#setting-living-setup'),
  btnSaveLocationSettings: $('#btn-save-location-settings'),
  settingTonePreference: $('#setting-tone-preference'),
  settingExecutionStyle: $('#setting-execution-style'),
  btnSaveToneSettings: $('#btn-save-tone-settings')
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
    if (els.settingModelName) els.settingModelName.value = state.settings.model_name || 'bestie-abliterated';
    els.settingNumCtx.value = state.settings.num_ctx || 16384;
    els.settingContextWindow.value = state.settings.context_window || 50;
    if (els.settingGithubToken) els.settingGithubToken.value = state.settings.github_token || '';
    if (els.headerModelSelect) els.headerModelSelect.value = state.settings.model_name || 'bestie-abliterated';
    if (els.settingPowerSaver) els.settingPowerSaver.checked = !!state.settings.power_saver;
    if (els.settingKeepAlive) els.settingKeepAlive.value = state.settings.ollama_keep_alive || '5m';
    if (state.settings.power_saver) {
      document.body.classList.add('power-saver');
    }
  }

  // Check Ollama connection and initialize smart polling
  checkConnection();
  setupConnectionPolling();

  // Register event listeners
  registerEventListeners();

  // Set up Ollama streaming listeners
  setupOllamaListeners();

  // Restore history sidebar collapse state
  if (localStorage.getItem('bestie_history_collapsed') === 'true' && els.chatHistorySidebar) {
    els.chatHistorySidebar.classList.add('collapsed');
  }

  // Initialize multi-conversation vault
  await refreshConversationsList();
  await loadActiveConversationMessages();

  // Load feedback badge
  await refreshFeedbackBadge();

  // Auto-sync Superbrain telemetry if available
  autoSyncSuperbrain();

  // Initialize In-Chat Persona Menu & Modules Hub
  renderPersonaDropdown();
  setupModulesHub();

  // Initialize Application Updater
  setupUpdater();
  updatePersonaSwitcherUI();

  // Initialize Prompt Vault & Operator Directives
  await setupPromptsVault();

  // Initialize Credentials & Merit Vault
  await setupCredentialsVault();

  // Initialize Performance & Power Monitoring
  setupPerformanceControls();

  // Initialize Topbar User Menu & Location
  setupUserMenuDropdown();
  updateTopbarUserLocation();

  // Initialize Settings Hub & Memory Consolidation
  setupSettingsHub();
  setupMemoryImportHub();
  syncSettingsFieldsFromState();

  // Apply theme if set
  if (state.settings?.theme) {
    document.body.dataset.theme = state.settings.theme;
  }

  // Check if onboarding is needed
  if (!state.profile?.onboarding_state?.completed) {
    startOnboarding();
  }
}

function updateModelDropdowns(models, activeModel) {
  if (!models || models.length === 0) return;

  const current = activeModel || state.settings?.model_name || 'bestie-abliterated';
  
  // Sort with bestie-abliterated and abliterated models at top
  const sorted = [...models].sort((a, b) => {
    const rank = (name) => {
      const lower = name.toLowerCase();
      if (lower.startsWith('bestie-abliterated')) return 0;
      if (lower.includes('abliterated') && lower.includes('bestie')) return 1;
      if (lower.includes('abliterated')) return 2;
      if (lower.startsWith('bestie-light')) return 3;
      if (lower.startsWith('bestie')) return 4;
      if (lower.startsWith('qwen2.5') || lower.startsWith('qwen3.5')) return 5;
      return 10;
    };
    const diff = rank(a.name) - rank(b.name);
    if (diff !== 0) return diff;
    return a.name.localeCompare(b.name);
  });

  const optionsHtml = sorted.map(m => {
    const isSelected = m.name === current || m.name.startsWith(`${current}:`);
    const sizeGb = (m.size / (1024 * 1024 * 1024)).toFixed(1);
    
    // Protected and informative tags
    let tag = '';
    const lower = m.name.toLowerCase();
    if (lower.startsWith('bestie-abliterated')) {
      tag = '🔥 Abliterated Core';
    } else if (lower.includes('abliterated')) {
      tag = '🔥 Abliterated Base';
    } else if (lower.startsWith('bestie-light') || lower.startsWith('bestie')) {
      tag = '🛡️ System Core';
    } else if (lower.includes('nomic-embed-text') || lower.includes('embed')) {
      tag = '🛡️ Vector Memory';
    } else if (lower.startsWith('qwen2.5') || lower.startsWith('qwen3.5')) {
      tag = '⚡ Recommended';
    } else {
      tag = m.size < 12 * 1024 * 1024 * 1024 ? 'Fast' : 'Deep';
    }
    return `<option value="${m.name}" ${isSelected ? 'selected' : ''}>${m.name} (${sizeGb} GB • ${tag})</option>`;
  }).join('');

  // If current active model is not in the installed list, prepend it so it remains visible
  const hasCurrent = sorted.some(m => m.name === current || m.name.startsWith(`${current}:`));
  let extraCurrentOption = '';
  if (current && !hasCurrent && current !== '__custom__') {
    extraCurrentOption = `<option value="${current}" selected>${current} (Active Custom Model)</option>`;
  }

  const customOption = `<option value="__custom__">➕ Use Custom / Other Model...</option>`;
  const fullHtml = extraCurrentOption + optionsHtml + customOption;

  if (els.headerModelSelect) {
    els.headerModelSelect.innerHTML = fullHtml;
    els.headerModelSelect.value = current;
  }
  if (els.settingModelName) {
    els.settingModelName.innerHTML = fullHtml;
    els.settingModelName.value = current;
  }

  // Populate Base Model Dropdown for Bestie Core Infusion
  if (els.infuseBaseModelSelect) {
    const nonEmbedModels = sorted.filter(m => !m.name.toLowerCase().includes('embed'));
    const infuseOptions = nonEmbedModels.map(m => {
      const sizeGb = (m.size / (1024 * 1024 * 1024)).toFixed(1);
      return `<option value="${m.name}">${m.name} (${sizeGb} GB)</option>`;
    }).join('');
    els.infuseBaseModelSelect.innerHTML = infuseOptions;
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

    if (status.models && status.models.length > 0) {
      updateModelDropdowns(status.models, status.activeModel || state.settings?.model_name);
    }

    // Update Ollama & Model System Health UI in Settings
    updateHealthStatusUI(status);

    // Self-healing notification & banner
    if (status.isFallback && status.fallbackReason && state.lastReportedFallback !== status.activeModel) {
      state.lastReportedFallback = status.activeModel;
      showToast(`🛡️ Self-Healing Active: Model "${status.targetModel}" not found. Auto-connected using "${status.activeModel}".`);
      if (els.selfHealingBanner && els.selfHealingMsg) {
        els.selfHealingBanner.classList.remove('hidden');
        els.selfHealingMsg.textContent = status.fallbackReason;
      }
    } else if (!status.isFallback && els.selfHealingBanner) {
      els.selfHealingBanner.classList.add('hidden');
    }
  } catch (e) {
    state.isConnected = false;
    els.statusDot.className = 'status-dot disconnected';
    els.statusText.textContent = 'Disconnected';
  }
}

function updateHealthStatusUI(status) {
  if (!status) return;
  const health = status.systemHealth || {};

  // 1. Ollama Engine
  if (els.healthStatusOllama) {
    if (health.ollamaRunning) {
      els.healthStatusOllama.textContent = 'Online';
      els.healthStatusOllama.className = 'health-badge healthy';
      if (els.healthDescOllama) els.healthDescOllama.textContent = `localhost:11434 (${health.totalModels || 0} models loaded)`;
      els.healthCardOllama?.classList.remove('error');
    } else {
      els.healthStatusOllama.textContent = 'Offline';
      els.healthStatusOllama.className = 'health-badge error';
      if (els.healthDescOllama) els.healthDescOllama.textContent = 'Ollama service is not responding';
      els.healthCardOllama?.classList.add('error');
    }
  }

  // 2. Persona Core
  if (els.healthStatusPersona) {
    if (health.hasBestieCore) {
      els.healthStatusPersona.textContent = 'Installed';
      els.healthStatusPersona.className = 'health-badge healthy';
      const active = status.activeModel || 'bestie-abliterated';
      const isAbliterated = active.includes('abliterated');
      if (els.healthDescPersona) {
        els.healthDescPersona.textContent = `${active} (${isAbliterated ? '27B • 🔥 Abliterated Active' : 'Active'})`;
      }
      els.btnRestorePersona?.classList.remove('hidden');
      els.btnRestorePersonaLight?.classList.remove('hidden');
      els.healthCardPersona?.classList.remove('warning', 'error');
    } else if (health.activeChatModel) {
      els.healthStatusPersona.textContent = 'Fallback Active';
      els.healthStatusPersona.className = 'health-badge warning';
      if (els.healthDescPersona) els.healthDescPersona.textContent = `Using ${health.activeChatModel} (Bestie core missing)`;
      els.btnRestorePersona?.classList.remove('hidden');
      els.btnRestorePersonaLight?.classList.remove('hidden');
      els.healthCardPersona?.classList.add('warning');
    } else {
      els.healthStatusPersona.textContent = 'Missing';
      els.healthStatusPersona.className = 'health-badge error';
      if (els.healthDescPersona) els.healthDescPersona.textContent = 'No persona model installed';
      els.btnRestorePersona?.classList.remove('hidden');
      els.btnRestorePersonaLight?.classList.remove('hidden');
      els.healthCardPersona?.classList.add('error');
    }
  }

  // 3. Vector Embeddings
  if (els.healthStatusEmbeddings) {
    if (health.hasEmbeddingModel) {
      els.healthStatusEmbeddings.textContent = 'Installed';
      els.healthStatusEmbeddings.className = 'health-badge healthy';
      if (els.healthDescEmbeddings) els.healthDescEmbeddings.textContent = 'nomic-embed-text (Ready for RAG)';
      els.btnPullEmbeddings?.classList.add('hidden');
      els.healthCardEmbeddings?.classList.remove('warning');
    } else {
      els.healthStatusEmbeddings.textContent = 'Missing';
      els.healthStatusEmbeddings.className = 'health-badge warning';
      if (els.healthDescEmbeddings) els.healthDescEmbeddings.textContent = 'Vector retrieval offline (nomic-embed-text needed)';
      els.btnPullEmbeddings?.classList.remove('hidden');
      els.healthCardEmbeddings?.classList.add('warning');
    }
  }

  // 4. Model Version Upgrade & Recommendation Banner
  if (status.modelUpdates && status.modelUpdates.hasUpdate) {
    state.pendingModelUpgrade = status.modelUpdates;
    if (els.modelUpgradeBanner) {
      els.modelUpgradeBanner.classList.remove('hidden');
      if (els.modelUpgradeBadge) els.modelUpgradeBadge.textContent = status.modelUpdates.badge || 'Upgrade Available';
      if (els.modelUpgradeTitle) els.modelUpgradeTitle.textContent = status.modelUpdates.title;
      if (els.modelUpgradeDesc) els.modelUpgradeDesc.textContent = status.modelUpdates.description;
      if (els.btnApplyModelUpgrade) els.btnApplyModelUpgrade.textContent = status.modelUpdates.actionLabel || '📥 Upgrade Core';
    }
  } else if (els.modelUpgradeBanner) {
    state.pendingModelUpgrade = null;
    els.modelUpgradeBanner.classList.add('hidden');
  }

  // Refresh curated catalog display
  renderCuratedCatalog();
}

async function renderCuratedCatalog() {
  if (!els.curatedModelsList || !window.bestie.ollama.getCatalog) return;
  try {
    const catalog = await window.bestie.ollama.getCatalog();
    if (!catalog || catalog.length === 0) {
      els.curatedModelsList.innerHTML = `<div style="color: var(--text-muted); font-size: 12px; grid-column: 1 / -1;">No curated catalog items found.</div>`;
      return;
    }

    els.curatedModelsList.innerHTML = catalog.map(item => {
      let statusBadge = '';
      let actionBtn = '';

      if (item.isActive) {
        statusBadge = `<span class="health-badge healthy" style="font-size: 10px;">Active Core</span>`;
        actionBtn = `<div style="font-size: 11px; color: var(--neon-cyan); font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 4px; padding: 4px 0;">✓ Currently Active Core</div>`;
      } else if (item.isInstalled) {
        statusBadge = `<span class="health-badge healthy" style="font-size: 10px;">Installed</span>`;
        actionBtn = `
          <button type="button" class="btn-neon btn-xs btn-infuse-catalog" data-tag="${item.installedName}" style="font-size: 11px; padding: 5px 10px; width: 100%;">
            ⚡ Infuse as Bestie Core
          </button>
        `;
      } else {
        statusBadge = `<span class="health-badge" style="font-size: 10px; background: rgba(255,255,255,0.08); color: var(--text-muted);">Registry</span>`;
        actionBtn = `
          <button type="button" class="btn-glass btn-xs btn-download-catalog" data-tag="${item.tag}" style="font-size: 11px; padding: 5px 10px; width: 100%;">
            📥 Download &amp; Infuse (${item.sizeEstimate})
          </button>
        `;
      }

      const strengthTags = (item.strengths || []).map(s => `
        <span class="curated-tag-pill">${s}</span>
      `).join('');

      return `
        <div class="curated-model-item ${item.isActive ? 'active-core' : ''}">
          <div>
            <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; margin-bottom: 6px;">
              <div>
                <strong style="color: #fff; font-size: 13px; display: block;">${item.name}</strong>
                <span style="font-family: var(--font-mono); font-size: 11px; color: var(--text-muted);">${item.tag}</span>
              </div>
              ${statusBadge}
            </div>

            <div style="font-size: 11px; color: #cbd5e1; line-height: 1.4; margin-bottom: 8px;">
              ${item.description}
            </div>

            <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 12px;">
              ${strengthTags}
            </div>
          </div>

          <div style="border-top: 1px solid rgba(255,255,255,0.06); padding-top: 10px; margin-top: 6px;">
            ${actionBtn}
          </div>
        </div>
      `;
    }).join('');

    // Attach listeners
    els.curatedModelsList.querySelectorAll('.btn-infuse-catalog').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tag = e.currentTarget.dataset.tag;
        handleCuratedInfuse(tag);
      });
    });

    els.curatedModelsList.querySelectorAll('.btn-download-catalog').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tag = e.currentTarget.dataset.tag;
        handleCuratedDownload(tag);
      });
    });

  } catch (err) {
    console.error('Failed to render curated catalog:', err);
  }
}

async function handleCuratedInfuse(tag) {
  const confirmed = confirm(
    `Infuse "${tag}" into Digital Bestie Core?\n\n` +
    `This configures the core with 16k context, optimal temperature/repetition penalty, and binds your Living Dossier and all 20 personas to it.`
  );
  if (!confirmed) return;

  try {
    showToast(`⚡ Infusing ${tag} into Bestie Core...`);
    const res = await window.bestie.ollama.infuseModel({ baseModel: tag, targetName: 'bestie' });
    if (res && res.success) {
      showToast(`🎉 Bestie Core successfully infused with ${tag}!`);
      state.settings = state.settings || {};
      state.settings.model_name = 'bestie';
      await window.bestie.settings.save(state.settings);
      await checkConnection();
      await renderCuratedCatalog();
    } else {
      showToast(`❌ Infusion error: ${res?.error || 'Unknown error'}`);
    }
  } catch (err) {
    showToast(`❌ Error: ${err.message}`);
  }
}

async function handleCuratedDownload(tag) {
  const confirmed = confirm(
    `Download and infuse "${tag}"?\n\n` +
    `This will pull the weights from Ollama and automatically compile it into your Digital Bestie core.`
  );
  if (!confirmed) return;

  try {
    showToast(`📥 Pulling ${tag} and compiling core... This may take a minute or two.`);
    const res = await window.bestie.ollama.upgradeModel(tag);
    if (res && res.success) {
      showToast(`🎉 Successfully installed and infused ${tag}!`);
      state.settings = state.settings || {};
      state.settings.model_name = 'bestie';
      await window.bestie.settings.save(state.settings);
      await checkConnection();
      await renderCuratedCatalog();
    } else {
      showToast(`❌ Download failed: ${res?.error || 'Unknown error'}`);
    }
  } catch (err) {
    showToast(`❌ Error: ${err.message}`);
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

  // --- Chat History Sidebar & Topbar ---
  const toggleHistorySidebar = () => {
    if (!els.chatHistorySidebar) return;
    const isNowCollapsed = els.chatHistorySidebar.classList.toggle('collapsed');
    localStorage.setItem('bestie_history_collapsed', isNowCollapsed ? 'true' : 'false');
  };

  els.btnCollapseHistory?.addEventListener('click', toggleHistorySidebar);
  els.btnToggleHistorySidebar?.addEventListener('click', toggleHistorySidebar);

  // Global hotkeys
  window.addEventListener('keydown', (e) => {
    // Cmd+B / Ctrl+B: Toggle history sidebar
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      toggleHistorySidebar();
    }
    // Cmd+P / Ctrl+P: Toggle persona switcher menu
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'p') {
      e.preventDefault();
      togglePersonaDropdown();
    }
    // Cmd+L / Ctrl+L: Toggle Prompt Vault
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      switchView(state.currentView === 'prompts' ? 'chat' : 'prompts');
    }
    // Escape: Close persona menu, prompt modal, import modal & model warning modal if open
    if (e.key === 'Escape') {
      closePersonaDropdown();
      closePromptModal();
      closeImportMemoryModal();
      closeModelWarningModal(true);
    }
  });

  // + New Chat button
  els.btnNewChat?.addEventListener('click', handleCreateNewChat);

  // History search filter
  els.historySearchInput?.addEventListener('input', (e) => {
    state.historySearchQuery = e.target.value;
    renderConversationsList();
  });

  // Folder filter clicking (delegated)
  els.foldersFilterList?.addEventListener('click', (e) => {
    const item = e.target.closest('.folder-filter-item');
    if (item) {
      state.activeFolderFilter = item.dataset.folderId;
      renderFoldersFilter();
      renderConversationsList();
    }
  });

  // Add category folder button
  els.btnAddFolder?.addEventListener('click', () => openFolderModal());

  // Conversation list clicking & action buttons (delegated)
  els.historyConversationList?.addEventListener('click', async (e) => {
    const actionBtn = e.target.closest('.conv-action-btn');
    if (actionBtn) {
      e.stopPropagation();
      const action = actionBtn.dataset.action;
      const convId = actionBtn.dataset.id;
      if (action === 'rename') {
        handleRenameConversation(convId);
      } else if (action === 'delete') {
        handleDeleteConversation(convId);
      } else if (action === 'move') {
        openMoveChatModal(convId);
      }
      return;
    }

    const item = e.target.closest('.conversation-item');
    if (item && item.dataset.convId) {
      handleSwitchConversation(item.dataset.convId);
    }
  });

  // Topbar active chat actions
  els.activeChatTitle?.addEventListener('click', () => {
    if (state.activeConversationId) handleRenameConversation(state.activeConversationId);
  });
  els.btnRenameActiveChat?.addEventListener('click', () => {
    if (state.activeConversationId) handleRenameConversation(state.activeConversationId);
  });
  els.btnMoveActiveChat?.addEventListener('click', () => {
    if (state.activeConversationId) openMoveChatModal(state.activeConversationId);
  });
  els.btnClearActiveChat?.addEventListener('click', async () => {
    if (confirm('Clear all messages in this conversation?')) {
      await window.bestie.conversation.clear();
      await loadActiveConversationMessages();
      await refreshConversationsList();
    }
  });

  // Folder Modal handlers
  els.btnCloseFolderModal?.addEventListener('click', closeFolderModal);
  els.btnCancelFolder?.addEventListener('click', closeFolderModal);
  els.folderModal?.addEventListener('click', (e) => {
    if (e.target === els.folderModal) closeFolderModal();
  });

  els.folderEmojiPicker?.addEventListener('click', (e) => {
    const btn = e.target.closest('.emoji-btn');
    if (btn) {
      $$('.emoji-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.selectedFolderEmoji = btn.dataset.emoji;
      if (els.folderModalIconPreview) els.folderModalIconPreview.textContent = state.selectedFolderEmoji;
    }
  });

  els.btnSaveFolder?.addEventListener('click', async () => {
    const name = (els.folderInputName.value || '').trim();
    if (!name) return;
    const editId = els.folderEditId.value;
    if (editId) {
      await window.bestie.folder.rename(editId, name, state.selectedFolderEmoji);
    } else {
      await window.bestie.folder.create({ name, icon: state.selectedFolderEmoji });
    }
    closeFolderModal();
    await refreshConversationsList();
  });

  // Move Chat Modal handlers
  els.btnCloseMoveModal?.addEventListener('click', closeMoveChatModal);
  els.btnCancelMove?.addEventListener('click', closeMoveChatModal);
  els.moveChatModal?.addEventListener('click', (e) => {
    if (e.target === els.moveChatModal) closeMoveChatModal();
  });

  els.btnConfirmMove?.addEventListener('click', async () => {
    const convId = els.moveChatId.value;
    const folderId = els.moveChatFolderSelect.value || null;
    if (convId) {
      await window.bestie.conversation.moveToFolder(convId, folderId);
      closeMoveChatModal();
      await refreshConversationsList();
    }
  });

  // Persona Switcher & In-Chat Dropdown
  els.btnPersonaSelector?.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePersonaDropdown();
  });

  els.personaDropdownMenu?.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.persona-switcher-wrapper')) {
      closePersonaDropdown();
    }
  });

  // Persona search input in dropdown
  els.personaSearchInput?.addEventListener('input', (e) => {
    state.personaSearchQuery = e.target.value;
    els.btnClearPersonaSearch?.classList.toggle('hidden', !state.personaSearchQuery);
    renderPersonaDropdownList();
  });

  els.btnClearPersonaSearch?.addEventListener('click', () => {
    if (els.personaSearchInput) {
      els.personaSearchInput.value = '';
      state.personaSearchQuery = '';
      els.btnClearPersonaSearch.classList.add('hidden');
      renderPersonaDropdownList();
    }
  });

  // Default Confidante item in dropdown
  document.querySelector('.persona-dropdown-item.default-item')?.addEventListener('click', () => {
    deactivateModule();
  });

  // Modules Cards (Hub View)
  els.moduleCards.forEach(card => {
    card.addEventListener('click', () => {
      const moduleName = card.dataset.module;
      activateModule(moduleName);
    });
  });

  els.btnClearModule?.addEventListener('click', () => {
    deactivateModule();
  });

  // Setup rich hover tooltips for all operational modules
  setupModuleTooltips();

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

  // --- Model Alteration Warning & Switch Interception ---
  let pendingModelChange = null;

  function openModelWarningModal(targetModel, sourceElement) {
    const currentModel = state.settings?.model_name || 'bestie-abliterated';
    const isCustom = (targetModel === '__custom__');

    pendingModelChange = {
      targetModel,
      isCustom,
      sourceElement,
      previousModel: currentModel
    };

    if (els.modelWarningSelectedPreview) {
      els.modelWarningSelectedPreview.textContent = isCustom ? 'Custom User-Specified Model' : targetModel;
    }

    if (els.modelWarningCustomField) {
      if (isCustom) {
        els.modelWarningCustomField.classList.remove('hidden');
        if (els.customModelInput) {
          els.customModelInput.value = '';
          setTimeout(() => els.customModelInput?.focus(), 80);
        }
      } else {
        els.modelWarningCustomField.classList.add('hidden');
      }
    }

    els.modelWarningModal?.classList.remove('hidden');
  }

  function closeModelWarningModal(revert = true) {
    if (revert && pendingModelChange) {
      if (pendingModelChange.sourceElement) {
        pendingModelChange.sourceElement.value = pendingModelChange.previousModel;
      }
    }
    els.modelWarningModal?.classList.add('hidden');
    pendingModelChange = null;
  }

  async function confirmModelWarningChange() {
    if (!pendingModelChange) return;

    let finalModel = pendingModelChange.targetModel;
    if (pendingModelChange.isCustom) {
      const typed = els.customModelInput?.value?.trim();
      if (!typed) {
        showToast('⚠️ Please enter an Ollama model name/tag');
        els.customModelInput?.focus();
        return;
      }
      finalModel = typed;
    }

    const previous = pendingModelChange.previousModel;
    els.modelWarningModal?.classList.add('hidden');
    pendingModelChange = null;

    if (finalModel === previous) {
      return;
    }

    // Update settings
    state.settings = state.settings || {};
    state.settings.model_name = finalModel;
    await window.bestie.settings.save(state.settings);

    // Sync header & settings dropdowns
    [els.headerModelSelect, els.settingModelName].forEach(select => {
      if (!select) return;
      const exists = Array.from(select.options).some(opt => opt.value === finalModel);
      if (!exists) {
        const opt = document.createElement('option');
        opt.value = finalModel;
        opt.textContent = `${finalModel} (Active Custom Model)`;
        select.insertBefore(opt, select.lastElementChild);
      }
      select.value = finalModel;
    });

    showToast(`⚠️ Switched model to ${finalModel} (Performance & tone may vary)`);
    await checkConnection();
  }

  function handleInitiateModelChange(targetVal, sourceEl) {
    const currentModel = state.settings?.model_name || 'bestie-abliterated';
    if (targetVal === currentModel) return;
    openModelWarningModal(targetVal, sourceEl);
  }

  // Intercept changes on Header & Settings model selectors
  els.headerModelSelect?.addEventListener('change', (e) => {
    handleInitiateModelChange(e.target.value, els.headerModelSelect);
  });

  els.settingModelName?.addEventListener('change', (e) => {
    handleInitiateModelChange(e.target.value, els.settingModelName);
  });

  // Warning Modal Actions
  els.btnCloseModelWarning?.addEventListener('click', () => closeModelWarningModal(true));
  els.btnCancelModelWarning?.addEventListener('click', () => closeModelWarningModal(true));
  els.btnConfirmModelWarning?.addEventListener('click', confirmModelWarningChange);
  els.modelWarningModal?.addEventListener('click', (e) => {
    if (e.target === els.modelWarningModal) closeModelWarningModal(true);
  });
  els.customModelInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      confirmModelWarningChange();
    }
  });

  // Base Model Infusion into Bestie Core
  els.btnInfuseModel?.addEventListener('click', async () => {
    const baseModel = els.infuseBaseModelSelect?.value;
    const targetName = (els.infuseTargetNameInput?.value || 'bestie').trim();

    if (!baseModel) {
      showToast('⚠️ Please select an installed base model to infuse.');
      return;
    }
    if (!targetName) {
      showToast('⚠️ Please specify a target name for the infused model.');
      return;
    }

    const confirmed = confirm(
      `Infuse "${baseModel}" as Digital Bestie Core named "${targetName}"?\n\n` +
      `This compiles a high-context Modelfile (16k context, optimal temperature/repetition penalty) and bakes the Digital Bestie tenets into the core weights.`
    );
    if (!confirmed) return;

    try {
      els.btnInfuseModel.disabled = true;
      els.btnInfuseModel.textContent = '⏳ Compiling Core...';
      showToast(`🔥 Infusing ${baseModel} into ${targetName}... Please wait.`);

      const res = await window.bestie.ollama.infuseModel(baseModel, targetName);
      if (res && res.success) {
        showToast(`🎉 Successfully infused ${targetName}! Activating as core engine...`);
        state.settings = state.settings || {};
        state.settings.model_name = targetName;
        await window.bestie.settings.save(state.settings);
        await checkConnection();
      } else {
        showToast(`❌ Infusion failed: ${res?.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Infusion error:', err);
      showToast(`❌ Infusion error: ${err.message}`);
    } finally {
      els.btnInfuseModel.disabled = false;
      els.btnInfuseModel.textContent = '🔥 Infuse & Compile';
    }
  });

  // Settings
  els.btnSaveSettings?.addEventListener('click', async () => {
    const powerSaver = !!(els.settingPowerSaver && els.settingPowerSaver.checked);
    const keepAlive = (els.settingKeepAlive && els.settingKeepAlive.value) || '5m';
    const theme = (els.settingThemeSelect && els.settingThemeSelect.value) || 'neon-dark';
    const settings = {
      ollama_url: els.settingOllamaUrl.value,
      model_name: els.settingModelName.value,
      num_ctx: parseInt(els.settingNumCtx.value) || (powerSaver ? 4096 : 8192),
      context_window: parseInt(els.settingContextWindow.value) || 50,
      github_token: els.settingGithubToken ? els.settingGithubToken.value.trim() : '',
      power_saver: powerSaver,
      ollama_keep_alive: keepAlive,
      theme: theme,
      inject_dossier: els.settingInjectDossier ? els.settingInjectDossier.checked : true,
      auto_commit: els.settingAutoCommit ? els.settingAutoCommit.checked : true
    };
    await window.bestie.settings.save(settings);
    state.settings = settings;
    document.body.dataset.theme = theme;
    if (powerSaver) {
      document.body.classList.add('power-saver');
    } else {
      document.body.classList.remove('power-saver');
    }
    if (els.headerModelSelect) els.headerModelSelect.value = settings.model_name;
    showToast('Settings saved 🚀');
    checkConnection();
  });

  // Ollama Health & Model Restoration Listeners
  els.btnRefreshHealth?.addEventListener('click', async () => {
    els.btnRefreshHealth.textContent = 'Checking...';
    await checkConnection();
    showToast('Ollama system health verified ✨');
    els.btnRefreshHealth.textContent = '↻ Check Health';
  });

  // Curated Model Upgrade & Catalog Listeners
  els.btnApplyModelUpgrade?.addEventListener('click', async () => {
    if (!state.pendingModelUpgrade) return;
    const upgrade = state.pendingModelUpgrade;

    if (upgrade.isInstalled) {
      await handleCuratedInfuse(upgrade.recommendedTag);
    } else {
      await handleCuratedDownload(upgrade.recommendedTag);
    }
  });

  els.btnRefreshCatalog?.addEventListener('click', async () => {
    showToast('Refreshing curated model catalog...');
    await renderCuratedCatalog();
    showToast('Catalog refreshed ✨');
  });

  els.btnRestorePersona?.addEventListener('click', async () => {
    try {
      els.btnRestorePersona.disabled = true;
      els.btnRestorePersona.textContent = 'Recreating 27B...';
      showToast('Rebuilding bestie-abliterated (27B) from bundled template... ⏳');
      await window.bestie.ollama.restoreModel('abliterated');
      showToast('Successfully restored bestie-abliterated model! 🔥');
      await checkConnection();
    } catch (err) {
      showToast(`Failed to restore 27B model: ${err.message}`);
    } finally {
      els.btnRestorePersona.disabled = false;
      els.btnRestorePersona.textContent = '⚡ Recreate 27B Core';
    }
  });

  els.btnRestorePersonaLight?.addEventListener('click', async () => {
    try {
      els.btnRestorePersonaLight.disabled = true;
      els.btnRestorePersonaLight.textContent = 'Recreating 14B...';
      showToast('Rebuilding bestie-light (14B) from bundled template... ⏳');
      await window.bestie.ollama.restoreModel('light');
      showToast('Successfully restored bestie-light model! ⚡');
      await checkConnection();
    } catch (err) {
      showToast(`Failed to restore 14B model: ${err.message}`);
    } finally {
      els.btnRestorePersonaLight.disabled = false;
      els.btnRestorePersonaLight.textContent = 'Recreate 14B Light';
    }
  });

  els.btnPullEmbeddings?.addEventListener('click', async () => {
    try {
      els.btnPullEmbeddings.disabled = true;
      els.btnPullEmbeddings.textContent = 'Downloading...';
      showToast('Pulling nomic-embed-text from Ollama library... ⏳');
      await window.bestie.ollama.pull('nomic-embed-text');
      showToast('Successfully installed nomic-embed-text! ✨');
      await checkConnection();
    } catch (err) {
      showToast(`Failed to pull embeddings: ${err.message}`);
    } finally {
      els.btnPullEmbeddings.disabled = false;
      els.btnPullEmbeddings.textContent = '📥 Download nomic-embed-text';
    }
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

  // --- Calibration Lab & Dossier Deepening ---
  els.tabMemoryDossier?.addEventListener('click', () => switchView('memory'));
  els.tabMemoryCalibration?.addEventListener('click', () => switchView('calibration'));
  els.tabCalibDossier?.addEventListener('click', () => switchView('memory'));
  els.tabCalibCredentials?.addEventListener('click', () => switchView('credentials'));
  els.tabCalibCalibration?.addEventListener('click', () => switchView('calibration'));
  els.btnOpenCalibrationFromMemory?.addEventListener('click', () => switchView('calibration'));
  els.btnSwitchToDossier?.addEventListener('click', () => switchView('memory'));

  els.calibrationCategories?.addEventListener('click', (e) => {
    const pill = e.target.closest('.cal-cat-pill');
    if (!pill) return;
    const cat = pill.dataset.category;
    if (cat) {
      state.calibrationCategory = cat;
      $$('.cal-cat-pill', els.calibrationCategories).forEach(p => p.classList.toggle('active', p.dataset.category === cat));
      renderActiveCalibrationCategory(cat);
    }
  });

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

  // Resource Tracker - Add Resource Modal handlers
  els.btnAddResource?.addEventListener('click', () => {
    if (els.resInputTitle) els.resInputTitle.value = '';
    if (els.resInputCost) els.resInputCost.value = '';
    if (els.resInputNotes) els.resInputNotes.value = '';
    if (els.resInputDate) els.resInputDate.value = '';
    if (els.resInputCategory) els.resInputCategory.value = 'Subscription';
    if (els.resInputCycle) els.resInputCycle.value = 'Monthly';
    els.resourceModal?.classList.remove('hidden');
    els.resInputTitle?.focus();
  });

  const closeResourceModal = () => {
    els.resourceModal?.classList.add('hidden');
  };

  els.btnCloseResourceModal?.addEventListener('click', closeResourceModal);
  els.btnCancelResource?.addEventListener('click', closeResourceModal);
  els.resourceModal?.addEventListener('click', (e) => {
    if (e.target === els.resourceModal) closeResourceModal();
  });

  // Submit new resource
  els.btnSubmitResource?.addEventListener('click', async () => {
    const title = els.resInputTitle?.value?.trim();
    const category = els.resInputCategory?.value || 'Subscription';
    const cost = parseFloat(els.resInputCost?.value);
    const billingCycle = els.resInputCycle?.value || 'Monthly';
    const renewalDate = els.resInputDate?.value || null;
    const notes = els.resInputNotes?.value?.trim() || '';

    if (!title) {
      showToast('Please enter a resource name');
      els.resInputTitle?.focus();
      return;
    }
    if (isNaN(cost) || cost < 0) {
      showToast('Please enter a valid cost (e.g. 20.00)');
      els.resInputCost?.focus();
      return;
    }

    try {
      showToast('Saving resource to tracker...');
      const res = await window.bestie.superbrain.addResource({
        title,
        category,
        cost,
        billingCycle,
        renewalDate,
        notes
      });

      if (res && res.success) {
        showToast(`Added "${title}" to Resource Tracker! Burn rate updated. 🚀`);
        closeResourceModal();
        await refreshSuperbrainView();
      } else {
        showToast(`Could not add resource: ${res?.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Error adding resource:', err);
      showToast(`Error adding resource: ${err.message}`);
    }
  });

  // Delegated delete handler for tracked resources list
  els.rtItemsList?.addEventListener('click', async (e) => {
    const btn = e.target.closest('.btn-delete-resource');
    if (!btn) return;
    const itemId = btn.dataset.id;
    const itemTitle = btn.dataset.title || 'Resource';
    if (!itemId) return;

    if (confirm(`Remove "${itemTitle}" from Resource Tracker?`)) {
      try {
        showToast(`Removing "${itemTitle}"...`);
        const res = await window.bestie.superbrain.deleteResource(itemId);
        if (res && res.success) {
          showToast(`Removed "${itemTitle}". Burn rate recalculated!`);
          await refreshSuperbrainView();
        } else {
          showToast(`Error deleting item: ${res?.error || 'Unknown error'}`);
        }
      } catch (err) {
        console.error('Error deleting resource:', err);
        showToast(`Failed to delete resource: ${err.message}`);
      }
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

  // Neon Brain Bank Tab Switching
  els.nbBankTabs?.forEach(tab => {
    tab.addEventListener('click', async () => {
      state.activeNbBank = tab.dataset.bank || 'tasks';
      els.nbBankTabs.forEach(t => t.classList.toggle('active', t === tab));
      const sbData = await window.bestie.superbrain.getData();
      renderNeonBrainBank(sbData.neon_brain || {});
    });
  });

  // Neon Brain Modal Handlers
  els.btnAddNbItem?.addEventListener('click', () => {
    if (els.nbInputTitle) els.nbInputTitle.value = '';
    if (els.nbInputContent) els.nbInputContent.value = '';
    if (els.nbInputTags) els.nbInputTags.value = '';
    if (els.nbInputPriority) els.nbInputPriority.value = 'high';
    setNbModalType('task');
    els.neonBrainModal?.classList.remove('hidden');
    els.nbInputTitle?.focus();
  });

  const closeNeonBrainModal = () => {
    els.neonBrainModal?.classList.add('hidden');
  };

  els.btnCloseNbModal?.addEventListener('click', closeNeonBrainModal);
  els.btnCancelNb?.addEventListener('click', closeNeonBrainModal);
  els.neonBrainModal?.addEventListener('click', (e) => {
    if (e.target === els.neonBrainModal) closeNeonBrainModal();
  });

  let activeNbModalType = 'task';
  const setNbModalType = (type) => {
    activeNbModalType = type;
    els.nbTypeBtns?.forEach(b => b.classList.toggle('active', b.dataset.type === type));
    if (type === 'task') {
      if (els.nbLabelTitle) els.nbLabelTitle.textContent = 'Task Title *';
      if (els.nbInputTitle) els.nbInputTitle.placeholder = 'e.g. Audit API rate limits before launch';
      if (els.nbGroupPriority) els.nbGroupPriority.classList.remove('hidden');
      if (els.nbLabelContent) els.nbLabelContent.textContent = 'Task Description / Notes';
    } else if (type === 'note') {
      if (els.nbLabelTitle) els.nbLabelTitle.textContent = 'Note Title *';
      if (els.nbInputTitle) els.nbInputTitle.placeholder = 'e.g. Architectural decision on Redis cache';
      if (els.nbGroupPriority) els.nbGroupPriority.classList.add('hidden');
      if (els.nbLabelContent) els.nbLabelContent.textContent = 'Thought Note Content *';
    } else if (type === 'prompt') {
      if (els.nbLabelTitle) els.nbLabelTitle.textContent = 'Prompt Template Title *';
      if (els.nbInputTitle) els.nbInputTitle.placeholder = 'e.g. Executive Strategy Reviewer';
      if (els.nbGroupPriority) els.nbGroupPriority.classList.add('hidden');
      if (els.nbLabelContent) els.nbLabelContent.textContent = 'Prompt Template Body *';
    }
  };

  els.nbTypeTask?.addEventListener('click', () => setNbModalType('task'));
  els.nbTypeNote?.addEventListener('click', () => setNbModalType('note'));
  els.nbTypePrompt?.addEventListener('click', () => setNbModalType('prompt'));

  els.btnSubmitNb?.addEventListener('click', async () => {
    const title = els.nbInputTitle?.value?.trim();
    const content = els.nbInputContent?.value?.trim();
    const priority = els.nbInputPriority?.value || 'high';
    const rawTags = els.nbInputTags?.value?.trim() || '';
    const tags = rawTags.split(',').map(s => s.trim()).filter(Boolean);

    if (!title) {
      showToast('Please enter a title');
      els.nbInputTitle?.focus();
      return;
    }
    if (activeNbModalType !== 'task' && !content) {
      showToast('Please enter content');
      els.nbInputContent?.focus();
      return;
    }

    try {
      showToast('Adding to Neon Brain bank...');
      let payload = { title, tags };
      if (activeNbModalType === 'task') {
        payload.description = content;
        payload.priority = priority;
      } else if (activeNbModalType === 'note') {
        payload.content = content;
      } else if (activeNbModalType === 'prompt') {
        payload.content = content;
        payload.prompt = content;
        payload.category = 'Bank Template';
      }

      const res = await window.bestie.superbrain.addNeonBrainItem(activeNbModalType, payload);
      if (res && res.success) {
        showToast(`Added ${activeNbModalType} to Neon Brain! ⚡`);
        closeNeonBrainModal();
        state.activeNbBank = activeNbModalType === 'task' ? 'tasks' : (activeNbModalType === 'note' ? 'notes' : 'prompts');
        els.nbBankTabs?.forEach(t => t.classList.toggle('active', t.dataset.bank === state.activeNbBank));
        await refreshSuperbrainView();
      } else {
        showToast('Could not add item to bank');
      }
    } catch (err) {
      console.error('Error adding Neon Brain item:', err);
      showToast('Error adding item to Neon Brain');
    }
  });

  // Delegated events for Neon Brain bank items (toggle task, delete, copy, use in chat)
  els.nbBankItemsContainer?.addEventListener('click', async (e) => {
    // Task toggle checkbox
    const toggle = e.target.closest('.nb-task-toggle');
    if (toggle) {
      const taskId = toggle.dataset.taskId;
      if (taskId) {
        await window.bestie.superbrain.toggleNeonBrainTask(taskId);
        await refreshSuperbrainView();
      }
      return;
    }

    // Delete item
    const delBtn = e.target.closest('.nb-delete-item');
    if (delBtn) {
      const type = delBtn.dataset.type;
      const id = delBtn.dataset.id;
      if (confirm(`Delete this ${type} from Neon Brain?`)) {
        await window.bestie.superbrain.deleteNeonBrainItem(type, id);
        showToast(`Item removed from Neon Brain bank`);
        await refreshSuperbrainView();
      }
      return;
    }

    // Copy note / prompt
    const copyBtn = e.target.closest('.nb-copy-note');
    if (copyBtn) {
      const content = copyBtn.dataset.content;
      navigator.clipboard.writeText(content).then(() => {
        showToast('Copied to clipboard 📋');
      });
      return;
    }

    // Use in Chat button
    const useBtn = e.target.closest('.nb-use-chat-btn');
    if (useBtn) {
      const content = useBtn.dataset.content;
      switchView('chat');
      if (els.chatInput) {
        els.chatInput.value = content;
        els.chatInput.dispatchEvent(new Event('input', { bubbles: true }));
        els.chatInput.focus();
        showToast('Prompt loaded into chat 🚀');
      }
      return;
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
  if (viewName === 'calibration') refreshCalibrationView();
  if (viewName === 'feedback') refreshFeedbackView();
  if (viewName === 'superbrain') refreshSuperbrainView();
  if (viewName === 'prompts') renderPromptsGrid();
  if (viewName === 'credentials') refreshCredentialsList();
  if (viewName === 'settings') {
    refreshMemoryTelemetry();
    renderDossierSummaryInSettings();
    syncSettingsFieldsFromState();
  }
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

  removeDoneListener = window.bestie.ollama.onDone(async (result) => {
    state.isGenerating = false;
    els.typingIndicator.classList.add('hidden');
    els.btnSend.disabled = !els.chatInput.value.trim();
    els.btnAbort.classList.add('hidden');
    els.btnSend.classList.remove('hidden');

    if (currentStreamEl) {
      const contentEl = currentStreamEl.querySelector('.message-raw-content');
      if (contentEl && contentEl.textContent.includes('<DOSSIER_UPDATE>')) {
        await handleDossierUpdatesInContent(contentEl.textContent, currentStreamEl);
      }
    }

    currentStreamEl = null;
    scrollToBottom();
    await refreshConversationsList();
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
  refreshConversationsList();

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

// ============================================================
// CHAT VAULT: MULTI-CONVERSATION & FOLDERS
// ============================================================

async function refreshConversationsList() {
  try {
    const summary = await window.bestie.conversation.list();
    if (!summary) return;

    state.conversations = summary.conversations || [];
    state.folders = summary.folders || [];
    state.activeConversationId = summary.activeId || (state.conversations[0]?.id ?? null);

    // Update active chat title & folder badge in topbar
    const active = state.conversations.find(c => c.id === state.activeConversationId);
    if (active) {
      if (els.activeChatTitle) els.activeChatTitle.textContent = active.title || 'New Conversation';
      if (els.activeChatFolderTag) {
        const folder = state.folders.find(f => f.id === active.folderId);
        els.activeChatFolderTag.textContent = folder ? `${folder.icon || '📁'} ${folder.name}` : '💬 General';
      }
    }

    renderFoldersFilter();
    renderConversationsList();
  } catch (err) {
    console.error('Error refreshing conversations list:', err);
  }
}

function renderFoldersFilter() {
  if (!els.foldersFilterList) return;

  const totalAll = state.conversations.length;
  let html = `
    <div class="folder-filter-item ${state.activeFolderFilter === 'all' ? 'active' : ''}" data-folder-id="all">
      <div class="folder-filter-name">
        <span>🌟</span>
        <span>All Chats</span>
      </div>
      <span class="folder-count-badge">${totalAll}</span>
    </div>
  `;

  state.folders.forEach(f => {
    const count = state.conversations.filter(c => c.folderId === f.id).length;
    const isAct = state.activeFolderFilter === f.id;
    html += `
      <div class="folder-filter-item ${isAct ? 'active' : ''}" data-folder-id="${f.id}" title="${escapeHtml(f.name)}">
        <div class="folder-filter-name">
          <span>${f.icon || '📁'}</span>
          <span>${escapeHtml(f.name)}</span>
        </div>
        <span class="folder-count-badge">${count}</span>
      </div>
    `;
  });

  els.foldersFilterList.innerHTML = html;
}

function renderConversationsList() {
  if (!els.historyConversationList) return;

  let filtered = state.conversations;

  // Filter by folder
  if (state.activeFolderFilter !== 'all') {
    filtered = filtered.filter(c => c.folderId === state.activeFolderFilter);
  }

  // Filter by search query
  if (state.historySearchQuery && state.historySearchQuery.trim()) {
    const q = state.historySearchQuery.trim().toLowerCase();
    filtered = filtered.filter(c => 
      (c.title || '').toLowerCase().includes(q) || 
      (c.preview || '').toLowerCase().includes(q)
    );
  }

  if (els.historyChatCount) {
    els.historyChatCount.textContent = filtered.length;
  }

  if (els.historyListHeading) {
    if (state.activeFolderFilter === 'all') {
      els.historyListHeading.textContent = 'CONVERSATIONS';
    } else {
      const currentFolder = state.folders.find(f => f.id === state.activeFolderFilter);
      els.historyListHeading.textContent = currentFolder ? currentFolder.name.toUpperCase() : 'CONVERSATIONS';
    }
  }

  if (filtered.length === 0) {
    els.historyConversationList.innerHTML = `
      <div style="padding: 16px 10px; text-align: center; color: var(--text-muted); font-size: 0.78rem;">
        No conversations found
      </div>
    `;
    return;
  }

  const html = filtered.map(c => {
    const isActive = c.id === state.activeConversationId;
    const folder = state.folders.find(f => f.id === c.folderId);
    const dateStr = formatRelativeDate(c.updatedAt);
    return `
      <div class="conversation-item ${isActive ? 'active' : ''}" data-conv-id="${c.id}">
        <div class="conversation-item-info">
          <div class="conversation-item-title" title="${escapeHtml(c.title)}">${escapeHtml(c.title)}</div>
          <div class="conversation-item-meta">
            <span>${dateStr}</span>
            ${folder && state.activeFolderFilter === 'all' ? `<span class="conversation-folder-pill">${folder.icon || '📁'} ${escapeHtml(folder.name)}</span>` : ''}
          </div>
        </div>
        <div class="conversation-item-actions">
          <button class="conv-action-btn move" data-action="move" data-id="${c.id}" title="Move to folder">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
          </button>
          <button class="conv-action-btn rename" data-action="rename" data-id="${c.id}" title="Rename chat">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
          </button>
          <button class="conv-action-btn delete" data-action="delete" data-id="${c.id}" title="Delete chat">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </div>
    `;
  }).join('');

  els.historyConversationList.innerHTML = html;
}

function formatRelativeDate(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const now = new Date();
  const diffMs = now - d;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

async function loadActiveConversationMessages() {
  try {
    const conversation = await window.bestie.conversation.getActive();
    els.chatMessages.innerHTML = '';

    if (conversation?.messages?.length > 0) {
      conversation.messages.forEach(msg => {
        addMessage(msg.role, msg.content);
      });
    } else {
      addWelcomeMessage();
    }
    scrollToBottom();
  } catch (e) {
    console.error('Failed to load active conversation messages:', e);
  }
}

async function handleSwitchConversation(id) {
  if (state.isGenerating) return;
  await window.bestie.conversation.switch(id);
  await refreshConversationsList();
  await loadActiveConversationMessages();
}

async function handleCreateNewChat() {
  if (state.isGenerating) return;
  const targetFolder = state.activeFolderFilter !== 'all' ? state.activeFolderFilter : null;
  await window.bestie.conversation.create({
    title: 'New Conversation',
    folderId: targetFolder
  });
  await refreshConversationsList();
  await loadActiveConversationMessages();
  if (els.chatInput) els.chatInput.focus();
}

async function handleRenameConversation(id) {
  const conv = state.conversations.find(c => c.id === id);
  const currentTitle = conv ? conv.title : '';
  const newTitle = window.prompt('Rename conversation:', currentTitle);
  if (newTitle && newTitle.trim() && newTitle.trim() !== currentTitle) {
    await window.bestie.conversation.rename(id, newTitle.trim());
    await refreshConversationsList();
  }
}

async function handleDeleteConversation(id) {
  const conv = state.conversations.find(c => c.id === id);
  const title = conv ? conv.title : 'this conversation';
  if (window.confirm(`Delete "${title}"? This cannot be undone.`)) {
    await window.bestie.conversation.delete(id);
    await refreshConversationsList();
    await loadActiveConversationMessages();
  }
}

function openMoveChatModal(id) {
  if (!els.moveChatModal) return;
  const conv = state.conversations.find(c => c.id === id);
  if (!conv) return;

  els.moveChatId.value = id;
  const select = els.moveChatFolderSelect;
  select.innerHTML = `
    <option value="" ${!conv.folderId ? 'selected' : ''}>💬 General (Uncategorized)</option>
    ${state.folders.map(f => `<option value="${f.id}" ${conv.folderId === f.id ? 'selected' : ''}>${f.icon || '📁'} ${escapeHtml(f.name)}</option>`).join('')}
  `;
  els.moveChatModal.classList.remove('hidden');
}

function closeMoveChatModal() {
  if (els.moveChatModal) els.moveChatModal.classList.add('hidden');
}

function openFolderModal(editFolderId = null) {
  if (!els.folderModal) return;
  els.folderEditId.value = editFolderId || '';
  if (editFolderId) {
    const f = state.folders.find(x => x.id === editFolderId);
    els.folderModalTitle.textContent = 'Edit Category Folder';
    els.folderInputName.value = f ? f.name : '';
    state.selectedFolderEmoji = f ? (f.icon || '📁') : '📁';
  } else {
    els.folderModalTitle.textContent = 'New Category Folder';
    els.folderInputName.value = '';
    state.selectedFolderEmoji = '📁';
  }
  if (els.folderModalIconPreview) els.folderModalIconPreview.textContent = state.selectedFolderEmoji;

  // Update active emoji button
  $$('.emoji-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-emoji') === state.selectedFolderEmoji);
  });

  els.folderModal.classList.remove('hidden');
  els.folderInputName.focus();
}

function closeFolderModal() {
  if (els.folderModal) els.folderModal.classList.add('hidden');
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
// PERSONA MENU & OPERATIONAL MODULES
// ============================================================

function togglePersonaDropdown() {
  if (!els.personaDropdownMenu) return;
  const isHidden = els.personaDropdownMenu.classList.contains('hidden');
  if (isHidden) {
    openPersonaDropdown();
  } else {
    closePersonaDropdown();
  }
}

function openPersonaDropdown() {
  if (!els.personaDropdownMenu) return;
  els.personaDropdownMenu.classList.remove('hidden');
  els.btnPersonaSelector?.classList.add('open');
  els.personaSearchInput?.focus();
}

function closePersonaDropdown() {
  if (!els.personaDropdownMenu) return;
  els.personaDropdownMenu.classList.add('hidden');
  els.btnPersonaSelector?.classList.remove('open');
}

function appendPersonaSwitchBanner(name, tag, desc) {
  if (!els.chatMessages) return;
  const banner = document.createElement('div');
  banner.className = 'chat-persona-switch-banner';
  banner.innerHTML = `
    <span class="banner-icon">✦</span>
    <span class="banner-name">${escapeHtml(name)}</span>
    <span class="banner-tag">${escapeHtml(tag)}</span>
    ${desc ? `<span class="banner-desc">· ${escapeHtml(desc)}</span>` : ''}
  `;
  els.chatMessages.appendChild(banner);
  scrollToBottom();
}

function updatePersonaSwitcherUI() {
  if (!els.personaBtnLabel) return;
  
  if (!state.activeModule) {
    els.personaBtnIcon.textContent = '✨';
    els.personaBtnLabel.textContent = 'Digital Bestie';
    els.personaBtnBadge.textContent = 'Default Confidante';
    els.personaBtnBadge.style.color = 'var(--neon-cyan)';
    if (els.btnPersonaSelector) {
      els.btnPersonaSelector.style.borderColor = 'rgba(255, 255, 255, 0.08)';
      els.btnPersonaSelector.style.boxShadow = 'none';
    }
  } else {
    const meta = MODULES_METADATA[state.activeModule];
    if (meta) {
      els.personaBtnIcon.textContent = meta.icon;
      els.personaBtnLabel.textContent = meta.name;
      els.personaBtnBadge.textContent = meta.badge;
      els.personaBtnBadge.style.color = meta.color;
      if (els.btnPersonaSelector) {
        els.btnPersonaSelector.style.borderColor = `${meta.color}55`;
        els.btnPersonaSelector.style.boxShadow = `0 0 14px ${meta.color}33`;
      }
    }
  }

  // Update active checkmarks and classes in dropdown items
  $$('.persona-dropdown-item').forEach(item => {
    const mod = item.dataset.module;
    const isAct = (!state.activeModule && mod === 'default') || (state.activeModule === mod);
    item.classList.toggle('active', isAct);
  });
}

function activateModule(moduleName, starterPrompt = null) {
  const previousModule = state.activeModule;
  state.activeModule = moduleName;
  
  // Update in-chat persona switcher button & dropdown
  updatePersonaSwitcherUI();

  // Update module cards in Modules view
  $$('.module-card').forEach(card => {
    card.classList.toggle('active-module', card.dataset.module === moduleName);
  });

  // Show indicator on sidebar
  if (els.activeModuleIndicator) {
    els.activeModuleIndicator.classList.remove('hidden');
    els.activeModuleName.textContent = moduleName.replace(/-/g, ' ');
  }

  // Switch to chat view if not already there
  if (state.currentView !== 'chat') {
    switchView('chat');
  }

  // Close dropdown menu
  closePersonaDropdown();

  // If module changed, render the in-stream transition banner into the chat
  const meta = MODULES_METADATA[moduleName];
  if (previousModule !== moduleName) {
    appendPersonaSwitchBanner(meta ? `${meta.icon} ${meta.name}` : moduleName, meta?.badge || 'Specialized Mode', meta?.purpose);
  }

  // If starter prompt is provided, populate input and focus
  if (starterPrompt && els.chatInput) {
    els.chatInput.value = starterPrompt;
    autoResizeTextarea(els.chatInput);
    els.chatInput.focus();
    if (els.btnSend) els.btnSend.disabled = !els.chatInput.value.trim();
  }
}

function deactivateModule() {
  const previousModule = state.activeModule;
  state.activeModule = null;
  updatePersonaSwitcherUI();
  $$('.module-card').forEach(card => card.classList.remove('active-module'));
  if (els.activeModuleIndicator) els.activeModuleIndicator.classList.add('hidden');
  closePersonaDropdown();

  if (previousModule) {
    appendPersonaSwitchBanner('✨ Digital Bestie', 'Default Confidante', 'Returned to general mode & operational second brain');
  }
}

function renderPersonaDropdown() {
  if (!els.personaDropdownList) return;

  // Render Category Filter Chips if empty
  if (els.personaCategoryFilters && els.personaCategoryFilters.children.length === 0) {
    const categories = Object.values(PERSONA_CATEGORIES);
    els.personaCategoryFilters.innerHTML = categories.map(cat => `
      <button type="button" class="persona-cat-chip ${cat.id === state.personaCategoryFilter ? 'active' : ''}" data-category="${cat.id}">
        ${cat.icon} ${cat.label}
      </button>
    `).join('');

    els.personaCategoryFilters.querySelectorAll('.persona-cat-chip').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        state.personaCategoryFilter = btn.dataset.category;
        els.personaCategoryFilters.querySelectorAll('.persona-cat-chip').forEach(b => {
          b.classList.toggle('active', b.dataset.category === state.personaCategoryFilter);
        });
        renderPersonaDropdownList();
      });
    });
  }

  renderPersonaDropdownList();
}

function renderPersonaDropdownList() {
  if (!els.personaDropdownList) return;

  const query = (state.personaSearchQuery || '').toLowerCase().trim();
  const filterCat = state.personaCategoryFilter || 'all';

  const modules = Object.entries(MODULES_METADATA);
  let visibleCount = 0;

  let html = '';
  for (const [key, meta] of modules) {
    // Check category filter
    if (filterCat !== 'all' && meta.category !== filterCat) {
      continue;
    }

    // Check search query
    if (query) {
      const matchName = meta.name.toLowerCase().includes(query);
      const matchBadge = meta.badge.toLowerCase().includes(query);
      const matchPurpose = meta.purpose.toLowerCase().includes(query);
      const matchKeywords = (meta.keywords || []).some(k => k.toLowerCase().includes(query));
      const matchPrompts = (meta.starterPrompts || []).some(p => p.toLowerCase().includes(query));

      if (!matchName && !matchBadge && !matchPurpose && !matchKeywords && !matchPrompts) {
        continue;
      }
    }

    visibleCount++;
    const isActive = state.activeModule === key;

    // Render starter prompt chips
    const starterChips = (meta.starterPrompts || []).map(prompt => `
      <button type="button" class="starter-prompt-chip" data-module="${key}" data-prompt="${escapeHtml(prompt)}" title="Click to load into chat">
        <span>${escapeHtml(prompt)}</span>
      </button>
    `).join('');

    html += `
      <div class="persona-dropdown-item ${isActive ? 'active' : ''}" data-module="${key}">
        <div class="persona-item-main">
          <span class="persona-item-icon" style="background: ${meta.color}15; border-color: ${meta.color}40; color: ${meta.color};">${meta.icon}</span>
          <div class="persona-item-info">
            <div class="persona-item-title-row">
              <span class="persona-item-name">${escapeHtml(meta.name)}</span>
              <span class="persona-item-badge" style="background: ${meta.color}20; color: ${meta.color}; border: 1px solid ${meta.color}40;">${escapeHtml(meta.badge)}</span>
            </div>
            <p class="persona-item-desc">${escapeHtml(meta.purpose)}</p>
          </div>
          <span class="persona-active-check">✓</span>
        </div>
        ${starterChips ? `
          <div class="starter-prompts-container">
            <span class="starter-prompts-label">Starter Prompts:</span>
            ${starterChips}
          </div>
        ` : ''}
      </div>
    `;
  }

  els.personaDropdownList.innerHTML = html;

  // Toggle empty state
  if (els.personaDropdownEmpty) {
    if (visibleCount === 0) {
      els.personaDropdownEmpty.classList.remove('hidden');
      if (els.personaEmptyQuery) els.personaEmptyQuery.textContent = state.personaSearchQuery;
    } else {
      els.personaDropdownEmpty.classList.add('hidden');
    }
  }

  // Bind click listeners for persona items and starter prompts
  els.personaDropdownList.querySelectorAll('.persona-dropdown-item').forEach(item => {
    item.addEventListener('click', (e) => {
      const promptBtn = e.target.closest('.starter-prompt-chip');
      if (promptBtn) {
        e.stopPropagation();
        const mod = promptBtn.dataset.module;
        const prompt = promptBtn.dataset.prompt;
        activateModule(mod, prompt);
        return;
      }
      const mod = item.dataset.module;
      activateModule(mod);
    });
  });
}

function setupModulesHub() {
  if (!els.modulesCategoryFilters) return;

  // Render category filters if empty
  if (els.modulesCategoryFilters.children.length === 0) {
    const categories = Object.values(PERSONA_CATEGORIES);
    els.modulesCategoryFilters.innerHTML = categories.map(cat => `
      <button type="button" class="modules-cat-btn ${cat.id === state.modulesCategoryFilter ? 'active' : ''}" data-category="${cat.id}">
        ${cat.icon} ${cat.label}
      </button>
    `).join('');

    els.modulesCategoryFilters.querySelectorAll('.modules-cat-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        state.modulesCategoryFilter = btn.dataset.category;
        els.modulesCategoryFilters.querySelectorAll('.modules-cat-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.category === state.modulesCategoryFilter);
        });
        filterModulesGrid();
      });
    });
  }

  // Render all module cards dynamically from MODULES_METADATA
  renderModulesHubGrid();

  // Search input for modules hub
  els.modulesSearchInput?.addEventListener('input', (e) => {
    state.modulesSearchQuery = e.target.value;
    els.btnClearModulesSearch?.classList.toggle('hidden', !state.modulesSearchQuery);
    filterModulesGrid();
  });

  els.btnClearModulesSearch?.addEventListener('click', () => {
    if (els.modulesSearchInput) {
      els.modulesSearchInput.value = '';
      state.modulesSearchQuery = '';
      els.btnClearModulesSearch.classList.add('hidden');
      filterModulesGrid();
    }
  });

  // Setup rich tooltip popover
  setupModuleTooltips();
}

function renderModulesHubGrid() {
  if (!els.modulesGrid) return;
  
  const modules = Object.entries(MODULES_METADATA);
  els.modulesGrid.innerHTML = modules.map(([modKey, meta]) => {
    const isActive = state.activeModule === modKey;
    const starterChips = (meta.starterPrompts || []).map(p => `
      <div class="module-card-starter-prompt" data-module="${modKey}" data-prompt="${escapeHtml(p)}" title="Click to load into chat">
        <span>${escapeHtml(p)}</span>
      </div>
    `).join('');

    return `
      <div class="module-card ${isActive ? 'active-module' : ''}" data-module="${modKey}" data-category="${meta.category || 'all'}">
        <div class="module-card-top">
          <div class="module-icon" style="--module-color: ${meta.color}; background: ${meta.color}15; border: 1px solid ${meta.color}35; color: ${meta.color};">
            <span style="font-size: 20px;">${meta.icon}</span>
          </div>
          <span class="module-info-pill">${escapeHtml(meta.badge)}</span>
        </div>
        <h3>${escapeHtml(meta.name)}</h3>
        <p>${escapeHtml(meta.purpose)}</p>
        ${starterChips ? `
          <div class="module-card-starter-prompts">
            <span class="module-card-prompt-label">Starter Prompts:</span>
            ${starterChips}
          </div>
        ` : ''}
      </div>
    `;
  }).join('');

  // Bind click and hover listeners on all dynamically rendered cards
  els.modulesGrid.querySelectorAll('.module-card').forEach(card => {
    card.addEventListener('click', (e) => {
      const promptBtn = e.target.closest('.module-card-starter-prompt');
      const modKey = card.dataset.module;
      if (promptBtn) {
        e.stopPropagation();
        activateModule(modKey, promptBtn.dataset.prompt);
        return;
      }
      activateModule(modKey);
    });

    card.addEventListener('mouseenter', () => showModuleTooltip(card));
    card.addEventListener('mouseleave', () => hideModuleTooltip());
  });
}

function filterModulesGrid() {
  const query = (state.modulesSearchQuery || '').toLowerCase().trim();
  const filterCat = state.modulesCategoryFilter || 'all';

  let matchCount = 0;
  $$('.module-card').forEach(card => {
    const modKey = card.dataset.module;
    const meta = MODULES_METADATA[modKey];
    if (!meta) return;

    let visible = true;
    if (filterCat !== 'all' && meta.category !== filterCat) {
      visible = false;
    }

    if (visible && query) {
      const matchName = meta.name.toLowerCase().includes(query);
      const matchBadge = meta.badge.toLowerCase().includes(query);
      const matchPurpose = meta.purpose.toLowerCase().includes(query);
      const matchKeywords = (meta.keywords || []).some(k => k.toLowerCase().includes(query));
      const matchPrompts = (meta.starterPrompts || []).some(p => p.toLowerCase().includes(query));

      if (!matchName && !matchBadge && !matchPurpose && !matchKeywords && !matchPrompts) {
        visible = false;
      }
    }

    card.style.display = visible ? 'flex' : 'none';
    if (visible) matchCount++;
  });

  if (els.modulesEmptySearch) {
    els.modulesEmptySearch.classList.toggle('hidden', matchCount > 0);
    if (els.modulesEmptyQuery) els.modulesEmptyQuery.textContent = state.modulesSearchQuery;
  }
}

let tooltipTimeout = null;

function hideModuleTooltip() {
  if (!els.moduleTooltip) return;
  tooltipTimeout = setTimeout(() => {
    els.moduleTooltip.classList.remove('visible');
    setTimeout(() => {
      if (!els.moduleTooltip.classList.contains('visible')) {
        els.moduleTooltip.classList.add('hidden');
      }
    }, 180);
  }, 120);
}

function showModuleTooltip(card) {
  if (!els.moduleTooltip) return;
  clearTimeout(tooltipTimeout);
  const modKey = card.dataset.module;
  const meta = MODULES_METADATA[modKey];
  if (!meta) return;

  els.ttIcon.textContent = meta.icon;
  els.ttTitle.textContent = meta.name;
  els.ttBadge.textContent = meta.badge;
  els.ttBadge.style.color = meta.color;
  els.ttIcon.style.border = `1px solid ${meta.color}55`;
  els.ttIcon.style.background = `${meta.color}15`;
  els.ttWhen.textContent = meta.whenToUse;
  
  els.ttCaps.innerHTML = meta.whatItDoes.map(c => `<li>${escapeHtml(c)}</li>`).join('');
  els.ttExample.textContent = `"${meta.examplePrompt}"`;
  els.moduleTooltip.dataset.activeModule = modKey;

  // Position tooltip relative to card
  const rect = card.getBoundingClientRect();
  const ttWidth = 330;
  const ttHeight = 310;
  let left = rect.right + 12;
  let top = rect.top - 8;

  if (left + ttWidth > window.innerWidth - 16) {
    left = rect.left - ttWidth - 12;
  }
  if (left < 16) {
    left = Math.max(16, rect.left);
    top = rect.bottom + 8;
  }
  if (top + ttHeight > window.innerHeight - 16) {
    top = Math.max(16, window.innerHeight - ttHeight - 16);
  }
  if (top < 50) {
    top = 50;
  }

  els.moduleTooltip.style.left = `${Math.round(left)}px`;
  els.moduleTooltip.style.top = `${Math.round(top)}px`;

  els.moduleTooltip.classList.remove('hidden');
  requestAnimationFrame(() => {
    els.moduleTooltip.classList.add('visible');
  });
}

function setupModuleTooltips() {
  if (!els.moduleTooltip) return;

  els.moduleTooltip.addEventListener('mouseenter', () => {
    clearTimeout(tooltipTimeout);
  });

  els.moduleTooltip.addEventListener('mouseleave', () => {
    hideModuleTooltip();
  });

  // Clicking the example prompt inside the tooltip immediately activates the module and runs in chat
  els.ttExample?.addEventListener('click', () => {
    const modKey = els.moduleTooltip.dataset.activeModule;
    const meta = MODULES_METADATA[modKey];
    if (meta && modKey) {
      activateModule(modKey);
      switchView('chat');
      els.chatInput.value = meta.examplePrompt;
      autoResizeTextarea(els.chatInput);
      els.moduleTooltip.classList.remove('visible');
      els.moduleTooltip.classList.add('hidden');
      sendMessage();
    }
  });
}

// ============================================================
// MEMORY VIEW & DOSSIER DEEPENING
// ============================================================

async function refreshMemoryView() {
  state.profile = await window.bestie.memory.getProfile();
  const p = state.profile?.user_profile;
  
  if (!p) {
    els.memoryContent.innerHTML = '<div class="memory-loading">No profile data yet. Run onboarding to get started.</div>';
    return;
  }

  const renderField = (label, value, dotPath, type = 'string') => {
    const displayVal = Array.isArray(value)
      ? (value.length ? value.join(', ') : null)
      : value;
    
    const isEmpty = !displayVal && displayVal !== 0;
    const rawVal = Array.isArray(value) ? value.join(', ') : (value ?? '');
    return `
      <div class="memory-field memory-field-editable" data-path="${dotPath}" data-type="${type}" data-label="${label}" data-val="${escapeHtml(String(rawVal))}">
        <span class="memory-field-label">${label}</span>
        <span class="memory-field-value ${isEmpty ? 'memory-field-empty' : ''}">${isEmpty ? 'Not set' : escapeHtml(String(displayVal))}</span>
        <button class="field-quick-edit-btn" title="Quick edit ${label}">✏️</button>
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
      <div class="memory-section-header">
        <h3>📍 Identity & Baseline</h3>
        <div class="memory-section-actions">
          <button class="btn-section-action highlight btn-deepen-category" data-category="boundaries">⚡ Deepen Setup</button>
        </div>
      </div>
      ${renderField('Living Situation', b.current_living_situation, 'user_profile.identity_and_baseline.current_living_situation')}
      ${renderField('Cash Reserve', b.liquid_cash_reserve != null ? '$' + b.liquid_cash_reserve : null, 'user_profile.identity_and_baseline.liquid_cash_reserve', 'number')}
      ${renderField('Cash Floor', b.hard_cash_floor != null ? '$' + b.hard_cash_floor : null, 'user_profile.identity_and_baseline.hard_cash_floor', 'number')}
      ${renderField('Weekly Burn Rate', b.burn_rate_weekly != null ? '$' + b.burn_rate_weekly : null, 'user_profile.identity_and_baseline.burn_rate_weekly', 'number')}
      ${renderField('Primary Stressor', b.primary_acute_stressor, 'user_profile.identity_and_baseline.primary_acute_stressor')}
      ${renderField('Location', b.active_location, 'user_profile.identity_and_baseline.active_location')}
    </div>
    <div class="memory-section">
      <div class="memory-section-header">
        <h3>⚡ Cognitive & Behavioral Profile</h3>
        <div class="memory-section-actions">
          <button class="btn-section-action highlight btn-deepen-category" data-category="triggers">⚡ Deepen Triggers</button>
        </div>
      </div>
      ${renderField('Decision Bias', c.decision_bias, 'user_profile.cognitive_and_behavioral_profile.decision_bias')}
      ${renderField('Avoidance Triggers', c.primary_avoidance_triggers, 'user_profile.cognitive_and_behavioral_profile.primary_avoidance_triggers', 'array')}
      ${renderField('Escape Mechanisms', c.escape_mechanisms, 'user_profile.cognitive_and_behavioral_profile.escape_mechanisms', 'array')}
      ${renderField('Tone Preference', c.tone_preference, 'user_profile.cognitive_and_behavioral_profile.tone_preference')}
      ${renderField('Execution Style', c.execution_style, 'user_profile.cognitive_and_behavioral_profile.execution_style')}
    </div>
    <div class="memory-section">
      <div class="memory-section-header">
        <h3>🎯 Goals & Boundaries</h3>
        <div class="memory-section-actions">
          <button class="btn-section-action highlight btn-deepen-category" data-category="intentions">⚡ Deepen Goals</button>
        </div>
      </div>
      ${renderField('90-Day North Star', g.north_star_90_day, 'user_profile.goal_and_boundary_matrix.north_star_90_day')}
      ${renderField('Anti-Goals', g.anti_goals, 'user_profile.goal_and_boundary_matrix.anti_goals', 'array')}
      ${renderField('Rate Floor', g.rate_floor, 'user_profile.goal_and_boundary_matrix.rate_floor')}
      ${renderField('Deposit Policy', g.deposit_policy, 'user_profile.goal_and_boundary_matrix.deposit_policy')}
      ${renderField('Client Red Flags', g.client_red_flags, 'user_profile.goal_and_boundary_matrix.client_red_flags', 'array')}
    </div>
    <div class="memory-section">
      <div class="memory-section-header">
        <h3>🚀 Venture Incubator</h3>
        <div class="memory-section-actions">
          <button class="btn-section-action highlight btn-deepen-category" data-category="ventures">⚡ Deepen Ventures</button>
        </div>
      </div>
      ${renderField('Active Project', v.active_project_name, 'user_profile.secret_venture_incubator.active_project_name')}
      ${renderField('Core Skills', v.core_skills_leveraged, 'user_profile.secret_venture_incubator.core_skills_leveraged', 'array')}
      ${renderField('Backlog Tasks', v.backlog_micro_tasks, 'user_profile.secret_venture_incubator.backlog_micro_tasks', 'array')}
    </div>
    <div class="memory-section">
      <div class="memory-section-header">
        <h3>☕ Third Places</h3>
      </div>
      ${s.verified_third_places?.length 
        ? s.verified_third_places.map(p => renderField(p.name, `${p.type} — ${p.notes || 'No notes'}`)).join('')
        : '<div class="memory-field"><span class="memory-field-label">No places saved yet</span></div>'}
    </div>
  `;

  // Attach quick-edit and deepen listeners to memory fields
  $$('.btn-deepen-category', els.memoryContent).forEach(btn => {
    btn.addEventListener('click', () => {
      const cat = btn.dataset.category;
      state.calibrationCategory = cat;
      switchView('calibration');
    });
  });

  $$('.field-quick-edit-btn', els.memoryContent).forEach(btn => {
    btn.addEventListener('click', (e) => {
      const fieldEl = e.target.closest('.memory-field-editable');
      if (!fieldEl) return;
      openInlineFieldEdit(fieldEl);
    });
  });
}

function openInlineFieldEdit(fieldEl) {
  const dotPath = fieldEl.dataset.path;
  const label = fieldEl.dataset.label;
  const type = fieldEl.dataset.type;
  const currVal = fieldEl.dataset.val || '';

  const form = document.createElement('div');
  form.className = 'memory-inline-form';
  form.innerHTML = `
    <span style="font-size: 11px; color: var(--neon-cyan); font-weight: 600;">Edit ${label}:</span>
    <input type="text" class="memory-inline-input" value="${escapeHtml(currVal)}" placeholder="Enter updated value (comma-separated for lists)" />
    <div class="memory-inline-actions">
      <button class="btn-glass btn-sm btn-cancel-edit">Cancel</button>
      <button class="btn-neon btn-sm btn-save-edit">Save</button>
    </div>
  `;

  fieldEl.style.display = 'none';
  fieldEl.parentNode.insertBefore(form, fieldEl.nextSibling);

  const input = form.querySelector('.memory-inline-input');
  input.focus();
  input.select();

  form.querySelector('.btn-cancel-edit').addEventListener('click', () => {
    form.remove();
    fieldEl.style.display = '';
  });

  form.querySelector('.btn-save-edit').addEventListener('click', async () => {
    const rawVal = input.value.trim();
    let finalVal = rawVal;
    if (type === 'number') {
      finalVal = rawVal === '' ? null : Number(rawVal.replace(/[^0-9.-]+/g, ''));
    } else if (type === 'array') {
      finalVal = rawVal === '' ? [] : rawVal.split(',').map(s => s.trim()).filter(Boolean);
    }

    await window.bestie.memory.updateField(dotPath, finalVal);
    showToast(`Updated ${label} in Living Dossier ✨`);
    form.remove();
    await refreshMemoryView();
  });
}

// ============================================================
// CALIBRATION LAB (DEEPENING HUB)
// ============================================================

function getCalibrationStats(profile) {
  let totalCount = 0;
  let totalAnswered = 0;
  const packStats = {};

  Object.entries(CALIBRATION_PACKS).forEach(([key, pack]) => {
    let packAnswered = 0;
    pack.questions.forEach(q => {
      totalCount++;
      const val = getDossierValue(profile, q.path);
      const isAnswered = Array.isArray(val) ? val.length > 0 : (val != null && String(val).trim() !== '');
      if (isAnswered) {
        packAnswered++;
        totalAnswered++;
      }
    });
    packStats[key] = {
      answered: packAnswered,
      total: pack.questions.length,
      isComplete: packAnswered === pack.questions.length
    };
  });

  return { totalCount, totalAnswered, packStats };
}

async function refreshCalibrationView() {
  state.profile = await window.bestie.memory.getProfile();
  const activeCat = state.calibrationCategory || 'intentions';
  
  const stats = getCalibrationStats(state.profile);

  // Update category pill badges and active status
  if (els.calibrationCategories) {
    const allCountEl = $('#cal-count-all', els.calibrationCategories);
    if (allCountEl) {
      allCountEl.textContent = `${stats.totalAnswered}/${stats.totalCount}`;
      allCountEl.classList.toggle('all-calibrated', stats.totalAnswered === stats.totalCount);
    }
    Object.entries(stats.packStats).forEach(([key, pStat]) => {
      const el = $(`#cal-count-${key}`, els.calibrationCategories);
      if (el) {
        el.textContent = `${pStat.answered}/${pStat.total}`;
        el.classList.toggle('all-calibrated', pStat.isComplete);
      }
    });

    $$('.cal-cat-pill', els.calibrationCategories).forEach(pill => {
      pill.classList.toggle('active', pill.dataset.category === activeCat);
    });
  }

  renderActiveCalibrationCategory(activeCat);
}

function renderCalibrationQuestionCard(q, idx, profile, catKey) {
  const existingVal = getDossierValue(profile, q.path);
  const isAnswered = Array.isArray(existingVal) ? existingVal.length > 0 : (existingVal != null && String(existingVal).trim() !== '');
  const displayVal = Array.isArray(existingVal)
    ? (existingVal.length ? existingVal.join(', ') : '')
    : (existingVal != null ? String(existingVal) : '');

  const statusBadge = isAnswered
    ? `<span class="cal-q-status-badge calibrated">✓ Calibrated</span>`
    : `<span class="cal-q-status-badge pending">○ Needs Calibration</span>`;

  return `
    <div class="cal-q-card" data-q-path="${q.path}" data-q-type="${q.type}" data-cat-key="${catKey}">
      <div class="cal-q-header">
        <h4 class="cal-q-title">${idx + 1}. ${escapeHtml(q.title)}</h4>
        <div class="cal-q-header-right">
          ${statusBadge}
          <span class="cal-q-tag">${q.type.toUpperCase()}</span>
        </div>
      </div>
      <div class="cal-q-desc">${escapeHtml(q.desc)}</div>
      <div class="cal-q-examples">💡 Example: ${escapeHtml(q.examples)}</div>
      ${displayVal ? `<div class="cal-q-current">Currently in memory: <strong>${escapeHtml(displayVal)}</strong></div>` : ''}
      <textarea class="cal-q-textarea" placeholder="Type your answer, reflections, or guidelines here...">${escapeHtml(displayVal)}</textarea>
      <div class="cal-q-actions">
        <div class="cal-q-actions-left">
          <span class="cal-q-status"></span>
        </div>
        <div class="cal-q-actions-right">
          <span class="cal-q-shortcut-hint">⌘+Enter to save</span>
          <button class="cal-q-ask-btn" title="Ask Digital Bestie to help answer or calibrate just this specific question in chat">
            <span>🎙️</span>
            <span>Ask Bestie in Chat</span>
          </button>
          <button class="cal-q-save-btn">Save to Dossier</button>
        </div>
      </div>
    </div>
  `;
}

function renderActiveCalibrationCategory(catKey) {
  if (!els.calibrationActiveCard) return;
  const profile = state.profile;

  if (catKey === 'all') {
    // Render All Questions across every pack sequentially
    const packsHtml = Object.entries(CALIBRATION_PACKS).map(([key, pack]) => {
      const qCards = pack.questions.map((q, idx) => renderCalibrationQuestionCard(q, idx, profile, key)).join('');
      return `
        <div class="cal-all-section" data-cat-section="${key}">
          <div class="cal-all-section-header">
            <div class="cal-all-section-title">
              <span>${pack.emoji}</span>
              <span>${pack.title}</span>
              <span class="cal-hero-badge">${pack.badge}</span>
            </div>
            <button class="cal-all-section-btn btn-launch-pack-interview" data-pack-key="${key}" title="Start 1-on-1 interview for this category">
              <span>🎙️ Interview this Pack</span>
            </button>
          </div>
          <div class="cal-questions-list">
            ${qCards}
          </div>
        </div>
      `;
    }).join('');

    const jumpChips = Object.entries(CALIBRATION_PACKS).map(([key, pack]) => {
      return `<button class="cal-jump-chip" data-jump-cat="${key}"><span>${pack.emoji}</span> <span>${pack.title.split('&')[0].trim()}</span></button>`;
    }).join('');

    els.calibrationActiveCard.innerHTML = `
      <div class="cal-hero-card">
        <div class="cal-hero-top">
          <div class="cal-hero-info">
            <div class="cal-hero-title">
              <span>⚡ All Questions (A La Carte Hub)</span>
              <span class="cal-hero-badge">Full Living Dossier Matrix</span>
            </div>
            <p class="cal-hero-desc">Browse, scroll, and calibrate all 17 questions across every domain directly. Edit any field below for instant updates, or launch an interactive 1-on-1 interview whenever you want guidance.</p>
          </div>
          <div class="cal-hero-cta-group" style="display: flex; gap: 8px; flex-wrap: wrap;">
            <button class="cal-interview-cta-btn btn-hero-import-memory" style="background: rgba(0, 240, 255, 0.12); border: 1px solid var(--neon-cyan); color: #fff;" title="Import memories and context from another model to calibrate your Living Dossier">
              <span>📥</span>
              <span>Import Memory from Another Model</span>
            </button>
            <button id="btn-launch-interview" class="cal-interview-cta-btn" title="Start an interactive 1-on-1 interview with Digital Bestie in chat">
              <span>🎙️</span>
              <span>Start 1-on-1 Interview in Chat</span>
            </button>
          </div>
        </div>
        <div class="cal-hero-modes">
          <div class="cal-hero-mode-pill">
            <span class="cal-hero-mode-icon">⚡</span>
            <div>
              <div class="cal-hero-mode-title">A La Carte Fast Edit</div>
              <div class="cal-hero-mode-text">Type in any question box below and press <strong>⌘+Enter</strong> or click "Save to Dossier".</div>
            </div>
          </div>
          <div class="cal-hero-mode-pill">
            <span class="cal-hero-mode-icon">🎙️</span>
            <div>
              <div class="cal-hero-mode-title">Targeted Chat Consultations</div>
              <div class="cal-hero-mode-text">Click "Ask Bestie in Chat" on any single question or start a full interview.</div>
            </div>
          </div>
        </div>
      </div>

      <div class="cal-jump-bar">
        <span class="cal-jump-label">Jump to Section:</span>
        <div class="cal-jump-chips">
          ${jumpChips}
        </div>
      </div>

      <div class="cal-all-sections-wrapper">
        ${packsHtml}
      </div>
    `;

    // Jump handlers
    $$('.cal-jump-chip', els.calibrationActiveCard).forEach(chip => {
      chip.addEventListener('click', () => {
        const cat = chip.dataset.jumpCat;
        const section = els.calibrationActiveCard.querySelector(`[data-cat-section="${cat}"]`);
        section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

    // Per-pack interview buttons
    $$('.btn-launch-pack-interview', els.calibrationActiveCard).forEach(btn => {
      btn.addEventListener('click', () => {
        const packKey = btn.dataset.packKey;
        startCalibrationInterview(packKey);
      });
    });

  } else {
    // Render specific category
    const pack = CALIBRATION_PACKS[catKey] || CALIBRATION_PACKS.intentions;
    if (!pack) return;

    const questionsHtml = pack.questions.map((q, idx) => renderCalibrationQuestionCard(q, idx, profile, catKey)).join('');

    const jumpChips = pack.questions.map((q, idx) => {
      const existingVal = getDossierValue(profile, q.path);
      const isAnswered = Array.isArray(existingVal) ? existingVal.length > 0 : (existingVal != null && String(existingVal).trim() !== '');
      return `
        <button class="cal-jump-chip ${isAnswered ? 'calibrated' : 'uncalibrated'}" data-jump-path="${q.path}">
          <span>${isAnswered ? '✓' : '○'}</span>
          <span>Q${idx + 1}: ${escapeHtml(q.title)}</span>
        </button>
      `;
    }).join('');

    els.calibrationActiveCard.innerHTML = `
      <div class="cal-hero-card">
        <div class="cal-hero-top">
          <div class="cal-hero-info">
            <div class="cal-hero-title">
              <span>${pack.emoji} ${pack.title}</span>
              <span class="cal-hero-badge">${pack.badge}</span>
            </div>
            <p class="cal-hero-desc">${pack.description}</p>
          </div>
          <div class="cal-hero-cta-group" style="display: flex; gap: 8px; flex-wrap: wrap;">
            <button class="cal-interview-cta-btn btn-hero-import-memory" style="background: rgba(0, 240, 255, 0.12); border: 1px solid var(--neon-cyan); color: #fff;" title="Import memories and context from another model to calibrate your Living Dossier">
              <span>📥</span>
              <span>Import Memory from Another Model</span>
            </button>
            <button id="btn-launch-interview" class="cal-interview-cta-btn" title="Start an interactive 1-on-1 interview with Digital Bestie in chat">
              <span>🎙️</span>
              <span>Start 1-on-1 Interview in Chat</span>
            </button>
          </div>
        </div>
        <div class="cal-hero-modes">
          <div class="cal-hero-mode-pill">
            <span class="cal-hero-mode-icon">⚡</span>
            <div>
              <div class="cal-hero-mode-title">A La Carte Fast Edit</div>
              <div class="cal-hero-mode-text">Complete any question below on your own time. Press <strong>⌘+Enter</strong> to save.</div>
            </div>
          </div>
          <div class="cal-hero-mode-pill">
            <span class="cal-hero-mode-icon">🎙️</span>
            <div>
              <div class="cal-hero-mode-title">Interactive 1-on-1 Interview</div>
              <div class="cal-hero-mode-text">Click the interview button to have Bestie question, challenge, and calibrate you in chat.</div>
            </div>
          </div>
        </div>
      </div>

      <div class="cal-jump-bar">
        <span class="cal-jump-label">Jump to Question:</span>
        <div class="cal-jump-chips">
          ${jumpChips}
        </div>
      </div>

      <div class="cal-questions-list">
        ${questionsHtml}
      </div>
    `;

    // Jump handlers
    $$('.cal-jump-chip', els.calibrationActiveCard).forEach(chip => {
      chip.addEventListener('click', () => {
        const path = chip.dataset.jumpPath;
        const card = els.calibrationActiveCard.querySelector(`[data-q-path="${path}"]`);
        if (card) {
          card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          card.querySelector('.cal-q-textarea')?.focus();
        }
      });
    });
  }

  // Attach card action handlers (Save, Cmd+Enter, Ask Bestie)
  $$('.cal-q-card', els.calibrationActiveCard).forEach(card => {
    bindCalibrationCardActions(card);
  });

  // Attach top interview & import memory launchers
  const interviewBtn = $('#btn-launch-interview', els.calibrationActiveCard);
  interviewBtn?.addEventListener('click', () => {
    startCalibrationInterview(catKey === 'all' ? 'intentions' : catKey);
  });
  $$('.btn-hero-import-memory', els.calibrationActiveCard).forEach(btn => {
    btn.addEventListener('click', () => openImportMemoryModal());
  });
}

function bindCalibrationCardActions(card) {
  const saveBtn = card.querySelector('.cal-q-save-btn');
  const textarea = card.querySelector('.cal-q-textarea');
  const statusSpan = card.querySelector('.cal-q-status');
  const askBtn = card.querySelector('.cal-q-ask-btn');
  const path = card.dataset.qPath;
  const type = card.dataset.qType;
  const catKey = card.dataset.catKey;

  const saveAction = async () => {
    const raw = textarea.value.trim();
    let value = raw;
    if (type === 'number') {
      value = raw === '' ? null : Number(raw.replace(/[^0-9.-]+/g, ''));
    } else if (type === 'array') {
      value = raw === '' ? [] : raw.split(',').map(s => s.trim()).filter(Boolean);
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    await window.bestie.memory.updateField(path, value);
    state.profile = await window.bestie.memory.getProfile();

    statusSpan.textContent = '✓ Saved to Living Dossier';
    statusSpan.className = 'cal-q-status saved';
    saveBtn.disabled = false;
    saveBtn.textContent = 'Saved!';
    showToast(`Updated Living Dossier ✨`);

    // Dynamically update status badge on card
    const headerRight = card.querySelector('.cal-q-header-right');
    if (headerRight) {
      const isNowAnswered = Array.isArray(value) ? value.length > 0 : (value != null && String(value).trim() !== '');
      const badge = headerRight.querySelector('.cal-q-status-badge');
      if (badge) {
        badge.className = `cal-q-status-badge ${isNowAnswered ? 'calibrated' : 'pending'}`;
        badge.textContent = isNowAnswered ? '✓ Calibrated' : '○ Needs Calibration';
      }
    }

    // Refresh count badges on category pills
    const stats = getCalibrationStats(state.profile);
    const allCountEl = $('#cal-count-all', els.calibrationCategories);
    if (allCountEl) {
      allCountEl.textContent = `${stats.totalAnswered}/${stats.totalCount}`;
      allCountEl.classList.toggle('all-calibrated', stats.totalAnswered === stats.totalCount);
    }
    Object.entries(stats.packStats).forEach(([key, pStat]) => {
      const el = $(`#cal-count-${key}`, els.calibrationCategories);
      if (el) {
        el.textContent = `${pStat.answered}/${pStat.total}`;
        el.classList.toggle('all-calibrated', pStat.isComplete);
      }
    });

    setTimeout(() => {
      saveBtn.textContent = 'Save to Dossier';
      statusSpan.textContent = '';
    }, 2500);
  };

  saveBtn?.addEventListener('click', saveAction);

  // Keyboard shortcut: Cmd+Enter or Ctrl+Enter to save immediately
  textarea?.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      saveAction();
    }
  });

  // Ask Bestie targeted question
  askBtn?.addEventListener('click', () => {
    const qTitle = card.querySelector('.cal-q-title')?.textContent?.replace(/^[0-9]+\.\s*/, '') || path;
    const qDesc = card.querySelector('.cal-q-desc')?.textContent || '';
    startSingleQuestionInterview(qTitle, qDesc, path);
  });
}

async function startSingleQuestionInterview(title, desc, path) {
  activateModule('dossier-interviewer');
  switchView('chat');
  const promptText = `Let's calibrate this specific topic: "${title}".\nContext: ${desc}\n\nAsk me your opening question on this, and then ask any clarifying or supplementary questions so we get it completely dialed in before locking it into my Living Dossier.`;
  els.chatInput.value = promptText;
  sendMessage();
}

async function startCalibrationInterview(catKey) {
  const pack = CALIBRATION_PACKS[catKey] || CALIBRATION_PACKS.intentions;
  if (!pack) return;

  // Activate the dossier-interviewer module
  activateModule('dossier-interviewer');

  // Switch to chat view
  switchView('chat');

  // Find the first uncalibrated question or default to the first question in the pack
  const firstUncalibrated = pack.questions.find(q => {
    const val = getDossierValue(state.profile, q.path);
    return !(Array.isArray(val) ? val.length > 0 : (val != null && String(val).trim() !== ''));
  }) || pack.questions[0];

  // Add the user trigger message and send
  const promptText = `Let's calibrate my ${pack.title}. Please stick strictly to ONE topic at a time so I don't get overloaded.\n\nStart with just "${firstUncalibrated.title}": ${firstUncalibrated.desc}\n\nAsk me your opening question on this, and then ask any clarifying or supplementary questions to really get it down before moving on to the next topic.`;
  els.chatInput.value = promptText;
  sendMessage();
}

/**
 * Parses machine <DOSSIER_UPDATE> blocks from assistant messages and syncs them directly into memory
 */
async function handleDossierUpdatesInContent(rawText, messageEl) {
  if (state.settings?.auto_commit === false) return;
  const regex = /<DOSSIER_UPDATE>([\s\S]*?)<\/DOSSIER_UPDATE>/gi;
  let match;
  let updatedAny = false;

  while ((match = regex.exec(rawText)) !== null) {
    try {
      const payload = JSON.parse(match[1].trim());
      if (payload.path && payload.value !== undefined) {
        await window.bestie.memory.updateField(payload.path, payload.value, payload.action || 'set');
        updatedAny = true;
        const lastPart = payload.path.split('.').pop().replace(/_/g, ' ');
        showToast(`Auto-committed to Dossier: ${lastPart} ✨`);
      }
    } catch (e) {
      console.warn('Failed to parse DOSSIER_UPDATE payload:', e);
    }
  }

  if (updatedAny) {
    state.profile = await window.bestie.memory.getProfile();
    // Clean raw block from display
    const cleaned = rawText.replace(/<DOSSIER_UPDATE>[\s\S]*?<\/DOSSIER_UPDATE>/gi, '').trim();
    const contentEl = messageEl.querySelector('.message-content');
    if (contentEl) contentEl.innerHTML = parseMarkdown(cleaned);
  }
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

  const currentPhase = onboardingPhase;

  // 1. Immediately save response into profile state so nothing is ever lost
  state.profile = await window.bestie.memory.getProfile();
  if (!state.profile.onboarding_state) state.profile.onboarding_state = {};
  if (!state.profile.onboarding_state.phase_responses) state.profile.onboarding_state.phase_responses = {};
  state.profile.onboarding_state.phase_responses[currentPhase] = response;
  state.profile.onboarding_state.current_phase = currentPhase;

  // Instant direct baseline mapping
  if (currentPhase === 1) {
    state.profile.user_profile.identity_and_baseline.current_living_situation = response;
    state.profile.user_profile.identity_and_baseline.primary_acute_stressor = response;
  } else if (currentPhase === 2) {
    state.profile.user_profile.cognitive_and_behavioral_profile.primary_avoidance_triggers = [response];
  } else if (currentPhase === 3) {
    state.profile.user_profile.cognitive_and_behavioral_profile.escape_mechanisms = [response];
  } else if (currentPhase === 4) {
    state.profile.user_profile.goal_and_boundary_matrix.north_star_90_day = response;
  } else if (currentPhase === 5) {
    const lower = response.toLowerCase();
    if (lower.includes('c') || lower.includes('bestie') || lower.includes('ride-or-die')) {
      state.profile.user_profile.cognitive_and_behavioral_profile.tone_preference = 'digital_bestie';
    } else if (lower.includes('b') || lower.includes('direct') || lower.includes('factual')) {
      state.profile.user_profile.cognitive_and_behavioral_profile.tone_preference = 'direct_factual';
    } else if (lower.includes('a') || lower.includes('gentle')) {
      state.profile.user_profile.cognitive_and_behavioral_profile.tone_preference = 'gentle';
    }
  }

  await window.bestie.memory.saveProfile(state.profile);

  // 2. Immediately advance to next phase in UI — zero freeze, zero waiting!
  if (onboardingPhase < 5) {
    onboardingPhase++;
    updateOnboardingUI();
  } else {
    // Complete onboarding
    state.profile.onboarding_state.completed = true;
    await window.bestie.memory.saveProfile(state.profile);
    els.onboardingOverlay.classList.add('hidden');
    
    addMessage('assistant', 'Onboarding complete! 🎉 I\'ve got your baseline profile locked in. I know your situation, your patterns, your goals, and how you want me to talk to you. Let\'s get to work — what\'s the most pressing thing on your plate right now?');
  }

  // 3. Run LLM structured extraction asynchronously in the background
  window.bestie.ollama.extract(currentPhase, response).then(async (extracted) => {
    if (extracted && !extracted.parseError) {
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

      const fields = fieldMap[currentPhase] || {};
      for (const [path, value] of Object.entries(fields)) {
        if (value !== undefined && value !== null && value !== '') {
          await window.bestie.memory.updateField(path, value);
        }
      }
      state.profile = await window.bestie.memory.getProfile();
    }
  }).catch((err) => {
    console.warn('Background extraction note:', err?.message || err);
  });
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

    // Render Tracked Resources List
    if (els.rtItemsList) {
      const items = rt.items || [];
      if (els.rtItemsCount) els.rtItemsCount.textContent = items.length;

      if (items.length === 0) {
        els.rtItemsList.innerHTML = `<div class="empty-state-sm">No resources logged yet. Click "+ Add Resource" to track subscriptions, hardware, or travel credits.</div>`;
      } else {
        els.rtItemsList.innerHTML = items.map(item => {
          const cat = (item.category || 'Subscription').toLowerCase();
          let catClass = '';
          if (cat.includes('hardware')) catClass = 'hardware';
          else if (cat.includes('travel') || cat.includes('voucher')) catClass = 'travel';
          else if (cat.includes('living') || cat.includes('utility')) catClass = 'living';
          else if (cat.includes('cloud')) catClass = 'cloud';

          const renewalStr = item.renewalDate || item.renewal_date;
          const cycleStr = item.billingCycle || item.billing_cycle || 'Monthly';
          const costVal = parseFloat(item.cost) || 0;

          return `
            <div class="resource-item-card">
              <div class="resource-item-main">
                <div class="resource-item-title-row">
                  <span class="resource-item-title">${escapeHtml(item.title || item.name || 'Untitled Resource')}</span>
                  <span class="resource-cat-badge ${catClass}">${escapeHtml(item.category || 'Resource')}</span>
                </div>
                <div class="resource-item-meta">
                  <span>🔄 ${escapeHtml(cycleStr)}</span>
                  ${renewalStr ? `<span>📅 Renews: ${escapeHtml(renewalStr)}</span>` : ''}
                  ${item.notes ? `<span>📝 ${escapeHtml(item.notes)}</span>` : ''}
                </div>
              </div>
              <div class="resource-item-right">
                <div class="resource-item-cost">
                  $${costVal.toFixed(2)}
                  <span class="resource-item-cost-sub">${escapeHtml(cycleStr)}</span>
                </div>
                <button class="btn-delete-resource" data-id="${escapeHtml(item.id)}" data-title="${escapeHtml(item.title || 'Resource')}" title="Delete resource">🗑️</button>
              </div>
            </div>
          `;
        }).join('');
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

    // Bank tab counters
    if (els.nbTabTasksCount) els.nbTabTasksCount.textContent = (nb.tasks || []).length;
    if (els.nbTabNotesCount) els.nbTabNotesCount.textContent = (nb.notes || []).length;
    if (els.nbTabPromptsCount) els.nbTabPromptsCount.textContent = (nb.prompts || []).length;

    // Render active Neon Brain Bank items
    renderNeonBrainBank(nb);

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

function renderNeonBrainBank(nb) {
  if (!els.nbBankItemsContainer) return;
  const currentBank = state.activeNbBank || 'tasks';

  if (currentBank === 'tasks') {
    const tasks = nb.tasks || [];
    if (tasks.length === 0) {
      els.nbBankItemsContainer.innerHTML = `<div class="empty-state-sm">No tasks in Neon Brain. Click "+ Add to Bank" to add one!</div>`;
      return;
    }
    els.nbBankItemsContainer.innerHTML = tasks.map(t => {
      const isDone = !!t.completed;
      const pri = (t.priority || 'medium').toLowerCase();
      return `
        <div class="nb-item-card ${isDone ? 'completed' : ''}" data-task-id="${escapeHtml(t.id)}">
          <div class="nb-item-left">
            <input type="checkbox" class="nb-item-checkbox nb-task-toggle" data-task-id="${escapeHtml(t.id)}" ${isDone ? 'checked' : ''} title="Toggle complete" />
            <div class="nb-item-body">
              <div class="nb-item-title-row">
                <span class="nb-item-title">${escapeHtml(t.title)}</span>
                <span class="nb-priority-tag ${pri}">${pri.toUpperCase()}</span>
              </div>
              ${t.description ? `<div class="nb-item-snippet">${escapeHtml(t.description)}</div>` : ''}
            </div>
          </div>
          <div class="nb-item-actions">
            <button class="nb-btn-mini delete nb-delete-item" data-type="task" data-id="${escapeHtml(t.id)}" title="Delete task">🗑️</button>
          </div>
        </div>
      `;
    }).join('');
  } else if (currentBank === 'notes') {
    const notes = nb.notes || [];
    if (notes.length === 0) {
      els.nbBankItemsContainer.innerHTML = `<div class="empty-state-sm">No thought notes in Neon Brain. Click "+ Add to Bank" to capture ideas!</div>`;
      return;
    }
    els.nbBankItemsContainer.innerHTML = notes.map(n => {
      const tags = Array.isArray(n.tags) ? n.tags : [];
      return `
        <div class="nb-item-card" data-note-id="${escapeHtml(n.id)}">
          <div class="nb-item-left">
            <div class="nb-item-body">
              <div class="nb-item-title-row">
                <span class="nb-item-title">💡 ${escapeHtml(n.title)}</span>
              </div>
              ${n.content ? `<div class="nb-item-snippet">${escapeHtml(n.content)}</div>` : ''}
              ${tags.length > 0 ? `
                <div style="margin-top: 4px; display: flex; gap: 4px; flex-wrap: wrap;">
                  ${tags.map(tag => `<span class="badge-tag" style="font-size: 9px;">#${escapeHtml(tag)}</span>`).join('')}
                </div>
              ` : ''}
            </div>
          </div>
          <div class="nb-item-actions">
            <button class="nb-btn-mini nb-copy-note" data-content="${escapeHtml(n.content || n.title)}" title="Copy note">📋</button>
            <button class="nb-btn-mini delete nb-delete-item" data-type="note" data-id="${escapeHtml(n.id)}" title="Delete note">🗑️</button>
          </div>
        </div>
      `;
    }).join('');
  } else if (currentBank === 'prompts') {
    const prompts = nb.prompts || [];
    if (prompts.length === 0) {
      els.nbBankItemsContainer.innerHTML = `<div class="empty-state-sm">No prompt templates in Neon Brain. Click "+ Add to Bank" to store templates!</div>`;
      return;
    }
    els.nbBankItemsContainer.innerHTML = prompts.map(p => {
      const pText = p.prompt || p.content || '';
      return `
        <div class="nb-item-card" data-prompt-id="${escapeHtml(p.id)}">
          <div class="nb-item-left">
            <div class="nb-item-body">
              <div class="nb-item-title-row">
                <span class="nb-item-title">📝 ${escapeHtml(p.title)}</span>
              </div>
              <div class="nb-item-snippet">${escapeHtml(pText)}</div>
            </div>
          </div>
          <div class="nb-item-actions">
            <button class="btn-neon btn-sm nb-use-chat-btn" data-content="${escapeHtml(pText)}" style="font-size: 10px; padding: 2px 8px;" title="Send to chat">Use in Chat 🚀</button>
            <button class="nb-btn-mini nb-copy-note" data-content="${escapeHtml(pText)}" title="Copy prompt">📋</button>
            <button class="nb-btn-mini delete nb-delete-item" data-type="prompt" data-id="${escapeHtml(p.id)}" title="Delete prompt">🗑️</button>
          </div>
        </div>
      `;
    }).join('');
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
// APPLICATION UPDATER & RELEASE NOTIFICATION
// ============================================================

function setupUpdater() {
  if (!window.bestie || !window.bestie.updater) return;

  let currentAppVersion = '2.2.0';
  let cachedUpdateInfo = null;

  // Retrieve and show current version
  window.bestie.updater.getVersion().then((v) => {
    if (v) {
      currentAppVersion = v;
      if (els.appVersionBadge) {
        els.appVersionBadge.textContent = `v${v}`;
      }
    }
  });

  // Manual "Check for Updates" Button
  els.btnCheckUpdates?.addEventListener('click', async () => {
    if (!els.btnCheckUpdates) return;
    const origText = els.btnCheckUpdates.textContent;
    els.btnCheckUpdates.disabled = true;
    els.btnCheckUpdates.textContent = 'Checking...';
    if (els.updaterStatusText) els.updaterStatusText.textContent = 'Contacting GitHub releases...';

    try {
      const result = await window.bestie.updater.check();
      handleUpdateResult(result);
    } catch (err) {
      if (els.updaterStatusText) els.updaterStatusText.textContent = `Check failed: ${err.message}`;
      showToast('Update check failed');
    } finally {
      els.btnCheckUpdates.disabled = false;
      els.btnCheckUpdates.textContent = origText;
    }
  });

  // Download Update Button in Settings
  els.btnDownloadUpdate?.addEventListener('click', () => {
    if (cachedUpdateInfo) {
      const targetUrl = cachedUpdateInfo.downloadUrl || cachedUpdateInfo.releaseUrl;
      window.bestie.updater.openRelease(targetUrl);
    }
  });

  // In-App Notification Banner Actions
  els.btnUpdateBannerDownload?.addEventListener('click', () => {
    if (cachedUpdateInfo) {
      const targetUrl = cachedUpdateInfo.downloadUrl || cachedUpdateInfo.releaseUrl;
      window.bestie.updater.openRelease(targetUrl);
      els.updateNotificationBanner?.classList.add('hidden');
    }
  });

  els.btnUpdateBannerDismiss?.addEventListener('click', () => {
    els.updateNotificationBanner?.classList.add('hidden');
  });

  // Background check listener from main process
  window.bestie.updater.onUpdateAvailable((info) => {
    if (info && info.updateAvailable) {
      cachedUpdateInfo = info;
      showUpdateBanner(info);
      handleUpdateResult(info);
    }
  });

  function handleUpdateResult(res) {
    if (!res || !res.success) {
      if (els.updaterStatusText) {
        els.updaterStatusText.textContent = res?.error || 'Unable to check for updates.';
      }
      if (els.updaterStatusBadge) {
        els.updaterStatusBadge.textContent = 'Check Failed';
        els.updaterStatusBadge.className = 'status-pill status-error';
      }
      return;
    }

    if (res.updateAvailable) {
      cachedUpdateInfo = res;
      if (els.updaterStatusText) {
        els.updaterStatusText.textContent = `New version ${res.latestVersion} is available!`;
      }
      if (els.updaterStatusBadge) {
        els.updaterStatusBadge.textContent = 'Update Available';
        els.updaterStatusBadge.className = 'status-pill status-warning';
      }
      if (els.btnDownloadUpdate) {
        els.btnDownloadUpdate.classList.remove('hidden');
        els.btnDownloadUpdate.textContent = `Download ${res.latestVersion} 🚀`;
      }
      if (els.updaterReleaseDetails) {
        els.updaterReleaseDetails.classList.remove('hidden');
        if (els.updaterReleaseTitle) els.updaterReleaseTitle.textContent = res.name || res.latestVersion;
        if (els.updaterReleaseSnippet) {
          els.updaterReleaseSnippet.textContent = (res.releaseNotes || 'No release notes provided.').slice(0, 300) + '...';
        }
      }
      showToast(`⚡ Update ${res.latestVersion} available!`);
      showUpdateBanner(res);
    } else {
      if (els.updaterStatusText) {
        els.updaterStatusText.textContent = `You are running the latest version (${currentAppVersion}).`;
      }
      if (els.updaterStatusBadge) {
        els.updaterStatusBadge.textContent = 'Up to date';
        els.updaterStatusBadge.className = 'status-pill status-active';
      }
      if (els.btnDownloadUpdate) {
        els.btnDownloadUpdate.classList.add('hidden');
      }
      if (els.updaterReleaseDetails) {
        els.updaterReleaseDetails.classList.add('hidden');
      }
      showToast('Digital Bestie is up to date ✨');
    }
  }

  function showUpdateBanner(info) {
    if (!els.updateNotificationBanner) return;
    if (els.updateBannerVersion) els.updateBannerVersion.textContent = info.latestVersion;
    if (els.updateBannerTitle) {
      els.updateBannerTitle.textContent = info.name || 'New features and improvements are ready.';
    }
    els.updateNotificationBanner.classList.remove('hidden');
  }
}

// ============================================================
// PROMPTS VAULT & OPERATOR DIRECTIVES
// ============================================================

function setupPromptsVault() {
  if (!window.bestie || !window.bestie.prompts) return;

  // Populate persona selector in prompt modal
  if (els.promptFormPersona) {
    els.promptFormPersona.innerHTML = '<option value="">None (Standard Confidante)</option>' +
      Object.entries(MODULES_METADATA).map(([key, meta]) => {
        return `<option value="${key}">${meta.icon} ${meta.title}</option>`;
      }).join('');
  }

  // Load prompts
  refreshPromptsList();

  // Search input
  els.promptsSearchInput?.addEventListener('input', (e) => {
    state.promptsSearchQuery = e.target.value.trim().toLowerCase();
    if (els.btnClearPromptsSearch) {
      els.btnClearPromptsSearch.classList.toggle('hidden', !state.promptsSearchQuery);
    }
    renderPromptsGrid();
  });

  // Clear search
  els.btnClearPromptsSearch?.addEventListener('click', () => {
    if (els.promptsSearchInput) els.promptsSearchInput.value = '';
    state.promptsSearchQuery = '';
    els.btnClearPromptsSearch?.classList.add('hidden');
    renderPromptsGrid();
  });

  // Category filter tabs click
  els.promptsCategoryFilters?.addEventListener('click', (e) => {
    const tab = e.target.closest('.prompt-cat-tab');
    if (tab) {
      state.promptsCategoryFilter = tab.dataset.category;
      renderPromptsCategoryFilters();
      renderPromptsGrid();
    }
  });

  // Chat input quick-access vault button
  els.btnChatPromptVault?.addEventListener('click', () => {
    switchView('prompts');
  });

  // "+ New Directive" button
  els.btnCreatePrompt?.addEventListener('click', () => {
    openPromptModal();
  });

  // Modal close / cancel
  els.btnClosePromptModal?.addEventListener('click', closePromptModal);
  els.promptModal?.addEventListener('click', (e) => {
    if (e.target === els.promptModal) closePromptModal();
  });

  // Modal save
  els.btnSavePromptModal?.addEventListener('click', savePromptModal);

  // Modal delete
  els.btnDeletePromptModal?.addEventListener('click', deletePromptModal);
}

async function refreshPromptsList() {
  try {
    state.prompts = await window.bestie.prompts.load();
    renderPromptsCategoryFilters();
    renderPromptsGrid();
  } catch (err) {
    console.error('Failed to load prompts vault:', err);
  }
}

function renderPromptsCategoryFilters() {
  if (!els.promptsCategoryFilters) return;

  const counts = { all: state.prompts.length, favorites: 0 };
  state.prompts.forEach(p => {
    if (p.favorite) counts.favorites = (counts.favorites || 0) + 1;
    if (p.category) counts[p.category] = (counts[p.category] || 0) + 1;
  });

  els.promptsCategoryFilters.innerHTML = PROMPT_CATEGORIES.map(cat => {
    const count = counts[cat.id] || 0;
    const isActive = state.promptsCategoryFilter === cat.id;
    return `
      <button type="button" class="prompt-cat-tab ${isActive ? 'active' : ''}" data-category="${cat.id}">
        <span>${cat.icon}</span>
        <span>${cat.name}</span>
        <span class="prompt-cat-count">${count}</span>
      </button>
    `;
  }).join('');
}

function renderPromptsGrid() {
  if (!els.promptsGrid) return;

  const query = state.promptsSearchQuery;
  const category = state.promptsCategoryFilter;

  const filtered = state.prompts.filter(p => {
    if (category === 'favorites' && !p.favorite) return false;
    if (category !== 'all' && category !== 'favorites' && p.category !== category) return false;

    if (query) {
      const matchTitle = (p.title || '').toLowerCase().includes(query);
      const matchSub = (p.subtitle || '').toLowerCase().includes(query);
      const matchContent = (p.content || '').toLowerCase().includes(query);
      const matchReason = (p.favoriteReason || '').toLowerCase().includes(query);
      const matchTags = Array.isArray(p.tags) && p.tags.some(t => t.toLowerCase().includes(query));
      return matchTitle || matchSub || matchContent || matchReason || matchTags;
    }
    return true;
  });

  if (filtered.length === 0) {
    els.promptsGrid.innerHTML = '';
    if (els.promptsEmptySearch) {
      els.promptsEmptySearch.classList.remove('hidden');
      if (els.promptsEmptyQuery) {
        els.promptsEmptyQuery.textContent = query || (category === 'favorites' ? 'Favorites (Star some directives to see them here)' : category);
      }
    }
    return;
  }

  if (els.promptsEmptySearch) els.promptsEmptySearch.classList.add('hidden');

  els.promptsGrid.innerHTML = filtered.map(prompt => {
    const isFav = !!prompt.favorite;
    const personaMeta = prompt.personaId ? MODULES_METADATA[prompt.personaId] : null;
    const catMeta = PROMPT_CATEGORIES.find(c => c.id === prompt.category);

    // Highlight [placeholders] in preview
    const escapedContent = (prompt.content || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const highlightedContent = escapedContent.replace(/\[([^\]]+)\]/g, '<mark>[$1]</mark>');

    return `
      <div class="prompt-card ${isFav ? 'is-favorite' : ''}" data-prompt-id="${prompt.id}">
        <div class="prompt-card-header">
          <div class="prompt-title-wrap">
            <h3 class="prompt-card-title">${escapeHtml(prompt.title)}</h3>
            ${prompt.subtitle ? `<p class="prompt-card-subtitle">${escapeHtml(prompt.subtitle)}</p>` : ''}
          </div>
          <button type="button" class="prompt-star-btn ${isFav ? 'active' : ''}" data-prompt-id="${prompt.id}" title="${isFav ? 'Favorited' : 'Add to favorites'}">
            ${isFav ? '★' : '☆'}
          </button>
        </div>

        <div class="prompt-badges-row">
          ${catMeta ? `<span class="prompt-badge-cat">${catMeta.icon} ${catMeta.name}</span>` : ''}
          ${personaMeta ? `<span class="prompt-badge-persona">${personaMeta.icon} ${personaMeta.title}</span>` : ''}
        </div>

        ${prompt.favoriteReason ? `
          <div class="prompt-use-case-box">
            <strong>Use Case / Why:</strong>
            ${escapeHtml(prompt.favoriteReason)}
          </div>
        ` : ''}

        <div class="prompt-content-preview">${highlightedContent}</div>

        <div class="prompt-card-actions">
          <div class="prompt-card-actions-left">
            <button type="button" class="btn-card-action btn-copy-prompt" data-prompt-id="${prompt.id}" title="Copy prompt to clipboard">
              <span>📋 Copy</span>
            </button>
            <button type="button" class="btn-card-action btn-edit-prompt" data-prompt-id="${prompt.id}" title="Edit directive & notes">
              <span>✏️ Edit</span>
            </button>
          </div>
          <button type="button" class="btn-use-prompt" data-prompt-id="${prompt.id}">
            <span>Use in Chat 🚀</span>
          </button>
        </div>
      </div>
    `;
  }).join('');

  // Wire card events
  wirePromptCardEvents();
}

function wirePromptCardEvents() {
  if (!els.promptsGrid) return;

  // Star / favorite click
  els.promptsGrid.querySelectorAll('.prompt-star-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.promptId;
      const target = state.prompts.find(p => p.id === id);
      if (!target) return;

      const newFav = !target.favorite;
      const updated = await window.bestie.prompts.toggleFavorite(id, newFav);
      if (updated) {
        target.favorite = updated.favorite;
        target.favoriteReason = updated.favoriteReason;
        showToast(target.favorite ? `⭐ Added "${target.title}" to favorites` : `Removed from favorites`);
        renderPromptsCategoryFilters();
        renderPromptsGrid();
      }
    });
  });

  // Copy prompt click
  els.promptsGrid.querySelectorAll('.btn-copy-prompt').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.promptId;
      const target = state.prompts.find(p => p.id === id);
      if (!target) return;

      navigator.clipboard.writeText(target.content).then(() => {
        const origHtml = btn.innerHTML;
        btn.innerHTML = '<span>✔ Copied!</span>';
        setTimeout(() => { btn.innerHTML = origHtml; }, 1800);
        showToast('Prompt copied to clipboard 📋');
      });
    });
  });

  // Edit prompt click
  els.promptsGrid.querySelectorAll('.btn-edit-prompt').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.promptId;
      const target = state.prompts.find(p => p.id === id);
      if (target) openPromptModal(target);
    });
  });

  // Use in Chat click
  els.promptsGrid.querySelectorAll('.btn-use-prompt').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.promptId;
      usePromptInChat(id);
    });
  });
}

function usePromptInChat(promptId) {
  const prompt = state.prompts.find(p => p.id === promptId);
  if (!prompt) return;

  // Switch to chat view
  switchView('chat');

  // If prompt has an associated persona, activate it seamlessly
  if (prompt.personaId && MODULES_METADATA[prompt.personaId]) {
    activateModule(prompt.personaId);
  }

  // Inject content into chatInput
  if (els.chatInput) {
    els.chatInput.value = prompt.content;
    els.chatInput.dispatchEvent(new Event('input', { bubbles: true }));

    // Auto-select the first [placeholder] for immediate replacement
    const firstBracketStart = prompt.content.indexOf('[');
    const firstBracketEnd = prompt.content.indexOf(']', firstBracketStart);

    els.chatInput.focus();
    if (firstBracketStart !== -1 && firstBracketEnd !== -1) {
      els.chatInput.setSelectionRange(firstBracketStart, firstBracketEnd + 1);
    }

    showToast(`Loaded "${prompt.title}" into chat 🚀`);
  }
}

function openPromptModal(prompt = null) {
  if (!els.promptModal) return;

  if (prompt) {
    els.promptModalTitle.textContent = 'Edit Directive';
    els.promptFormId.value = prompt.id;
    els.promptFormTitle.value = prompt.title || '';
    els.promptFormCategory.value = prompt.category || 'ops';
    els.promptFormPersona.value = prompt.personaId || '';
    els.promptFormContent.value = prompt.content || '';
    els.promptFormReason.value = prompt.favoriteReason || '';
    els.promptFormFavorite.checked = !!prompt.favorite;
    els.btnDeletePromptModal.classList.toggle('hidden', !prompt.isCustom);
  } else {
    els.promptModalTitle.textContent = 'Create New Directive';
    els.promptFormId.value = '';
    els.promptFormTitle.value = '';
    els.promptFormCategory.value = 'ops';
    els.promptFormPersona.value = state.activeModule || '';
    els.promptFormContent.value = '';
    els.promptFormReason.value = '';
    els.promptFormFavorite.checked = false;
    els.btnDeletePromptModal.classList.add('hidden');
  }

  els.promptModal.classList.remove('hidden');
  els.promptFormTitle.focus();
}

function closePromptModal() {
  if (els.promptModal) {
    els.promptModal.classList.add('hidden');
  }
}

async function savePromptModal() {
  const id = els.promptFormId.value;
  const title = els.promptFormTitle.value.trim();
  const content = els.promptFormContent.value;
  const category = els.promptFormCategory.value;
  const personaId = els.promptFormPersona.value || null;
  const favoriteReason = els.promptFormReason.value.trim();
  const favorite = els.promptFormFavorite.checked;

  if (!title) {
    showToast('Please enter a directive title');
    els.promptFormTitle.focus();
    return;
  }

  if (!content) {
    showToast('Please enter prompt content');
    els.promptFormContent.focus();
    return;
  }

  try {
    if (id) {
      // Update existing
      await window.bestie.prompts.update(id, {
        title,
        content,
        category,
        personaId,
        favorite,
        favoriteReason,
      });
      showToast('Directive updated ✨');
    } else {
      // Create new
      await window.bestie.prompts.add({
        title,
        content,
        category,
        personaId,
        favorite,
        favoriteReason,
      });
      showToast('New directive created 🚀');
    }

    closePromptModal();
    await refreshPromptsList();
  } catch (err) {
    console.error('Failed to save prompt:', err);
    showToast('Error saving directive');
  }
}

async function deletePromptModal() {
  const id = els.promptFormId.value;
  if (!id) return;

  if (confirm('Are you sure you want to delete this custom directive?')) {
    try {
      await window.bestie.prompts.delete(id);
      showToast('Directive deleted');
      closePromptModal();
      await refreshPromptsList();
    } catch (err) {
      console.error('Failed to delete prompt:', err);
      showToast('Error deleting directive');
    }
  }
}

// ============================================================
// CREDENTIALS, CERTIFICATES & MERIT VAULT
// ============================================================

const CREDENTIAL_ICONS = {
  certification: '🎖️',
  degree: '🎓',
  license: '📜',
  award: '🏆',
  patent: '💡',
  publication: '📑',
  merit: '⭐'
};

const CREDENTIAL_LABELS = {
  certification: 'Certification',
  degree: 'Degree',
  license: 'License',
  award: 'Award / Honor',
  patent: 'Patent / IP',
  publication: 'Publication',
  merit: 'Merit'
};

function setupCredentialsVault() {
  if (!window.bestie || !window.bestie.credentials) return;

  // Search input
  els.credentialsSearchInput?.addEventListener('input', (e) => {
    state.credentialsSearchQuery = e.target.value.trim().toLowerCase();
    if (els.btnClearCredentialsSearch) {
      els.btnClearCredentialsSearch.classList.toggle('hidden', !state.credentialsSearchQuery);
    }
    renderCredentialsGrid();
  });

  // Clear search
  els.btnClearCredentialsSearch?.addEventListener('click', () => {
    if (els.credentialsSearchInput) els.credentialsSearchInput.value = '';
    state.credentialsSearchQuery = '';
    els.btnClearCredentialsSearch?.classList.add('hidden');
    renderCredentialsGrid();
  });

  // Category filter tabs
  els.credentialsCategoryFilters?.addEventListener('click', (e) => {
    const tab = e.target.closest('.cred-filter-tab');
    if (tab) {
      state.credentialsCategoryFilter = tab.dataset.category || 'all';
      $$('.cred-filter-tab', els.credentialsCategoryFilters).forEach(t => {
        t.classList.toggle('active', t === tab);
      });
      renderCredentialsGrid();
    }
  });

  // "+ Add Credential / Merit" button
  els.btnCreateCredential?.addEventListener('click', () => {
    openCredentialModal();
  });

  // Category change in modal -> update icon preview
  els.credFormCategory?.addEventListener('change', (e) => {
    const icon = CREDENTIAL_ICONS[e.target.value] || '🎖️';
    if (els.credModalIconPreview) els.credModalIconPreview.textContent = icon;
  });

  // Modal close / cancel
  els.btnCloseCredentialModal?.addEventListener('click', closeCredentialModal);
  els.credentialModal?.addEventListener('click', (e) => {
    if (e.target === els.credentialModal) closeCredentialModal();
  });

  // Modal save & delete
  els.btnSaveCredentialModal?.addEventListener('click', saveCredentialModal);
  els.btnDeleteCredentialModal?.addEventListener('click', deleteCredentialModal);

  // Tab in living dossier view
  els.tabMemoryCredentials?.addEventListener('click', () => {
    switchView('credentials');
  });

  // Load initial credentials
  refreshCredentialsList();
}

async function refreshCredentialsList() {
  try {
    state.credentials = await window.bestie.credentials.load();
    updateCredentialsCategoryCounts();
    renderCredentialsGrid();
  } catch (err) {
    console.error('Failed to load credentials vault:', err);
  }
}

function updateCredentialsCategoryCounts() {
  const total = state.credentials.length;
  const highlighted = state.credentials.filter(c => c.highlight).length;
  if (els.credCountAll) els.credCountAll.textContent = total;
  if (els.credCountHighlight) els.credCountHighlight.textContent = highlighted;
}

function renderCredentialsGrid() {
  if (!els.credentialsGrid) return;

  const query = state.credentialsSearchQuery;
  const category = state.credentialsCategoryFilter;

  const filtered = state.credentials.filter(c => {
    if (category === 'highlighted' && !c.highlight) return false;
    if (category !== 'all' && category !== 'highlighted' && c.category !== category) return false;

    if (query) {
      const matchTitle = (c.title || '').toLowerCase().includes(query);
      const matchIssuer = (c.issuer || '').toLowerCase().includes(query);
      const matchDesc = (c.description || '').toLowerCase().includes(query);
      const matchId = (c.credentialId || '').toLowerCase().includes(query);
      const matchSkills = Array.isArray(c.skills) && c.skills.some(s => s.toLowerCase().includes(query));
      return matchTitle || matchIssuer || matchDesc || matchId || matchSkills;
    }
    return true;
  });

  if (filtered.length === 0) {
    els.credentialsGrid.innerHTML = '';
    if (els.credentialsEmptySearch) {
      els.credentialsEmptySearch.classList.remove('hidden');
    }
    return;
  }

  if (els.credentialsEmptySearch) els.credentialsEmptySearch.classList.add('hidden');

  els.credentialsGrid.innerHTML = filtered.map(item => {
    const isHigh = !!item.highlight;
    const icon = CREDENTIAL_ICONS[item.category] || '🎖️';
    const catLabel = CREDENTIAL_LABELS[item.category] || item.category || 'Credential';
    const isUrl = /^https?:\/\//i.test(item.credentialId || '');

    return `
      <div class="credential-card ${isHigh ? 'highlighted' : ''}" data-cred-id="${escapeHtml(item.id)}">
        <div class="credential-header">
          <div class="credential-icon-title">
            <div class="credential-icon-badge">${icon}</div>
            <div class="credential-info">
              <h4 class="credential-title">${escapeHtml(item.title)}</h4>
              ${item.issuer ? `<div class="credential-issuer">${escapeHtml(item.issuer)}</div>` : ''}
            </div>
          </div>
          <button type="button" class="btn-cred-star ${isHigh ? 'active' : ''}" data-cred-id="${escapeHtml(item.id)}" title="${isHigh ? 'Highlighted in AI Dossier' : 'Highlight in AI Dossier'}">
            ${isHigh ? '⭐' : '☆'}
          </button>
        </div>

        <div class="credential-meta-row">
          <span class="credential-category-badge">${escapeHtml(catLabel)}</span>
          ${item.issueDate ? `<span>📅 ${escapeHtml(item.issueDate)}</span>` : ''}
          ${item.expiryDate ? `<span>⌛ Exp: ${escapeHtml(item.expiryDate)}</span>` : ''}
        </div>

        ${item.skills && item.skills.length > 0 ? `
          <div class="credential-skills-row">
            ${item.skills.map(s => `<span class="cred-skill-pill">${escapeHtml(s)}</span>`).join('')}
          </div>
        ` : ''}

        ${item.description ? `
          <div class="credential-desc">${escapeHtml(item.description)}</div>
        ` : ''}

        <div class="credential-footer">
          <div>
            ${item.credentialId ? (
              isUrl
                ? `<a href="${escapeHtml(item.credentialId)}" target="_blank" rel="noopener noreferrer" class="credential-id-link">🔗 Verify Link</a>`
                : `<span class="credential-id-link" title="Credential ID: ${escapeHtml(item.credentialId)}">🆔 ${escapeHtml(item.credentialId)}</span>`
            ) : `<span style="font-size: 11px; color: var(--text-dim);">${item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : ''}</span>`}
          </div>
          <div class="credential-actions">
            <button type="button" class="btn-card-action btn-copy-cred" data-cred-id="${escapeHtml(item.id)}" title="Copy summary">📋</button>
            <button type="button" class="btn-card-action btn-edit-cred" data-cred-id="${escapeHtml(item.id)}" title="Edit credential">✏️</button>
            <button type="button" class="btn-card-action btn-delete-cred" data-cred-id="${escapeHtml(item.id)}" title="Delete credential">🗑️</button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  wireCredentialCardEvents();
}

function wireCredentialCardEvents() {
  if (!els.credentialsGrid) return;

  // Star / highlight click
  els.credentialsGrid.querySelectorAll('.btn-cred-star').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.credId;
      const updated = await window.bestie.credentials.toggleHighlight(id);
      if (updated) {
        showToast(updated.highlight ? '⭐ Added to AI Operator Dossier highlight' : 'Removed from Dossier highlight');
        await refreshCredentialsList();
      }
    });
  });

  // Copy summary click
  els.credentialsGrid.querySelectorAll('.btn-copy-cred').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.credId;
      const target = state.credentials.find(c => c.id === id);
      if (!target) return;
      const skillsStr = (target.skills || []).join(', ');
      const summary = `${target.title} — ${target.issuer || ''} (${target.category})\nSkills: ${skillsStr}\n${target.description || ''}`.trim();
      navigator.clipboard.writeText(summary).then(() => {
        showToast('Credential details copied to clipboard 📋');
      });
    });
  });

  // Edit credential click
  els.credentialsGrid.querySelectorAll('.btn-edit-cred').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.credId;
      const target = state.credentials.find(c => c.id === id);
      if (target) openCredentialModal(target);
    });
  });

  // Delete credential click
  els.credentialsGrid.querySelectorAll('.btn-delete-cred').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.credId;
      const target = state.credentials.find(c => c.id === id);
      if (!target) return;
      if (confirm(`Are you sure you want to delete "${target.title}"?`)) {
        await window.bestie.credentials.delete(id);
        showToast('Credential removed from vault');
        await refreshCredentialsList();
      }
    });
  });
}

function openCredentialModal(item = null) {
  if (!els.credentialModal) return;

  if (item) {
    els.credentialModalTitle.textContent = 'Edit Credential / Merit';
    els.credFormId.value = item.id;
    els.credFormTitle.value = item.title || '';
    els.credFormIssuer.value = item.issuer || '';
    els.credFormCategory.value = item.category || 'certification';
    els.credFormIssueDate.value = item.issueDate || '';
    els.credFormExpiryDate.value = item.expiryDate || '';
    els.credFormIdUrl.value = item.credentialId || '';
    els.credFormSkills.value = (item.skills || []).join(', ');
    els.credFormDesc.value = item.description || '';
    els.credFormHighlight.checked = !!item.highlight;
    els.btnDeleteCredentialModal?.classList.remove('hidden');
    if (els.credModalIconPreview) els.credModalIconPreview.textContent = CREDENTIAL_ICONS[item.category] || '🎖️';
  } else {
    els.credentialModalTitle.textContent = 'Log Credential or Merit';
    els.credFormId.value = '';
    els.credFormTitle.value = '';
    els.credFormIssuer.value = '';
    els.credFormCategory.value = 'certification';
    els.credFormIssueDate.value = '';
    els.credFormExpiryDate.value = '';
    els.credFormIdUrl.value = '';
    els.credFormSkills.value = '';
    els.credFormDesc.value = '';
    els.credFormHighlight.checked = true;
    els.btnDeleteCredentialModal?.classList.add('hidden');
    if (els.credModalIconPreview) els.credModalIconPreview.textContent = '🎖️';
  }

  els.credentialModal.classList.remove('hidden');
  els.credFormTitle.focus();
}

function closeCredentialModal() {
  if (els.credentialModal) {
    els.credentialModal.classList.add('hidden');
  }
}

async function saveCredentialModal() {
  const id = els.credFormId.value;
  const title = els.credFormTitle.value.trim();
  const issuer = els.credFormIssuer.value.trim();
  const category = els.credFormCategory.value;
  const issueDate = els.credFormIssueDate.value.trim();
  const expiryDate = els.credFormExpiryDate.value.trim();
  const credentialId = els.credFormIdUrl.value.trim();
  const skills = els.credFormSkills.value.split(',').map(s => s.trim()).filter(Boolean);
  const description = els.credFormDesc.value.trim();
  const highlight = els.credFormHighlight.checked;

  if (!title) {
    showToast('Please enter a credential title');
    els.credFormTitle.focus();
    return;
  }

  try {
    if (id) {
      await window.bestie.credentials.update(id, {
        title, issuer, category, issueDate, expiryDate, credentialId, skills, description, highlight
      });
      showToast('Credential updated ✨');
    } else {
      await window.bestie.credentials.add({
        title, issuer, category, issueDate, expiryDate, credentialId, skills, description, highlight
      });
      showToast('Credential saved to vault 🚀');
    }
    closeCredentialModal();
    await refreshCredentialsList();
  } catch (err) {
    console.error('Failed to save credential:', err);
    showToast('Error saving credential');
  }
}

async function deleteCredentialModal() {
  const id = els.credFormId.value;
  if (!id) return;
  if (confirm('Are you sure you want to delete this credential?')) {
    try {
      await window.bestie.credentials.delete(id);
      showToast('Credential deleted');
      closeCredentialModal();
      await refreshCredentialsList();
    } catch (err) {
      console.error('Failed to delete credential:', err);
      showToast('Error deleting credential');
    }
  }
}

// ============================================================
// SETTINGS HUB & MEMORY CONSOLIDATION
// ============================================================

function updateTopbarUserLocation(location) {
  const loc = location || state.profile?.user_profile?.identity_and_baseline?.active_location || 'Austin, TX';
  if (els.topbarUserLocation) {
    els.topbarUserLocation.textContent = loc;
  }
  if (els.menuCurrentLocationText) {
    els.menuCurrentLocationText.textContent = loc;
  }
  if (els.userMenuLocationPreview) {
    els.userMenuLocationPreview.textContent = `${loc} • Sovereign Sanctuary`;
  }
  if (els.settingUserLocation && !els.settingUserLocation.value) {
    els.settingUserLocation.value = loc;
  }
}

function setupUserMenuDropdown() {
  if (!els.btnUserMenu || !els.userMenuDropdown) return;

  // Toggle dropdown on pill button click
  els.btnUserMenu.addEventListener('click', (e) => {
    e.stopPropagation();
    els.userMenuDropdown.classList.toggle('hidden');
  });

  // Close when clicking outside
  document.addEventListener('click', (e) => {
    if (!els.userMenuDropdown.classList.contains('hidden') && 
        !els.userMenuDropdown.contains(e.target) && 
        !els.btnUserMenu.contains(e.target)) {
      els.userMenuDropdown.classList.add('hidden');
    }
  });

  // Wire actions inside dropdown
  els.userMenuDropdown.querySelectorAll('.user-menu-item').forEach(item => {
    item.addEventListener('click', () => {
      els.userMenuDropdown.classList.add('hidden');
      const action = item.dataset.action;
      if (action === 'memory') {
        switchView('memory');
      } else if (action === 'import-memory') {
        openImportMemoryModal();
      } else if (action === 'update-location') {
        switchView('settings');
        activateSettingsPanel('panel-settings-location');
        setTimeout(() => els.settingUserLocation?.focus(), 150);
      } else if (action === 'calibration') {
        switchView('calibration');
      } else if (action === 'settings') {
        switchView('settings');
      } else if (action === 'feedback') {
        if (els.feedbackOverlay) els.feedbackOverlay.classList.remove('hidden');
      }
    });
  });
}

function setupSettingsHub() {
  // Navigation tabs in sidebar
  els.settingsNavBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetPanel = btn.dataset.settingsPanel;
      activateSettingsPanel(targetPanel);
    });
  });

  // Search input filtering
  els.settingsSearchInput?.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    if (!query) {
      activateSettingsPanel(state.activeSettingsPanel || 'panel-settings-memory');
      return;
    }

    let firstMatchedPanel = null;
    els.settingsPanels.forEach(panel => {
      const searchTerms = (panel.dataset.searchTerms || '').toLowerCase();
      const textContent = panel.textContent.toLowerCase();
      const matches = searchTerms.includes(query) || textContent.includes(query);
      if (matches && !firstMatchedPanel) {
        firstMatchedPanel = panel.id;
      }
    });

    if (firstMatchedPanel) {
      activateSettingsPanel(firstMatchedPanel);
    }
  });

  // Quick navigation buttons within panels
  els.btnSettingsJumpCalibration?.addEventListener('click', () => {
    switchView('calibration');
  });

  els.btnSettingsClearChat?.addEventListener('click', async () => {
    if (confirm('Clear all chat history across conversations? This cannot be undone.')) {
      await window.bestie.conversation.clear();
      els.chatMessages.innerHTML = '';
      addWelcomeMessage();
      showToast('All chat history cleared 🗑️');
    }
  });

  // Theme switch live preview
  els.settingThemeSelect?.addEventListener('change', (e) => {
    const theme = e.target.value;
    document.body.dataset.theme = theme;
    showToast(`Theme preset changed to ${theme} ✨`);
  });

  // Save location & living setup
  els.btnSaveLocationSettings?.addEventListener('click', async () => {
    const loc = els.settingUserLocation?.value.trim() || 'Austin, TX';
    const living = els.settingLivingSetup?.value.trim() || '';
    await window.bestie.memory.updateField('user_profile.identity_and_baseline.active_location', loc, 'set');
    if (living) {
      await window.bestie.memory.updateField('user_profile.identity_and_baseline.current_living_situation', living, 'set');
    }
    state.profile = await window.bestie.memory.getProfile();
    updateTopbarUserLocation(loc);
    showToast('Sanctuary location saved 📍');
  });

  // Save voice & tone dynamic
  els.btnSaveToneSettings?.addEventListener('click', async () => {
    const tone = els.settingTonePreference?.value || 'digital_bestie';
    const execStyle = els.settingExecutionStyle?.value || 'execution_first';
    await window.bestie.memory.updateField('user_profile.cognitive_and_behavioral_profile.tone_preference', tone, 'set');
    await window.bestie.memory.updateField('user_profile.cognitive_and_behavioral_profile.execution_style', execStyle, 'set');
    state.profile = await window.bestie.memory.getProfile();
    showToast('Operating dynamic saved 🎙️');
  });
}

function activateSettingsPanel(panelId) {
  state.activeSettingsPanel = panelId;
  els.settingsNavBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.settingsPanel === panelId);
  });
  els.settingsPanels.forEach(panel => {
    panel.classList.toggle('active', panel.id === panelId);
  });

  if (panelId === 'panel-settings-dossier') {
    renderDossierSummaryInSettings();
  }
}

function renderDossierSummaryInSettings() {
  if (!els.settingsDossierSummaryGrid) return;
  const p = state.profile?.user_profile || {};
  const g = p.goal_and_boundary_matrix || {};
  const id = p.identity_and_baseline || {};
  const cog = p.cognitive_and_behavioral_profile || {};
  const vent = p.secret_venture_incubator || {};

  els.settingsDossierSummaryGrid.innerHTML = `
    <div class="dossier-summary-card">
      <div class="dossier-summary-card-title">🎯 90-Day North Star Goal</div>
      <div class="dossier-summary-list">
        <div class="dossier-summary-item">
          <strong>Active Target:</strong>
          <span>${escapeHtml(g.north_star_90_day || 'Not calibrated yet')}</span>
        </div>
        <div class="dossier-summary-item">
          <strong>Pricing Floor:</strong>
          <span>${escapeHtml(g.rate_floor || '$150/hr minimum')}</span>
        </div>
      </div>
    </div>

    <div class="dossier-summary-card">
      <div class="dossier-summary-card-title">🛡️ Anti-Goals &amp; Boundaries</div>
      <div class="dossier-summary-list">
        <div class="dossier-summary-item">
          <strong>Refusals:</strong>
          <span>${(g.anti_goals && g.anti_goals.length > 0) ? escapeHtml(g.anti_goals.join(' • ')) : 'None defined yet'}</span>
        </div>
        <div class="dossier-summary-item">
          <strong>Client Red Flags:</strong>
          <span>${(g.client_red_flags && g.client_red_flags.length > 0) ? escapeHtml(g.client_red_flags.join(' • ')) : 'None logged yet'}</span>
        </div>
      </div>
    </div>

    <div class="dossier-summary-card">
      <div class="dossier-summary-card-title">💰 Capital Runway &amp; Sanctuary</div>
      <div class="dossier-summary-list">
        <div class="dossier-summary-item">
          <strong>Hard Cash Floor:</strong>
          <span>$${id.hard_cash_floor ? Number(id.hard_cash_floor).toLocaleString() : '10,000'}</span>
        </div>
        <div class="dossier-summary-item">
          <strong>Weekly Burn:</strong>
          <span>$${id.burn_rate_weekly ? Number(id.burn_rate_weekly).toLocaleString() : '1,500'}/wk</span>
        </div>
        <div class="dossier-summary-item">
          <strong>Active Location:</strong>
          <span>${escapeHtml(id.active_location || 'Austin, TX')}</span>
        </div>
      </div>
    </div>

    <div class="dossier-summary-card">
      <div class="dossier-summary-card-title">🛑 Avoidance &amp; Psychology</div>
      <div class="dossier-summary-list">
        <div class="dossier-summary-item">
          <strong>Avoidance Triggers:</strong>
          <span>${(cog.primary_avoidance_triggers && cog.primary_avoidance_triggers.length > 0) ? escapeHtml(cog.primary_avoidance_triggers.join(' • ')) : 'None logged'}</span>
        </div>
        <div class="dossier-summary-item">
          <strong>Escape Traps:</strong>
          <span>${(cog.escape_mechanisms && cog.escape_mechanisms.length > 0) ? escapeHtml(cog.escape_mechanisms.join(' • ')) : 'None logged'}</span>
        </div>
      </div>
    </div>

    <div class="dossier-summary-card">
      <div class="dossier-summary-card-title">🚀 Active Venture &amp; Superpowers</div>
      <div class="dossier-summary-list">
        <div class="dossier-summary-item">
          <strong>Project:</strong>
          <span>${escapeHtml(vent.active_project_name || 'Digital Bestie')}</span>
        </div>
        <div class="dossier-summary-item">
          <strong>Core Skills Leveraged:</strong>
          <span>${(vent.core_skills_leveraged && vent.core_skills_leveraged.length > 0) ? escapeHtml(vent.core_skills_leveraged.join(', ')) : 'Full-stack AI systems'}</span>
        </div>
      </div>
    </div>

    <div class="dossier-summary-card">
      <div class="dossier-summary-card-title">🎙️ Operating Dynamic</div>
      <div class="dossier-summary-list">
        <div class="dossier-summary-item">
          <strong>Tone Preference:</strong>
          <span>${escapeHtml(cog.tone_preference || 'digital_bestie')}</span>
        </div>
        <div class="dossier-summary-item">
          <strong>Execution Style:</strong>
          <span>${escapeHtml(cog.execution_style || 'execution_first')}</span>
        </div>
      </div>
    </div>
  `;
}

function syncSettingsFieldsFromState() {
  if (state.settings) {
    if (els.settingThemeSelect) els.settingThemeSelect.value = state.settings.theme || 'neon-dark';
    if (els.settingInjectDossier) els.settingInjectDossier.checked = state.settings.inject_dossier !== false;
    if (els.settingAutoCommit) els.settingAutoCommit.checked = state.settings.auto_commit !== false;
    if (els.settingPowerSaver) els.settingPowerSaver.checked = !!state.settings.power_saver;
  }
  const idBase = state.profile?.user_profile?.identity_and_baseline;
  const cogBase = state.profile?.user_profile?.cognitive_and_behavioral_profile;
  if (els.settingUserLocation && idBase?.active_location) {
    els.settingUserLocation.value = idBase.active_location;
  }
  if (els.settingLivingSetup && idBase?.current_living_situation) {
    els.settingLivingSetup.value = idBase.current_living_situation;
  }
  if (els.settingTonePreference && cogBase?.tone_preference) {
    els.settingTonePreference.value = cogBase.tone_preference;
  }
  if (els.settingExecutionStyle && cogBase?.execution_style) {
    els.settingExecutionStyle.value = cogBase.execution_style;
  }
}

export function openImportMemoryModal(providerId = null) {
  if (providerId) {
    state.selectedImportProvider = providerId;
  }
  const prov = state.selectedImportProvider || 'claude';
  els.importProviderPills.forEach(p => p.classList.toggle('active', p.dataset.provider === prov));
  renderImportPrompt(prov);
  if (els.importMemoryModal) {
    els.importMemoryModal.classList.remove('hidden');
    setTimeout(() => {
      if (els.importMemoryInput && !els.importMemoryInput.value) {
        els.btnCopyImportPrompt?.focus();
      } else {
        els.importMemoryInput?.focus();
      }
    }, 120);
  }
}

export function closeImportMemoryModal() {
  els.importMemoryModal?.classList.add('hidden');
}

function setupMemoryImportHub() {
  state.selectedImportProvider = 'claude';
  state.stagedMemories = [];
  state.stagedFilterCategory = 'all';

  // Render initial Claude prompt
  renderImportPrompt('claude');

  // Provider pills click handler
  els.importProviderPills.forEach(pill => {
    pill.addEventListener('click', () => {
      const providerId = pill.dataset.provider;
      state.selectedImportProvider = providerId;
      els.importProviderPills.forEach(p => p.classList.toggle('active', p === pill));
      renderImportPrompt(providerId);
    });
  });

  // Copy prompt button
  els.btnCopyImportPrompt?.addEventListener('click', async () => {
    const prov = IMPORT_PROVIDERS[state.selectedImportProvider] || IMPORT_PROVIDERS.claude;
    try {
      await navigator.clipboard.writeText(prov.prompt);
      const copyText = els.btnCopyImportPrompt.querySelector('.copy-text');
      if (copyText) {
        const orig = copyText.textContent;
        copyText.textContent = 'Copied to Clipboard! ✓';
        els.btnCopyImportPrompt.classList.add('btn-success-glow');
        setTimeout(() => {
          copyText.textContent = orig;
          els.btnCopyImportPrompt.classList.remove('btn-success-glow');
        }, 2200);
      }
      showToast(`Copied ${prov.name} export prompt 📋`);
    } catch (err) {
      console.error('Clipboard copy failed:', err);
      showToast('Could not copy automatically. Please select text manually.');
    }
  });

  // Load demo example
  els.btnLoadSampleMemory?.addEventListener('click', () => {
    if (els.importMemoryInput) {
      els.importMemoryInput.value = DEMO_CLAUDE_EXPORT;
      showToast('Demo Claude export loaded 💡 Click "Analyze & Stage Memories"');
    }
  });

  // Clear input
  els.btnClearImportInput?.addEventListener('click', () => {
    if (els.importMemoryInput) els.importMemoryInput.value = '';
  });

  // Parse button
  els.btnParseMemory?.addEventListener('click', () => {
    const text = els.importMemoryInput?.value.trim();
    if (!text) {
      showToast('Please paste memory export text first.');
      return;
    }

    const items = parseExportedMemory(text, state.selectedImportProvider);
    if (!items || items.length === 0) {
      showToast('Could not find any distinct facts or bullet items to stage.');
      return;
    }

    state.stagedMemories = items;
    state.stagedFilterCategory = 'all';

    // Show staging area
    if (els.importStagingArea) {
      els.importStagingArea.classList.remove('hidden');
      els.importStagingArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    renderStagedMemories();
    showToast(`Staged ${items.length} items for review ✨`);
  });

  // Filter chips in staging area
  els.stagedFilterChips.forEach(chip => {
    chip.addEventListener('click', () => {
      els.stagedFilterChips.forEach(c => c.classList.toggle('active', c === chip));
      state.stagedFilterCategory = chip.dataset.filter;
      renderStagedMemories();
    });
  });

  // Batch Select All
  els.btnStageSelectAll?.addEventListener('click', () => {
    state.stagedMemories.forEach(item => { item.checked = true; });
    renderStagedMemories();
  });

  // Batch Deselect All
  els.btnStageDeselectAll?.addEventListener('click', () => {
    state.stagedMemories.forEach(item => { item.checked = false; });
    renderStagedMemories();
  });

  // Add Custom Item manually to staging
  els.btnAddStagedCustom?.addEventListener('click', () => {
    const newItem = {
      id: `item_${Date.now()}_custom`,
      raw: '',
      value: 'New custom memory fact...',
      path: 'user_profile.goal_and_boundary_matrix.anti_goals',
      label: '🛡️ Anti-Goals & Refusals',
      action: 'append',
      category: 'Goals & Boundaries',
      checked: true,
      provider: 'custom'
    };
    state.stagedMemories.unshift(newItem);
    renderStagedMemories();
    showToast('Added custom staging card');
  });

  // Cancel staging
  els.btnCancelStagedMemory?.addEventListener('click', () => {
    if (confirm('Discard staged memories?')) {
      state.stagedMemories = [];
      els.importStagingArea?.classList.add('hidden');
      showToast('Staging discarded');
    }
  });

  // Commit approved memories
  els.btnCommitStagedMemory?.addEventListener('click', commitStagedMemories);

  // Wire Open Import Hub buttons across views
  els.btnOpenImportHub?.addEventListener('click', () => openImportMemoryModal());
  els.btnImportMemoryHeader?.addEventListener('click', () => openImportMemoryModal());
  els.btnImportMemoryCalib?.addEventListener('click', () => openImportMemoryModal());
  els.btnLaunchImportFromSettings?.addEventListener('click', () => openImportMemoryModal());

  // Modal close handlers
  els.btnCloseImportModal?.addEventListener('click', closeImportMemoryModal);
  els.importMemoryModal?.addEventListener('click', (e) => {
    if (e.target === els.importMemoryModal) closeImportMemoryModal();
  });
}

function renderImportPrompt(providerId) {
  const prov = IMPORT_PROVIDERS[providerId] || IMPORT_PROVIDERS.claude;
  if (els.importSelectedProviderTitle) {
    els.importSelectedProviderTitle.textContent = `${prov.icon} ${prov.name} Memory Export Prompt`;
  }
  if (els.importPromptDisplay) {
    els.importPromptDisplay.textContent = prov.prompt;
  }
}

function renderStagedMemories() {
  if (!els.importStagedItems) return;

  const total = state.stagedMemories.length;
  const checked = state.stagedMemories.filter(i => i.checked).length;
  if (els.stagedTotalCount) els.stagedTotalCount.textContent = total;
  if (els.stagedSelectedCount) els.stagedSelectedCount.textContent = checked;

  const filter = state.stagedFilterCategory || 'all';
  const visibleItems = state.stagedMemories.filter(item => {
    if (filter === 'all') return true;
    return item.category === filter;
  });

  if (visibleItems.length === 0) {
    els.importStagedItems.innerHTML = `
      <div class="empty-state-sm">No staged items match filter "${escapeHtml(filter)}".</div>
    `;
    return;
  }

  els.importStagedItems.innerHTML = visibleItems.map(item => {
    const isChecked = item.checked ? 'checked' : '';
    const optionsHtml = DOSSIER_TARGET_FIELDS.map(f => {
      const selected = f.path === item.path ? 'selected' : '';
      return `<option value="${f.path}" data-action="${f.action}" ${selected}>${escapeHtml(f.label)}</option>`;
    }).join('');

    return `
      <div class="staged-item-card ${item.checked ? 'active' : 'inactive'}" data-item-id="${item.id}">
        <div class="staged-item-top">
          <label class="staged-checkbox-label">
            <input type="checkbox" class="staged-item-check" data-item-id="${item.id}" ${isChecked} />
            <span class="staged-cat-badge">${escapeHtml(item.category)}</span>
          </label>
          <div class="staged-item-actions">
            <select class="staged-path-select" data-item-id="${item.id}">
              ${optionsHtml}
            </select>
            <button type="button" class="btn-trash-staged" data-item-id="${item.id}" title="Remove this item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        </div>
        <div class="staged-item-body">
          <input type="text" class="staged-val-input" data-item-id="${item.id}" value="${escapeHtml(String(item.value))}" placeholder="Memory fact or instruction..." />
        </div>
      </div>
    `;
  }).join('');

  // Attach event listeners to live cards
  els.importStagedItems.querySelectorAll('.staged-item-check').forEach(chk => {
    chk.addEventListener('change', (e) => {
      const id = e.target.dataset.itemId;
      const targetItem = state.stagedMemories.find(i => i.id === id);
      if (targetItem) {
        targetItem.checked = e.target.checked;
        const card = els.importStagedItems.querySelector(`.staged-item-card[data-item-id="${id}"]`);
        if (card) {
          card.classList.toggle('active', targetItem.checked);
          card.classList.toggle('inactive', !targetItem.checked);
        }
        const updatedChecked = state.stagedMemories.filter(i => i.checked).length;
        if (els.stagedSelectedCount) els.stagedSelectedCount.textContent = updatedChecked;
      }
    });
  });

  els.importStagedItems.querySelectorAll('.staged-path-select').forEach(sel => {
    sel.addEventListener('change', (e) => {
      const id = e.target.dataset.itemId;
      const targetItem = state.stagedMemories.find(i => i.id === id);
      if (targetItem) {
        targetItem.path = e.target.value;
        const opt = e.target.options[e.target.selectedIndex];
        targetItem.action = opt.dataset.action || 'set';
        const fieldMeta = DOSSIER_TARGET_FIELDS.find(f => f.path === targetItem.path);
        if (fieldMeta) {
          targetItem.label = fieldMeta.label;
        }
      }
    });
  });

  els.importStagedItems.querySelectorAll('.staged-val-input').forEach(inp => {
    inp.addEventListener('input', (e) => {
      const id = e.target.dataset.itemId;
      const targetItem = state.stagedMemories.find(i => i.id === id);
      if (targetItem) {
        targetItem.value = e.target.value;
      }
    });
  });

  els.importStagedItems.querySelectorAll('.btn-trash-staged').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = btn.dataset.itemId;
      state.stagedMemories = state.stagedMemories.filter(i => i.id !== id);
      renderStagedMemories();
    });
  });
}

async function commitStagedMemories() {
  const approved = state.stagedMemories.filter(item => item.checked && String(item.value).trim());
  if (approved.length === 0) {
    showToast('No approved items selected to commit.');
    return;
  }

  els.btnCommitStagedMemory.disabled = true;
  els.btnCommitStagedMemory.textContent = 'Committing to Living Dossier... ⏳';

  try {
    for (const item of approved) {
      const val = typeof item.value === 'string' ? item.value.trim() : item.value;
      await window.bestie.memory.updateField(item.path, val, item.action || 'set');
    }

    // Refresh profile state
    state.profile = await window.bestie.memory.getProfile();

    // Update location if it was among approved items
    const locItem = approved.find(i => i.path === 'user_profile.identity_and_baseline.active_location');
    if (locItem) {
      updateTopbarUserLocation(locItem.value);
    }

    // Refresh all views
    refreshMemoryView();
    refreshCalibrationView();
    renderDossierSummaryInSettings();

    // Clean up staging UI & close modal
    state.stagedMemories = [];
    if (els.importMemoryInput) els.importMemoryInput.value = '';
    els.importStagingArea?.classList.add('hidden');
    closeImportMemoryModal();

    showToast(`Successfully consolidated ${approved.length} memories into Living Dossier & Calibrated Memory! ✨🚀`);
  } catch (err) {
    console.error('Failed to commit staged memories:', err);
    showToast(`Error committing memories: ${err.message}`);
  } finally {
    els.btnCommitStagedMemory.disabled = false;
    els.btnCommitStagedMemory.textContent = 'Commit Approved Items to Living Dossier ✨';
  }
}

// ============================================================
// PERFORMANCE, POWER & MEMORY OPTIMIZATIONS
// ============================================================

let connectionPollInterval = null;

function setupConnectionPolling() {
  if (connectionPollInterval) clearInterval(connectionPollInterval);
  // Throttle polling to 120s when hidden or minimized; 30s when active
  const pollDelay = document.hidden ? 120000 : 30000;
  connectionPollInterval = setInterval(checkConnection, pollDelay);
}

function setupPerformanceControls() {
  // Live toggle for power saver mode
  els.settingPowerSaver?.addEventListener('change', (e) => {
    const enabled = e.target.checked;
    document.body.classList.toggle('power-saver', enabled);
    showToast(enabled ? '🍃 Power Saver activated (heavy blurs and continuous GPU draws disabled)' : '✨ Visual effects restored');
  });

  // Memory telemetry controls
  els.btnRefreshMemory?.addEventListener('click', refreshMemoryTelemetry);
  els.btnClearMemCache?.addEventListener('click', async () => {
    try {
      showToast('Purging memory cache and forcing garbage collection...');
      const res = await window.bestie.system.clearMemoryCache();
      if (res && res.success) {
        showToast(`Memory reclaimed: ~${res.freedMB || 0} MB freed ⚡`);
      } else {
        showToast('Memory cache cleared.');
      }
      await refreshMemoryTelemetry();
    } catch (err) {
      console.error('Error clearing memory cache:', err);
    }
  });

  // Window visibility & background state listeners for battery conservation
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      checkConnection();
    }
    setupConnectionPolling();
  });

  if (window.bestie?.system?.onBackgroundState) {
    window.bestie.system.onBackgroundState((bgState) => {
      if (bgState === 'visible') {
        checkConnection();
      }
      setupConnectionPolling();
    });
  }
}

async function refreshMemoryTelemetry() {
  if (!window.bestie?.system?.getMemoryUsage) return;
  try {
    const mem = await window.bestie.system.getMemoryUsage();
    if (els.memHeapUsed) els.memHeapUsed.textContent = `${mem.process.heapUsedMB} MB / ${mem.process.heapTotalMB} MB`;
    if (els.memRss) els.memRss.textContent = `${mem.process.rssMB} MB`;
    if (els.memSysFree) els.memSysFree.textContent = `${mem.system.freeMemGB} GB free (${mem.system.totalMemGB} GB total)`;
  } catch (err) {
    console.warn('Error fetching memory telemetry:', err);
  }
}

// ============================================================
// BOOT
// ============================================================

document.addEventListener('DOMContentLoaded', init);

