import { escapeRegExp } from "../utils";

export interface WordOccurrence {
	pairKey: string;
	variant: string;
	line: number;
	col: number;
	length: number;
	matchedText: string;
}

/**
 * Finds every occurrence of either side of each US/UK pair in the given lines.
 * `pairKey` is `${us}|${uk}` so occurrences of both spellings group together.
 */
export function findSpellingOccurrences(
	lines: string[],
	masked: boolean[],
	pairs: [string, string][],
	approvedTerms: Set<string>
): WordOccurrence[] {
	const results: WordOccurrence[] = [];
	if (pairs.length === 0) return results;

	// Build one regex per variant word -> which pair + which side it belongs to.
	const variantToPair = new Map<string, { pairKey: string; variant: "us" | "uk" }>();
	for (const [us, uk] of pairs) {
		const pairKey = `${us}|${uk}`;
		variantToPair.set(us.toLowerCase(), { pairKey, variant: "us" });
		variantToPair.set(uk.toLowerCase(), { pairKey, variant: "uk" });
	}

	const allWords = Array.from(variantToPair.keys()).sort((a, b) => b.length - a.length);
	const pattern = new RegExp(`\\b(${allWords.map(escapeRegExp).join("|")})\\b`, "gi");

	for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
		if (masked[lineIdx]) continue;
		const line = lines[lineIdx];
		pattern.lastIndex = 0;
		let m: RegExpExecArray | null;
		while ((m = pattern.exec(line)) !== null) {
			const matchedText = m[0];
			const lower = matchedText.toLowerCase();
			if (approvedTerms.has(matchedText) || approvedTerms.has(lower)) continue;
			const info = variantToPair.get(lower);
			if (!info) continue;
			results.push({
				pairKey: info.pairKey,
				variant: lower,
				line: lineIdx + 1,
				col: m.index,
				length: matchedText.length,
				matchedText,
			});
		}
	}

	return results;
}

/** Preserves the capitalization pattern of `source` when substituting `target`. */
export function matchCase(source: string, target: string): string {
	if (source === source.toUpperCase() && source !== source.toLowerCase()) {
		return target.toUpperCase();
	}
	if (source[0] === source[0].toUpperCase() && source[0] !== source[0].toLowerCase()) {
		return target.charAt(0).toUpperCase() + target.slice(1);
	}
	return target;
}
