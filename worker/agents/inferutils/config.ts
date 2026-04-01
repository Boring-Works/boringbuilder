import {
    AgentActionKey,
    AgentConfig,
    AgentConstraintConfig,
    AIModels,
    AllModels,
} from "./config.types";
import { env } from 'cloudflare:workers';

// Common configs - these are good defaults
const COMMON_AGENT_CONFIGS = {
    screenshotAnalysis: {
        name: AIModels.DISABLED,
        reasoning_effort: 'medium' as const,
        max_tokens: 8000,
        temperature: 1,
        fallbackModel: AIModels.WAI_GLM_47_FLASH,
    },
    realtimeCodeFixer: {
        name: AIModels.WAI_GLM_47_FLASH,
        reasoning_effort: 'low' as const,
        max_tokens: 32000,
        temperature: 0.2,
        fallbackModel: AIModels.WAI_QWEN3_30B,
    },
    fastCodeFixer: {
        name: AIModels.WAI_GLM_47_FLASH,
        reasoning_effort: 'low' as const,
        max_tokens: 64000,
        temperature: 0.0,
        fallbackModel: AIModels.WAI_QWEN25_CODER_32B,
    },
    templateSelection: {
        name: AIModels.WAI_GLM_47_FLASH,
        max_tokens: 2000,
        fallbackModel: AIModels.WAI_GRANITE_4_MICRO,
        temperature: 0.0,
    },
} as const;

const SHARED_IMPLEMENTATION_CONFIG = {
    reasoning_effort: 'low' as const,
    max_tokens: 48000,
    temperature: 0.6,
    fallbackModel: AIModels.WAI_QWEN25_CODER_32B,
};

//======================================================================================
// Workers AI platform config -- runs on CF GPUs, no external API keys needed.
// Models selected per operation based on CF Workers AI catalog (March 2026).
//======================================================================================
const PLATFORM_AGENT_CONFIG: AgentConfig = {
    ...COMMON_AGENT_CONFIGS,
    blueprint: {
        name: AIModels.WAI_NEMOTRON_3_120B,
        reasoning_effort: 'high',
        max_tokens: 20000,
        fallbackModel: AIModels.WAI_KIMI_K2_5,
        temperature: 1.0,
    },
    projectSetup: {
        name: AIModels.WAI_QWEN3_30B,
        reasoning_effort: 'medium',
        max_tokens: 8000,
        temperature: 1,
        fallbackModel: AIModels.WAI_GLM_47_FLASH,
    },
    phaseGeneration: {
        name: AIModels.WAI_KIMI_K2_5,
        reasoning_effort: 'medium',
        max_tokens: 8000,
        temperature: 1,
        fallbackModel: AIModels.WAI_NEMOTRON_3_120B,
    },
    firstPhaseImplementation: {
        name: AIModels.WAI_KIMI_K2_5,
        reasoning_effort: 'low',
        max_tokens: 48000,
        temperature: 0.6,
        fallbackModel: AIModels.WAI_QWEN25_CODER_32B,
    },
    phaseImplementation: {
        name: AIModels.WAI_KIMI_K2_5,
        reasoning_effort: 'low',
        max_tokens: 48000,
        temperature: 0.6,
        fallbackModel: AIModels.WAI_QWEN25_CODER_32B,
    },
    conversationalResponse: {
        name: AIModels.WAI_GLM_47_FLASH,
        reasoning_effort: 'low',
        max_tokens: 4000,
        temperature: 0.8,
        fallbackModel: AIModels.WAI_QWEN3_30B,
    },
    deepDebugger: {
        name: AIModels.WAI_NEMOTRON_3_120B,
        reasoning_effort: 'high',
        max_tokens: 8000,
        temperature: 0.2,
        fallbackModel: AIModels.WAI_DEEPSEEK_R1_DISTILL,
    },
    fileRegeneration: {
        name: AIModels.WAI_QWEN25_CODER_32B,
        reasoning_effort: 'low',
        max_tokens: 16000,
        temperature: 0.0,
        fallbackModel: AIModels.WAI_GLM_47_FLASH,
    },
    agenticProjectBuilder: {
        name: AIModels.WAI_NEMOTRON_3_120B,
        reasoning_effort: 'medium',
        max_tokens: 8000,
        temperature: 1,
        fallbackModel: AIModels.WAI_KIMI_K2_5,
    },
};

//======================================================================================
// Default Gemini-only config (most likely used in your deployment)
//======================================================================================
/* These are the default out-of-the box gemini-only models used when PLATFORM_MODEL_PROVIDERS is not set */
const DEFAULT_AGENT_CONFIG: AgentConfig = {
    ...COMMON_AGENT_CONFIGS,
    templateSelection: {
        name: AIModels.GEMINI_2_5_FLASH_LITE,
        max_tokens: 2000,
        fallbackModel: AIModels.GEMINI_2_5_FLASH,
        temperature: 0.6,
    },
    blueprint: {
        name: AIModels.GEMINI_3_FLASH_PREVIEW,
        reasoning_effort: 'high',
        max_tokens: 64000,
        fallbackModel: AIModels.GEMINI_2_5_PRO,
        temperature: 1,
    },
    projectSetup: {
        name: AIModels.GEMINI_3_FLASH_PREVIEW,
        ...SHARED_IMPLEMENTATION_CONFIG,
    },
    phaseGeneration: {
        name: AIModels.GEMINI_3_FLASH_PREVIEW,
        ...SHARED_IMPLEMENTATION_CONFIG,
    },
    firstPhaseImplementation: {
        name: AIModels.GEMINI_3_FLASH_PREVIEW,
        ...SHARED_IMPLEMENTATION_CONFIG,
    },
    phaseImplementation: {
        name: AIModels.GEMINI_3_FLASH_PREVIEW,
        ...SHARED_IMPLEMENTATION_CONFIG,
    },
    conversationalResponse: {
        name: AIModels.GEMINI_2_5_FLASH,
        reasoning_effort: 'low',
        max_tokens: 4000,
        temperature: 0,
        fallbackModel: AIModels.GEMINI_2_5_PRO,
    },
    deepDebugger: {
        name: AIModels.GEMINI_3_FLASH_PREVIEW,
        reasoning_effort: 'high',
        max_tokens: 8000,
        temperature: 1,
        fallbackModel: AIModels.GEMINI_2_5_FLASH,
    },
    fileRegeneration: {
        name: AIModels.GEMINI_3_FLASH_PREVIEW,
        reasoning_effort: 'low',
        max_tokens: 32000,
        temperature: 1,
        fallbackModel: AIModels.GEMINI_2_5_FLASH,
    },
    agenticProjectBuilder: {
        name: AIModels.GEMINI_3_FLASH_PREVIEW,
        reasoning_effort: 'high',
        max_tokens: 8000,
        temperature: 1,
        fallbackModel: AIModels.GEMINI_2_5_FLASH,
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