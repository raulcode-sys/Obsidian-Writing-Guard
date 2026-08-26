import { App } from "obsidian";
import { StyleRules } from "./types";
import { computeMaskedLines, blankInlineCode } from "./utils";

const ACRONYM_PATTERN = /\b[A-Z]{2,6}\b/g;

/** Finds ALL-CAPS tokens (likely acronyms) that appear often enough to be intentional. */
export async function detectAcronyms(
	app: App,
	rules: StyleRules,
	minOccurrences = 2
): Promise<{ word: string; count: number }[]> {
	const files = app.vault.getMarkdownFiles();
	const tally = new Map<string, number>();
	const approved = new Set(rules.approvedTerms);

	for (const file of files) {
		const content = await app.vault.cachedRead(file);
		const rawLines = content.split("\n");
		const masked = computeMaskedLines(rawLines, rules);
		for (let i = 0; i < rawLines.length; i++) {
			if (masked[i]) continue;
			const line = blankInlineCode(rawLines[i]);
			ACRONYM_PATTERN.lastIndex = 0;
			let m: RegExpExecArray | null;
			while ((m = ACRONYM_PATTERN.exec(line)) !== null) {
				const word = m[0];
				if (approved.has(word)) continue;
				tally.set(word, (tally.get(word) ?? 0) + 1);
			}
		}
	}

	return Array.from(tally.entries())
		.filter(([, count]) => count >= minOccurrences)
		.sort((a, b) => b[1] - a[1])
		.map(([word, count]) => ({ word, count }));
}
