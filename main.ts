import { Notice, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { StyleRules, PluginData, HistoryPoint } from "./src/types";
import { loadRules, saveRules } from "./src/rulesStore";
import { DEFAULT_PLUGIN_DATA, MAX_HISTORY_POINTS } from "./src/dataStore";
import { scanVault, FullScanResult } from "./src/scanner";
import { FixHistory } from "./src/fixManager";
import { VIEW_TYPE_SCANNER, VIEW_TYPE_REPORT } from "./src/constants";
import { ScannerView } from "./src/views/ScannerView";
import { ReportView } from "./src/views/ReportView";
import { WritingStyleGuardSettingTab } from "./src/settings";

export default class WritingStyleGuardPlugin extends Plugin {
	rules: StyleRules;
	pluginData: PluginData;
	fixHistory = new FixHistory();
	lastScan: FullScanResult | null = null;
	scanning = false;

	async onload() {
		this.rules = await loadRules(this.app);
		this.pluginData = Object.assign({}, DEFAULT_PLUGIN_DATA, await this.loadData());

		this.registerView(VIEW_TYPE_SCANNER, (leaf) => new ScannerView(leaf, this));
		this.registerView(VIEW_TYPE_REPORT, (leaf) => new ReportView(leaf, this));

		this.addRibbonIcon("shield-check", "Writing Style Guard: Scan vault", () => {
			this.runScan();
		});

		this.addCommand({
			id: "wsg-scan-vault",
			name: "Scan vault for style inconsistencies",
			callback: () => this.runScan(),
		});

		this.addCommand({
			id: "wsg-open-scanner",
			name: "Open scan results",
			callback: () => this.activateView(VIEW_TYPE_SCANNER),
		});

		this.addCommand({
			id: "wsg-open-report",
			name: "Open style compliance dashboard",
			callback: () => this.activateView(VIEW_TYPE_REPORT),
		});

		this.addCommand({
			id: "wsg-undo-fix",
			name: "Undo last auto-correct",
			callback: async () => {
				const batch = await this.fixHistory.undo(this.app);
				if (batch) new Notice(`Undid: ${batch.label} (${batch.operations.length} file${batch.operations.length === 1 ? "" : "s"})`);
				else new Notice("Nothing to undo.");
			},
		});

		this.addCommand({
			id: "wsg-redo-fix",
			name: "Redo last auto-correct",
			callback: async () => {
				const batch = await this.fixHistory.redo(this.app);
				if (batch) new Notice(`Redid: ${batch.label} (${batch.operations.length} file${batch.operations.length === 1 ? "" : "s"})`);
				else new Notice("Nothing to redo.");
			},
		});

		this.addSettingTab(new WritingStyleGuardSettingTab(this.app, this));
	}

	onunload() {
		// Views are cleaned up by Obsidian; nothing else to release.
	}

	async saveRules() {
		await saveRules(this.app, this.rules);
	}

	async savePluginData() {
		await this.saveData(this.pluginData);
	}

	async activateView(viewType: string) {
		const { workspace } = this.app;
		let leaf: WorkspaceLeaf | null = null;
		const existing = workspace.getLeavesOfType(viewType);
		if (existing.length > 0) {
			leaf = existing[0];
		} else {
			leaf = workspace.getRightLeaf(false);
			await leaf?.setViewState({ type: viewType, active: true });
		}
		if (leaf) workspace.revealLeaf(leaf);
	}

	async runScan(): Promise<FullScanResult> {
		if (this.scanning) {
			new Notice("A scan is already running.");
			return this.lastScan ?? { scannedAt: Date.now(), filesScanned: 0, violations: [], groups: [], compliance: [], fileViolationCounts: [], overallScore: 100 };
		}
		this.scanning = true;
		try {
			const result = await scanVault(this.app, this.rules);
			this.lastScan = result;

			if (this.rules.trackHistory) {
				const perRule: Record<string, number> = {};
				for (const c of result.compliance) perRule[c.key] = c.percent;
				const point: HistoryPoint = { timestamp: result.scannedAt, overallScore: result.overallScore, perRule };
				this.pluginData.history.push(point);
				if (this.pluginData.history.length > MAX_HISTORY_POINTS) {
					this.pluginData.history = this.pluginData.history.slice(-MAX_HISTORY_POINTS);
				}
				await this.savePluginData();
			}

			new Notice(
				`Writing Style Guard: scanned ${result.filesScanned} notes, found ${result.violations.length} inconsistenc${result.violations.length === 1 ? "y" : "ies"}.`
			);

			await this.activateView(VIEW_TYPE_SCANNER);
			this.refreshScannerViews();
			this.refreshReportViews();
			return result;
		} finally {
			this.scanning = false;
		}
	}

	refreshScannerViews() {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_SCANNER)) {
			if (leaf.view instanceof ScannerView) leaf.view.render();
		}
	}

	refreshReportViews() {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_REPORT)) {
			if (leaf.view instanceof ReportView) leaf.view.render();
		}
	}

	openFileAtLine(filePath: string, line: number) {
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (!(file instanceof TFile)) {
			new Notice(`File not found: ${filePath}`);
			return;
		}
		const leaf = this.app.workspace.getLeaf(false);
		leaf.openFile(file, { eState: { line: line - 1 } });
	}
}
