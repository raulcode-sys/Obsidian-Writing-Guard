/**
 * Collects "interesting" mixed-case tokens (interior capitals like "JavaScript"/"GitHub",
 * or short all-caps acronyms) that are NOT the first word on their line, since sentence-initial
 * capitalization is expected and not a real style variant. Used by the Rule Wizard to spot
 * words the vault capitalizes inconsistently.
 */
export interface CasingOccurrence {
	line: number;
	col: number;
	form: string;
}

const INTERESTING_WORD = /\b[A-Za-z][A-Za-z0-9]*\b/g;

function isInteresting(word: string): boolean {
	if (word.length < 2) return false;
	const hasInteriorCapital = /^[A-Za-z][a-z0-9]*[A-Z]/.test(word);
	const isShortAcronym = /^[A-Z]{2,6}$/.test(word);
	return hasInteriorCapital || isShortAcronym;
}

export function collectCasingOccurrences(
	lines: string[],
	masked: boolean[]
): Map<string, CasingOccurrence[]> {
	const byLower = new Map<string, CasingOccurrence[]>();

	for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
		if (masked[lineIdx]) continue;
		const line = lines[lineIdx];
		INTERESTING_WORD.lastIndex = 0;
		let m: RegExpExecArray | null;
		let isFirstWordOnLine = true;
		while ((m = INTERESTING_WORD.exec(line)) !== null) {
			const word = m[0];
			const wasFirst = isFirstWordOnLine;
			isFirstWordOnLine = false;
			if (wasFirst) continue;
			if (!isInteresting(word)) continue;
			const lower = word.toLowerCase();
			if (!byLower.has(lower)) byLower.set(lower, []);
			byLower.get(lower)!.push({ line: lineIdx + 1, col: m.index, form: word });
		}
	}

	return byLower;
}
