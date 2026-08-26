import { HyphenationGroup } from "../types";
import { escapeRegExp } from "../utils";

export interface HyphenOccurrence {
	groupId: string;
	variant: string;
	line: number;
	col: number;
	length: number;
	matchedText: string;
}

export function findHyphenationOccurrences(
	lines: string[],
	masked: boolean[],
	groups: HyphenationGroup[],
	approvedTerms: Set<string>
): HyphenOccurrence[] {
	const results: HyphenOccurrence[] = [];
	const enabledGroups = groups.filter((g) => g.enabled && g.variants.length > 1);
	if (enabledGroups.length === 0) return results;

	interface Compiled {
		group: HyphenationGroup;
		regex: RegExp;
		variantLookup: Map<string, string>;
	}

	const compiled: Compiled[] = enabledGroups.map((group) => {
		const variantLookup = new Map<string, string>();
		for (const v of group.variants) variantLookup.set(v.toLowerCase(), v);
		const sorted = [...group.variants].sort((a, b) => b.length - a.length);
		const alternation = sorted.map(escapeRegExp).join("|");
		// Use lookaround instead of \b since variants may contain hyphens or spaces.
		const regex = new RegExp(`(?<![A-Za-z])(${alternation})(?![A-Za-z])`, "gi");
		return { group, regex, variantLookup };
	});

	for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
		if (masked[lineIdx]) continue;
		const line = lines[lineIdx];
		for (const { group, regex, variantLookup } of compiled) {
			regex.lastIndex = 0;
			let m: RegExpExecArray | null;
			while ((m = regex.exec(line)) !== null) {
				const matchedText = m[0];
				if (approvedTerms.has(matchedText)) continue;
				const canonical = variantLookup.get(matchedText.toLowerCase());
				if (!canonical) continue;
				results.push({
					groupId: group.id,
					variant: canonical,
					line: lineIdx + 1,
					col: m.index,
					length: matchedText.length,
					matchedText,
				});
			}
		}
	}

	return results;
}
