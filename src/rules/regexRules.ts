import { RegexRule } from "../types";
import { RuleCheckResult } from "./oxfordComma";

export interface RegexViolation {
	ruleId: string;
	line: number;
	col: number;
	length: number;
	message: string;
	suggestion?: string;
	matchedText: string;
}

export function checkRegexRules(
	lines: string[],
	masked: boolean[],
	rules: RegexRule[]
): RuleCheckResult<RegexViolation> {
	const violations: RegexViolation[] = [];
	let totalChecked = 0;
	const enabled = rules.filter((r) => r.enabled && r.pattern.trim().length > 0);
	if (enabled.length === 0) return { violations, totalChecked };

	const compiled = enabled
		.map((rule) => {
			try {
				const flags = rule.flags.includes("g") ? rule.flags : rule.flags + "g";
				return { rule, regex: new RegExp(rule.pattern, flags) };
			} catch (e) {
				return null;
			}
		})
		.filter((x): x is { rule: RegexRule; regex: RegExp } => x !== null);

	for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
		if (masked[lineIdx]) continue;
		const line = lines[lineIdx];
		for (const { rule, regex } of compiled) {
			regex.lastIndex = 0;
			let m: RegExpExecArray | null;
			let iterations = 0;
			while ((m = regex.exec(line)) !== null) {
				totalChecked++;
				let suggestion: string | undefined;
				if (rule.replacement !== undefined) {
					suggestion = m[0].replace(new RegExp(rule.pattern, rule.flags), rule.replacement);
				}
				violations.push({
					ruleId: rule.id,
					line: lineIdx + 1,
					col: m.index,
					length: m[0].length,
					message: rule.message || `Matched custom rule "${rule.name}"`,
					suggestion,
					matchedText: m[0],
				});
				if (m[0].length === 0) regex.lastIndex++;
				iterations++;
				if (iterations > 500) break; // safety guard against pathological patterns
			}
		}
	}

	return { violations, totalChecked };
}
