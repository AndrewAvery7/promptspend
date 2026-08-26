export const HELP_CATEGORIES = [
  { id: 'start', label: 'Getting started', summary: 'Understand PromptSpend and create a first estimate.' },
  { id: 'home', label: 'Home', summary: 'Use the Cost Brief, presets, saved scenarios, and watchlist.' },
  { id: 'estimate', label: 'Estimate', summary: 'Describe one workload and understand every assumption.' },
  { id: 'compare', label: 'Compare', summary: 'Apply one workload to as many as four models.' },
  { id: 'data', label: 'Data & Alerts', summary: 'Inspect evidence and manage private pricing alerts.' },
  { id: 'learn', label: 'Learn', summary: 'Use the Token Lab and the seven cost lessons.' },
  {
    id: 'tools',
    label: 'Tools & appearance',
    summary: 'Use Search, Guide, themes, and accessibility features.',
  },
  {
    id: 'privacy',
    label: 'Privacy & accuracy',
    summary: 'Know what stays private and what estimates include.',
  },
  {
    id: 'troubleshooting',
    label: 'Troubleshooting',
    summary: 'Recover from catalog, alert, sharing, and display problems.',
  },
] as const;

export type HelpCategoryId = (typeof HELP_CATEGORIES)[number]['id'];
export type HelpDestination = 'home' | 'estimate' | 'compare' | 'data' | 'learn';

export interface HelpAction {
  destination: HelpDestination;
  label: string;
}

export interface HelpEntry {
  action?: HelpAction;
  answer: readonly string[];
  category: HelpCategoryId;
  id: string;
  keywords: readonly string[];
  question: string;
}

export const HELP_ENTRIES: readonly HelpEntry[] = [
  {
    id: 'start-app-purpose',
    category: 'start',
    question: 'What does PromptSpend calculate?',
    answer: [
      'PromptSpend estimates published LLM API usage costs. It combines one representative conversation with the number of turns, optional provider discounts, and your operating scale.',
      'It is a planning tool, not a provider invoice. Quality, latency, tool charges, regional premiums, taxes, negotiated discounts, and usage outside the workload you enter can change the final bill.',
    ],
    keywords: ['purpose', 'calculator', 'llm', 'api', 'cost', 'invoice', 'bill'],
    action: { destination: 'estimate', label: 'Create an estimate' },
  },
  {
    id: 'start-pages',
    category: 'start',
    question: 'What is the difference between Home, Estimate, and Compare?',
    answer: [
      'Home is your private Cost Brief: it summarizes the active scenario, saved work, followed models, and the strongest current savings opportunity.',
      'Estimate calculates one model in detail. Compare applies the same workload and assumptions to as many as four models so the price differences are fair.',
    ],
    keywords: ['home versus estimate', 'home vs estimate', 'compare', 'difference', 'pages', 'tabs'],
    action: { destination: 'home', label: 'Open Home' },
  },
  {
    id: 'start-first-estimate',
    category: 'start',
    question: 'How do I create my first estimate?',
    answer: [
      'Open Estimate and choose a model. Paste representative system, user, and response text, or switch each field to token entry. Then enter turns per conversation and your expected daily volume.',
      'PromptSpend updates the result as you change assumptions. Start with a typical workload rather than an extreme case, then use Sensitivity Lab to test what happens when usage grows.',
    ],
    keywords: ['first', 'begin', 'start', 'estimate', 'instructions', 'how to'],
    action: { destination: 'estimate', label: 'Open Estimate' },
  },
  {
    id: 'start-pricing-freshness',
    category: 'start',
    question: 'How current are the prices?',
    answer: [
      'The app validates the current PromptSpend pricing catalog when it opens and shows the latest successful source-check and price-change dates near the results.',
      'If the network is unavailable, a recently validated device cache may be used with a warning. Calculations are withheld when PromptSpend cannot establish a sufficiently current, valid catalog.',
    ],
    keywords: ['fresh', 'current', 'updated', 'pricing date', 'offline', 'cache', 'stale'],
    action: { destination: 'data', label: 'Inspect pricing health' },
  },
  {
    id: 'start-actual-bill',
    category: 'start',
    question: 'Why could my provider bill differ from the estimate?',
    answer: [
      'PromptSpend uses published standard-tier list prices and the workload you enter. Actual tokenization, retries, context growth, tool use, regional or priority premiums, taxes, and provider-specific rounding can change real usage.',
      'Negotiated enterprise discounts and charges that are not published as token rates are outside the estimate. Validate a representative production trace before making a purchasing decision.',
    ],
    keywords: ['actual bill', 'different', 'invoice', 'accuracy', 'tax', 'regional', 'tool fee'],
  },
  {
    id: 'start-account',
    category: 'start',
    question: 'Do I need a PromptSpend account?',
    answer: [
      'No. The app does not require a PromptSpend account. Your scenarios, watchlist, prompt-entry preferences, and appearance choices stay on your device.',
      'Email price alerts are optional and separately use the email address and preferences you provide to the alert service.',
    ],
    keywords: ['account', 'login', 'sign in', 'registration', 'local'],
  },
  {
    id: 'start-app-website',
    category: 'start',
    question: 'How does the app relate to promptspend.com?',
    answer: [
      'The native app and website use the same validated catalog and cost rules. The app adds device-local saved scenarios, a Cost Brief, native sharing, guided onboarding, and in-app alert management.',
      'Developer resources, public data feeds, privacy information, and support pages remain available on the PromptSpend websites.',
    ],
    keywords: ['website', 'mobile', 'same', 'promptspend.com', 'native'],
  },
  {
    id: 'home-overview',
    category: 'home',
    question: 'How do I use the Home Cost Brief?',
    answer: [
      'Home summarizes the scenario you are currently shaping. It shows the selected model, estimated monthly and per-conversation cost, operating metrics, and a direct path back to Estimate.',
      'Use Home to resume decisions, not to enter every assumption. Detailed workload editing remains on Estimate and Compare.',
    ],
    keywords: ['home', 'cost brief', 'dashboard', 'overview', 'active scenario'],
    action: { destination: 'home', label: 'Open Home' },
  },
  {
    id: 'home-active-scenario',
    category: 'home',
    question: 'What is the active scenario?',
    answer: [
      'The active scenario is the model and workload currently loaded into the estimator. Home reflects those live assumptions even before you save them.',
      'Selecting Open estimate takes you to the editable fields without creating a duplicate saved scenario.',
    ],
    keywords: ['active', 'scenario', 'current', 'open estimate'],
    action: { destination: 'estimate', label: 'Edit the active scenario' },
  },
  {
    id: 'home-presets',
    category: 'home',
    question: 'What do scenario presets change?',
    answer: [
      'Presets load a practical starting workload for common use cases. They replace the editable assumptions in the active scenario and then open Estimate.',
      'Review every value before relying on the result. A preset is a starting point, not a claim about your actual traffic or prompt size.',
    ],
    keywords: ['preset', 'template', 'support assistant', 'start fast', 'workload'],
    action: { destination: 'home', label: 'View presets' },
  },
  {
    id: 'home-save-scenario',
    category: 'home',
    question: 'How do I save a scenario?',
    answer: [
      'Use Save from the Estimate or Compare actions. Give the scenario a meaningful name so it is recognizable on Home.',
      'PromptSpend saves the selected models, derived token counts, scale, and cost assumptions. Raw pasted prompt text is deliberately not stored in the saved scenario.',
    ],
    keywords: ['save', 'scenario', 'name', 'stored', 'prompt text'],
    action: { destination: 'estimate', label: 'Open Estimate actions' },
  },
  {
    id: 'home-saved-actions',
    category: 'home',
    question: 'How do I restore, rename, duplicate, or delete saved work?',
    answer: [
      'Open Home and use the action control beside a saved scenario. Restore loads its assumptions, Rename changes only its label, and Duplicate creates an independent copy.',
      'Delete removes the local saved item. When an undo message is offered, use it before leaving the screen if the deletion was accidental.',
    ],
    keywords: ['restore', 'rename', 'duplicate', 'copy', 'delete', 'undo', 'saved'],
    action: { destination: 'home', label: 'Open saved scenarios' },
  },
  {
    id: 'home-watchlist',
    category: 'home',
    question: 'How do I follow or unfollow a model?',
    answer: [
      'Use the bookmark or watch action in model details, the catalog, or Search. Followed models appear on Home with their current rates and pricing status.',
      'Following a model is device-local. It does not create email alerts unless you separately configure Data & Alerts to watch selected models.',
    ],
    keywords: ['watch', 'follow', 'favorite', 'bookmark', 'watchlist', 'model'],
    action: { destination: 'home', label: 'View followed models' },
  },
  {
    id: 'home-savings',
    category: 'home',
    question: 'How is the savings opportunity chosen?',
    answer: [
      'PromptSpend evaluates the active workload against available cost levers, such as a less expensive model, shorter output, fewer turns, caching, or batch pricing where supported.',
      'A savings suggestion compares cost only. Validate quality, safety, latency, context handling, and tool support before changing a production model.',
    ],
    keywords: ['savings', 'opportunity', 'recommendation', 'cheaper', 'quality'],
    action: { destination: 'estimate', label: 'Open the Savings Playbook' },
  },
  {
    id: 'estimate-overview',
    category: 'estimate',
    question: 'How do I use the Estimate page?',
    answer: [
      'Estimate leads with the current answer, followed by the model and workload controls that produce it. Work from top to bottom: model, conversation content, turns and discounts, then operating scale.',
      'Expand calculation details to audit the token and rate components. Use Sensitivity Lab and the Savings Playbook after the baseline reflects a typical workload.',
    ],
    keywords: ['estimate page', 'overview', 'instructions', 'calculation'],
    action: { destination: 'estimate', label: 'Open Estimate' },
  },
  {
    id: 'estimate-model-country',
    category: 'estimate',
    question: 'How do I choose a model or filter by country?',
    answer: [
      'Open the model picker and search by model or provider. Country chips narrow the visible catalog to providers associated with the selected countries; selecting multiple countries broadens the matching set.',
      'A hidden current selection is preserved until you choose a replacement, so filtering does not silently change the estimate.',
    ],
    keywords: ['model picker', 'country', 'filter', 'provider', 'search', 'multiple'],
    action: { destination: 'estimate', label: 'Choose a model' },
  },
  {
    id: 'estimate-paste-tokens',
    category: 'estimate',
    question: 'Should I paste a prompt or enter token counts?',
    answer: [
      'Paste mode is easiest when you have representative text. PromptSpend estimates tokens locally for the selected model and updates while you type.',
      'Token mode is best when a provider usage report or production trace gives you measured counts. You can choose the mode independently for the system prompt, user message, and model response.',
    ],
    keywords: ['paste', 'prompt', 'token count', 'characters', 'input mode', 'measured'],
    action: { destination: 'estimate', label: 'Open workload inputs' },
  },
  {
    id: 'estimate-message-types',
    category: 'estimate',
    question: 'What belongs in system prompt, user message, and model response?',
    answer: [
      'System prompt is the instruction or context sent with each request. User message is one representative new request. Model response is the typical amount of generated output.',
      'Use representative production samples. Do not paste confidential or regulated information even though PromptSpend processes the text locally.',
    ],
    keywords: ['system prompt', 'user message', 'response', 'output', 'sample'],
  },
  {
    id: 'estimate-token-accuracy',
    category: 'estimate',
    question: 'How accurate are pasted-text token estimates?',
    answer: [
      'Token counts are calibrated estimates for the selected tokenizer family. Exact provider tokenizers and server-side message wrappers can produce different totals.',
      'For a final budget or procurement decision, replace estimates with measured usage from a representative provider request when possible.',
    ],
    keywords: ['tokenizer', 'accurate', 'approximately', 'estimate', 'measured usage'],
    action: { destination: 'learn', label: 'Try the Token Lab' },
  },
  {
    id: 'estimate-turns',
    category: 'estimate',
    question: 'Why do turns increase conversation cost?',
    answer: [
      'A turn is one back-and-forth exchange. In a continuing conversation, prior messages are commonly sent again as context, so input grows as the conversation progresses.',
      'Enter the typical complete conversation length, not the number of users or daily conversations. Those scale values are entered separately.',
    ],
    keywords: ['turns', 'conversation history', 'compound', 'back and forth', 'context'],
  },
  {
    id: 'estimate-cache',
    category: 'estimate',
    question: 'When should I enable prompt caching?',
    answer: [
      'Enable caching only when your provider and model support it and a meaningful portion of repeated input is eligible. The cache-hit share is the percentage of input expected to use the published cached-input rate.',
      'Caching is off by default. PromptSpend applies published cache write and read pricing where available; it does not assume every repeated token is automatically cached.',
    ],
    keywords: ['cache', 'cached input', 'hit rate', 'repeated prompt', 'write rate'],
  },
  {
    id: 'estimate-batch',
    category: 'estimate',
    question: 'What does batch pricing do?',
    answer: [
      'Batch pricing applies a provider’s published batch multiplier when the selected model supports it. Models without a published batch rate remain at their normal price.',
      'Use it only for asynchronous workloads that can tolerate the provider’s batch timing and operational constraints.',
    ],
    keywords: ['batch', 'discount', 'asynchronous', 'multiplier'],
  },
  {
    id: 'estimate-reasoning',
    category: 'estimate',
    question: 'What is the reasoning-token multiplier?',
    answer: [
      'The reasoning multiplier lets you model hidden or additional reasoning tokens billed at the output rate. Leave it at 1× unless provider usage reports show that your workload incurs additional billed reasoning.',
      'This is a workload assumption, not a model-quality score.',
    ],
    keywords: ['reasoning', 'hidden tokens', 'multiplier', 'thinking tokens'],
  },
  {
    id: 'estimate-scale',
    category: 'estimate',
    question: 'What should I enter for conversations per day?',
    answer: [
      'Enter the expected number of complete conversations processed during a typical day. A conversation may contain multiple turns; do not multiply the daily number by turns yourself.',
      'Use Sensitivity Lab to test a higher and lower volume rather than hiding uncertainty inside one number.',
    ],
    keywords: ['conversations per day', 'volume', 'scale', 'requests', 'daily'],
  },
  {
    id: 'estimate-users-revenue',
    category: 'estimate',
    question: 'How are monthly users and revenue used?',
    answer: [
      'Monthly active users divide the estimated monthly cost into a per-user figure. Revenue per user lets PromptSpend show cost as a share of monthly user revenue.',
      'These fields do not change the provider token bill itself; they add unit-economics context to the same workload.',
    ],
    keywords: ['monthly active users', 'mau', 'revenue', 'per user', 'unit economics'],
  },
  {
    id: 'estimate-results',
    category: 'estimate',
    question: 'How are per-conversation, daily, monthly, and annual costs related?',
    answer: [
      'Per-conversation cost is calculated from the selected model, tokens, turns, caching, batch, and reasoning assumptions. Daily cost multiplies that answer by conversations per day.',
      'Monthly and annual figures scale the daily workload using PromptSpend’s documented calendar assumptions. Expand the calculation to inspect the underlying input and output components.',
    ],
    keywords: ['per conversation', 'per day', 'per month', 'per year', 'annual', 'calculation'],
  },
  {
    id: 'estimate-sensitivity',
    category: 'estimate',
    question: 'How do I use Sensitivity Lab?',
    answer: [
      'Sensitivity Lab changes selected assumptions around the current baseline so you can see which variables have the greatest cost impact. Use presets or adjust the draft values without losing sight of the original case.',
      'Apply a preview only when you want those values to become the active scenario.',
    ],
    keywords: ['sensitivity', 'what if', 'growth', 'scenario', 'preview'],
    action: { destination: 'estimate', label: 'Open Sensitivity Lab' },
  },
  {
    id: 'estimate-playbook',
    category: 'estimate',
    question: 'How do I use the Savings Playbook?',
    answer: [
      'The Savings Playbook ranks practical levers using the active workload. Applying a lever updates the relevant model or assumption so you can inspect the complete revised estimate.',
      'Treat model-switch suggestions as cost leads, not automatic recommendations. Test production quality and operational requirements independently.',
    ],
    keywords: ['savings playbook', 'apply', 'lever', 'optimize', 'reduce cost'],
    action: { destination: 'estimate', label: 'Open the Savings Playbook' },
  },
  {
    id: 'estimate-save-share',
    category: 'estimate',
    question: 'How do I save, share, or export an estimate?',
    answer: [
      'Save keeps the scenario on this device. Share estimate opens the system share sheet with a privacy-safe summary. Cost Receipt creates a more detailed artifact that can be previewed and shared through installed apps.',
      'Raw pasted prompt text is excluded from shares and saved artifacts. Always review the preview before sending it.',
    ],
    keywords: ['save', 'share', 'email', 'messenger', 'export', 'receipt', 'pdf', 'csv'],
    action: { destination: 'estimate', label: 'Open Estimate actions' },
  },
  {
    id: 'compare-overview',
    category: 'compare',
    question: 'How do I compare models fairly?',
    answer: [
      'Choose two to four models and enter one representative workload. PromptSpend applies identical token, conversation, discount, and scale assumptions to every selected model.',
      'This isolates published price differences. It does not claim the models have equal quality, speed, safety, context handling, or tool support.',
    ],
    keywords: ['compare', 'fair', 'same workload', 'models', 'four'],
    action: { destination: 'compare', label: 'Open Compare' },
  },
  {
    id: 'compare-select',
    category: 'compare',
    question: 'How do I select up to four models?',
    answer: [
      'Open the comparison model picker, search or filter by country, and select the models you want. Selected models appear as removable chips above the picker.',
      'PromptSpend stops accepting additions at four so the results remain readable. Remove one model before choosing another.',
    ],
    keywords: ['select', 'add', 'remove', 'four models', 'model picker', 'chip'],
    action: { destination: 'compare', label: 'Choose comparison models' },
  },
  {
    id: 'compare-workload',
    category: 'compare',
    question: 'Does Compare use the same workload for every model?',
    answer: [
      'Yes. Token estimates may differ by tokenizer when you use pasted text, but the source text and every other assumption remain identical.',
      'When you enter measured token counts manually, those same counts are applied to every selected model.',
    ],
    keywords: ['same', 'identical', 'workload', 'tokenizer', 'fair comparison'],
  },
  {
    id: 'compare-ranking',
    category: 'compare',
    question: 'How do I read the comparison ranking and price difference?',
    answer: [
      'Results are ordered from the lowest to highest estimated monthly cost for the active workload. Each row shows its monthly estimate and how much more it costs than the lowest-priced result.',
      'The lowest label refers only to this workload and these published rates. Changing tokens, caching, batch availability, or scale can change the ranking.',
    ],
    keywords: ['ranking', 'lowest', 'delta', 'difference', 'cheapest', 'monthly'],
  },
  {
    id: 'compare-country',
    category: 'compare',
    question: 'How do country filters work in Compare?',
    answer: [
      'Country filters narrow the model picker and catalog to providers associated with the selected countries. You can select more than one country and combine the filter with text search.',
      'Existing selections remain selected even when temporarily hidden, preventing a filter change from silently changing the comparison.',
    ],
    keywords: ['country filter', 'compare', 'provider country', 'hidden selection'],
  },
  {
    id: 'compare-value-map',
    category: 'compare',
    question: 'What does the catalog Value Map show?',
    answer: [
      'The Value Map places models with available capability evidence against their blended token rate. It is a directional exploration tool, not a universal benchmark or purchasing recommendation.',
      'Models without sufficient scoring evidence remain available in the catalog list instead of receiving invented capability values.',
    ],
    keywords: ['value map', 'capability', 'blended rate', 'score', 'catalog'],
    action: { destination: 'compare', label: 'Open the catalog' },
  },
  {
    id: 'compare-quality',
    category: 'compare',
    question: 'Does the cheapest model automatically provide the best value?',
    answer: [
      'No. Price is one decision input. A lower-cost model may differ in response quality, latency, reliability, safety behavior, context limits, multimodal support, or tool use.',
      'Use PromptSpend to identify where the financial difference is material, then run a workload-specific evaluation before switching.',
    ],
    keywords: ['cheapest', 'best value', 'quality', 'benchmark', 'switch'],
  },
  {
    id: 'compare-share',
    category: 'compare',
    question: 'How do I share a model comparison?',
    answer: [
      'Select Share comparison to open the device share sheet. The summary includes selected models, the common workload, cost results, assumptions, and pricing verification context.',
      'Raw pasted text is excluded. Review the generated content before choosing Mail, Messages, Messenger, or another installed app.',
    ],
    keywords: ['share comparison', 'email', 'message', 'messenger', 'privacy'],
    action: { destination: 'compare', label: 'Open comparison results' },
  },
  {
    id: 'data-overview',
    category: 'data',
    question: 'What can I do in Data & Alerts?',
    answer: [
      'Data & Alerts combines in-app email alert management with catalog freshness, source provenance, flagged pricing disagreements, developer resources, privacy, and support.',
      'Use it when you need to verify why a price is trusted or follow future changes without repeatedly checking the estimator.',
    ],
    keywords: ['data and alerts', 'overview', 'evidence', 'provenance', 'alerts'],
    action: { destination: 'data', label: 'Open Data & Alerts' },
  },
  {
    id: 'data-pipeline',
    category: 'data',
    question: 'What does Pipeline health mean?',
    answer: [
      'Pipeline health shows when prices last changed, when sources were last checked successfully, the last synchronization outcome, and how many models are tracked.',
      'A degraded run publishes nothing. The app continues to display the last validated catalog with an explicit status rather than silently accepting suspicious data.',
    ],
    keywords: ['pipeline', 'health', 'sync', 'last run', 'degraded', 'models tracked'],
    action: { destination: 'data', label: 'View Pipeline health' },
  },
  {
    id: 'data-trust',
    category: 'data',
    question: 'How does the pricing trust ladder work?',
    answer: [
      'Hand-verified vendor pricing has the highest authority. The automated catalog is cross-checked with independent sources, and sanity gates reject suspicious schema, rate, source-size, daily-move, or catalog-shrink changes.',
      'A disagreement raises a visible review flag; it does not silently overwrite the primary price.',
    ],
    keywords: ['trust ladder', 'vendor', 'litellm', 'openrouter', 'sanity gate', 'source'],
    action: { destination: 'data', label: 'View the trust ladder' },
  },
  {
    id: 'data-flagged',
    category: 'data',
    question: 'What does “flagged for review” mean?',
    answer: [
      'A flagged model has a material disagreement or evidence concern between pricing sources. PromptSpend keeps the current primary-feed value visible while the conflict is reviewed.',
      'Open the flagged row for the review note and source context. Treat the estimate with additional caution until the evidence agrees.',
    ],
    keywords: ['flagged', 'review', 'disagreement', 'warning', 'price source'],
    action: { destination: 'data', label: 'View flagged models' },
  },
  {
    id: 'data-start-alerts',
    category: 'data',
    question: 'How do I create an email price alert?',
    answer: [
      'Open Data & Alerts, choose Start alerts, enter your email address, select a cadence and what to watch, then complete the secure anti-abuse check.',
      'PromptSpend sends a confirmation email. The subscription becomes active only after you confirm it, preventing someone else from subscribing your address.',
    ],
    keywords: ['create alert', 'start alerts', 'email', 'confirmation', 'subscribe'],
    action: { destination: 'data', label: 'Start email alerts' },
  },
  {
    id: 'data-alert-options',
    category: 'data',
    question: 'Which alert cadence and model scope should I choose?',
    answer: [
      'Weekly brief summarizes pricing activity on a regular schedule. As prices change is intended for more immediate price-change notifications.',
      'Every model follows the full catalog. Only selected models limits alerts to the models you choose; country filters help narrow that selection list.',
    ],
    keywords: ['weekly', 'instant', 'cadence', 'every model', 'selected models', 'scope'],
    action: { destination: 'data', label: 'Configure alert preferences' },
  },
  {
    id: 'data-manage-code',
    category: 'data',
    question: 'Why do I need a six-digit code to manage alerts?',
    answer: [
      'PromptSpend has no user accounts or passwords. The short-lived, one-time code sent to the subscribed email address proves that you control it before preferences are displayed or changed.',
      'Enter the complete code within its validity period. Request a new code if it expires or has already been used.',
    ],
    keywords: ['six digit', 'code', 'manage alerts', 'password', 'expires', 'one time'],
    action: { destination: 'data', label: 'Manage alerts' },
  },
  {
    id: 'data-update-stop',
    category: 'data',
    question: 'How do I update preferences or stop alerts?',
    answer: [
      'Choose Manage alerts, verify the subscribed address with its emailed code, change cadence or model scope, and save.',
      'Stop alerts and delete my address removes the subscription. Confirmed emails also include a one-click unsubscribe path.',
    ],
    keywords: ['update alert', 'unsubscribe', 'stop alerts', 'delete email', 'preferences'],
    action: { destination: 'data', label: 'Manage alerts' },
  },
  {
    id: 'data-native-push',
    category: 'data',
    question: 'Why are native push notifications not available yet?',
    answer: [
      'The current alert service supports verified email subscriptions. iOS and Android push notifications require separate APNs and FCM device tokens and delivery infrastructure.',
      'PromptSpend does not request notification permission until a complete, privacy-reviewed native push service exists.',
    ],
    keywords: ['push', 'notification', 'apns', 'fcm', 'permission', 'not available'],
  },
  {
    id: 'data-integrations',
    category: 'data',
    question: 'Where can I use PromptSpend outside the app?',
    answer: [
      'Data & Alerts links to the public pricing API and developer hub, MCP server, VS Code Marketplace extension, Open VSX extension, public catalog feed, and source repository.',
      'These tools use the same public pricing ecosystem but have their own installation and operating instructions.',
    ],
    keywords: ['api', 'mcp', 'vscode', 'cursor', 'windsurf', 'open vsx', 'feed', 'integration'],
    action: { destination: 'data', label: 'View integrations' },
  },
  {
    id: 'data-missing-model',
    category: 'data',
    question: 'How do I request a missing model or report pricing evidence?',
    answer: [
      'Use Request a missing model in Data & Alerts to open the structured public request form. Include the official model name and a first-party pricing source when possible.',
      'Do not include credentials, private contracts, customer data, or proprietary prompts in a public issue.',
    ],
    keywords: ['missing model', 'request', 'incorrect price', 'github issue', 'evidence'],
    action: { destination: 'data', label: 'Open support options' },
  },
  {
    id: 'learn-overview',
    category: 'learn',
    question: 'What is the Learn page for?',
    answer: [
      'Learn contains this Help Center, an interactive Token Lab, and seven short lessons about the mechanics that move AI cost.',
      'Use Help & FAQs for operating instructions. Use the lessons when you want to understand why tokens, turns, caching, output, and scale change the estimate.',
    ],
    keywords: ['learn', 'lessons', 'help center', 'faq', 'education'],
    action: { destination: 'learn', label: 'Open Learn' },
  },
  {
    id: 'learn-token-lab',
    category: 'learn',
    question: 'How do I use the Token Lab?',
    answer: [
      'Paste a representative text sample into the Token Lab. It shows approximate counts for several tokenizer families so you can see why the same text does not have one universal token count.',
      'The sample is processed on the device and is not saved, logged, shared, or uploaded.',
    ],
    keywords: ['token lab', 'paste', 'tokenizer', 'same text', 'private'],
    action: { destination: 'learn', label: 'Open the Token Lab' },
  },
  {
    id: 'learn-lessons',
    category: 'learn',
    question: 'How do the seven lessons work?',
    answer: [
      'Each lesson introduces one cost concept, a number that demonstrates it, and a practical action. Tap a lesson to expand it and tap again to collapse it.',
      'The lessons are bundled with the app and remain available without a network connection.',
    ],
    keywords: ['seven lessons', 'expand', 'collapse', 'offline', 'course'],
    action: { destination: 'learn', label: 'Browse the lessons' },
  },
  {
    id: 'tools-search',
    category: 'tools',
    question: 'What can Search do?',
    answer: [
      'Search can jump to top-level pages, open Help answers, select a model for Estimate, add or remove comparison models, follow or unfollow models, reset the scenario, and change appearance settings.',
      'Type a model, provider, feature, or natural question. If nothing matches, PromptSpend suggests broader help terms instead of leaving a blank result.',
    ],
    keywords: ['search', 'command', 'model', 'natural question', 'no results'],
  },
  {
    id: 'tools-guide',
    category: 'tools',
    question: 'What is the Guided Tour for?',
    answer: [
      'The Guided Tour is a six-step orientation that moves through Home, Estimate, Compare, Learn, Data & Alerts, and the global tools while highlighting the relevant content.',
      'It is always replayable. Use this Help Center for detailed reference after the overview.',
    ],
    keywords: ['guide', 'guided tour', 'six steps', 'replay', 'highlight'],
  },
  {
    id: 'tools-appearance',
    category: 'tools',
    question: 'How do I change light mode, dark mode, or colors?',
    answer: [
      'Choose Color in the app header. Interface can follow the system or stay light or dark. Accent changes interactive emphasis, while Canvas changes the neutral background character.',
      'Appearance choices are stored only on this device. Savings, warnings, and errors retain their semantic colors so meaning is never changed by the accent.',
    ],
    keywords: ['color', 'dark mode', 'light mode', 'system', 'accent', 'canvas', 'theme'],
  },
  {
    id: 'tools-accessibility',
    category: 'tools',
    question: 'Which accessibility features does PromptSpend support?',
    answer: [
      'The app provides labeled controls, meaningful reading order, text alternatives for status, large touch targets, Dynamic Type support, and reduced-motion behavior. It is designed for VoiceOver and TalkBack navigation.',
      'Pricing status, savings, warnings, and selections use text or icons in addition to color. Report any clipped, unreachable, or unlabeled control through support.',
    ],
    keywords: ['accessibility', 'voiceover', 'talkback', 'large text', 'dynamic type', 'reduce motion'],
    action: { destination: 'data', label: 'Open support options' },
  },
  {
    id: 'tools-device-storage',
    category: 'tools',
    question: 'Which preferences are stored on my device?',
    answer: [
      'Saved scenarios, model watchlist, the active workload, onboarding status, and appearance choices are stored locally so the app can resume your work.',
      'Raw pasted prompt text is not persisted. Removing the app or clearing its storage can remove device-local work.',
    ],
    keywords: ['stored', 'device', 'preferences', 'local', 'uninstall', 'clear storage'],
  },
  {
    id: 'privacy-prompts',
    category: 'privacy',
    question: 'Does PromptSpend upload or save pasted prompts?',
    answer: [
      'No. Pasted text is token-estimated on the device and is not sent to PromptSpend, saved in scenarios, included in shared results, or written to analytics.',
      'The app has no advertising SDK or cross-app tracking. You should still avoid pasting secrets or regulated information into any planning tool.',
    ],
    keywords: ['privacy', 'prompt', 'upload', 'save', 'analytics', 'tracking', 'secret'],
  },
  {
    id: 'privacy-alert-data',
    category: 'privacy',
    question: 'What information is stored for email alerts?',
    answer: [
      'The alert service stores the email address, selected model IDs, cadence, scope, and consent date needed to operate the subscription.',
      'It does not need your name or prompt text. You can verify the address, change preferences, or stop alerts and delete the address from Data & Alerts.',
    ],
    keywords: ['email data', 'stored', 'alert privacy', 'consent', 'delete address'],
    action: { destination: 'data', label: 'Manage alert privacy' },
  },
  {
    id: 'privacy-price-scope',
    category: 'privacy',
    question: 'Which pricing is included and excluded?',
    answer: [
      'PromptSpend focuses on published standard-tier global list prices in USD for the token categories represented in the catalog.',
      'Regional premiums, priority tiers, server-side tool fees, taxes, credits, minimum commitments, negotiated discounts, and unlisted contract terms are outside the estimate unless explicitly represented by a visible assumption.',
    ],
    keywords: ['scope', 'excluded', 'regional', 'priority', 'tool fee', 'discount', 'tax', 'usd'],
    action: { destination: 'data', label: 'Inspect pricing scope' },
  },
  {
    id: 'privacy-source-disagreement',
    category: 'privacy',
    question: 'What should I do if I believe a price is wrong?',
    answer: [
      'Check the model’s verification date, vendor URL, and any review flag in Data & Alerts. Confirm that you are comparing the same model, tier, region, and token category.',
      'If the evidence is still wrong, submit the official source through the missing-model or support path. PromptSpend does not accept an unverified price silently.',
    ],
    keywords: ['wrong price', 'incorrect', 'report', 'source', 'verification'],
    action: { destination: 'data', label: 'Inspect and report evidence' },
  },
  {
    id: 'troubleshooting-catalog',
    category: 'troubleshooting',
    question: 'Why are calculations paused or marked offline?',
    answer: [
      'PromptSpend pauses calculations when it cannot validate a current catalog. Check the device connection and use the refresh action.',
      'A recent validated device cache may be used temporarily with a visible warning. The app does not substitute an unvalidated bundled rate table when freshness cannot be established.',
    ],
    keywords: ['paused', 'offline', 'catalog', 'network', 'refresh', 'stale'],
    action: { destination: 'estimate', label: 'Return to Estimate' },
  },
  {
    id: 'troubleshooting-model',
    category: 'troubleshooting',
    question: 'Why can’t I find a model?',
    answer: [
      'Clear the text and country filters, then search by provider or a shorter portion of the model name. In the catalog, enable legacy models if the model is deprecated or no longer listed.',
      'If it is still missing, use Request a missing model in Data & Alerts and include an official pricing source.',
    ],
    keywords: ['cannot find model', 'missing', 'filter', 'legacy', 'deprecated', 'search'],
    action: { destination: 'data', label: 'Request a missing model' },
  },
  {
    id: 'troubleshooting-email-code',
    category: 'troubleshooting',
    question: 'What should I do if the alert-management code does not arrive?',
    answer: [
      'Confirm the spelling of the subscribed address and check spam or junk folders. Wait briefly before requesting another code; only the latest valid code should be used.',
      'For privacy, the app gives the same response whether or not an address has an active subscription. Contact support if delivery repeatedly fails.',
    ],
    keywords: ['code not arrive', 'email missing', 'spam', 'junk', 'manage alerts'],
    action: { destination: 'data', label: 'Retry alert management' },
  },
  {
    id: 'troubleshooting-share',
    category: 'troubleshooting',
    question: 'Why is sharing or file export unavailable?',
    answer: [
      'The installed iOS and Android apps use the device share sheet. Available destinations depend on installed apps and device policy. Some file export behavior is not available in the web preview.',
      'If the share sheet does not open, close and reopen PromptSpend, confirm the target app is installed, and try a text share before a file export.',
    ],
    keywords: ['share unavailable', 'export', 'file', 'web preview', 'installed app'],
  },
  {
    id: 'troubleshooting-saved',
    category: 'troubleshooting',
    question: 'Why is saved work missing?',
    answer: [
      'Saved scenarios and the watchlist are local to the device and app installation. They do not automatically synchronize between iPhone, iPad, and Android.',
      'Reinstalling the app, clearing storage, or using a different device can remove or hide local work. Save or share an export before destructive device maintenance.',
    ],
    keywords: ['saved missing', 'sync', 'different device', 'reinstall', 'clear storage'],
    action: { destination: 'home', label: 'Check saved scenarios' },
  },
  {
    id: 'troubleshooting-display',
    category: 'troubleshooting',
    question: 'What should I do if text or controls are clipped?',
    answer: [
      'Record the device model, operating-system version, text-size or screen-zoom setting, orientation, app build number, and the page where the problem occurs. Include a screenshot that does not expose private information.',
      'Try rotating back to portrait and returning to the page. Do not permanently reduce accessibility text size as a workaround; report the layout problem through support.',
    ],
    keywords: ['clipped', 'cut off', 'display', 'layout', 'screen zoom', 'large text', 'orientation'],
    action: { destination: 'data', label: 'Open support options' },
  },
  {
    id: 'troubleshooting-support',
    category: 'troubleshooting',
    question: 'How do I contact PromptSpend support?',
    answer: [
      'Open Data & Alerts and use the support or email actions. Include the device, operating-system version, app build, steps to reproduce, expected result, actual result, and a privacy-safe screenshot.',
      'Never send passwords, verification codes, API keys, confidential prompts, or account documents in a support request.',
    ],
    keywords: ['support', 'contact', 'email', 'bug report', 'qa'],
    action: { destination: 'data', label: 'Open support options' },
  },
] as const;

export const DEFAULT_HELP_ENTRY_ID = 'start-first-estimate';

const HELP_SEARCH_STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'can',
  'do',
  'does',
  'for',
  'help',
  'how',
  'i',
  'in',
  'is',
  'it',
  'me',
  'my',
  'no',
  'of',
  'on',
  'or',
  'such',
  'the',
  'to',
  'what',
  'when',
  'where',
  'which',
  'why',
  'with',
]);

export function findHelpEntry(id: string | undefined): HelpEntry | undefined {
  if (!id) return undefined;
  return HELP_ENTRIES.find((entry) => entry.id === id);
}

export function searchHelpEntries(query: string, category: HelpCategoryId | 'all' = 'all'): HelpEntry[] {
  const candidates = HELP_ENTRIES.filter((entry) => category === 'all' || entry.category === category);
  const normalized = normalize(query);
  if (!normalized) return [...candidates];
  const terms = normalized.split(' ').filter((term) => term.length > 1 && !HELP_SEARCH_STOP_WORDS.has(term));
  if (terms.length === 0) return [];
  return candidates
    .map((entry) => ({ entry, score: helpScore(entry, normalized, terms) }))
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.question.localeCompare(b.entry.question))
    .map((result) => result.entry);
}

export function helpSearchText(entry: HelpEntry): string {
  return [entry.question, ...entry.answer, ...entry.keywords].join(' ');
}

function helpScore(entry: HelpEntry, query: string, terms: readonly string[]): number {
  const question = normalize(entry.question);
  const keywords = normalize(entry.keywords.join(' '));
  const answer = normalize(entry.answer.join(' '));
  let score = 0;
  if (question === query) score += 200;
  if (question.startsWith(query)) score += 100;
  if (question.includes(query)) score += 70;
  if (keywords.includes(query)) score += 55;
  if (answer.includes(query)) score += 20;
  for (const term of terms) {
    if (question.includes(term)) score += 12;
    if (keywords.includes(term)) score += 8;
    if (answer.includes(term)) score += 2;
  }
  if (terms.length > 1 && terms.every((term) => `${question} ${keywords} ${answer}`.includes(term))) {
    score += 30;
  }
  return score;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
