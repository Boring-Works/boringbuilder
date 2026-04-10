import {
    AgentActionKey,
    AgentConfig,
    AgentConstraintConfig,
    AIModels,
    AllModels,
} from "./config.types";
import { env } from 'cloudflare:workers';

//======================================================================================
// Workers AI platform config. Maximum quality tier (April 2026).
// 6 models: Kimi K2.5, GPT-OSS-120B, QwQ-32B, Qwen2.5-Coder-32B, GLM 4.7 Flash, Gemma 4 26B
// Session affinity for Kimi K2.5 prompt caching handled in core.ts (line 606-608).
//======================================================================================
const PLATFORM_AGENT_CONFIG: AgentConfig = {
    templateSelection: {
        name: AIModels.WAI_QWQ_32B,
        reasoning_effort: 'medium',
        max_tokens: 2000,
        temperature: 0.15,
        fallbackModel: AIModels.WAI_GPT_OSS_120B,
    },
    blueprint: {
        name: AIModels.WAI_KIMI_K2_5,
        reasoning_effort: 'high',
        max_tokens: 32000,
        temperature: 0.7,
        fallbackModel: AIModels.WAI_GPT_OSS_120B,
    },
    projectSetup: {
        name: AIModels.WAI_GPT_OSS_120B,
        reasoning_effort: 'medium',
        max_tokens: 16000,
        temperature: 0.6,
        fallbackModel: AIModels.WAI_KIMI_K2_5,
    },
    phaseGeneration: {
        name: AIModels.WAI_GPT_OSS_120B,
        reasoning_effort: 'high',
        max_tokens: 8000,
        temperature: 0.7,
        fallbackModel: AIModels.WAI_KIMI_K2_5,
    },
    firstPhaseImplementation: {
        name: AIModels.WAI_KIMI_K2_5,
        reasoning_effort: 'medium',
        max_tokens: 64000,
        temperature: 0.6,
        fallbackModel: AIModels.WAI_QWEN25_CODER_32B,
    },
    phaseImplementation: {
        name: AIModels.WAI_KIMI_K2_5,
        reasoning_effort: 'low',
        max_tokens: 64000,
        temperature: 0.5,
        fallbackModel: AIModels.WAI_QWEN25_CODER_32B,
    },
    fileRegeneration: {
        name: AIModels.WAI_QWEN25_CODER_32B,
        max_tokens: 32000,
        temperature: 0.1,
        fallbackModel: AIModels.WAI_GLM_47_FLASH,
    },
    screenshotAnalysis: {
        name: AIModels.WAI_GEMMA_4_26B,
        reasoning_effort: 'medium',
        max_tokens: 8000,
        temperature: 0.3,
        fallbackModel: AIModels.WAI_KIMI_K2_5,
    },
    realtimeCodeFixer: {
        name: AIModels.WAI_QWQ_32B,
        reasoning_effort: 'low',
        max_tokens: 16000,
        temperature: 0.2,
        fallbackModel: AIModels.WAI_GLM_47_FLASH,
    },
    fastCodeFixer: {
        name: AIModels.WAI_GLM_47_FLASH,
        reasoning_effort: 'low',
        max_tokens: 64000,
        temperature: 0.0,
        fallbackModel: AIModels.WAI_QWEN3_30B,
    },
    conversationalResponse: {
        name: AIModels.WAI_KIMI_K2_5,
        reasoning_effort: 'low',
        max_tokens: 4000,
        temperature: 0.8,
        fallbackModel: AIModels.WAI_GLM_47_FLASH,
    },
    deepDebugger: {
        name: AIModels.WAI_GPT_OSS_120B,
        reasoning_effort: 'high',
        max_tokens: 16000,
        temperature: 0.3,
        fallbackModel: AIModels.WAI_KIMI_K2_5,
    },
    agenticProjectBuilder: {
        name: AIModels.WAI_KIMI_K2_5,
        reasoning_effort: 'high',
        max_tokens: 48000,
        temperature: 0.7,
        fallbackModel: AIModels.WAI_GPT_OSS_120B,
    },
};

//======================================================================================
// Budget config. Workers AI backbone using cheaper models.
// Used when PLATFORM_MODEL_PROVIDERS env var is not set.
// Backbone: Qwen3-30B ($0.051/$0.335). Vision: Gemma 4 26B ($0.13/$0.40).
//======================================================================================
const DEFAULT_AGENT_CONFIG: AgentConfig = {
    templateSelection: {
        name: AIModels.WAI_GRANITE_4_MICRO,
        max_tokens: 2000,
        temperature: 0.0,
        fallbackModel: AIModels.WAI_GLM_47_FLASH,
    },
    blueprint: {
        name: AIModels.WAI_QWEN3_30B,
        reasoning_effort: 'high',
        max_tokens: 16000,
        temperature: 0.7,
        fallbackModel: AIModels.WAI_GLM_47_FLASH,
    },
    projectSetup: {
        name: AIModels.WAI_QWEN3_30B,
        reasoning_effort: 'medium',
        max_tokens: 8000,
        temperature: 0.6,
        fallbackModel: AIModels.WAI_GLM_47_FLASH,
    },
    phaseGeneration: {
        name: AIModels.WAI_QWEN3_30B,
        reasoning_effort: 'high',
        max_tokens: 8000,
        temperature: 0.7,
        fallbackModel: AIModels.WAI_GLM_47_FLASH,
    },
    firstPhaseImplementation: {
        name: AIModels.WAI_QWEN3_30B,
        reasoning_effort: 'low',
        max_tokens: 48000,
        temperature: 0.6,
        fallbackModel: AIModels.WAI_QWEN25_CODER_32B,
    },
    phaseImplementation: {
        name: AIModels.WAI_QWEN3_30B,
        reasoning_effort: 'low',
        max_tokens: 48000,
        temperature: 0.5,
        fallbackModel: AIModels.WAI_QWEN25_CODER_32B,
    },
    fileRegeneration: {
        name: AIModels.WAI_QWEN25_CODER_32B,
        max_tokens: 16000,
        temperature: 0.1,
        fallbackModel: AIModels.WAI_GLM_47_FLASH,
    },
    screenshotAnalysis: {
        name: AIModels.WAI_GEMMA_4_26B,
        reasoning_effort: 'medium',
        max_tokens: 8000,
        temperature: 0.3,
        fallbackModel: AIModels.WAI_KIMI_K2_5,
    },
    realtimeCodeFixer: {
        name: AIModels.WAI_GLM_47_FLASH,
        reasoning_effort: 'low',
        max_tokens: 32000,
        temperature: 0.2,
        fallbackModel: AIModels.WAI_QWEN3_30B,
    },
    fastCodeFixer: {
        name: AIModels.WAI_GLM_47_FLASH,
        reasoning_effort: 'low',
        max_tokens: 64000,
        temperature: 0.0,
        fallbackModel: AIModels.WAI_QWEN3_30B,
    },
    conversationalResponse: {
        name: AIModels.WAI_QWEN3_30B,
        reasoning_effort: 'low',
        max_tokens: 4000,
        temperature: 0.8,
        fallbackModel: AIModels.WAI_GLM_47_FLASH,
    },
    deepDebugger: {
        name: AIModels.WAI_QWEN3_30B,
        reasoning_effort: 'high',
        max_tokens: 8000,
        temperature: 0.3,
        fallbackModel: AIModels.WAI_GLM_47_FLASH,
    },
    agenticProjectBuilder: {
        name: AIModels.WAI_QWEN3_30B,
        reasoning_effort: 'high',
        max_tokens: 48000,
        temperature: 0.7,
        fallbackModel: AIModels.WAI_GLM_47_FLASH,
    },
};

export const AGENT_CONFIG: AgentConfig = env.PLATFORM_MODEL_PROVIDERS 
    ? PLATFORM_AGENT_CONFIG 
    : DEFAULT_AGENT_CONFIG;


export const AGENT_CONSTRAINTS: Map<AgentActionKey, AgentConstraintConfig> = new Map([
	['fastCodeFixer', {
		allowedModels: new Set(AllModels),
		enabled: true,
	}],
	['realtimeCodeFixer', {
		allowedModels: new Set(AllModels),
		enabled: true,
	}],
	['screenshotAnalysis', {
		allowedModels: new Set(AllModels),
		enabled: true,
	}],
	['fileRegeneration', {
		allowedModels: new Set(AllModels),
		enabled: true,
	}],
	['phaseGeneration', {
		allowedModels: new Set(AllModels),
		enabled: true,
	}],
	['projectSetup', {
		allowedModels: new Set(AllModels),
		enabled: true,
	}],
	['conversationalResponse', {
		allowedModels: new Set(AllModels),
		enabled: true,
	}],
	['templateSelection', {
		allowedModels: new Set(AllModels),
		enabled: true,
	}],
]);