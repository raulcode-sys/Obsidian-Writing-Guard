export interface AbbreviationGroup {
	id: string;
	label: string;
	variants: string[];
}

export const ABBREVIATION_GROUPS: AbbreviationGroup[] = [
	{ id: "eg", label: "for example", variants: ["e.g.", "eg.", "eg"] },
	{ id: "ie", label: "that is", variants: ["i.e.", "ie.", "ie"] },
	{ id: "etc", label: "et cetera", variants: ["etc.", "etc"] },
	{ id: "vs", label: "versus", variants: ["vs.", "vs", "versus"] },
	{ id: "approx", label: "approximately", variants: ["approx.", "approx"] },
	{ id: "no", label: "number", variants: ["No.", "no.", "#"] },
];

export interface AbbreviationOccurrence {
	line: number;
	col: number;
	form: string;
}

export function collectAbbreviationOccurrences(
	lines: string[],
	masked: boolean[]
): Map<string, Map<string, AbbreviationOccurrence[]>> {
	const byGroup = new Map<string, Map<string, AbbreviationOccurrence[]>>();

	for (const group of ABBREVIATION_GROUPS) {
		const sorted = [...group.variants].sort((a, b) => b.length - a.length);
		const escaped = sorted.map((v) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
		const regex = new RegExp(`(?<![A-Za-z])(${escaped.join("|")})(?![A-Za-z])`, "g");
		const byVariant = new Map<string, AbbreviationOccurrence[]>();

		for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
			if (masked[lineIdx]) continue;
			const line = lines[lineIdx];
			regex.lastIndex = 0;
			let m: RegExpExecArray | null;
			while ((m = regex.exec(line)) !== null) {
				const form = m[0];
				if (!byVariant.has(form)) byVariant.set(form, []);
				byVariant.get(form)!.push({ line: lineIdx + 1, col: m.index, form });
			}
		}

		if (byVariant.size > 0) byGroup.set(group.id, byVariant);
	}

	return byGroup;
}
