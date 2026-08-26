import { ItemView, WorkspaceLeaf, Notice } from "obsidian";
import type WritingStyleGuardPlugin from "../../main";
import { VIEW_TYPE_SCANNER, VIEW_TYPE_REPORT } from "../constants";
import { InconsistencyGroup, Violation } from "../types";
import { applyFixes } from "../fixManager";
import { PreviewModal } from "./modals/PreviewModal";
import { WizardModal } from "./modals/WizardModal";
import { generateWizardSuggestions } from "../wizard";

export class ScannerView extends ItemView {
	plugin: WritingStyleGuardPlugin;
	private expanded = new Set<string>();

	constructor(leaf: WorkspaceLeaf, plugin: WritingStyleGuardPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_SCANNER;
	}

	getDisplayText(): string {
		return "Style Guard scan results";
	}

	getIcon(): string {
		return "shield-check";
	}

	async onOpen() {
		this.render();
	}

	render() {
		const container = this.containerEl.children[1];
		container.empty();
		container.addClass("wsg-scanner-view");

		const header = container.createDiv({ cls: "wsg-header" });
		header.createEl("h3", { text: "Writing Style Guard" });
		const btnRow = header.createDiv({ cls: "wsg-btn-row" });

		const scanBtn = btnRow.createEl("button", { text: "Scan vault", cls: "mod-cta" });
		scanBtn.onclick = () => this.plugin.runScan();

		const wizardBtn = btnRow.createEl("button", { text: "Rule wizard" });
		wizardBtn.onclick = async () => {
			const all = await generateWizardSuggestions(this.plugin.app, this.plugin.rules);
			const dismissed = new Set(this.plugin.pluginData.dismissedSuggestions);
			const fresh = all.filter((s) => !dismissed.has(s.id));
			new WizardModal(this.plugin, fresh).open();
		};

		const reportBtn = btnRow.createEl("button", { text: "Open dashboard" });
		reportBtn.onclick = () => this.plugin.activateView(VIEW_TYPE_REPORT);

		const result = this.plugin.lastScan;
		if (!result) {
			container.createEl("p", {
				text: 'No scan yet. Click "Scan vault" to check your notes for style inconsistencies.',
				cls: "wsg-empty",
			});
			return;
		}

		const summary = container.createDiv({ cls: "wsg-summary" });
		summary.createEl("span", {
			text: `${result.filesScanned} notes scanned · ${result.violations.length} inconsistencies · ${result.overallScore}% overall consistency`,
		});

		if (result.groups.length === 0) {
			container.createEl("p", { text: "No inconsistencies found. Your vault is consistent!", cls: "wsg-empty" });
			return;
		}

		const list = container.createDiv({ cls: "wsg-group-list" });
		for (const group of result.groups) {
			this.renderGroup(list, group);
		}
	}

	private renderGroup(parent: HTMLElement, group: InconsistencyGroup) {
		const card = parent.createDiv({ cls: "wsg-group-card" });
		const titleRow = card.createDiv({ cls: "wsg-group-title-row" });
		const title = titleRow.createDiv({ cls: "wsg-group-title" });
		title.createEl("strong", { text: group.description });
		title.createEl("span", {
			text: ` — ${group.totalOccurrences} occurrence${group.totalOccurrences === 1 ? "" : "s"}`,
			cls: "wsg-muted",
		});

		if (Object.keys(group.variantCounts).length > 0) {
			const counts = card.createDiv({ cls: "wsg-variant-counts" });
			const parts = Object.entries(group.variantCounts)
				.sort((a, b) => b[1] - a[1])
				.map(([variant, count]) => `"${variant}": ${count}`);
			counts.createEl("span", { text: parts.join("   ") });
		}

		const actions = card.createDiv({ cls: "wsg-group-actions" });
		const toggleBtn = actions.createEl("button", {
			text: this.expanded.has(group.key)
				? "Hide details"
				: `Show ${group.violations.length} location${group.violations.length === 1 ? "" : "s"}`,
		});
		toggleBtn.onclick = () => {
			if (this.expanded.has(group.key)) this.expanded.delete(group.key);
			else this.expanded.add(group.key);
			this.render();
		};

		const fixableCount = group.violations.filter((v) => v.suggestion !== undefined).length;
		if (fixableCount > 0) {
			const previewBtn = actions.createEl("button", { text: "Preview" });
			previewBtn.onclick = () => {
				new PreviewModal(this.plugin, group.violations, group.description, async (chosen) => {
					const batch = await applyFixes(this.plugin.app, chosen, group.description);
					this.plugin.fixHistory.push(batch);
					new Notice(`Fixed ${batch.operations.length} file${batch.operations.length === 1 ? "" : "s"}.`);
					await this.plugin.runScan();
				}).open();
			};

			const fixAllBtn = actions.createEl("button", { text: `Fix all (${fixableCount})`, cls: "mod-cta" });
			fixAllBtn.onclick = async () => {
				const batch = await applyFixes(this.plugin.app, group.violations, group.description);
				this.plugin.fixHistory.push(batch);
				new Notice(`Fixed ${batch.operations.length} file${batch.operations.length === 1 ? "" : "s"}.`);
				await this.plugin.runScan();
			};
		}

		if (this.expanded.has(group.key)) {
			const detailList = card.createDiv({ cls: "wsg-violation-list" });
			const shown = group.violations.slice(0, 200);
			for (const v of shown) {
				this.renderViolation(detailList, v);
			}
			if (group.violations.length > shown.length) {
				detailList.createDiv({
					text: `…and ${group.violations.length - shown.length} more.`,
					cls: "wsg-muted",
				});
			}
		}
	}

	private renderViolation(parent: HTMLElement, v: Violation) {
		const row = parent.createDiv({ cls: "wsg-violation-row" });
		const link = row.createEl("a", { text: `${v.filePath}:${v.line}`, cls: "wsg-file-link" });
		link.onclick = (e) => {
			e.preventDefault();
			this.plugin.openFileAtLine(v.filePath, v.line);
		};
		row.createEl("span", { text: v.message, cls: "wsg-violation-message" });
		if (v.suggestion !== undefined) {
			const fixBtn = row.createEl("button", { text: "Fix", cls: "wsg-small-btn" });
			fixBtn.onclick = async () => {
				const batch = await applyFixes(this.plugin.app, [v], v.message);
				this.plugin.fixHistory.push(batch);
				new Notice("Fixed.");
				await this.plugin.runScan();
			};
		}
	}
}
