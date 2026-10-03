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

  // System Capabilities Tour & Keybindings Cheat Sheet
  btnSystemTour: $('#btn-system-tour'),
  btnReplaySystemTour: $('#btn-replay-system-tour'),
  btnReplaySystemTourMemory: $('#btn-replay-system-tour-memory'),
  btnRerunOnboardingSettings: $('#btn-rerun-onboarding-settings'),
  systemTourModal: $('#system-tour-modal'),
  btnCloseSystemTour: $('#btn-close-system-tour'),
  tourStepCounter: $('#tour-step-counter'),
  systemTourStepper: $('#system-tour-stepper'),
  systemTourBody: $('#system-tour-body'),
  tourAcknowledgmentBox: $('#tour-acknowledgment-box'),
  tourAckCheckbox: $('#tour-ack-checkbox'),
  tourAckText: $('#tour-ack-text'),
  btnTourPrev: $('#btn-tour-prev'),
  btnTourNext: $('#btn-tour-next'),
  btnTourSkip: $('#btn-tour-skip'),
  tourStepDots: $$('.tour-step-dot'),

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
  btnSaveToneSettings: $('#btn-save-tone-settings'),

  // TaskFlow Kanban Module
  btnNewTaskflowTask: $('#btn-new-taskflow-task'),
  btnSyncTaskflowNeon: $('#btn-sync-taskflow-neon'),
  tfStatTodo: $('#tf-stat-todo'),
  tfStatProgress: $('#tf-stat-progress'),
  tfStatDone: $('#tf-stat-done'),
  tfStatOverdue: $('#tf-stat-overdue'),
  tfStatCritical: $('#tf-stat-critical'),
  tfSearchInput: $('#tf-search-input'),
  tfBtnClearSearch: $('#tf-btn-clear-search'),
  tfFilterPriority: $('#tf-filter-priority'),
  tfSortSelect: $('#tf-sort-select'),
  tfBoard: $('#tf-board'),
  tfCardsTodo: $('#tf-cards-todo'),
  tfCardsProgress: $('#tf-cards-progress'),
  tfCardsDone: $('#tf-cards-done'),
  tfCountTodo: $('#tf-count-todo'),
  tfCountProgress: $('#tf-count-progress'),
  tfCountDone: $('#tf-count-done'),
  tfTaskModal: $('#tf-task-modal'),
  tfModalTitle: $('#tf-modal-title'),
  btnCloseTfModal: $('#btn-close-tf-modal'),
  btnCancelTfTask: $('#btn-cancel-tf-task'),
  btnSaveTfTask: $('#btn-save-tf-task'),
  tfTaskForm: $('#tf-task-form'),
  tfTaskId: $('#tf-task-id'),
  tfTaskTitleInput: $('#tf-task-title-input'),
  tfTaskDescInput: $('#tf-task-desc-input'),
  tfTaskPriorityInput: $('#tf-task-priority-input'),
  tfTaskStatusInput: $('#tf-task-status-input'),
  tfTaskDueInput: $('#tf-task-due-input'),
  tfTagContainer: $('#tf-tag-container'),
  tfTagInput: $('#tf-tag-input'),
  tfDeleteModal: $('#tf-delete-modal'),
  tfDeleteTaskName: $('#tf-delete-task-name'),
  btnCancelTfDelete: $('#btn-cancel-tf-delete'),
  btnConfirmTfDelete: $('#btn-confirm-tf-delete'),
  btnWearCompanion: $('#btn-wear-companion'),
  wearModal: $('#wear-modal'),
  btnCloseWearModal: $('#btn-close-wear-modal'),
  wearContent: $('#wear-content'),
  wearClock: $('#wear-clock'),
  wearDockBtns: $('#wear-modal .wear-dock-btn'),

  // Telemetry, RAG & HITL Elements
  btnToggleQuickIngest: $('#btn-toggle-quick-ingest'),
  btnRefreshTelemetry: $('#btn-refresh-telemetry'),
  btnClearTelemetry: $('#btn-clear-telemetry'),
  telemetryIngestDrawer: $('#telemetry-ingest-drawer'),
  ingestInputText: $('#ingest-input-text'),
  ingestInputUrl: $('#ingest-input-url'),
  btnSubmitIngestion: $('#btn-submit-ingestion'),
  ingestFeedback: $('#ingest-feedback'),
  btnAutoScheduleBacklog: $('#btn-auto-schedule-backlog'),
  btnShiftUnfinished: $('#btn-shift-unfinished'),
  telDefenseFocusText: $('#tel-defense-focus-text'),
  telDefenseCapacityText: $('#tel-defense-capacity-text'),
  telDefenseBufferText: $('#tel-defense-buffer-text'),
  telDefenseScheduleList: $('#tel-defense-schedule-list'),
  telDriftScoreText: $('#tel-drift-score-text'),
  btnCopyWebhookUrl: $('#btn-copy-webhook-url'),
  btnToggleHitlAudit: $('#btn-toggle-hitl-audit'),
  hitlPendingList: $('#hitl-pending-list'),
  hitlAuditList: $('#hitl-audit-list'),
  hitlNavBadge: $('#hitl-nav-badge'),
  hitlHeaderCount: $('#hitl-header-count'),
  hitlModal: $('#hitl-modal'),
  btnCloseHitlModal: $('#btn-close-hitl-modal'),
  btnApproveHitlModal: $('#btn-approve-hitl-modal'),
  btnRejectHitlModal: $('#btn-reject-hitl-modal'),
  hitlModalRisk: $('#hitl-modal-risk'),
  hitlModalType: $('#hitl-modal-type'),
  hitlModalId: $('#hitl-modal-id'),
  hitlModalTarget: $('#hitl-modal-target'),
  hitlModalDesc: $('#hitl-modal-desc'),
  hitlModalPayload: $('#hitl-modal-payload'),
  hitlModalComment: $('#hitl-modal-comment'),
  telTokensTotal: $('#tel-tokens-total'),
  telTokensSpeed: $('#tel-tokens-speed'),
  telCostSaved: $('#tel-cost-saved'),
  telCostSonnet: $('#tel-cost-sonnet'),
  telMcpCalls: $('#tel-mcp-calls'),
  telMcpSuccessRate: $('#tel-mcp-success-rate'),
  telQdrantCount: $('#tel-qdrant-count'),
  telQdrantStatus: $('#tel-qdrant-status'),
  telHwPlatform: $('#tel-hw-platform'),
  telHwCpu: $('#tel-hw-cpu'),
  telHwRam: $('#tel-hw-ram'),
  telHwHeap: $('#tel-hw-heap'),
  telRamBar: $('#tel-ram-bar'),
  telTraceTbody: $('#tel-trace-tbody'),
  telTraceCount: $('#tel-trace-count')
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

  // Initialize TaskFlow Kanban Module
  await setupTaskflow();

  // Apply theme if set
  if (state.settings?.theme) {
    document.body.dataset.theme = state.settings.theme;
  }

  // Initialize System Capabilities Tour
  setupSystemTour();

  // Check if system tour or onboarding intake is needed
  if (!state.profile?.onboarding_state?.system_tour_completed) {
    openSystemTourModal(false);
  } else if (!state.profile?.onboarding_state?.completed) {
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
    // Escape: Close persona menu, prompt modal, import modal, warning modal & tour modal if open
    if (e.key === 'Escape') {
      closePersonaDropdown();
      closePromptModal();
      closeImportMemoryModal();
      closeModelWarningModal(true);
      closeSystemTourModal();
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
  if (viewName === 'taskflow') refreshTaskflowView();
  if (viewName === 'telemetry') refreshTelemetryView();
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
// SYSTEM CAPABILITIES TOUR & INTERACTIVE FLIGHT CHECK
// ============================================================

let currentTourStep = 1;
let isTourReplayMode = false;
let tourAcknowledgedSteps = {};

const TOUR_STEPS = [
  {
    step: 1,
    icon: '👋',
    badge: '100% LOCAL • HARDWARE ENCRYPTED',
    title: 'Hey new bestie! 👋',
    subtitle: 'Welcome to your sovereign second-brain & operational OS.',
    desc: 'Digital Bestie is an autonomous, local-first intelligence architecture designed to give you extreme leverage, absolute privacy, and an uncompromising operational ally. Before we calibrate your personal baseline, let\'s run a 90-second flight check through your core capabilities.',
    features: [
      {
        icon: '🔒',
        title: '100% Local Sovereignty',
        text: 'Runs entirely on your machine via Ollama. No remote telemetry, no chat logging, and no cloud subscriptions.'
      },
      {
        icon: '🛡️',
        title: 'Apple Keychain Encryption',
        text: 'All profiles, chat histories, and financial data are secured at rest with hardware-backed encryption (safeStorage).'
      },
      {
        icon: '⚡',
        title: 'Anti-Moralizing Stance',
        text: 'Engineered with zero corporate fluff, no preachy disclaimers, and ride-or-die loyalty to your personal agency.'
      },
      {
        icon: '🧠',
        title: 'Continuous Second Brain',
        text: 'Maintains long-term memory across sessions so your context, constraints, and priorities are never forgotten.'
      }
    ],
    interactive: null,
    ack: 'I acknowledge that Digital Bestie runs 100% locally on my machine and encrypts my data with Apple Keychain.'
  },
  {
    step: 2,
    icon: '💬',
    badge: 'VAULT SIDEBAR • ⌘B HOTKEY',
    title: 'Chat Vault & Strategic Categorization',
    subtitle: 'Persistent multi-conversation memory organized into custom strategic folders.',
    desc: 'Never lose strategic context. Your conversation history is organized into categorized folders with instant real-time search.',
    features: [
      {
        icon: '📁',
        title: 'Strategic Category Folders',
        text: 'Sort discussions into Finances, Strategy, Ventures, Diary, and General with dedicated custom icons.'
      },
      {
        icon: '🔍',
        title: 'Instant Real-Time Search',
        text: 'Filter through previous conversations immediately as you type without waiting for database queries.'
      },
      {
        icon: '🏷️',
        title: 'Intelligent Auto-Titling',
        text: 'Discussions receive meaningful contextual names based on topics discussed, rather than generic date tags.'
      },
      {
        icon: '⌨️',
        title: 'Vault Sidebar Hotkey (⌘B)',
        text: 'Press ⌘B (or Ctrl+B) anytime in chat to toggle the history sidebar on or off seamlessly.'
      }
    ],
    interactive: {
      text: 'Test toggling your Chat Vault sidebar in the background:',
      btnText: 'Peek at Chat Vault (⌘B)',
      action: 'toggleVault'
    },
    ack: 'I understand how to organize, search, and toggle my chat vault using ⌘B.'
  },
  {
    step: 3,
    icon: '🎭',
    badge: '20 LENSES • 60 STARTERS • ⌘P',
    title: '20 Operational Personas & In-Chat Switcher',
    subtitle: 'Switch strategic advisory lenses mid-conversation without losing context or memory.',
    desc: 'One size never fits all. Bestie equips you with 20 specialized operational advisors spanning 5 strategic domains:',
    features: [
      {
        icon: '🏛️',
        title: 'Executive & Strategy (4)',
        text: 'Sovereign Strategist, Devil\'s Advocate, Resource Allocator, and Systems Architect.'
      },
      {
        icon: '⚡',
        title: 'Tactical & Execution (4)',
        text: 'Ruthless Operator, Sprint Master, Forensic Debugger, and Friction Eliminator.'
      },
      {
        icon: '🔥',
        title: 'Brutal Honesty (4)',
        text: 'Reality Checker, Anti-Bullshit Mirror, Cold-Shower Mentor, and Tough-Love Partner.'
      },
      {
        icon: '💡',
        title: 'Creative & Learning (4)',
        text: 'Socratic Provocateur, First-Principles Deconstructor, Rapid Prototyper, 80/20 Synthesizer.'
      },
      {
        icon: '🛡️',
        title: 'Support & Equilibrium (4)',
        text: 'Ride-or-Die Confidante, Nervous-System Anchor, Boundary Enforcer, and Recovery Guard.'
      },
      {
        icon: '🔄',
        title: 'Zero Context Loss (⌘P)',
        text: 'Press ⌘P mid-chat to swap lenses instantly. All previous turns and memory remain fully intact.'
      }
    ],
    interactive: {
      text: 'Experience the 20-persona drawer and starter directives:',
      btnText: 'Preview Personas Menu (⌘P)',
      action: 'openPersonas'
    },
    ack: 'I recognize that I can switch operational personas mid-chat via ⌘P without losing conversation memory.'
  },
  {
    step: 4,
    icon: '⚙️',
    badge: 'RUTHLESS ALGORITHMS • BOUNDARY DEFENSE',
    title: '8 Hardcoded Operational Modules',
    subtitle: 'Pre-configured, non-negotiable mental algorithms for critical life & business moments.',
    desc: 'When overwhelmed or making high-stakes decisions, generic advice fails. Switch to the Modules tab to run 8 specialized frameworks:',
    features: [
      {
        icon: '🛡️',
        title: 'Inbound Boundary Shield',
        text: 'Enforces your client rate floor, flags scope creep, and drafts ready-to-send boundary emails.'
      },
      {
        icon: '💰',
        title: 'Capital Guardian',
        text: 'Enforces 72-hour purchase cooling-off periods and alerts on runway burn before buying.'
      },
      {
        icon: '⚡',
        title: 'Ruthless Priority Sorter',
        text: 'Ranks tasks by consequence of delay and extracts the immediate 10-minute action.'
      },
      {
        icon: '🔮',
        title: 'Project Pre-Mortem',
        text: 'Identifies fatal failure modes before launch and outlines counter-measures.'
      },
      {
        icon: '🧹',
        title: 'Mess-to-Execution Converter',
        text: 'Turns chaotic brain-dumps into Kanban-ready sequential action plans.'
      },
      {
        icon: '🔍',
        title: 'Hidden Assumptions Breaker',
        text: 'Red-teams core beliefs and isolates blind spots before committing resources.'
      },
      {
        icon: '🧠',
        title: '80/20 Learning Engine',
        text: 'Strips fluff for rapid 20-30 minute micro-project skill acquisition.'
      },
      {
        icon: '🔧',
        title: 'Technical Troubleshooting',
        text: 'Methodically isolates variables and root causes with rigorous interrogation.'
      }
    ],
    interactive: {
      text: 'Switch to the Modules view in the application:',
      btnText: 'Explore Modules View',
      action: 'viewModules'
    },
    ack: 'I understand how the 8 operational modules enforce boundaries, protect capital, and cut through decision paralysis.'
  },
  {
    step: 5,
    icon: '🧠',
    badge: 'PERSISTENT DOSSIER • 1-CLICK IMPORT',
    title: 'Living Dossier & Memory Calibration Lab',
    subtitle: 'A persistent second-brain that never forgets your real situation, goals, or triggers.',
    desc: 'Unlike ephemeral cloud chats, Bestie maintains your living state in ~/.digital-bestie/user_profile.json. It injects your active location, living reality, financial runway, and behavioral triggers into every prompt.',
    features: [
      {
        icon: '📋',
        title: 'Living Dossier Matrix',
        text: 'Your living situation, primary stressors, behavioral avoidances, and 90-day North Star.'
      },
      {
        icon: '🧪',
        title: 'Memory Calibration Lab',
        text: 'Deepen or update your profile question-by-question a la carte with status badges and ⌘+Enter fast saving.'
      },
      {
        icon: '📥',
        title: 'Multi-Provider Memory Import',
        text: '1-click prompt generator to pull your existing memory out of Claude, ChatGPT, Venice, or Superbrain, inspect staged facts, and consolidate them!'
      },
      {
        icon: '🎖️',
        title: 'Credentials & Merits Vault',
        text: 'Track real credentials, certifications, and high-stakes achievements verified in memory.'
      }
    ],
    interactive: {
      text: 'Inspect your Calibration Lab & Living Dossier:',
      btnText: 'View Calibration Lab',
      action: 'viewCalibration'
    },
    ack: 'I acknowledge that my Living Dossier powers the AI\'s contextual awareness and I can calibrate or import memories anytime.'
  },
  {
    step: 6,
    icon: '🌌',
    badge: 'CAPITAL DEFENSE • REAL-TIME RUNWAY',
    title: 'Superbrain Hub & Financial Runway Tracker',
    subtitle: 'Live tracking of subscriptions, physical assets, and burn rates synced to memory.',
    desc: 'Ground your decisions in reality. Track all assets and monthly commitments in real time:',
    features: [
      {
        icon: '💳',
        title: 'SaaS & Subscriptions',
        text: 'Track monthly/annual recurring charges with 1-click active status toggles.'
      },
      {
        icon: '💻',
        title: 'Hardware & Workstation Assets',
        text: 'Catalog high-value tools, equipment, and serial numbers in a secure vault.'
      },
      {
        icon: '✈️',
        title: 'Travel Credits & Points',
        text: 'Track vouchers, airline miles, and expiration alerts before benefits expire.'
      },
      {
        icon: '📊',
        title: 'Dynamic Runway Calculator',
        text: 'Bestie calculates your exact financial runway in real time and automatically warns you if an impulsive purchase or low-rate project threatens your survival floor.'
      }
    ],
    interactive: {
      text: 'View the Superbrain Hub & Resource Tracker:',
      btnText: 'Inspect Superbrain Hub',
      action: 'viewSuperbrain'
    },
    ack: 'I understand that the Superbrain Hub calculates my burn rate and financial runway to keep my decisions grounded in reality.'
  },
  {
    step: 7,
    icon: '⌨️',
    badge: 'VELOCITY • KEYBINDING CHEAT SHEET',
    title: 'Operational Keybindings & Final Flight Check',
    subtitle: 'Master your keyboard shortcuts and initiate your system.',
    desc: 'Operate Digital Bestie at the speed of thought. Review your operational hotkeys below:',
    cheatSheet: [
      { key: '⌘B / Ctrl+B', label: 'Toggle Chat Vault Sidebar' },
      { key: '⌘P / Ctrl+P', label: 'Open 20 Operational Personas Switcher' },
      { key: '⌘L / Ctrl+L', label: 'Open Prompt Vault & Directives' },
      { key: '⌘+Enter', label: 'Send Chat Message / Quick Save Question' },
      { key: 'Esc', label: 'Dismiss Active Modal, Drawer, or Import Hub' },
      { key: 'Header Dropdown', label: 'Switch Models or Compile Base Infusions' }
    ],
    features: [
      {
        icon: '🛡️',
        title: 'Model Alteration Interceptor',
        text: 'Changing models in the titlebar or settings displays an alert warning you of potential performance changes, persona drift, or moralizing censorship risks.'
      },
      {
        icon: '🔥',
        title: 'Base Model Infusion Engine',
        text: 'In Settings, compile any raw local model into the Bestie architecture with baked-in 16,384 context and anti-refusal system directives.'
      }
    ],
    interactive: null,
    ack: 'I have reviewed the operational keybindings and I am ready to calibrate my Digital Bestie.'
  }
];

function setupSystemTour() {
  els.btnSystemTour?.addEventListener('click', () => openSystemTourModal(true));
  els.btnReplaySystemTour?.addEventListener('click', () => openSystemTourModal(true));
  els.btnReplaySystemTourMemory?.addEventListener('click', () => openSystemTourModal(true));
  els.btnRerunOnboardingSettings?.addEventListener('click', () => {
    switchView('chat');
    startOnboarding();
  });

  els.btnCloseSystemTour?.addEventListener('click', () => closeSystemTourModal());
  els.systemTourModal?.addEventListener('click', (e) => {
    if (e.target === els.systemTourModal) closeSystemTourModal();
  });

  els.btnTourPrev?.addEventListener('click', handleTourPrev);
  els.btnTourNext?.addEventListener('click', handleTourNext);
  els.btnTourSkip?.addEventListener('click', handleTourSkip);
  els.tourAckCheckbox?.addEventListener('change', handleTourAckChange);

  // Stepper dots click handler
  els.tourStepDots.forEach(dot => {
    dot.addEventListener('click', () => {
      const step = parseInt(dot.dataset.step, 10);
      if (step) {
        // In replay mode, jump freely; in initial walkthrough, allow jump if previous is acknowledged
        if (isTourReplayMode || tourAcknowledgedSteps[step - 1] || step === 1) {
          renderTourStep(step);
        } else {
          els.tourAcknowledgmentBox?.classList.add('pulse-warn');
          setTimeout(() => els.tourAcknowledgmentBox?.classList.remove('pulse-warn'), 600);
          showToast('Please acknowledge previous steps before advancing.');
        }
      }
    });
  });
}

function openSystemTourModal(isReplay = false) {
  isTourReplayMode = isReplay;
  tourAcknowledgedSteps = state.profile?.onboarding_state?.tour_acknowledgments || {};
  currentTourStep = 1;

  if (els.systemTourModal) {
    els.systemTourModal.classList.remove('hidden');
    renderTourStep(1);
  }
}

function closeSystemTourModal(markCompleted = false) {
  if (els.systemTourModal) {
    els.systemTourModal.classList.add('hidden');
  }
  if (markCompleted && state.profile) {
    state.profile.onboarding_state = state.profile.onboarding_state || {};
    state.profile.onboarding_state.system_tour_completed = true;
    window.bestie.memory.saveProfile(state.profile);
  }
}

function renderTourStep(stepNum) {
  currentTourStep = Math.max(1, Math.min(7, stepNum));
  const step = TOUR_STEPS[currentTourStep - 1];
  if (!step) return;

  // Update top counter
  if (els.tourStepCounter) {
    els.tourStepCounter.textContent = `Step ${currentTourStep} of 7`;
  }

  // Update stepper dots
  els.tourStepDots.forEach(dot => {
    const s = parseInt(dot.dataset.step, 10);
    dot.classList.remove('active');
    if (s === currentTourStep) dot.classList.add('active');
    dot.classList.toggle('acknowledged', !!tourAcknowledgedSteps[s]);
  });

  // Render body
  let html = `
    <div class="tour-step-header">
      <div class="tour-step-icon-wrap">${step.icon}</div>
      <div class="tour-step-title-wrap">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
          <span class="tour-brand-badge">${step.badge}</span>
        </div>
        <h2 class="tour-step-title">${step.title}</h2>
        <p class="tour-step-subtitle">${step.subtitle}</p>
      </div>
    </div>
    <div class="tour-step-desc">${step.desc}</div>
  `;

  // Keybindings Cheat Sheet (Step 7)
  if (step.cheatSheet) {
    html += `
      <div class="tour-cheat-grid">
        ${step.cheatSheet.map(item => `
          <div class="tour-cheat-item">
            <span class="tour-cheat-label">${item.label}</span>
            <span class="tour-cheat-keys"><kbd>${item.key}</kbd></span>
          </div>
        `).join('')}
      </div>
    `;
  }

  // Features Grid
  if (step.features && step.features.length > 0) {
    html += `
      <div class="tour-features-grid">
        ${step.features.map(f => `
          <div class="tour-feature-card">
            <h4 class="tour-feature-title"><span>${f.icon}</span> <span>${f.title}</span></h4>
            <p class="tour-feature-text">${f.text}</p>
          </div>
        `).join('')}
      </div>
    `;
  }

  // Live action / Peek row
  if (step.interactive) {
    html += `
      <div class="tour-interactive-row">
        <span class="tour-interactive-text">
          <span>⚡</span> ${step.interactive.text}
        </span>
        <button type="button" class="tour-peek-btn" data-tour-action="${step.interactive.action}">
          ${step.interactive.btnText}
        </button>
      </div>
    `;
  }

  // Step 7 final graduation options
  if (currentTourStep === 7) {
    if (isTourReplayMode) {
      html += `
        <div style="background: rgba(0, 240, 255, 0.05); border: 1px solid rgba(0, 240, 255, 0.2); border-radius: var(--radius-lg); padding: 16px; margin-top: 14px; display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
          <div>
            <strong style="color: #fff; display: block; font-size: 13px;">Refresher Flight Check Complete!</strong>
            <span style="font-size: 12px; color: var(--text-muted);">You're all brushed up on operational hotkeys and architecture.</span>
          </div>
          <div style="display: flex; gap: 10px;">
            <button type="button" id="btn-tour-reintake" class="btn-glass btn-sm">🎯 Re-run Personal Baseline</button>
            <button type="button" id="btn-tour-finish-replay" class="btn-neon btn-sm">Done / Close Tour ✓</button>
          </div>
        </div>
      `;
    } else {
      html += `
        <div style="background: rgba(0, 240, 255, 0.05); border: 1px solid rgba(0, 240, 255, 0.2); border-radius: var(--radius-lg); padding: 18px; margin-top: 14px;">
          <div style="margin-bottom: 12px;">
            <strong style="color: #fff; display: block; font-size: 14px;">Ready to initiate your sovereign Bestie? 🚀</strong>
            <span style="font-size: 12px; color: var(--text-muted);">Choose how you want to proceed. You can take the 5-phase personal interview to dial in your baseline right now, or jump straight into chatting.</span>
          </div>
          <div style="display: flex; gap: 12px; flex-wrap: wrap;">
            <button type="button" id="btn-tour-start-intake" class="btn-neon" style="flex: 1; padding: 10px 16px;" ${!tourAcknowledgedSteps[7] ? 'disabled' : ''}>
              🚀 Continue to Personal Baseline Intake
            </button>
            <button type="button" id="btn-tour-skip-to-chat" class="btn-glass" style="flex: 1; padding: 10px 16px;" ${!tourAcknowledgedSteps[7] ? 'disabled' : ''}>
              💬 Skip Intake &amp; Start Chatting
            </button>
          </div>
        </div>
      `;
    }
  }

  if (els.systemTourBody) {
    els.systemTourBody.innerHTML = html;

    // Attach listeners to interactive buttons in body
    els.systemTourBody.querySelectorAll('[data-tour-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = e.currentTarget.dataset.tourAction;
        handleTourAction(action);
      });
    });

    // Step 7 graduation buttons
    const btnStartIntake = els.systemTourBody.querySelector('#btn-tour-start-intake');
    btnStartIntake?.addEventListener('click', handleTourContinueToIntake);

    const btnSkipToChat = els.systemTourBody.querySelector('#btn-tour-skip-to-chat');
    btnSkipToChat?.addEventListener('click', handleTourSkipToChat);

    const btnFinishReplay = els.systemTourBody.querySelector('#btn-tour-finish-replay');
    btnFinishReplay?.addEventListener('click', () => {
      closeSystemTourModal(true);
      showToast('Bestie system tour completed! ✨');
    });

    const btnReintake = els.systemTourBody.querySelector('#btn-tour-reintake');
    btnReintake?.addEventListener('click', () => {
      closeSystemTourModal(true);
      switchView('chat');
      startOnboarding();
    });
  }

  // Update Acknowledgment Checkbox
  if (els.tourAckText) {
    els.tourAckText.textContent = step.ack;
  }
  const isAck = !!tourAcknowledgedSteps[currentTourStep];
  if (els.tourAckCheckbox) {
    els.tourAckCheckbox.checked = isAck;
  }
  if (els.tourAcknowledgmentBox) {
    els.tourAcknowledgmentBox.classList.toggle('checked', isAck);
  }

  // Update navigation buttons
  if (els.btnTourPrev) {
    els.btnTourPrev.disabled = (currentTourStep === 1);
  }
  if (els.btnTourNext) {
    if (isAck) {
      els.btnTourNext.disabled = false;
      els.btnTourNext.style.opacity = '1';
    } else {
      els.btnTourNext.disabled = true;
      els.btnTourNext.style.opacity = '0.4';
    }

    if (currentTourStep === 7) {
      els.btnTourNext.textContent = isTourReplayMode ? 'Finish Tour ✓' : 'Complete Flight Check ✓';
    } else {
      els.btnTourNext.textContent = 'Next Capability →';
    }
  }

  if (els.btnTourSkip) {
    els.btnTourSkip.textContent = isTourReplayMode ? 'Close' : 'Skip Tour';
  }
}

function handleTourAction(action) {
  if (action === 'toggleVault') {
    toggleHistorySidebar();
    showToast('Chat Vault sidebar toggled! (⌘B)');
  } else if (action === 'openPersonas') {
    togglePersonaDropdown();
    showToast('Persona drawer toggled! (⌘P)');
  } else if (action === 'viewModules') {
    switchView('modules');
    showToast('Switched to Operational Modules view.');
  } else if (action === 'viewCalibration') {
    switchView('calibration');
    showToast('Switched to Memory Calibration Lab.');
  } else if (action === 'viewSuperbrain') {
    switchView('superbrain');
    showToast('Switched to Superbrain Hub.');
  }
}

async function handleTourAckChange(e) {
  const isChecked = e.target.checked;
  if (isChecked) {
    tourAcknowledgedSteps[currentTourStep] = true;
    if (state.profile) {
      state.profile.onboarding_state = state.profile.onboarding_state || {};
      state.profile.onboarding_state.tour_acknowledgments = tourAcknowledgedSteps;
      await window.bestie.memory.saveProfile(state.profile);
    }
    els.tourAcknowledgmentBox?.classList.add('checked');
    if (els.btnTourNext) {
      els.btnTourNext.disabled = false;
      els.btnTourNext.style.opacity = '1';
    }
    // Update step dot
    const activeDot = document.querySelector(`.tour-step-dot[data-step="${currentTourStep}"]`);
    activeDot?.classList.add('acknowledged');

    // If step 7, unlock action buttons
    if (currentTourStep === 7) {
      const btnIntake = $('#btn-tour-start-intake');
      if (btnIntake) btnIntake.disabled = false;
      const btnChat = $('#btn-tour-skip-to-chat');
      if (btnChat) btnChat.disabled = false;
    }
  } else {
    delete tourAcknowledgedSteps[currentTourStep];
    if (state.profile?.onboarding_state?.tour_acknowledgments) {
      delete state.profile.onboarding_state.tour_acknowledgments[currentTourStep];
      await window.bestie.memory.saveProfile(state.profile);
    }
    els.tourAcknowledgmentBox?.classList.remove('checked');
    if (els.btnTourNext) {
      els.btnTourNext.disabled = true;
      els.btnTourNext.style.opacity = '0.4';
    }
    const activeDot = document.querySelector(`.tour-step-dot[data-step="${currentTourStep}"]`);
    activeDot?.classList.remove('acknowledged');

    if (currentTourStep === 7) {
      const btnIntake = $('#btn-tour-start-intake');
      if (btnIntake) btnIntake.disabled = true;
      const btnChat = $('#btn-tour-skip-to-chat');
      if (btnChat) btnChat.disabled = true;
    }
  }
}

function handleTourNext() {
  if (!tourAcknowledgedSteps[currentTourStep]) {
    els.tourAcknowledgmentBox?.classList.add('pulse-warn');
    setTimeout(() => els.tourAcknowledgmentBox?.classList.remove('pulse-warn'), 600);
    showToast('Please check the acknowledgment box to proceed.');
    return;
  }

  if (currentTourStep < 7) {
    renderTourStep(currentTourStep + 1);
  } else {
    if (isTourReplayMode) {
      closeSystemTourModal(true);
      showToast('Bestie system tour completed! ✨');
    } else {
      handleTourContinueToIntake();
    }
  }
}

function handleTourPrev() {
  if (currentTourStep > 1) {
    renderTourStep(currentTourStep - 1);
  }
}

function handleTourSkip() {
  if (isTourReplayMode) {
    closeSystemTourModal();
  } else {
    if (confirm('Skip the system capabilities tour and proceed directly to personal intake?')) {
      if (state.profile) {
        state.profile.onboarding_state = state.profile.onboarding_state || {};
        state.profile.onboarding_state.system_tour_completed = true;
        window.bestie.memory.saveProfile(state.profile);
      }
      closeSystemTourModal();
      startOnboarding();
    }
  }
}

async function handleTourContinueToIntake() {
  if (state.profile) {
    state.profile.onboarding_state = state.profile.onboarding_state || {};
    state.profile.onboarding_state.system_tour_completed = true;
    await window.bestie.memory.saveProfile(state.profile);
  }
  closeSystemTourModal();
  startOnboarding();
  showToast('Flight check verified! Let\'s dial in your personal baseline. 🎯');
}

async function handleTourSkipToChat() {
  if (state.profile) {
    state.profile.onboarding_state = state.profile.onboarding_state || {};
    state.profile.onboarding_state.system_tour_completed = true;
    state.profile.onboarding_state.completed = true;
    await window.bestie.memory.saveProfile(state.profile);
  }
  closeSystemTourModal();
  switchView('chat');
  addMessage('assistant', 'Hey! System flight check verified. 🚀 I\'ve got all 20 personas, 8 operational modules, and your sovereign memory engine ready to roll. What are we tackling first?');
  els.chatInput?.focus();
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

  let currentAppVersion = '2.4.0';
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
      if (action === 'tour') {
        openSystemTourModal(true);
      } else if (action === 'memory') {
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
// TASKFLOW KANBAN MODULE
// ============================================================

let tfState = {
  tasks: [],
  currentTags: [],
  editingTaskId: null,
  deleteTargetId: null,
  searchDebounce: null
};

async function setupTaskflow() {
  if (!els.btnNewTaskflowTask) return;

  // New task button opens modal
  els.btnNewTaskflowTask.addEventListener('click', () => openTfCreateModal());

  // Close modals
  if (els.btnCloseTfModal) els.btnCloseTfModal.addEventListener('click', closeTfTaskModal);
  if (els.btnCancelTfTask) els.btnCancelTfTask.addEventListener('click', closeTfTaskModal);
  if (els.tfTaskModal) {
    els.tfTaskModal.addEventListener('click', (e) => {
      if (e.target === els.tfTaskModal) closeTfTaskModal();
    });
  }

  // Task form submit
  if (els.tfTaskForm) {
    els.tfTaskForm.addEventListener('submit', handleTfFormSubmit);
  }

  // Tag input handling
  if (els.tfTagInput) els.tfTagInput.addEventListener('keydown', handleTfTagInput);
  if (els.tfTagContainer) els.tfTagContainer.addEventListener('click', handleTfTagRemove);

  // Search input with debounce
  if (els.tfSearchInput) {
    els.tfSearchInput.addEventListener('input', () => {
      const val = els.tfSearchInput.value.trim();
      if (els.tfBtnClearSearch) els.tfBtnClearSearch.classList.toggle('hidden', !val);
      clearTimeout(tfState.searchDebounce);
      tfState.searchDebounce = setTimeout(() => {
        refreshTaskflowBoard();
      }, 250);
    });
  }

  if (els.tfBtnClearSearch) {
    els.tfBtnClearSearch.addEventListener('click', () => {
      els.tfSearchInput.value = '';
      els.tfBtnClearSearch.classList.add('hidden');
      refreshTaskflowBoard();
    });
  }

  // Filter & sort dropdowns
  if (els.tfFilterPriority) {
    els.tfFilterPriority.addEventListener('change', () => refreshTaskflowBoard());
  }
  if (els.tfSortSelect) {
    els.tfSortSelect.addEventListener('change', () => refreshTaskflowBoard());
  }

  // Delete modal controls
  if (els.btnCancelTfDelete) els.btnCancelTfDelete.addEventListener('click', closeTfDeleteModal);
  if (els.tfDeleteModal) {
    els.tfDeleteModal.addEventListener('click', (e) => {
      if (e.target === els.tfDeleteModal) closeTfDeleteModal();
    });
  }
  if (els.btnConfirmTfDelete) {
    els.btnConfirmTfDelete.addEventListener('click', handleConfirmTfDelete);
  }

  // Sync with Superbrain button
  if (els.btnSyncTaskflowNeon) {
    els.btnSyncTaskflowNeon.addEventListener('click', handleSyncTaskflowNeon);
  }

  // Wear OS Smartwatch Companion
  if (els.btnWearCompanion) {
    els.btnWearCompanion.addEventListener('click', openWearModal);
  }
  if (els.btnCloseWearModal) {
    els.btnCloseWearModal.addEventListener('click', closeWearModal);
  }
  if (els.wearModal) {
    els.wearModal.addEventListener('click', (e) => {
      if (e.target === els.wearModal) closeWearModal();
    });
  }
  els.wearDockBtns.forEach(btn => {
    btn.addEventListener('click', () => switchWearTab(btn.dataset.tab));
  });

  // Keyboard shortcut: Esc to close modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (els.tfTaskModal && !els.tfTaskModal.classList.contains('hidden')) closeTfTaskModal();
      if (els.tfDeleteModal && !els.tfDeleteModal.classList.contains('hidden')) closeTfDeleteModal();
      if (els.wearModal && !els.wearModal.classList.contains('hidden')) closeWearModal();
    }
  });

  // Setup Drag and Drop
  setupTfDragAndDrop();
}

async function refreshTaskflowView() {
  await refreshTaskflowBoard();
  await refreshTaskflowStats();
}

async function refreshTaskflowBoard() {
  if (!window.bestie?.taskflow?.loadTasks) return;
  try {
    const filters = {
      priority: els.tfFilterPriority ? els.tfFilterPriority.value : 'all',
      search: els.tfSearchInput ? els.tfSearchInput.value.trim() : '',
      sort: els.tfSortSelect ? els.tfSortSelect.value : 'position',
      order: 'asc'
    };

    tfState.tasks = await window.bestie.taskflow.loadTasks(filters);
    renderTfBoard();
  } catch (err) {
    console.error('[TaskFlow] Error loading tasks:', err);
  }
}

async function refreshTaskflowStats() {
  if (!window.bestie?.taskflow?.getTaskStats) return;
  try {
    const stats = await window.bestie.taskflow.getTaskStats();
    if (els.tfStatTodo) els.tfStatTodo.textContent = stats.todo ?? 0;
    if (els.tfStatProgress) els.tfStatProgress.textContent = stats.in_progress ?? 0;
    if (els.tfStatDone) els.tfStatDone.textContent = stats.done ?? 0;
    if (els.tfStatOverdue) els.tfStatOverdue.textContent = stats.overdue ?? 0;
    if (els.tfStatCritical) els.tfStatCritical.textContent = stats.critical ?? 0;
  } catch (err) {
    console.error('[TaskFlow] Error loading stats:', err);
  }
}

function renderTfBoard() {
  const grouped = {
    todo: tfState.tasks.filter(t => t.status === 'todo'),
    in_progress: tfState.tasks.filter(t => t.status === 'in_progress'),
    done: tfState.tasks.filter(t => t.status === 'done')
  };

  renderTfColumn(els.tfCardsTodo, grouped.todo, 'todo');
  renderTfColumn(els.tfCardsProgress, grouped.in_progress, 'in_progress');
  renderTfColumn(els.tfCardsDone, grouped.done, 'done');

  if (els.tfCountTodo) els.tfCountTodo.textContent = grouped.todo.length;
  if (els.tfCountProgress) els.tfCountProgress.textContent = grouped.in_progress.length;
  if (els.tfCountDone) els.tfCountDone.textContent = grouped.done.length;
}

function renderTfColumn(container, tasks, status) {
  if (!container) return;
  container.innerHTML = '';

  if (tasks.length === 0) {
    const emptyMsgs = {
      todo: { icon: '📋', text: 'No pending items' },
      in_progress: { icon: '⚡', text: 'Nothing in progress' },
      done: { icon: '✨', text: 'No completed tasks yet' }
    };
    const m = emptyMsgs[status] || emptyMsgs.todo;
    container.innerHTML = `
      <div class="tf-empty-column">
        <div class="tf-empty-icon">${m.icon}</div>
        <div class="tf-empty-text">${m.text}</div>
      </div>
    `;
    return;
  }

  tasks.forEach(task => {
    container.appendChild(createTfCardElement(task));
  });
}

function createTfCardElement(task) {
  const card = document.createElement('div');
  card.className = `tf-card priority-${task.priority} status-${task.status}`;
  card.dataset.id = task.id;
  card.draggable = true;

  const tags = Array.isArray(task.tags) ? task.tags : [];
  const tagsHTML = tags.map(t => `<span class="tf-tag">${escapeTfHtml(t)}</span>`).join('');
  const dueDateHTML = task.due_date ? formatTfDueDate(task.due_date) : '';

  card.innerHTML = `
    <div class="tf-card-header">
      <div class="tf-card-title">${escapeTfHtml(task.title)}</div>
      <div class="tf-card-actions">
        <button type="button" class="tf-card-btn edit" data-id="${task.id}" title="Edit task">✏️</button>
        <button type="button" class="tf-card-btn delete" data-id="${task.id}" title="Delete task">🗑️</button>
      </div>
    </div>
    ${task.description ? `<div class="tf-card-desc">${escapeTfHtml(task.description)}</div>` : ''}
    <div class="tf-card-meta">
      <span class="tf-priority-badge ${task.priority}">${task.priority}</span>
      ${tagsHTML}
      ${dueDateHTML}
    </div>
  `;

  // Attach button events
  const editBtn = card.querySelector('.tf-card-btn.edit');
  if (editBtn) {
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openTfEditModal(task.id);
    });
  }

  const deleteBtn = card.querySelector('.tf-card-btn.delete');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openTfDeleteModal(task.id);
    });
  }

  return card;
}

function formatTfDueDate(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((date - now) / (1000 * 60 * 60 * 24));
  const isOverdue = diffDays < 0;

  let label;
  if (diffDays === 0) label = 'Today';
  else if (diffDays === 1) label = 'Tomorrow';
  else if (diffDays === -1) label = 'Yesterday';
  else if (diffDays > 1 && diffDays <= 7) label = `In ${diffDays}d`;
  else if (diffDays < -1) label = `${Math.abs(diffDays)}d overdue`;
  else label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return `<span class="tf-due-date ${isOverdue ? 'overdue' : ''}">${isOverdue ? '⚠️' : '📅'} ${label}</span>`;
}

function escapeTfHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Modal handling
function openTfCreateModal() {
  tfState.editingTaskId = null;
  els.tfModalTitle.textContent = 'New Task';
  els.btnSaveTfTask.textContent = 'Create Task';
  els.tfTaskForm.reset();
  els.tfTaskId.value = '';
  els.tfTaskPriorityInput.value = 'medium';
  els.tfTaskStatusInput.value = 'todo';
  tfState.currentTags = [];
  renderTfTags();
  els.tfTaskModal.classList.remove('hidden');
  setTimeout(() => els.tfTaskTitleInput.focus(), 150);
}

function openTfEditModal(id) {
  const task = tfState.tasks.find(t => t.id === id);
  if (!task) return;

  tfState.editingTaskId = id;
  els.tfModalTitle.textContent = 'Edit Task';
  els.btnSaveTfTask.textContent = 'Save Changes';
  els.tfTaskId.value = task.id;
  els.tfTaskTitleInput.value = task.title;
  els.tfTaskDescInput.value = task.description || '';
  els.tfTaskPriorityInput.value = task.priority;
  els.tfTaskStatusInput.value = task.status;
  els.tfTaskDueInput.value = task.due_date || '';
  tfState.currentTags = Array.isArray(task.tags) ? [...task.tags] : [];
  renderTfTags();
  els.tfTaskModal.classList.remove('hidden');
  setTimeout(() => els.tfTaskTitleInput.focus(), 150);
}

function closeTfTaskModal() {
  if (els.tfTaskModal) els.tfTaskModal.classList.add('hidden');
  tfState.editingTaskId = null;
  tfState.currentTags = [];
}

function openTfDeleteModal(id) {
  const task = tfState.tasks.find(t => t.id === id);
  if (!task) return;
  tfState.deleteTargetId = id;
  els.tfDeleteTaskName.textContent = `"${task.title}"`;
  els.tfDeleteModal.classList.remove('hidden');
}

function closeTfDeleteModal() {
  if (els.tfDeleteModal) els.tfDeleteModal.classList.add('hidden');
  tfState.deleteTargetId = null;
}

async function handleConfirmTfDelete() {
  if (!tfState.deleteTargetId) return;
  try {
    await window.bestie.taskflow.deleteTask(tfState.deleteTargetId);
    closeTfDeleteModal();
    await refreshTaskflowBoard();
    await refreshTaskflowStats();
  } catch (err) {
    console.error('[TaskFlow] Delete error:', err);
  }
}

async function handleTfFormSubmit(e) {
  e.preventDefault();
  const title = els.tfTaskTitleInput.value.trim();
  if (!title) return;

  const payload = {
    title,
    description: els.tfTaskDescInput.value.trim(),
    priority: els.tfTaskPriorityInput.value,
    status: els.tfTaskStatusInput.value,
    due_date: els.tfTaskDueInput.value || null,
    tags: [...tfState.currentTags]
  };

  try {
    if (tfState.editingTaskId) {
      await window.bestie.taskflow.updateTask(tfState.editingTaskId, payload);
    } else {
      await window.bestie.taskflow.createTask(payload);
    }
    closeTfTaskModal();
    await refreshTaskflowBoard();
    await refreshTaskflowStats();
  } catch (err) {
    console.error('[TaskFlow] Save error:', err);
  }
}

function handleTfTagInput(e) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    const val = els.tfTagInput.value.trim().replace(',', '');
    if (val && !tfState.currentTags.includes(val)) {
      tfState.currentTags.push(val);
      renderTfTags();
    }
    els.tfTagInput.value = '';
  }
  if (e.key === 'Backspace' && els.tfTagInput.value === '' && tfState.currentTags.length > 0) {
    tfState.currentTags.pop();
    renderTfTags();
  }
}

function handleTfTagRemove(e) {
  const btn = e.target.closest('.tf-tag-remove');
  if (!btn) return;
  const tag = btn.dataset.tag;
  tfState.currentTags = tfState.currentTags.filter(t => t !== tag);
  renderTfTags();
}

function renderTfTags() {
  if (!els.tfTagContainer || !els.tfTagInput) return;
  els.tfTagContainer.querySelectorAll('.tf-tag-pill').forEach(el => el.remove());
  tfState.currentTags.forEach(tag => {
    const pill = document.createElement('span');
    pill.className = 'tf-tag-pill';
    pill.innerHTML = `
      ${escapeTfHtml(tag)}
      <button type="button" class="tf-tag-remove" data-tag="${escapeTfHtml(tag)}">✕</button>
    `;
    els.tfTagContainer.insertBefore(pill, els.tfTagInput);
  });
}

function setupTfDragAndDrop() {
  const columns = $('.tf-column-cards');
  let draggedCard = null;

  document.addEventListener('dragstart', (e) => {
    const card = e.target.closest('.tf-card');
    if (!card) return;
    draggedCard = card;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', card.dataset.id);
  });

  document.addEventListener('dragend', () => {
    if (draggedCard) {
      draggedCard.classList.remove('dragging');
      draggedCard = null;
    }
    $('.tf-column').forEach(col => col.classList.remove('drag-over'));
  });

  columns.forEach(col => {
    const columnParent = col.closest('.tf-column');

    col.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (columnParent) columnParent.classList.add('drag-over');
    });

    col.addEventListener('dragleave', (e) => {
      if (columnParent && !col.contains(e.relatedTarget)) {
        columnParent.classList.remove('drag-over');
      }
    });

    col.addEventListener('drop', async (e) => {
      e.preventDefault();
      if (columnParent) columnParent.classList.remove('drag-over');

      const taskId = e.dataTransfer.getData('text/plain');
      const newStatus = col.dataset.status;
      if (!taskId || !newStatus) return;

      try {
        await window.bestie.taskflow.updateTask(taskId, { status: newStatus });
        await refreshTaskflowBoard();
        await refreshTaskflowStats();
      } catch (err) {
        console.error('[TaskFlow] Drop error:', err);
      }
    });
  });
}


// --- Wear OS Smartwatch Companion Controller ---
let activeWearTab = 'tasks';
let wearClockTimer = null;

function updateWearClock() {
  if (els.wearClock) {
    const now = new Date();
    els.wearClock.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
}

async function openWearModal() {
  updateWearClock();
  clearInterval(wearClockTimer);
  wearClockTimer = setInterval(updateWearClock, 10000);
  if (els.wearModal) els.wearModal.classList.remove('hidden');
  await renderActiveWearTab();
}

function closeWearModal() {
  if (els.wearModal) els.wearModal.classList.add('hidden');
  clearInterval(wearClockTimer);
}

async function switchWearTab(tab) {
  activeWearTab = tab;
  els.wearDockBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  await renderActiveWearTab();
}

async function renderActiveWearTab() {
  if (!els.wearContent) return;

  if (activeWearTab === 'tasks') {
    els.wearContent.innerHTML = '<div style="text-align:center; padding: 20px; font-size:10px; color:#888;">Syncing with wrist...</div>';
    try {
      const wearTasks = await window.bestie.taskflow.getWearTasks();
      if (!wearTasks || wearTasks.length === 0) {
        els.wearContent.innerHTML = '<div style="text-align:center; padding: 30px 10px; font-size:11px; color:#00ff88;">All duties done! ✨</div>';
        return;
      }

      els.wearContent.innerHTML = '';
      wearTasks.forEach(task => {
        const item = document.createElement('div');
        item.className = 'wear-task-item' + (task.completed ? ' done' : '');
        item.innerHTML = `
          <span class="wear-task-dot ${task.priority}"></span>
          <span class="wear-task-text" style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeTfHtml(task.title)}</span>
          <span style="font-size:10px; color:${task.completed ? '#00ff88' : '#888'};">${task.completed ? '✓' : '○'}</span>
        `;

        item.addEventListener('click', async () => {
          await window.bestie.taskflow.toggleWearTask(task.id);
          await renderActiveWearTab();
          await refreshTaskflowBoard();
          await refreshTaskflowStats();
        });

        els.wearContent.appendChild(item);
      });
    } catch (err) {
      els.wearContent.innerHTML = '<div style="color:#ff1744; font-size:10px; text-align:center;">Sync error</div>';
    }
  } else if (activeWearTab === 'voice') {
    els.wearContent.innerHTML = `
      <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; gap:8px; text-align:center;">
        <button id="btn-wear-mic-bestie" style="width:48px; height:48px; border-radius:50%; background:rgba(179,71,255,0.25); border:1px solid #b347ff; color:#b347ff; font-size:20px; cursor:pointer; display:flex; align-items:center; justify-content:center;">🎙️</button>
        <div id="wear-voice-hint-bestie" style="font-size:10px; color:#aaa; padding:0 6px;">Tap mic to dictate task</div>
      </div>
    `;

    const micBtn = els.wearContent.querySelector('#btn-wear-mic-bestie');
    const hint = els.wearContent.querySelector('#wear-voice-hint-bestie');
    micBtn.addEventListener('click', async () => {
      micBtn.style.boxShadow = '0 0 15px #b347ff';
      hint.textContent = 'Listening to wrist audio...';

      setTimeout(async () => {
        const sampleTasks = [
          'Review quarterly cloud budget',
          'Follow up with client contract',
          'Deploy security hotfix',
          'Calibrate living dossier anti-goals'
        ];
        const chosen = sampleTasks[Math.floor(Math.random() * sampleTasks.length)];
        hint.textContent = `"Captured: ${chosen}"`;

        await window.bestie.taskflow.quickAddWearTask({ title: chosen });
        await refreshTaskflowBoard();
        await refreshTaskflowStats();

        setTimeout(() => switchWearTab('tasks'), 1000);
      }, 1200);
    });
  } else if (activeWearTab === 'tile') {
    try {
      const tile = await window.bestie.taskflow.getWearTileData();
      els.wearContent.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding: 4px;">
          <div style="font-size:9px; font-weight:700; color:#00f0ff; letter-spacing:1px; margin-bottom:2px;">⚡ TASKFLOW TILE</div>
          <div style="font-size:18px; font-weight:800; color:#b347ff;">${tile.pendingCount} <span style="font-size:10px; font-weight:400; color:#aaa;">duties left</span></div>
          <div style="width:100%; border-top:1px solid rgba(255,255,255,0.1); margin:6px 0;"></div>
          ${(tile.tasks || []).map(t => `<div style="font-size:9.5px; color:#eee; max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-bottom:2px;">• ${escapeTfHtml(t.title)}</div>`).join('')}
        </div>
      `;
    } catch (err) {
      els.wearContent.innerHTML = '<div style="color:#ff1744; font-size:10px;">Tile load failed</div>';
    }
  }
}

async function handleSyncTaskflowNeon() {
  try {
    const res = await window.bestie.taskflow.syncToNeonBrain();
    if (res && res.success) {
      if (els.btnSyncTaskflowNeon) {
        const orig = els.btnSyncTaskflowNeon.textContent;
        els.btnSyncTaskflowNeon.textContent = '✓ Synced with Superbrain!';
        setTimeout(() => {
          els.btnSyncTaskflowNeon.textContent = orig;
        }, 2000);
      }
    }
  } catch (err) {
    console.error('[TaskFlow] Sync error:', err);
  }
}

// ============================================================
// TELEMETRY, RAG & HITL EXECUTION OBSERVABILITY
// ============================================================

let currentActiveHitlRequest = null;

async function refreshHitlBadge() {
  try {
    const pending = await window.bestie.execution.getPending();
    const count = (pending || []).length;
    if (els.hitlNavBadge) {
      els.hitlNavBadge.textContent = count;
      els.hitlNavBadge.classList.toggle('hidden', count === 0);
    }
    if (els.hitlHeaderCount) {
      els.hitlHeaderCount.textContent = `${count} Pending`;
    }
  } catch (err) {
    console.warn('[HITL] Badge refresh error:', err);
  }
}

async function refreshTelemetryView() {
  try {
    const [summary, qdrantStats, pendingApprovals] = await Promise.all([
      window.bestie.telemetry.getSummary(),
      window.bestie.rag.getStats(),
      window.bestie.execution.getPending()
    ]);

    // Update KPI 1: Tokens
    if (els.telTokensTotal) els.telTokensTotal.textContent = (summary.economics.totalTokens || 0).toLocaleString();
    if (els.telTokensSpeed) els.telTokensSpeed.textContent = `${summary.economics.avgTokensPerSec || 0} tok/sec avg speed`;

    // Update KPI 2: Compute ROI
    if (els.telCostSaved) els.telCostSaved.textContent = `$${(summary.economics.costSavedGPT4USD || 0).toFixed(2)}`;
    if (els.telCostSonnet) els.telCostSonnet.textContent = `~$${(summary.economics.costSavedSonnetUSD || 0).toFixed(2)} vs Claude Sonnet`;

    // Update KPI 3: MCP Tools
    if (els.telMcpCalls) els.telMcpCalls.textContent = (summary.activity.mcpToolCalls || 0).toLocaleString();
    if (els.telMcpSuccessRate) els.telMcpSuccessRate.textContent = `${summary.activity.mcpSuccessRate || 100}% success rate`;

    // Update KPI 4: Vector Memory
    if (els.telQdrantCount) els.telQdrantCount.textContent = (qdrantStats.pointsCount || 0).toLocaleString();
    if (els.telQdrantStatus) els.telQdrantStatus.textContent = qdrantStats.online ? `Online (${qdrantStats.status || 'active'})` : 'Offline';

    // Update Hardware
    if (els.telHwPlatform) els.telHwPlatform.textContent = summary.hardware.platform || 'Darwin arm64';
    if (els.telHwCpu) els.telHwCpu.textContent = `${summary.hardware.cpuModel} (${summary.hardware.cpuCores} Cores)`;
    if (els.telHwRam) els.telHwRam.textContent = `${summary.hardware.usedMemoryGB} GB / ${summary.hardware.totalMemoryGB} GB (${summary.hardware.memoryUsagePercent}%)`;
    if (els.telHwHeap) els.telHwHeap.textContent = `${summary.hardware.appMemoryMB} MB`;
    if (els.telRamBar) els.telRamBar.style.width = `${summary.hardware.memoryUsagePercent}%`;

    // Update HITL pending list
    renderHitlPendingList(pendingApprovals || []);
    refreshHitlBadge();

    // Update Time Defense & Calendar Shifting
    if (window.bestie && window.bestie.timeDefense) {
      try {
        const [defenseStatus, schedule] = await Promise.all([
          window.bestie.timeDefense.getStatus(),
          window.bestie.timeDefense.getSchedule()
        ]);

        if (els.telDefenseFocusText) {
          if (defenseStatus.isInFocusBlock) {
            els.telDefenseFocusText.textContent = `⚡ Active: ${defenseStatus.activeBlockTitle} (${defenseStatus.remainingMinutes}m left)`;
          } else if (defenseStatus.isInBuffer) {
            els.telDefenseFocusText.textContent = `🛡️ Buffer: Focus Recovery Active (${defenseStatus.remainingMinutes}m left)`;
          } else {
            els.telDefenseFocusText.textContent = 'Idle • No active focus block';
          }
        }

        if (els.telDefenseCapacityText && schedule && schedule.summary) {
          els.telDefenseCapacityText.textContent = `${schedule.summary.allocatedFocusMinutes}m / ${schedule.summary.totalCapacityMinutes}m (${schedule.summary.focusBlockCount} blocks)`;
        }

        if (els.telDefenseBufferText && schedule && schedule.summary) {
          els.telDefenseBufferText.textContent = `${schedule.summary.protectedBufferMinutes}m Protected Buffer`;
        }

        if (els.telDefenseScheduleList && schedule) {
          const blocks = schedule.blocks || [];
          if (blocks.length === 0) {
            els.telDefenseScheduleList.innerHTML = '<div style="color: var(--text-muted); font-size: 12px; padding: 6px;">No focus blocks scheduled for today. Click \"Auto-Schedule Backlog\" to map duties.</div>';
          } else {
            els.telDefenseScheduleList.innerHTML = blocks.map(b => `
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; background: rgba(255,255,255,0.02); border-radius: 6px; border-left: 3px solid ${b.type === 'FOCUS' ? 'var(--neon-cyan)' : 'var(--neon-green)'}; font-size: 12px;">
                <div>
                  <span style="font-weight: 600; color: var(--text-primary);">${b.title}</span>
                  <span class="text-muted" style="font-size: 11px; margin-left: 8px;">${b.startTime} - ${b.endTime} (${b.durationMinutes}m)</span>
                </div>
                <span class="status-pill ${b.status === 'shifted' ? 'status-warning' : 'status-active'}">${b.status.toUpperCase()}</span>
              </div>
            `).join('');
          }
        }
      } catch (tdErr) {
        console.warn('[Telemetry] Time defense load error:', tdErr.message);
      }
    }

    // Update Layered Memory & Drift Telemetry
    if (window.bestie && window.bestie.layeredMemory) {
      try {
        const drift = await window.bestie.layeredMemory.getDrift();
        if (els.telDriftScoreText && drift) {
          els.telDriftScoreText.textContent = `Drift: ${drift.current_drift_score.toFixed(2)} (${drift.status})`;
          els.telDriftScoreText.className = `font-mono text-sm ${drift.status === 'OPTIMAL' ? 'text-neon-green' : 'text-danger'}`;
        }
      } catch (lmErr) {
        console.warn('[Telemetry] Drift telemetry load error:', lmErr.message);
      }
    }

    // Update Event Activity Traces
    renderTelemetryTraces(summary.recentEvents || []);
  } catch (err) {
    console.error('[Telemetry] Refresh view error:', err);
  }
}

function renderHitlPendingList(items) {
  if (!els.hitlPendingList) return;
  if (items.length === 0) {
    els.hitlPendingList.innerHTML = `
      <div style="text-align: center; padding: 24px; color: var(--text-muted); font-size: 13px; background: rgba(255,255,255,0.01); border-radius: 8px;">
        <span style="color: var(--neon-green); font-size: 16px;">✓</span> All systems clear. No outbound actions awaiting human approval.
      </div>
    `;
    return;
  }

  els.hitlPendingList.innerHTML = items.map(item => `
    <div class="hitl-card risk-${item.riskLevel || 'high'}" data-request-id="${item.id}">
      <div class="hitl-card-header">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span class="hitl-risk-badge ${item.riskLevel || 'high'}">${(item.riskLevel || 'HIGH').toUpperCase()}</span>
          <span style="font-weight: 700; font-size: 13px; color: var(--text-primary);">${item.actionType.toUpperCase()}</span>
          <span class="font-mono text-xs text-muted">${item.id}</span>
        </div>
        <span class="text-muted text-xs">${new Date(item.createdAt).toLocaleTimeString()}</span>
      </div>
      <div style="font-size: 12px; color: var(--text-secondary);">
        <strong>Target:</strong> <span class="font-mono text-cyan">${item.target}</span>
      </div>
      <div style="font-size: 12px; color: var(--text-muted);">
        ${item.description || 'Outbound action awaiting operator authorization'}
      </div>
      <div class="hitl-actions-row">
        <button class="btn btn-primary btn-xs btn-hitl-approve" data-id="${item.id}">
          <span>✓</span> Approve &amp; Execute
        </button>
        <button class="btn btn-secondary btn-xs btn-hitl-reject" data-id="${item.id}">
          <span>✕</span> Reject
        </button>
        <button class="btn btn-secondary btn-xs btn-hitl-inspect" data-id="${item.id}">
          <span>🔍</span> Inspect Payload
        </button>
      </div>
    </div>
  `).join('');
}

function renderTelemetryTraces(events) {
  if (!els.telTraceTbody) return;
  if (els.telTraceCount) els.telTraceCount.textContent = `${events.length} events logged`;

  if (events.length === 0) {
    els.telTraceTbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 16px;">No activity events recorded yet.</td></tr>';
    return;
  }

  els.telTraceTbody.innerHTML = events.slice(0, 25).map(ev => {
    let typeClass = 'llm';
    if (ev.type === 'MCP_TOOL') typeClass = 'mcp';
    if (ev.type === 'DAG_WORKFLOW') typeClass = 'dag';

    const isSuccess = ev.status === 'SUCCESS';
    const statusPill = isSuccess
      ? '<span style="color: var(--neon-green); font-size: 11px;">● SUCCESS</span>'
      : `<span style="color: #ff1744; font-size: 11px;" title="${ev.error || ''}">● ERROR</span>`;

    const detail = ev.tokens ? `${ev.tokens} tok (${ev.tokensPerSecond || 0} tps)` : (ev.nodesCount ? `${ev.nodesCount} nodes` : (ev.silo || ''));
    const timeStr = new Date(ev.timestamp).toLocaleTimeString();

    return `
      <tr>
        <td><span class="tel-type-badge ${typeClass}">${ev.type}</span></td>
        <td style="font-weight: 600; color: var(--text-primary);">${ev.name}</td>
        <td>${ev.durationMs ? `${ev.durationMs}ms` : '-'}</td>
        <td style="color: var(--text-muted);">${detail}</td>
        <td>${statusPill}</td>
        <td style="color: var(--text-muted); font-size: 11px;">${timeStr}</td>
      </tr>
    `;
  }).join('');
}

function openHitlModal(request) {
  currentActiveHitlRequest = request;
  if (!els.hitlModal) return;

  if (els.hitlModalRisk) {
    els.hitlModalRisk.textContent = (request.riskLevel || 'HIGH').toUpperCase();
    els.hitlModalRisk.className = `hitl-risk-badge ${request.riskLevel || 'high'}`;
  }
  if (els.hitlModalType) els.hitlModalType.textContent = (request.actionType || 'ACTION').toUpperCase();
  if (els.hitlModalId) els.hitlModalId.textContent = request.id;
  if (els.hitlModalTarget) els.hitlModalTarget.textContent = request.target;
  if (els.hitlModalDesc) els.hitlModalDesc.textContent = request.description;
  if (els.hitlModalPayload) {
    els.hitlModalPayload.textContent = JSON.stringify(request.payload || {}, null, 2);
  }
  if (els.hitlModalComment) els.hitlModalComment.value = '';

  els.hitlModal.classList.remove('hidden');
}

function closeHitlModal() {
  currentActiveHitlRequest = null;
  if (els.hitlModal) els.hitlModal.classList.add('hidden');
}

function setupTelemetryListeners() {
  // Refresh button
  els.btnRefreshTelemetry?.addEventListener('click', () => {
    refreshTelemetryView();
    showToast('Telemetry refreshed ⚡');
  });

  // Clear stats button
  els.btnClearTelemetry?.addEventListener('click', async () => {
    if (confirm('Reset rolling telemetry stats and event traces?')) {
      await window.bestie.telemetry.clear();
      refreshTelemetryView();
      showToast('Telemetry counters reset.');
    }
  });

  // Toggle Quick Ingest Drawer
  els.btnToggleQuickIngest?.addEventListener('click', () => {
    if (els.telemetryIngestDrawer) {
      els.telemetryIngestDrawer.classList.toggle('hidden');
    }
  });

  // Copy Webhook URL
  els.btnCopyWebhookUrl?.addEventListener('click', () => {
    const code = els.telWebhookUrlCode?.textContent || 'http://127.0.0.1:3848/api/webhook/universal';
    navigator.clipboard.writeText(code);
    showToast('Universal Webhook URL copied to clipboard! 📋');
  });

  // Submit Ingestion
  els.btnSubmitIngestion?.addEventListener('click', async () => {
    const text = els.ingestInputText?.value?.trim();
    const url = els.ingestInputUrl?.value?.trim() || '';
    if (!text) {
      showToast('Please enter text or a URL to ingest.');
      return;
    }

    try {
      if (els.btnSubmitIngestion) els.btnSubmitIngestion.disabled = true;
      const res = await window.bestie.ingestion.process({
        text,
        sourceUrl: url,
        source: 'manual_quick_capture'
      });

      if (els.ingestFeedback) {
        els.ingestFeedback.classList.remove('hidden');
        els.ingestFeedback.innerHTML = `
          <strong>✓ Triaged as ${res.verdict}:</strong> "${res.title}"
          ${res.taskCreated ? '<span class="text-neon-green">[TaskFlow Ticket Created]</span>' : ''}
          ${res.resourceCreated ? '<span class="text-cyan">[Superbrain Indexed]</span>' : ''}
        `;
      }
      els.ingestInputText.value = '';
      showToast(`Ingestion complete: ${res.verdict} ⚡`);
      refreshTelemetryView();
    } catch (err) {
      showToast(`Ingestion error: ${err.message}`);
    } finally {
      if (els.btnSubmitIngestion) els.btnSubmitIngestion.disabled = false;
    }
  });

  // HITL Pending list delegation (Approve / Reject / Inspect)
  els.hitlPendingList?.addEventListener('click', async (e) => {
    const approveBtn = e.target.closest('.btn-hitl-approve');
    const rejectBtn = e.target.closest('.btn-hitl-reject');
    const inspectBtn = e.target.closest('.btn-hitl-inspect');

    if (approveBtn) {
      const id = approveBtn.dataset.id;
      try {
        await window.bestie.execution.approve(id, 'Approved via dashboard');
        showToast(`Action ${id} authorized and executed! ✓`);
        refreshTelemetryView();
      } catch (err) {
        showToast(`Execution failed: ${err.message}`);
      }
    } else if (rejectBtn) {
      const id = rejectBtn.dataset.id;
      try {
        await window.bestie.execution.reject(id, 'Declined by operator');
        showToast(`Action ${id} aborted.`);
        refreshTelemetryView();
      } catch (err) {
        showToast(`Reject failed: ${err.message}`);
      }
    } else if (inspectBtn) {
      const id = inspectBtn.dataset.id;
      const pending = await window.bestie.execution.getPending();
      const item = (pending || []).find(p => p.id === id);
      if (item) openHitlModal(item);
    }
  });

  // HITL Modal buttons
  els.btnCloseHitlModal?.addEventListener('click', closeHitlModal);
  els.btnRejectHitlModal?.addEventListener('click', async () => {
    if (!currentActiveHitlRequest) return;
    const reason = els.hitlModalComment?.value || 'Declined from modal';
    await window.bestie.execution.reject(currentActiveHitlRequest.id, reason);
    showToast(`Action ${currentActiveHitlRequest.id} rejected.`);
    closeHitlModal();
    refreshTelemetryView();
  });
  els.btnApproveHitlModal?.addEventListener('click', async () => {
    if (!currentActiveHitlRequest) return;
    const comment = els.hitlModalComment?.value || 'Approved from modal';
    try {
      await window.bestie.execution.approve(currentActiveHitlRequest.id, comment);
      showToast(`Action ${currentActiveHitlRequest.id} executed successfully! ✓`);
      closeHitlModal();
      refreshTelemetryView();
    } catch (err) {
      showToast(`Execution error: ${err.message}`);
    }
  });

  // Toggle Audit Log
  els.btnToggleHitlAudit?.addEventListener('click', async () => {
    if (!els.hitlAuditList) return;
    const isHidden = els.hitlAuditList.classList.toggle('hidden');
    if (!isHidden) {
      const audit = await window.bestie.execution.getAuditLog(20);
      els.hitlAuditList.innerHTML = audit.map(a => `
        <div style="font-size: 11px; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.04); display: flex; justify-content: space-between; font-family: var(--font-mono);">
          <div>
            <span style="color: ${a.status === 'EXECUTED' ? 'var(--neon-green)' : '#ff1744'}; font-weight: 700;">[${a.status}]</span>
            <span style="color: var(--text-primary);">${a.actionType}</span> -> ${a.target}
          </div>
          <span style="color: var(--text-muted);">${new Date(a.resolvedAt || a.createdAt).toLocaleTimeString()}</span>
        </div>
      `).join('') || '<div style="color: var(--text-muted); padding: 8px;">No audit records.</div>';
    }
  });

  // Listen for real-time incoming HITL requests
  window.bestie.execution.onNewPending?.((newReq) => {
    refreshHitlBadge();
    showToast(`🛡️ Authorization Required: Outbound ${newReq.actionType}`);
    if (state.currentView === 'telemetry') {
      refreshTelemetryView();
    } else {
      openHitlModal(newReq);
    }
  });
}

// ============================================================
// BOOT
// ============================================================

document.addEventListener('DOMContentLoaded', init);

