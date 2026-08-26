/** Deterministic short hash for building stable violation/group ids. */
export function hashString(input: string): string {
	let h = 0;
	for (let i = 0; i < input.length; i++) {
		h = (Math.imul(31, h) + input.charCodeAt(i)) | 0;
	}
	return (h >>> 0).toString(36);
}

export interface LineMask {
	/** Same length as the original lines array; true = line should be skipped by word-level rules. */
	masked: boolean[];
}

/**
 * Computes which lines fall inside fenced code blocks and/or YAML frontmatter,
 * so rules can skip them when configured to do so.
 */
export function computeMaskedLines(
	lines: string[],
	opts: { ignoreCodeBlocks: boolean; ignoreFrontmatter: boolean }
): boolean[] {
	const masked = new Array(lines.length).fill(false);

	if (opts.ignoreFrontmatter && lines[0]?.trim() === "---") {
		for (let i = 1; i < lines.length; i++) {
			masked[i] = true;
			if (lines[i].trim() === "---") {
				masked[i] = true;
				break;
			}
		}
		masked[0] = true;
	}

	if (opts.ignoreCodeBlocks) {
		let inFence = false;
		let fenceMarker = "";
		for (let i = 0; i < lines.length; i++) {
			if (masked[i]) continue;
			const trimmed = lines[i].trim();
			const fenceMatch = trimmed.match(/^(`{3,}|~{3,})/);
			if (!inFence && fenceMatch) {
				inFence = true;
				fenceMarker = fenceMatch[1][0];
				masked[i] = true;
				continue;
			}
			if (inFence) {
				masked[i] = true;
				const closeMatch = trimmed.match(new RegExp(`^\\${fenceMarker}{3,}\\s*$`));
				if (closeMatch) {
					inFence = false;
				}
				continue;
			}
			// inline code spans: mask nothing at line level, handled per-match in rules.
		}
	}

	return masked;
}

/** Strips inline `code spans` from a line, replacing with spaces of equal length to preserve column offsets. */
export function blankInlineCode(line: string): string {
	return line.replace(/`[^`]*`/g, (m) => " ".repeat(m.length));
}

export function escapeRegExp(input: string): string {
	return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function titleCase(input: string): string {
	const smallWords = new Set([
		"a", "an", "and", "as", "at", "but", "by", "for", "if", "in",
		"nor", "of", "on", "or", "per", "so", "the", "to", "vs", "via", "yet",
	]);
	const words = input.split(/(\s+)/);
	let firstWordSeen = false;
	let lastWordIndex = -1;
	for (let i = 0; i < words.length; i++) {
		if (words[i].trim().length > 0) lastWordIndex = i;
	}
	return words
		.map((word, i) => {
			if (word.trim().length === 0) return word;
			const isFirst = !firstWordSeen;
			firstWordSeen = true;
			const isLast = i === lastWordIndex;
			const lower = word.toLowerCase();
			if (!isFirst && !isLast && smallWords.has(lower)) {
				return lower;
			}
			// Preserve words that already contain internal caps (e.g. "JavaScript", "iPhone").
			if (/[a-z].*[A-Z]/.test(word)) return word;
			return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
		})
		.join("");
}

export function sentenceCase(input: string): string {
	const trimmedStart = input.match(/^(\s*)/)?.[1] ?? "";
	const rest = input.slice(trimmedStart.length);
	if (rest.length === 0) return input;
	// Preserve words that already contain internal caps (e.g. "JavaScript", "iPhone") and pure acronyms.
	const words = rest.split(/(\s+)/);
	return (
		trimmedStart +
		words
			.map((word, i) => {
				if (word.trim().length === 0) return word;
				if (i === 0 || (i === 1 && words[0].trim().length === 0)) {
					if (/^[A-Z]+$/.test(word) && word.length > 1) return word;
					if (/[a-z].*[A-Z]/.test(word)) return word;
					return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
				}
				if (/^[A-Z]+$/.test(word) && word.length > 1) return word;
				if (/[a-z].*[A-Z]/.test(word)) return word;
				return word.toLowerCase();
			})
			.join("")
	);
}
