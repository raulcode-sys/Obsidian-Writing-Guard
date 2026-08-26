import { App, TFile } from "obsidian";
import { StyleRules, Violation, ScanResult, InconsistencyGroup, RuleType } from "./types";
import { computeMaskedLines, blankInlineCode, hashString } from "./utils";
import { findSpellingOccurrences, WordOccurrence, matchCase } from "./rules/spelling";
import { findHyphenationOccurrences, HyphenOccurrence } from "./rules/hyphenation";
import { checkOxfordComma } from "./rules/oxfordComma";
import { checkHeadingCase } from "./rules/headingCase";
import { checkRegexRules } from "./rules/regexRules";
import { US_UK_PAIRS } from "./spellingDictionary";

export interface ComplianceScore {
	key: string;
	label: string;
	compliant: number;
	total: number;
	percent: number;
}

export interface FullScanResult extends ScanResult {
	groups: InconsistencyGroup[];
	compliance: ComplianceScore[];
	fileViolationCounts: { path: string; count: number }[];
	overallScore: number;
}

function addToGroup(
	map: Map<string, InconsistencyGroup>,
	key: string,
	ruleType: RuleType,
	description: string,
	suggestedWinner: string,
	violation: Violation
) {
	if (!map.has(key)) {
		map.set(key, {
			key,
			ruleType,
			description,
			variantCounts: {},
			totalOccurrences: 0,
			violations: [],
			suggestedWinner,
		});
	}
	const g = map.get(key)!;
	g.violations.push(violation);
	g.totalOccurrences++;
	g.variantCounts[violation.match] = (g.variantCounts[violation.match] ?? 0) + 1;
}

export async function scanVault(app: App, rules: StyleRules): Promise<FullScanResult> {
	const files = app.vault.getMarkdownFiles();
	const approvedTerms = new Set(rules.approvedTerms);

	const pairs: [string, string][] = [
		...US_UK_PAIRS,
		...rules.customSpellingPairs.map((p) => [p.us, p.uk] as [string, string]),
	];

	interface FileData {
		file: TFile;
		lines: string[];
		masked: boolean[];
		spellingOccs: WordOccurrence[];
		hyphenOccs: HyphenOccurrence[];
	}
	const fileDatas: FileData[] = [];

	const spellingTally = new Map<string, Map<string, number>>();
	const hyphenTally = new Map<string, Map<string, number>>();
	const directViolations: Violation[] = [];

	let oxfordTotal = 0;
	let oxfordViolationCount = 0;
	let headingTotal = 0;
	let headingViolationCount = 0;
	const regexRuleTotals = new Map<string, number>();

	for (const file of files) {
		const content = await app.vault.cachedRead(file);
		const rawLines = content.split("\n");
		const masked = computeMaskedLines(rawLines, rules);
		const lines = rawLines.map((l, i) => (masked[i] ? l : blankInlineCode(l)));

		const spellingOccs =
			rules.spellingMode !== "off"
				? findSpellingOccurrences(lines, masked, pairs, approvedTerms)
				: [];
		const hyphenOccs = findHyphenationOccurrences(lines, masked, rules.hyphenationGroups, approvedTerms);

		fileDatas.push({ file, lines, masked, spellingOccs, hyphenOccs });

		for (const occ of spellingOccs) {
			if (!spellingTally.has(occ.pairKey)) spellingTally.set(occ.pairKey, new Map());
			const m = spellingTally.get(occ.pairKey)!;
			m.set(occ.variant, (m.get(occ.variant) ?? 0) + 1);
		}
		for (const occ of hyphenOccs) {
			if (!hyphenTally.has(occ.groupId)) hyphenTally.set(occ.groupId, new Map());
			const m = hyphenTally.get(occ.groupId)!;
			m.set(occ.variant, (m.get(occ.variant) ?? 0) + 1);
		}

		const oxford = checkOxfordComma(lines, masked, rules.oxfordComma);
		oxfordTotal += oxford.totalChecked;
		oxfordViolationCount += oxford.violations.length;
		for (const v of oxford.violations) {
			directViolations.push({
				id: hashString(`${file.path}:${v.line}:${v.col}:oxford`),
				ruleType: "oxfordComma",
				filePath: file.path,
				line: v.line,
				col: v.col,
				length: v.length,
				match: v.matchedText,
				message: v.message,
				suggestion: v.suggestion,
				groupKey: "oxfordComma",
			});
		}

		const heading = checkHeadingCase(lines, masked, rules.headingCase);
		headingTotal += heading.totalChecked;
		headingViolationCount += heading.violations.length;
		for (const v of heading.violations) {
			directViolations.push({
				id: hashString(`${file.path}:${v.line}:${v.col}:heading`),
				ruleType: "headingCase",
				filePath: file.path,
				line: v.line,
				col: v.col,
				length: v.length,
				match: v.matchedText,
				message: v.message,
				suggestion: v.suggestion,
				groupKey: "headingCase",
			});
		}

		const regex = checkRegexRules(lines, masked, rules.regexRules);
		for (const v of regex.violations) {
			regexRuleTotals.set(v.ruleId, (regexRuleTotals.get(v.ruleId) ?? 0) + 1);
			directViolations.push({
				id: hashString(`${file.path}:${v.line}:${v.col}:${v.ruleId}`),
				ruleType: "regex",
				ruleId: v.ruleId,
				filePath: file.path,
				line: v.line,
				col: v.col,
				length: v.length,
				match: v.matchedText,
				message: v.message,
				suggestion: v.suggestion,
				groupKey: `regex:${v.ruleId}`,
			});
		}
	}

	// Determine the "winning" spelling per pair.
	const spellingWinner = new Map<string, string>();
	for (const [pairKey, tally] of spellingTally) {
		const [usWord, ukWord] = pairKey.split("|");
		if (rules.spellingMode === "us") spellingWinner.set(pairKey, usWord.toLowerCase());
		else if (rules.spellingMode === "uk") spellingWinner.set(pairKey, ukWord.toLowerCase());
		else {
			let best = "";
			let bestCount = -1;
			for (const [variant, count] of tally) {
				if (count > bestCount) {
					best = variant;
					bestCount = count;
				}
			}
			spellingWinner.set(pairKey, best);
		}
	}

	// Determine the "winning" hyphenation form per group.
	const hyphenWinner = new Map<string, string>();
	for (const group of rules.hyphenationGroups) {
		const tally = hyphenTally.get(group.id);
		if (!tally) continue;
		if (group.preferred) {
			hyphenWinner.set(group.id, group.preferred.toLowerCase());
		} else {
			let best = "";
			let bestCount = -1;
			for (const [variant, count] of tally) {
				if (count > bestCount) {
					best = variant;
					bestCount = count;
				}
			}
			hyphenWinner.set(group.id, best.toLowerCase());
		}
	}

	const groupsByKey = new Map<string, InconsistencyGroup>();

	for (const fd of fileDatas) {
		for (const occ of fd.spellingOccs) {
			const winner = spellingWinner.get(occ.pairKey);
			if (!winner || occ.variant === winner) continue;
			const [usWord, ukWord] = occ.pairKey.split("|");
			const winnerDisplay = winner === usWord.toLowerCase() ? usWord : ukWord;
			const suggestion = matchCase(occ.matchedText, winnerDisplay);
			const groupKey = `spelling:${occ.pairKey}`;
			const violation: Violation = {
				id: hashString(`${fd.file.path}:${occ.line}:${occ.col}:spelling`),
				ruleType: "spelling",
				filePath: fd.file.path,
				line: occ.line,
				col: occ.col,
				length: occ.length,
				match: occ.matchedText,
				message: `"${occ.matchedText}" is inconsistent with your vault's preferred spelling "${winnerDisplay}"`,
				suggestion,
				groupKey,
			};
			directViolations.push(violation);
			addToGroup(groupsByKey, groupKey, "spelling", `"${usWord}" vs "${ukWord}"`, winnerDisplay, violation);
		}

		for (const occ of fd.hyphenOccs) {
			const winner = hyphenWinner.get(occ.groupId);
			if (!winner || occ.variant.toLowerCase() === winner) continue;
			const group = rules.hyphenationGroups.find((g) => g.id === occ.groupId);
			const winnerDisplay = group?.variants.find((v) => v.toLowerCase() === winner) ?? winner;
			const groupKey = `hyphenation:${occ.groupId}`;
			const violation: Violation = {
				id: hashString(`${fd.file.path}:${occ.line}:${occ.col}:hyphen`),
				ruleType: "hyphenation",
				filePath: fd.file.path,
				line: occ.line,
				col: occ.col,
				length: occ.length,
				match: occ.matchedText,
				message: `"${occ.matchedText}" is inconsistent with your vault's preferred form "${winnerDisplay}"`,
				suggestion: winnerDisplay,
				groupKey,
			};
			directViolations.push(violation);
			addToGroup(
				groupsByKey,
				groupKey,
				"hyphenation",
				group?.variants.join(" / ") ?? occ.groupId,
				winnerDisplay,
				violation
			);
		}
	}

	for (const v of directViolations) {
		if (v.ruleType === "spelling" || v.ruleType === "hyphenation") continue;
		if (!groupsByKey.has(v.groupKey)) {
			const ruleLabel =
				v.ruleType === "oxfordComma"
					? "Oxford comma"
					: v.ruleType === "headingCase"
					? "Heading capitalization"
					: `Custom rule: ${rules.regexRules.find((r) => r.id === v.ruleId)?.name ?? v.ruleId}`;
			groupsByKey.set(v.groupKey, {
				key: v.groupKey,
				ruleType: v.ruleType,
				ruleId: v.ruleId,
				description: ruleLabel,
				variantCounts: {},
				totalOccurrences: 0,
				violations: [],
				suggestedWinner: "",
			});
		}
		const g = groupsByKey.get(v.groupKey)!;
		g.violations.push(v);
		g.totalOccurrences++;
	}

	// Compliance scores.
	const compliance: ComplianceScore[] = [];

	function pct(compliant: number, total: number): number {
		if (total === 0) return 100;
		return Math.round((compliant / total) * 1000) / 10;
	}

	if (spellingTally.size > 0) {
		let compliant = 0;
		let total = 0;
		for (const [pairKey, tally] of spellingTally) {
			const winner = spellingWinner.get(pairKey);
			for (const [variant, count] of tally) {
				total += count;
				if (variant === winner) compliant += count;
			}
		}
		compliance.push({ key: "spelling", label: "Spelling consistency", compliant, total, percent: pct(compliant, total) });
	}

	if (hyphenTally.size > 0) {
		let compliant = 0;
		let total = 0;
		for (const [groupId, tally] of hyphenTally) {
			const winner = hyphenWinner.get(groupId);
			for (const [variant, count] of tally) {
				total += count;
				if (variant.toLowerCase() === winner) compliant += count;
			}
		}
		compliance.push({ key: "hyphenation", label: "Hyphenation consistency", compliant, total, percent: pct(compliant, total) });
	}

	if (rules.oxfordComma !== "off" && oxfordTotal > 0) {
		compliance.push({
			key: "oxfordComma",
			label: "Oxford comma",
			compliant: oxfordTotal - oxfordViolationCount,
			total: oxfordTotal,
			percent: pct(oxfordTotal - oxfordViolationCount, oxfordTotal),
		});
	}

	if (rules.headingCase !== "off" && headingTotal > 0) {
		compliance.push({
			key: "headingCase",
			label: "Heading capitalization",
			compliant: headingTotal - headingViolationCount,
			total: headingTotal,
			percent: pct(headingTotal - headingViolationCount, headingTotal),
		});
	}

	for (const rule of rules.regexRules.filter((r) => r.enabled)) {
		const violationCount = regexRuleTotals.get(rule.id) ?? 0;
		// For custom regex rules "compliance" is best read as: fraction of files with zero matches.
		const filesWithMatch = new Set(directViolations.filter((v) => v.ruleId === rule.id).map((v) => v.filePath)).size;
		compliance.push({
			key: `regex:${rule.id}`,
			label: rule.name,
			compliant: files.length - filesWithMatch,
			total: files.length,
			percent: pct(files.length - filesWithMatch, files.length),
		});
	}

	const fileCounts = new Map<string, number>();
	for (const v of directViolations) {
		fileCounts.set(v.filePath, (fileCounts.get(v.filePath) ?? 0) + 1);
	}
	const fileViolationCounts = Array.from(fileCounts.entries())
		.map(([path, count]) => ({ path, count }))
		.sort((a, b) => b.count - a.count);

	const overallScore =
		compliance.length > 0
			? Math.round((compliance.reduce((sum, c) => sum + c.percent, 0) / compliance.length) * 10) / 10
			: 100;

	return {
		scannedAt: Date.now(),
		filesScanned: files.length,
		violations: directViolations,
		groups: Array.from(groupsByKey.values()).sort((a, b) => b.totalOccurrences - a.totalOccurrences),
		compliance,
		fileViolationCounts,
		overallScore,
	};
}
