import { App } from "obsidian";
import { StyleRules, WizardSuggestion } from "./types";
import { computeMaskedLines, blankInlineCode, hashString } from "./utils";
import { collectCasingOccurrences } from "./rules/casing";
import { collectAbbreviationOccurrences, ABBREVIATION_GROUPS } from "./rules/abbreviations";

/**
 * Pattern-based rule suggestions: analyzes existing vault text for inconsistent
 * capitalization and abbreviation usage and proposes new rules. This runs entirely
 * locally (no external AI calls) using frequency analysis, so it works offline
 * and needs no API key.
 */
export async function generateWizardSuggestions(
	app: App,
	rules: StyleRules
): Promise<WizardSuggestion[]> {
	const files = app.vault.getMarkdownFiles();
	const approvedTerms = new Set(rules.approvedTerms.map((t) => t.toLowerCase()));

	const casingTally = new Map<string, Map<string, number>>();
	const abbrevTally = new Map<string, Map<string, number>>();

	for (const file of files) {
		const content = await app.vault.cachedRead(file);
		const rawLines = content.split("\n");
		const masked = computeMaskedLines(rawLines, rules);
		const lines = rawLines.map((l, i) => (masked[i] ? l : blankInlineCode(l)));

		const casingOccs = collectCasingOccurrences(lines, masked);
		for (const [lower, occs] of casingOccs) {
			if (approvedTerms.has(lower)) continue;
			if (!casingTally.has(lower)) casingTally.set(lower, new Map());
			const m = casingTally.get(lower)!;
			for (const occ of occs) m.set(occ.form, (m.get(occ.form) ?? 0) + 1);
		}

		const abbrevOccs = collectAbbreviationOccurrences(lines, masked);
		for (const [groupId, byVariant] of abbrevOccs) {
			if (!abbrevTally.has(groupId)) abbrevTally.set(groupId, new Map());
			const m = abbrevTally.get(groupId)!;
			for (const [variant, occs] of byVariant) {
				m.set(variant, (m.get(variant) ?? 0) + occs.length);
			}
		}
	}

	const suggestions: WizardSuggestion[] = [];

	// Casing suggestions: words with 2+ distinct forms and enough total volume to matter.
	const existingHyphenIds = new Set(rules.hyphenationGroups.map((g) => g.id));
	for (const [lower, forms] of casingTally) {
		if (forms.size < 2) continue;
		const total = Array.from(forms.values()).reduce((a, b) => a + b, 0);
		if (total < 3) continue;
		const id = `casing-${hashString(lower)}`;
		if (existingHyphenIds.has(id)) continue;
		const sorted = Array.from(forms.entries()).sort((a, b) => b[1] - a[1]);
		const winner = sorted[0][0];
		const variantCounts: Record<string, number> = {};
		for (const [form, count] of sorted) variantCounts[form] = count;

		suggestions.push({
			id,
			title: `You capitalize "${winner}" inconsistently`,
			rationale: sorted
				.map(([form, count]) => `"${form}" (${count}×)`)
				.join(", "),
			kind: "casing",
			variantCounts,
			apply: () => ({
				hyphenationGroups: [
					...rules.hyphenationGroups,
					{
						id,
						variants: sorted.map(([form]) => form),
						preferred: winner,
						enabled: true,
					},
				],
			}),
		});
	}

	// Abbreviation suggestions: groups with 2+ distinct forms in use.
	for (const [groupId, byVariant] of abbrevTally) {
		if (byVariant.size < 2) continue;
		const group = ABBREVIATION_GROUPS.find((g) => g.id === groupId);
		if (!group) continue;
		const id = `abbrev-${groupId}`;
		if (existingHyphenIds.has(id)) continue;
		const sorted = Array.from(byVariant.entries()).sort((a, b) => b[1] - a[1]);
		const winner = sorted[0][0];
		const variantCounts: Record<string, number> = {};
		for (const [form, count] of sorted) variantCounts[form] = count;

		suggestions.push({
			id,
			title: `You use both ${sorted.map(([f]) => `"${f}"`).join(" and ")} for "${group.label}"`,
			rationale: sorted.map(([form, count]) => `"${form}" (${count}×)`).join(", "),
			kind: "abbreviation",
			variantCounts,
			apply: () => ({
				hyphenationGroups: [
					...rules.hyphenationGroups,
					{
						id,
						variants: sorted.map(([form]) => form),
						preferred: winner,
						enabled: true,
					},
				],
			}),
		});
	}

	suggestions.sort((a, b) => {
		const totalA = Object.values(a.variantCounts).reduce((x, y) => x + y, 0);
		const totalB = Object.values(b.variantCounts).reduce((x, y) => x + y, 0);
		return totalB - totalA;
	});

	return suggestions;
}
