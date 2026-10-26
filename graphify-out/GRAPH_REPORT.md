# Graph Report - Zeus Chrome Extension  (2026-10-26)

## Corpus Check
- 232 files · ~304,105 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 59 file(s) not represented in the graph (top: .csv 53, .css 3, (none) 2)

## Summary
- 2311 nodes · 3902 edges · 176 communities (137 shown, 39 thin omitted)
- Extraction: 90% EXTRACTED · 10% INFERRED · 0% AMBIGUOUS · INFERRED: 404 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- shadcn Component Integration
- BM25 Search Retrieval Engine
- Core Data Quality & A11y
- Design Token Color Palette
- Banner Design & Sizing
- Design System Palette Derivation
- BM25 Search Retrieval Engine
- Design Token Typography & Spacing
- Extension Manifest & Permissions
- Search Relevance Evaluation
- Vector Graphic Generation Engine
- Extension Options Page
- Sidepanel UI & Template Editor
- Keyboard Shortcuts Engine
- Command Palette UI Tests
- shadcn Component Integration
- Brand Voice & Visual Identity
- Extension Popup Interface
- Extension Build & Packaging
- DOM Content Script Injection
- AI Model Providers & Routing
- Style Taxonomy Test Suite
- Commandpalette Module
- BM25 Search Retrieval Engine
- BM25 Search Retrieval Engine
- Injector Module
- Brand Voice & Visual Identity
- Brand Voice & Visual Identity
- Generate Slide Module
- Tailwind Config Gen Test Suite
- Keyboard Shortcuts Engine
- Chrome Module
- Design Token Typography & Spacing
- AI Model Providers & Routing
- Package Module
- Copywriting Formulas Module
- Design Token Typography & Spacing
- AI Model Providers & Routing
- Qualityscore Module
- Brand Voice & Visual Identity
- Brand Voice & Visual Identity
- PRD Specifications & Ralph Agent
- Design System Palette Derivation
- Catalog Refresh Test Suite
- Domutils Module
- Promptlibrary Module
- Messagehandler Module
- Transform Shortcut Test Module
- Brand Voice & Visual Identity
- Tailwind Config Gen Test Suite
- Web Stack Freshness Test Suite
- Privacy Module
- AI Model Providers & Routing
- Keyboard Shortcuts Engine
- Design Token Typography & Spacing
- Tailwind Config Gen Test Suite
- Core Test Suite
- Core Test Suite
- Data Contracts Test Suite
- Copilot Module
- Telemetry Module
- Brand Voice & Visual Identity
- Settings And Messaging Smoke Module
- Slides Copywriting Formulas Module
- Render Module
- Token Validation Test Suite
- Design Token Typography & Spacing
- Design System Palette Derivation
- Text Layout Resilience Test Suite
- Usefloatingposition Module
- Zip Extension Module
- AI Model Providers & Routing
- Brand Voice & Visual Identity
- Banner Design & Sizing
- Token Architecture Module
- Embed Tokens Module
- Design Token Typography & Spacing
- BM25 Search Retrieval Engine
- Native Desktop Stack Test Suite
- Workflows Module
- AI Model Providers & Routing
- Contributing Module
- Cip Deliverable Guide Module
- Generate Tokens Module
- Design Token Typography & Spacing
- shadcn Component Integration
- Reasoning Contract Module
- Ghosttext Module
- Check Syntax Module
- Logo Style Guide Module
- BM25 Search Retrieval Engine
- AI Model Providers & Routing
- AI Model Providers & Routing
- Chatgpt Module
- Grok Module
- Logo Color Psychology Module
- Slides Template Module
- Search Module
- Design Token Typography & Spacing
- Design Token Typography & Spacing
- shadcn Component Integration
- Design System Palette Derivation
- PRD Specifications & Ralph Agent
- Claude Module
- Deepseek Module
- Gemini Module
- Generic Module
- Openrouter Module
- Cip Prompt Engineering Module
- Search Module
- States And Variants Module
- shadcn Component Integration
- Design System Mode Test Suite
- Search Relevance Evaluation
- Presets Module
- AI Model Providers & Routing
- AI Model Providers & Routing
- Canvas Design System Module
- Design Token Typography & Spacing
- BM25 Search Retrieval Engine
- Core Test Suite
- Data Contracts Test Suite
- Multimodal Module
- Prompts Module
- Keyboard Shortcuts Engine
- Extension Options Page
- Package Module
- AI Model Providers & Routing
- AI Model Providers & Routing
- Keyboard Shortcuts Engine
- Skill Module
- PRD Specifications & Ralph Agent
- Icon Design Module
- Social Photos Design Module
- Design Token Typography & Spacing
- Design Token Typography & Spacing
- Design Token Typography & Spacing
- Tailwind Utilities Module
- BM25 Search Retrieval Engine
- Observer Module
- Extension Popup Interface
- AI Model Providers & Routing
- Sidepanel UI & Template Editor
- Chatgpt Module
- Design Token Typography & Spacing
- Design Token Typography & Spacing
- Design Token Typography & Spacing
- Design Token Typography & Spacing
- Search Relevance Evaluation
- Retry Module
- Context Aware Test Module
- Content Dom Test Module
- Harness Module
- Design Token Typography & Spacing
- Design Token Typography & Spacing
- Design Token Typography & Spacing
- Design Token Typography & Spacing
- Design Token Typography & Spacing
- Design Token Typography & Spacing
- Tailwind Responsive Module
- AI Model Providers & Routing
- AI Model Providers & Routing
- Multimodal Test Module
- Prompts Test Module
- Retry Test Module
- Router Test Module
- PRD Specifications & Ralph Agent

## God Nodes (most connected - your core abstractions)
1. `TailwindConfigGenerator` - 58 edges
2. `TestTailwindConfigGenerator` - 35 edges
3. `DesignSystemGenerator` - 35 edges
4. `ShadcnInstaller` - 34 edges
5. `loadScript()` - 29 edges
6. `clearZeusGlobals()` - 27 edges
7. `TestShadcnInstaller` - 26 edges
8. `create()` - 18 edges
9. `read_rows()` - 16 edges
10. `color` - 15 edges

## Surprising Connections (you probably didn't know these)
- `Overnight Feature Pipeline` --references--> `Zeus Extension Architecture`  [INFERRED]
  .agents/workflows/overnight-features.md → README.md
- `Autonomous Plan-Implement-Test-Verify Loop` --semantically_similar_to--> `Ralph Autonomous Agent Instructions`  [INFERRED] [semantically similar]
  .agents/workflows/overnight-features.md → scripts/ralph/CLAUDE.md
- `Autonomous Plan-Implement-Test-Verify Loop` --semantically_similar_to--> `Ralph Autonomous Agent Prompt Template`  [INFERRED] [semantically similar]
  .agents/workflows/overnight-features.md → scripts/ralph/prompt.md
- `Starter Brand Colors and Typography Configuration` --shares_data_with--> `extractColorsFromMarkdown()`  [INFERRED]
  .agents/skills/brand/templates/brand-guidelines-starter.md → .agents/skills/brand/scripts/sync-brand-to-tokens.cjs
- `Modular Type Scale Ratio System` --semantically_similar_to--> `Primitive Design Tokens Foundation Layer`  [INFERRED] [semantically similar]
  .agents/skills/brand/references/typography-specifications.md → .agents/skills/design-system/references/primitive-tokens.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Three-Layer Design Token Hierarchy** — agents_skills_design_system_references_primitive_tokens_primitive_token_layer, agents_skills_design_system_references_semantic_tokens_semantic_token_layer, agents_skills_design_system_references_component_tokens_component_tokens_layer [EXTRACTED 1.00]
- **Brand Guidelines to Design Tokens Sync Pipeline** — agents_skills_brand_skill_brand_sync_workflow, agents_skills_brand_references_update_update_workflow, agents_skills_design_system_skill_three_layer_token_architecture [INFERRED 0.95]
- **Multi-Format Creative Banner Generation Stack** — agents_skills_banner_design_skill_workflow, agents_skills_banner_design_references_banner_sizes_and_styles_art_direction_styles, agents_skills_brand_references_visual_identity_visual_identity_basics [INFERRED 0.85]
- **Three-Tier Design Token & Styling Pipeline** — agents_skills_design_system_references_token_architecture_three_layer_token_system, agents_skills_design_system_references_tailwind_integration_css_variables_setup, agents_skills_design_system_references_states_and_variants_variant_patterns [EXTRACTED 1.00]
- **Full Brand Package Lifecycle Pipeline** — agents_skills_design_references_logo_design_logo_generation_workflow, agents_skills_design_references_cip_design_cip_scripts_workflow, agents_skills_design_references_slides_strategic_slide_workflow, agents_skills_design_skill_brand_package_workflow [EXTRACTED 1.00]
- **Strategic Presentation Synthesis Framework** — agents_skills_design_references_slides_strategies_deck_structures_15, agents_skills_design_references_slides_copywriting_formulas_persuasive_copywriting_formulas, agents_skills_design_references_slides_layout_patterns_slide_layouts_25, agents_skills_design_references_slides_html_template_responsive_slide_deck_structure [EXTRACTED 1.00]
- **UI Styling Three-Layer Architecture Stack** — agents_skills_ui_styling_skill_shadcn_layer, agents_skills_ui_styling_skill_tailwind_layer, agents_skills_ui_styling_skill_canvas_layer [EXTRACTED 1.00]
- **Autonomous PRD-to-Execution Pipeline** — agents_skills_prd_skill_user_story_format, agents_skills_ralph_skill_single_iteration_rule, agents_skills_ralph_skill_prd_json_schema, agents_skills_run_tests_skill_npm_test [INFERRED 0.85]
- **Strategic Presentation Design and Delivery Framework** — agents_skills_slides_references_slide_strategies_proven_structures, agents_skills_slides_references_copywriting_formulas_core_formulas, agents_skills_slides_references_layout_patterns_decision_flow, agents_skills_slides_references_html_template_deck_container [INFERRED 0.85]
- **Multi-Surface Transforms Management & Synchronization** — options_transforms_hud, popup_transforms_card, sidepanel_transforms_tab, docs_product_transforms_redesign_prd_prd [INFERRED 0.95]
- **Site Adapter Mock DOM Verification Harnesses** — tests_harness_chatgpt_harness, tests_harness_claude_harness, tests_harness_deepseek_harness, tests_harness_generic_harness, tests_harness_grok_harness [EXTRACTED 1.00]
- **Autonomous Plan-Implement-Test Agent Workflows** — scripts_ralph_claude_instructions, scripts_ralph_prompt_instructions, _agents_workflows_overnight_features_autonomous_loop [INFERRED 0.85]
- **Chrome Extension Action Icon Multi-Resolution Suite (16px, 32px, 48px, 128px)** — icons_zeus_16_icon, icons_zeus_32_icon, icons_zeus_48_icon, icons_zeus_128_icon [INFERRED 0.95]
- **Zeus Olympian Deity Illustration Icon Suite (16px, 48px, 128px)** — icons_icon16_avatar, icons_icon48_avatar, icons_icon128_avatar [INFERRED 0.95]
- **Zeus Brand Lightning & Thunderbolt Design System** — icons_zeus_128_hex_badge_identity, icons_lightning_flash_svgrepo_com_energy_glyph, icons_zeus_dual_bolt_motif, icons_icon128_mythological_branding [INFERRED 0.85]

## Communities (176 total, 39 thin omitted)

### Community 0 - "shadcn Component Integration"
Cohesion: 0.05
Nodes (3): main(), ShadcnInstaller, TestShadcnInstaller

### Community 1 - "BM25 Search Retrieval Engine"
Cohesion: 0.06
Nodes (31): BM25, _contains_phrase(), detect_domain(), _domain_keywords(), _exact_match_diagnostic(), _exact_row_identity(), _exact_stack_identifier(), _file_signature() (+23 more)

### Community 2 - "Core Data Quality & A11y"
Cohesion: 0.07
Nodes (43): read_rows(), TestAccessibilityGuidance, TestChartsTypographyAndIcons, TestCurrentReactGuidance, TestSemanticColors, _catalog_date(), _check_app_interface_contract(), _check_catalog_contract() (+35 more)

### Community 3 - "Design Token Color Palette"
Cohesion: 0.05
Nodes (53): $type, $value, $type, $value, $type, $value, $type, $value (+45 more)

### Community 4 - "Banner Design & Sizing"
Cohesion: 0.05
Nodes (42): Banner Sizes and Art Direction Styles Reference, Banner Art Direction Aesthetic Styles, Multi-Platform Banner Dimensions, Banner Design Skill, Banner Visual AI Model Selection Strategy, Multi-Format Creative Banner Generation Workflow, Asset Approval Checklist, Marketing Asset Approval Verification Gates (+34 more)

### Community 5 - "Design System Palette Derivation"
Cohesion: 0.07
Nodes (17): ansi_ljust(), _contrast_ratio(), _derive_dark_palette(), _detect_page_type(), format_ascii_box(), format_master_md(), format_page_override_md(), _generate_intelligent_overrides() (+9 more)

### Community 6 - "BM25 Search Retrieval Engine"
Cohesion: 0.08
Nodes (17): format_context(), format_result(), main(), BM25, calculate_pattern_break(), detect_domain(), get_background_config(), get_color_for_emotion() (+9 more)

### Community 7 - "Design Token Typography & Spacing"
Cohesion: 0.06
Nodes (34): $type, $value, $type, $value, $type, $value, $type, $value (+26 more)

### Community 8 - "Extension Manifest & Permissions"
Cohesion: 0.06
Nodes (33): action, default_icon, default_popup, background, service_worker, commands, open-side-panel, content_scripts (+25 more)

### Community 9 - "Search Relevance Evaluation"
Cohesion: 0.07
Nodes (6): format_markdown(), generate_design_system(), _write_persisted_file(), TestDiagnosticsContracts, TestPersistence, TestMetricMath

### Community 10 - "Vector Graphic Generation Engine"
Cohesion: 0.10
Nodes (13): apply_color(), apply_viewbox_size(), extract_svgs(), generate_batch(), generate_icon(), generate_sizes(), load_env(), main() (+5 more)

### Community 11 - "Extension Options Page"
Cohesion: 0.13
Nodes (26): applyModelSearchFilter(), applySettingsToUI(), createModelOptionButton(), formatModelOptionLabel(), loadAbExperiments(), loadOptionsTransforms(), loadPrivacyStats(), loadSettings() (+18 more)

### Community 12 - "Sidepanel UI & Template Editor"
Cohesion: 0.14
Nodes (28): cancelTemplateEdit(), checkInputPII(), diffWords(), escapeHtml(), executeTemplate(), initCommandPalette(), injectPromptToEditor(), loadHistory() (+20 more)

### Community 13 - "Keyboard Shortcuts Engine"
Cohesion: 0.15
Nodes (30): canonicalizeCombo(), comboFromEvent(), comboFromParts(), createRecorder(), beginCapture(), endCapture(), onBlur(), onClick() (+22 more)

### Community 14 - "Command Palette UI Tests"
Cohesion: 0.09
Nodes (14): { loadScript, clearZeusGlobals }, { loadScript, clearZeusGlobals }, { loadScript, clearZeusGlobals }, { loadScript, clearZeusGlobals }, { loadScript, clearZeusGlobals }, { loadScript, clearZeusGlobals }, { loadScript, clearZeusGlobals }, { loadScript, clearZeusGlobals } (+6 more)

### Community 15 - "shadcn Component Integration"
Cohesion: 0.13
Nodes (5): test_sync_parses_bundled_starter_template(), main(), _run(), test_flags_hardcoded_hex_sharing_line_with_token(), test_token_only_line_reports_no_violation()

### Community 16 - "Brand Voice & Visual Identity"
Cohesion: 0.13
Nodes (12): get_context(), is_allowed_exception(), is_allowed_rgba(), is_inside_block(), load_css_variables(), main(), print_result(), print_summary() (+4 more)

### Community 17 - "Extension Popup Interface"
Cohesion: 0.15
Nodes (25): applyDarkMode(), applyModelSearchFilter(), applySettingsToUI(), createModelOptionButton(), formatModelOptionLabel(), initializeDarkMode(), loadSettings(), loadTransforms() (+17 more)

### Community 18 - "Extension Build & Packaging"
Cohesion: 0.15
Nodes (24): blockedDirectoryNames, blockedFileSuffixes, buildExtension(), copyDirectoryRecursive(), copyFile(), distDir, emittedFiles, extensionDir (+16 more)

### Community 19 - "DOM Content Script Injection"
Cohesion: 0.21
Nodes (23): applyTransformShortcut(), collectInputs(), dedupeElements(), fetchSettingsIfNeeded(), fetchTransformsIfNeeded(), handleEnhanceClickForInput(), initialize(), invalidateTransforms() (+15 more)

### Community 20 - "AI Model Providers & Routing"
Cohesion: 0.16
Nodes (22): Zeus Code Review Skill, Zeus Code Review Four Pillars, getDefaultModel(), getFallbackModels(), getGroupedModels(), getModel(), getProviderConfig(), getProviderHelper() (+14 more)

### Community 21 - "Style Taxonomy Test Suite"
Cohesion: 0.10
Nodes (6): _query_wants_dark(), _resolve_color_mode(), _style_is_dark_primary(), TestModeResolution, read_rows(), TestStyleTaxonomy

### Community 22 - "Commandpalette Module"
Cohesion: 0.15
Nodes (14): CommandRegistry, createPalette(), buildDOM(), close(), executeCurrent(), handleKeydown(), open(), render() (+6 more)

### Community 23 - "BM25 Search Retrieval Engine"
Cohesion: 0.12
Nodes (6): detect_domain(), get_cip_brief(), _load_csv(), search(), search_all(), _search_csv()

### Community 24 - "BM25 Search Retrieval Engine"
Cohesion: 0.12
Nodes (6): BM25, detect_domain(), _load_csv(), search(), search_all(), _search_csv()

### Community 25 - "Injector Module"
Cohesion: 0.22
Nodes (19): create(), ensureButton(), ensureFloatingController(), inject(), mountForInput(), pickBestInput(), refresh(), registerInput() (+11 more)

### Community 26 - "Brand Voice & Visual Identity"
Cohesion: 0.14
Nodes (8): build_cip_prompt(), check_logo_required(), generate_cip_set(), generate_with_nano_banana(), load_env(), load_logo_image(), main(), main()

### Community 27 - "Brand Voice & Visual Identity"
Cohesion: 0.15
Nodes (10): generate_css_for_background(), get_background_image(), get_curated_images(), get_overlay_css(), get_pexels_search_url(), load_backgrounds_config(), load_brand_colors(), main() (+2 more)

### Community 28 - "Generate Slide Module"
Cohesion: 0.13
Nodes (10): _e(), generate_chart_slide(), generate_cta_slide(), generate_deck(), generate_metrics_slide(), generate_problem_slide(), generate_solution_slide(), generate_testimonial_slide() (+2 more)

### Community 30 - "Keyboard Shortcuts Engine"
Cohesion: 0.23
Nodes (17): createDefaultTransforms(), createTransformId(), dedupeShortcuts(), extractTemplateVariables(), findUnresolvedVariables(), getStorageSync(), getTransformById(), isLegacyTemplateRecord() (+9 more)

### Community 31 - "Chrome Module"
Cohesion: 0.15
Nodes (13): clone(), createChromeMock(), createEvent(), createPort(), createStorageArea(), applyGet(), DEEP_CLONE_FALLBACK(), { createChromeMock } (+5 more)

### Community 32 - "Design Token Typography & Spacing"
Cohesion: 0.11
Nodes (19): $type, $value, background, foreground, muted-foreground, primary, primary-hover, secondary (+11 more)

### Community 33 - "AI Model Providers & Routing"
Cohesion: 0.22
Nodes (15): analyzePrompt(), autoRouteForIntent(), buildAutoRouteCandidates(), buildSmartRouteCandidates(), callProvider(), detectPromptIntent(), enhancePrompt(), enhanceWithAuto() (+7 more)

### Community 34 - "Package Module"
Cohesion: 0.11
Nodes (16): author, description, directories, test, engines, node, keywords, license (+8 more)

### Community 35 - "Copywriting Formulas Module"
Cohesion: 0.13
Nodes (17): Slide Copywriting Formulas Reference, Persuasive Slide Formulas (PAS, AIDA, FAB, BAB, Cost of Inaction), Slide Type to Emotion Arc Mapping, Slide Headline and Contrast Patterns, Slides Create Subcommand Reference, HTML Slide Template Reference, Slide CSS Keyframe Animations, Chart.js Presentation Data Visualization (+9 more)

### Community 36 - "Design Token Typography & Spacing"
Cohesion: 0.12
Nodes (16): $type, $value, $type, $value, $type, $value, $type, $value (+8 more)

### Community 38 - "AI Model Providers & Routing"
Cohesion: 0.28
Nodes (14): buildUserFacingError(), categoryMessage(), classifyError(), formatProviderName(), isSafeSpecificMessage(), looksLikeOllamaConnectionError(), matchesPatterns(), normalizeEnhanceError() (+6 more)

### Community 39 - "Qualityscore Module"
Cohesion: 0.29
Nodes (15): clamp(), compareVariants(), createExperimentRecord(), deleteExperiment(), deriveGrade(), evaluateQuality(), generateSuggestions(), loadExperiments() (+7 more)

### Community 40 - "Brand Voice & Visual Identity"
Cohesion: 0.18
Nodes (12): Brand Update and Token Sync Command, Systematic Brand Update Pipeline, adjustBrightness(), { execFileSync }, extractColorsFromMarkdown(), fs, generateColorScale(), main() (+4 more)

### Community 41 - "Brand Voice & Visual Identity"
Cohesion: 0.20
Nodes (11): calculateCompliance(), colorDistance(), displayPalette(), extractHexColors(), findNearestBrandColor(), fs, generateImageMagickCommand(), hexToRgb() (+3 more)

### Community 42 - "PRD Specifications & Ralph Agent"
Cohesion: 0.16
Nodes (13): PRD Generator Skill, PRD Clarifying Questions Interview Pattern, 9-Section PRD Specification Structure, Atomic Verifiable User Story Specification, Ralph PRD Converter Skill, Dependency-First Story Ordering (Schema to Backend to UI), Ralph prd.json Execution Schema, Verifiable Acceptance Criteria Rule (+5 more)

### Community 45 - "Domutils Module"
Cohesion: 0.26
Nodes (13): collectSearchRoots(), debug(), dedupeElements(), filterEligibleInputs(), findCandidates(), getActiveElementRecursive(), getActiveInputValue(), getInputText() (+5 more)

### Community 46 - "Promptlibrary Module"
Cohesion: 0.28
Nodes (12): addVersion(), createDefaultPrompts(), createId(), createPrompt(), extractVariables(), getActiveVersion(), loadLibrary(), normalizeLibrary() (+4 more)

### Community 47 - "Messagehandler Module"
Cohesion: 0.22
Nodes (13): buildContextMenu(), createContextMenuEntries(), forceInject(), handleEnhancePrompt(), handleGetSettings(), notifyTabsOfUpdate(), resolveTargetTab(), resolveTransform() (+5 more)

### Community 48 - "Transform Shortcut Test Module"
Cohesion: 0.19
Nodes (9): bootWith(), installChromeStub(), keydown(), loadContentScripts(), { loadScript, clearZeusGlobals }, makeTextarea(), pressDigit(), resetDocument() (+1 more)

### Community 49 - "Brand Voice & Visual Identity"
Cohesion: 0.25
Nodes (13): checkManifest(), formatBytes(), formatOutput(), fs, main(), parseFilename(), path, RULES (+5 more)

### Community 52 - "Privacy Module"
Cohesion: 0.24
Nodes (10): collectAllMatches(), detectCategory(), escapeRegex(), isLuhnValid(), isValidPhoneNumber(), maskEntityPreview(), redactPrompt(), restorePrompt() (+2 more)

### Community 53 - "AI Model Providers & Routing"
Cohesion: 0.14
Nodes (14): scripts, build, clean, package, test, test:coverage, test:dom, test:integration (+6 more)

### Community 54 - "Keyboard Shortcuts Engine"
Cohesion: 0.16
Nodes (6): loadContentScriptGraph(), { loadScript, clearZeusGlobals }, runDiagnostic(), { loadScript, clearZeusGlobals }, { loadScript, clearZeusGlobals }, loadScript()

### Community 55 - "Design Token Typography & Spacing"
Cohesion: 0.15
Nodes (12): component, $type, $value, dark, semantic, $schema, $type, $value (+4 more)

### Community 59 - "Data Contracts Test Suite"
Cohesion: 0.23
Nodes (3): read_rows(), TestGeneratedCatalogContract, TestLandingAndStackContract

### Community 60 - "Copilot Module"
Cohesion: 0.37
Nodes (12): accept(), attachToInput(), cleanupPort(), destroy(), fetchSuggestion(), getEligibleInputs(), init(), onInput() (+4 more)

### Community 61 - "Telemetry Module"
Cohesion: 0.32
Nodes (12): clear(), ensureHydrated(), getFallbackCount(), getStorageLocal(), getSummary(), nowIso(), persistNow(), readEvents() (+4 more)

### Community 62 - "Brand Voice & Visual Identity"
Cohesion: 0.23
Nodes (13): Zeus Olympian Avatar Icon 128px, Zeus Olympian Deity Mythological Branding, Zeus Olympian Avatar Icon 16px, Zeus Olympian Avatar Icon 48px, Lightning Flash Energy Glyph Motif, Lightning Flash SVG Vector, Hexagonal Badge & Electric Lightning Visual Identity, Zeus Extension Action Icon 128px (+5 more)

### Community 63 - "Settings And Messaging Smoke Module"
Cohesion: 0.26
Nodes (9): assert(), clone(), createChromeMock(), pickStoreValues(), invokeMessage(), loadScript(), rootDir, runMessageActionSmoke() (+1 more)

### Community 64 - "Slides Copywriting Formulas Module"
Cohesion: 0.18
Nodes (11): Strategic HTML Slides Knowledge Hub, Slide Copywriting Formulas, Headline and Social Proof Copy Patterns, 25 Persuasive Copywriting Formulas, Slide-to-Formula & Emotion Mapping, Slide Creation Workflow Task, Slides Skill Task Invocation, Strategic Slide Creation Workflow (+3 more)

### Community 65 - "Render Module"
Cohesion: 0.23
Nodes (4): generate_html(), get_deliverable_info(), get_image_base64(), main()

### Community 66 - "Token Validation Test Suite"
Cohesion: 0.24
Nodes (11): extensions, formatReport(), fs, getFiles(), main(), parseArgs(), path, patterns (+3 more)

### Community 67 - "Design Token Typography & Spacing"
Cohesion: 0.20
Nodes (12): $type, $value, bg, bg, padding, shadow, card, bg (+4 more)

### Community 69 - "Text Layout Resilience Test Suite"
Cohesion: 0.18
Nodes (3): read_rows(), TestTextLayoutDataContracts, TestTextLayoutRetrieval

### Community 70 - "Usefloatingposition Module"
Cohesion: 0.33
Nodes (11): clamp(), create(), applyAnchored(), applyFixed(), applyNow(), getButtonSize(), scheduleUpdate(), ensureRelativeAnchor() (+3 more)

### Community 71 - "Zip Extension Module"
Cohesion: 0.21
Nodes (10): archiver, distDir, extensionDir, fs, path, rootDir, sizeInMb(), toPosix() (+2 more)

### Community 72 - "AI Model Providers & Routing"
Cohesion: 0.29
Nodes (10): collectProviderApiHosts(), extractBuildArray(), extractContentScriptFiles(), extractImportScriptsFiles(), extractQuotedStrings(), fileExists(), fs, path (+2 more)

### Community 73 - "Brand Voice & Visual Identity"
Cohesion: 0.31
Nodes (10): extractColorsFromTable(), extractCoreAttributes(), extractHexColors(), extractImageStyle(), extractTypography(), extractVoice(), fs, generatePromptAddition() (+2 more)

### Community 74 - "Banner Design & Sizing"
Cohesion: 0.22
Nodes (9): Banner Sizes & Art Direction Styles Reference, 22 Art Direction Styles, Banner Dimensions Catalog, Design Routing Guide, Design Sub-Skills Matrix, Multi-Skill Collaboration Workflows, Design Skill Specification, Complete Brand Package Workflow (+1 more)

### Community 75 - "Token Architecture Module"
Cohesion: 0.22
Nodes (10): 16:9 Responsive Slide Deck Structure, New Design System Workflow, Color and Size Component Variants, Token Architecture Specification, Component Tokens (Layer 3), Primitive Tokens (Layer 1), Semantic Tokens (Layer 2), Three-Layer Token System (+2 more)

### Community 76 - "Embed Tokens Module"
Cohesion: 0.18
Nodes (8): args, fs, minimal, MINIMAL_TOKENS, path, projectRoot, tokensPath, wrapStyle

### Community 77 - "Design Token Typography & Spacing"
Cohesion: 0.18
Nodes (11): fast, normal, slow, $type, $value, $type, $value, primitive (+3 more)

### Community 80 - "Workflows Module"
Cohesion: 0.44
Nodes (10): createDefaultWorkflows(), deleteWorkflow(), executeWorkflow(), getAllWorkflows(), getStorageArea(), normalizeWorkflow(), sanitizeString(), saveWorkflow() (+2 more)

### Community 82 - "Contributing Module"
Cohesion: 0.22
Nodes (9): Extension CI Workflow, Validate and Package CI Job, Zeus Contributor Guide, Security and Responsible Disclosure, Contribution Testing & Quality Checks, Zeus Extension Architecture, Copilot Inline Suggestions, End-to-End Prompt Enhancement Flow (+1 more)

### Community 83 - "Cip Deliverable Guide Module"
Cohesion: 0.20
Nodes (10): CIP Deliverable Guide, Core Identity & Logo Deliverables, Digital & Event Deliverables, Physical Environment & Signage Deliverables, Stationery Deliverables Set, CIP Design Reference, CIP HTML Presentation Renderer, CIP Gemini Image Models (+2 more)

### Community 84 - "Generate Tokens Module"
Cohesion: 0.36
Nodes (9): flattenTokens(), fs, generateCSS(), generateTailwind(), main(), parseArgs(), path, resolveReference() (+1 more)

### Community 85 - "Design Token Typography & Spacing"
Cohesion: 0.20
Nodes (10): fg, font-size, hover-bg, button, $type, $value, $type, $value (+2 more)

### Community 86 - "shadcn Component Integration"
Cohesion: 0.24
Nodes (10): Apache License 2.0 (ui-styling), shadcn/ui Accessibility Patterns Reference, Keyboard Navigation and Focus Trap Management, Radix UI Accessible Primitives Foundation, Screen Reader Support & ARIA Live Regions, shadcn/ui Component Catalog, shadcn Form System (React Hook Form + Zod), shadcn Dialog, Drawer, Popover, and Command Overlays (+2 more)

### Community 89 - "Reasoning Contract Module"
Cohesion: 0.27
Nodes (4): apply_decision_rules(), _object_without_duplicates(), parse_decision_rules(), _validate_action()

### Community 90 - "Ghosttext Module"
Cohesion: 0.31
Nodes (7): createMirrorDiv(), createOverlay(), destroy(), getCaretCoordinates(), positionOverlay(), show(), updateOverlayStyles()

### Community 91 - "Check Syntax Module"
Cohesion: 0.20
Nodes (8): glob, failures, files, { globSync }, ignorePatterns, path, rootDir, { spawnSync }

### Community 92 - "Logo Style Guide Module"
Cohesion: 0.22
Nodes (8): Logo Design Reference, Industry Logo Defaults & Presets, Logo Styles Taxonomy, Logo AI Prompt Engineering, Style-Specific Prompt Keywords, Logo Style Guide, Logo Aesthetic Styles, 7 Core Logo Types

### Community 94 - "AI Model Providers & Routing"
Cohesion: 0.53
Nodes (8): buildEndpoint(), buildHeaders(), enhance(), extractCandidateText(), extractSignal(), isRetryable(), shouldFallback(), suggest()

### Community 95 - "AI Model Providers & Routing"
Cohesion: 0.44
Nodes (7): buildModelCandidates(), enhance(), extractModelIds(), extractSignal(), fetchCatalog(), isRetryable(), shouldFallback()

### Community 96 - "Chatgpt Module"
Cohesion: 0.50
Nodes (7): findInputs(), getAnchorContainer(), getInputElement(), getPositionStrategy(), getRightControlsInset(), isVisible(), matches()

### Community 97 - "Grok Module"
Cohesion: 0.46
Nodes (7): findInputs(), getAnchorContainer(), getInputElement(), getPositionStrategy(), isVisible(), matches(), pickBottomMost()

### Community 98 - "Logo Color Psychology Module"
Cohesion: 0.25
Nodes (7): CIP Design Style Guide, CIP Color Psychology, CIP Design Styles & Industry Alignment, Logo Color Psychology Reference, Color Harmony Principles, Industry Color Mapping & Avoidances, Primary Color Psychological Profiles

### Community 99 - "Slides Template Module"
Cohesion: 0.25
Nodes (7): HTML Slide Template Architecture, Chart.js Presentation Integration, Slide Animation Classes, Keyboard & Touch Slide Navigation Engine, Slide Layout Patterns Reference, Slide Component & Card Variants, 25 Slide Layout Patterns

### Community 100 - "Search Module"
Cohesion: 0.32
Nodes (3): format_brief(), format_results(), main()

### Community 101 - "Design Token Typography & Spacing"
Cohesion: 0.29
Nodes (8): padding-x, input, $type, $value, focus-ring, padding-x, $type, $value

### Community 102 - "Design Token Typography & Spacing"
Cohesion: 0.29
Nodes (8): $type, $value, $type, $value, radius, default, full, default

### Community 103 - "shadcn Component Integration"
Cohesion: 0.25
Nodes (8): shadcn/ui Theming and Customization Reference, HSL CSS Variable Theming System, cva Component Variant Customization, next-themes Dark Mode Implementation, Tailwind CSS Customization Reference, Tailwind @utility and @custom-variant Directives, Tailwind @layer Architecture (base, components, utilities), Tailwind v4 @theme CSS Configuration Directive

### Community 108 - "PRD Specifications & Ralph Agent"
Cohesion: 0.39
Nodes (7): Content Script Resilience Architecture, Transforms & Shortcut Implementation Plan, Shortcut Engine Hardening Plan, Transforms Traceability Matrix, Options Transforms HUD Section, Popup Transforms Card, Side Panel Transforms Tab

### Community 109 - "Claude Module"
Cohesion: 0.52
Nodes (6): findInputs(), getAnchorContainer(), getInputElement(), getPositionStrategy(), isVisible(), matches()

### Community 110 - "Deepseek Module"
Cohesion: 0.48
Nodes (4): findInputs(), getInputElement(), isVisible(), matches()

### Community 111 - "Gemini Module"
Cohesion: 0.52
Nodes (6): findInputs(), getAnchorContainer(), getInputElement(), getPositionStrategy(), isVisible(), matches()

### Community 112 - "Generic Module"
Cohesion: 0.48
Nodes (4): findInputs(), getInputElement(), isVisible(), matches()

### Community 113 - "Openrouter Module"
Cohesion: 0.52
Nodes (6): findInputs(), getAnchorContainer(), getInputElement(), getPositionStrategy(), isVisible(), matches()

### Community 114 - "Cip Prompt Engineering Module"
Cohesion: 0.33
Nodes (5): CIP Mockup Prompt Engineering, CIP Modifier Taxonomy, CIP Base Prompt Structure, Logo Prompt Architecture, Logo Scalability & Versatility Specifications

### Community 116 - "States And Variants Module"
Cohesion: 0.38
Nodes (6): States and Variants Specification, Disabled State Treatment, Error State & Indicators, Focus Ring Specification, Interactive States & Priority, Loading State Treatment

### Community 117 - "shadcn Component Integration"
Cohesion: 0.38
Nodes (6): Tailwind Integration Reference, Component Utility Classes (@layer components), CSS Variables Setup & Layers, Dark Mode Class & System Preference Toggle, shadcn/ui Alignment Convention, Tailwind Theme Extension Configuration

### Community 121 - "Presets Module"
Cohesion: 0.38
Nodes (4): exportPresetBundle(), importPresetBundle(), sanitizeString(), validatePresetBundle()

### Community 122 - "AI Model Providers & Routing"
Cohesion: 0.62
Nodes (6): buildOllamaOriginBlockedMessage(), checkHealth(), detectModel(), enhance(), fetchModels(), suggest()

### Community 123 - "AI Model Providers & Routing"
Cohesion: 0.33
Nodes (6): AI Development Team Guidelines, Extension Full-Stack Developer Agent Role, Frontend Developer Agent Role, Product Manager Agent Role, Provider Specialist Agent Role, QA Engineer Agent Role

### Community 124 - "Canvas Design System Module"
Cohesion: 0.33
Nodes (5): Social Photo Art Direction Styles, Canvas Design System Reference, Aesthetic Design Movement Frameworks, Two-Phase Visual Philosophy Creation Process, Canvas Visual Design Philosophy Layer

### Community 125 - "Design Token Typography & Spacing"
Cohesion: 0.47
Nodes (6): sm, shadow, sm, sm, $type, $value

### Community 128 - "Data Contracts Test Suite"
Cohesion: 0.47
Nodes (3): split_values(), style_identities(), TestStyleIdentityContract

### Community 129 - "Multimodal Module"
Cohesion: 0.67
Nodes (5): detectVisualAttachmentType(), extractAttachedImagesFromDOM(), formatMultimodalDirectives(), normalizeAttachment(), sanitizeString()

### Community 130 - "Prompts Module"
Cohesion: 0.53
Nodes (4): buildEnhancePrompt(), buildFrameworkSection(), buildObjectiveSection(), formatConversationContext()

### Community 131 - "Keyboard Shortcuts Engine"
Cohesion: 0.40
Nodes (6): Transforms Functional Requirements FR-1 to FR-6, Transforms Subsystem & Shortcut Redesign PRD, Transforms User Stories US-001 to US-005, Prompt Transforms & Keyboard Shortcuts, Transforms Redesign Story Ledger, Shortcut & Transforms Live Browser Harness

### Community 132 - "Extension Options Page"
Cohesion: 0.33
Nodes (6): Options Custom Providers Section, Options Control Center Page, Options Team Presets Section, Options Privacy & PII Shield Section, Options Sidebar Navigation, Side Panel Enhance Editor Tab

### Community 133 - "Package Module"
Cohesion: 0.33
Nodes (6): devDependencies, archiver, glob, jsdom, vitest, @vitest/coverage-v8

### Community 134 - "AI Model Providers & Routing"
Cohesion: 0.67
Nodes (4): enhance(), extractSignal(), isRetryable(), shouldFallback()

### Community 135 - "AI Model Providers & Routing"
Cohesion: 0.67
Nodes (4): enhance(), extractSignal(), isRetryable(), shouldFallback()

### Community 136 - "Keyboard Shortcuts Engine"
Cohesion: 0.47
Nodes (5): DIGIT_ROW, digitEvent(), keyEvent(), { loadScript, clearZeusGlobals }, physicalKeyEvent()

### Community 137 - "Skill Module"
Cohesion: 0.40
Nodes (5): Design Dials, Design System Generator, UI Pre-Delivery Checklist, UI/UX Pro Max Skill, Cyberpunk HUD UI Design

### Community 138 - "PRD Specifications & Ralph Agent"
Cohesion: 0.50
Nodes (5): Autonomous Plan-Implement-Test-Verify Loop, Overnight Feature Pipeline, Ralph Autonomous Agent Instructions, Ralph Progress Log, Ralph Autonomous Agent Prompt Template

### Community 139 - "Icon Design Module"
Cohesion: 0.40
Nodes (4): Icon Design Reference, Gemini 3.1 Pro SVG Text Generation, 12 Icon Domain Categories, 15 Icon Styles Specification

### Community 140 - "Social Photos Design Module"
Cohesion: 0.60
Nodes (5): Social Photos Design Guide, Social Photo HTML Design Rules, Social Media Platform Sizes Specification, Headless Browser Screenshot Export Pipeline, Social Photos 8-Step Design Workflow

### Community 141 - "Design Token Typography & Spacing"
Cohesion: 0.60
Nodes (5): $type, $value, border, border, border

### Community 142 - "Design Token Typography & Spacing"
Cohesion: 0.60
Nodes (5): radius, radius, radius, $type, $value

### Community 143 - "Design Token Typography & Spacing"
Cohesion: 0.60
Nodes (5): lg, $type, $value, lg, lg

### Community 144 - "Tailwind Utilities Module"
Cohesion: 0.40
Nodes (5): Tailwind CSS Utility Reference, Tailwind Arbitrary Value Syntax ([...]), Tailwind Layout, Flexbox, Grid, and Spacing Scale, Tailwind Typography and 11-Shade Color Scale, Tailwind CSS Utility Styling Layer

### Community 146 - "Observer Module"
Cohesion: 0.70
Nodes (4): create(), createDebouncedCallback(), mutationMayAffectInputs(), nodeMayContainInput()

### Community 147 - "Extension Popup Interface"
Cohesion: 0.40
Nodes (5): Popup Model Picker Component, Popup HUD Window, Popup Provider Selection Card, Popup Status & Telemetry Bar, Fallback Telemetry System

### Community 148 - "AI Model Providers & Routing"
Cohesion: 0.80
Nodes (4): enhance(), normalizeEndpoint(), resolveCustomConfig(), suggest()

### Community 149 - "Sidepanel UI & Template Editor"
Cohesion: 0.40
Nodes (5): Chrome Side Panel Workbench, Side Panel Asset Library Tab, Side Panel Workbench Page, Side Panel Navigation Tabs, Side Panel Workflows Pipeline Tab

### Community 151 - "Chatgpt Module"
Cohesion: 0.40
Nodes (5): ChatGPT Adapter Test Harness, Claude Adapter Test Harness, DeepSeek Adapter Test Harness, Generic Adapter Test Harness, Grok Adapter Test Harness

### Community 152 - "Design Token Typography & Spacing"
Cohesion: 0.67
Nodes (4): padding-y, padding-y, $type, $value

### Community 153 - "Design Token Typography & Spacing"
Cohesion: 0.67
Nodes (4): xl, xl, $type, $value

### Community 154 - "Design Token Typography & Spacing"
Cohesion: 0.67
Nodes (4): $type, $value, md, md

### Community 155 - "Design Token Typography & Spacing"
Cohesion: 0.67
Nodes (4): $type, $value, none, none

### Community 158 - "Context Aware Test Module"
Cohesion: 0.50
Nodes (3): jsdom, { JSDOM }, { loadScript, clearZeusGlobals }

### Community 160 - "Harness Module"
Cohesion: 0.83
Nodes (3): pushResult(), resetResults(), runChecks()

### Community 161 - "Design Token Typography & Spacing"
Cohesion: 0.67
Nodes (3): destructive, $type, $value

### Community 162 - "Design Token Typography & Spacing"
Cohesion: 0.67
Nodes (3): destructive-foreground, $type, $value

### Community 163 - "Design Token Typography & Spacing"
Cohesion: 0.67
Nodes (3): muted, $type, $value

### Community 164 - "Design Token Typography & Spacing"
Cohesion: 0.67
Nodes (3): primary-foreground, $type, $value

### Community 165 - "Design Token Typography & Spacing"
Cohesion: 0.67
Nodes (3): ring, $type, $value

### Community 166 - "Design Token Typography & Spacing"
Cohesion: 0.67
Nodes (3): secondary-foreground, $type, $value

### Community 167 - "Tailwind Responsive Module"
Cohesion: 0.67
Nodes (3): Tailwind CSS Responsive Design Reference, Mobile-First Breakpoint System (sm, md, lg, xl, 2xl), Tailwind Container Queries (@container)

## Knowledge Gaps
- **108 isolated node(s):** `@vitest/coverage-v8`, `Banner Visual AI Model Selection Strategy`, `Multi-Platform Banner Dimensions`, `Banner Art Direction Aesthetic Styles`, `Marketing Asset Directory Architecture` (+103 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 843 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **39 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ShadcnInstaller` connect `shadcn Component Integration` to `shadcn Component Integration`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `TailwindConfigGenerator` (e.g. with `TestGeneratedConfigIsValidJs` and `TestTailwindConfigGenerator`) actually correct?**
  _`TailwindConfigGenerator` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `@vitest/coverage-v8`, `Banner Visual AI Model Selection Strategy`, `Multi-Platform Banner Dimensions` to the rest of the system?**
  _108 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `shadcn Component Integration` be split into smaller, more focused modules?**
  _Cohesion score 0.053555750658472345 - nodes in this community are weakly interconnected._
- **Why does `TailwindConfigGenerator` connect `Tailwind Config Gen Test Suite` to `Tailwind Config Gen Module`, `Tailwind Config Gen Test Suite`, `Tailwind Config Gen Test Suite`, `Tailwind Config Gen Test Suite`, `shadcn Component Integration`, `Tailwind Config Gen Test Suite`, `Tailwind Config Gen Module`, `Tailwind Config Gen Test Suite`, `Brand Voice & Visual Identity`, `Tailwind Config Gen Test Suite`, `Tailwind Config Gen Test Suite`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `DesignSystemGenerator` (e.g. with `TestReasoningMatch` and `TestReasoningContract`) actually correct?**
  _`DesignSystemGenerator` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Should `BM25 Search Retrieval Engine` be split into smaller, more focused modules?**
  _Cohesion score 0.05563093622795115 - nodes in this community are weakly interconnected._