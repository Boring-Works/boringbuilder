import { describe, it, expect } from 'vitest';
import { AIModels, AI_MODEL_CONFIG, AllModels } from '../../../worker/agents/inferutils/config.types';
import { AGENT_CONFIG, AGENT_CONSTRAINTS } from '../../../worker/agents/inferutils/config';

describe('Model Configuration Consistency', () => {
	describe('every AIModels entry has a valid AI_MODEL_CONFIG', () => {
		const modelEntries = Object.entries(AIModels).filter(
			([, id]) => typeof id === 'string' && id !== 'disabled'
		);

		it('should have models defined', () => {
			expect(modelEntries.length).toBeGreaterThan(0);
		});

		it.each(modelEntries)('model %s (%s) has config with required fields', (_key, id) => {
			const config = AI_MODEL_CONFIG[id as keyof typeof AI_MODEL_CONFIG];
			expect(config, `Missing config for ${_key} (${id})`).toBeDefined();
			expect(config.name).toBeTruthy();
			expect(config.provider).toBeTruthy();
			expect(config.contextSize).toBeGreaterThan(0);
		});
	});

	describe('AGENT_CONFIG operations reference existing models', () => {
		const operations = Object.entries(AGENT_CONFIG);

		it.each(operations)('operation %s references a valid model', (op, config) => {
			if (config.name === 'disabled') return; // DISABLED is allowed
			const modelConfig = AI_MODEL_CONFIG[config.name as keyof typeof AI_MODEL_CONFIG];
			expect(modelConfig, `Operation "${op}" references unknown model "${config.name}"`).toBeDefined();
		});

		it.each(operations)('operation %s fallback model exists', (op, config) => {
			if (!config.fallbackModel) return;
			const fallbackConfig = AI_MODEL_CONFIG[config.fallbackModel as keyof typeof AI_MODEL_CONFIG];
			expect(fallbackConfig, `Operation "${op}" fallback "${config.fallbackModel}" not found`).toBeDefined();
		});
	});

	describe('AGENT_CONSTRAINTS reference valid operations', () => {
		it('all constrained operations exist in AGENT_CONFIG', () => {
			for (const [actionKey] of AGENT_CONSTRAINTS) {
				expect(
					AGENT_CONFIG[actionKey],
					`Constraint for "${actionKey}" but no AGENT_CONFIG entry`
				).toBeDefined();
			}
		});

		it('constraint allowedModels sets are non-empty', () => {
			for (const [actionKey, constraint] of AGENT_CONSTRAINTS) {
				expect(
					constraint.allowedModels.size,
					`Constraint for "${actionKey}" has empty allowedModels`
				).toBeGreaterThan(0);
			}
		});
	});

	describe('AllModels list is complete', () => {
		it('AllModels count matches AIModels enum', () => {
			const enumValues = Object.values(AIModels).filter(v => typeof v === 'string');
			expect(AllModels.length).toBe(enumValues.length);
		});
	});

	describe('no circular fallbacks', () => {
		it('no operation falls back to itself', () => {
			for (const [op, config] of Object.entries(AGENT_CONFIG)) {
				if (config.fallbackModel) {
					expect(
						config.fallbackModel,
						`Operation "${op}" falls back to itself`
					).not.toBe(config.name);
				}
			}
		});
	});
});
