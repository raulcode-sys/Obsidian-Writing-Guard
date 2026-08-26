import { App, TFile } from "obsidian";
import { Violation, FixBatch, FixOperation } from "./types";
import { hashString } from "./utils";

/**
 * Applies a set of violations' suggested fixes to the vault, batched per file
 * (multi-line-safe: same-line edits are applied right-to-left so earlier
 * replacements never shift the column offsets of later ones).
 */
export async function applyFixes(app: App, violations: Violation[], label: string): Promise<FixBatch> {
	const fixable = violations.filter((v) => v.suggestion !== undefined);
	const byFile = new Map<string, Violation[]>();
	for (const v of fixable) {
		if (!byFile.has(v.filePath)) byFile.set(v.filePath, []);
		byFile.get(v.filePath)!.push(v);
	}

	const operations: FixOperation[] = [];

	for (const [path, vs] of byFile) {
		const file = app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) continue;
		const before = await app.vault.read(file);
		const lines = before.split("\n");

		const byLine = new Map<number, Violation[]>();
		for (const v of vs) {
			if (!byLine.has(v.line)) byLine.set(v.line, []);
			byLine.get(v.line)!.push(v);
		}

		for (const [lineNum, lineVs] of byLine) {
			const idx = lineNum - 1;
			if (idx < 0 || idx >= lines.length) continue;
			let line = lines[idx];
			const sorted = [...lineVs].sort((a, b) => b.col - a.col);
			for (const v of sorted) {
				if (v.suggestion === undefined) continue;
				line = line.slice(0, v.col) + v.suggestion + line.slice(v.col + v.length);
			}
			lines[idx] = line;
		}

		const after = lines.join("\n");
		if (after !== before) {
			await app.vault.modify(file, after);
			operations.push({ filePath: path, before, after });
		}
	}

	return {
		id: hashString(`${label}:${Date.now()}:${Math.random()}`),
		timestamp: Date.now(),
		label,
		operations,
	};
}

export class FixHistory {
	private undoStack: FixBatch[] = [];
	private redoStack: FixBatch[] = [];

	push(batch: FixBatch) {
		if (batch.operations.length === 0) return;
		this.undoStack.push(batch);
		this.redoStack = [];
	}

	canUndo(): boolean {
		return this.undoStack.length > 0;
	}

	canRedo(): boolean {
		return this.redoStack.length > 0;
	}

	async undo(app: App): Promise<FixBatch | null> {
		const batch = this.undoStack.pop();
		if (!batch) return null;
		for (const op of batch.operations) {
			const file = app.vault.getAbstractFileByPath(op.filePath);
			if (file instanceof TFile) await app.vault.modify(file, op.before);
		}
		this.redoStack.push(batch);
		return batch;
	}

	async redo(app: App): Promise<FixBatch | null> {
		const batch = this.redoStack.pop();
		if (!batch) return null;
		for (const op of batch.operations) {
			const file = app.vault.getAbstractFileByPath(op.filePath);
			if (file instanceof TFile) await app.vault.modify(file, op.after);
		}
		this.undoStack.push(batch);
		return batch;
	}
}
