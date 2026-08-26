import { ItemView, WorkspaceLeaf } from "obsidian";
import type WritingStyleGuardPlugin from "../../main";
import { VIEW_TYPE_REPORT } from "../constants";

export class ReportView extends ItemView {
	plugin: WritingStyleGuardPlugin;

	constructor(leaf: WorkspaceLeaf, plugin: WritingStyleGuardPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_REPORT;
	}

	getDisplayText(): string {
		return "Style Guard dashboard";
	}

	getIcon(): string {
		return "bar-chart-2";
	}

	async onOpen() {
		this.render();
	}

	render() {
		const container = this.containerEl.children[1];
		container.empty();
		container.addClass("wsg-report-view");
		container.createEl("h3", { text: "Style compliance dashboard" });

		const result = this.plugin.lastScan;
		if (!result) {
			container.createEl("p", {
				text: "No scan yet. Run a scan from the scanner view or command palette.",
				cls: "wsg-empty",
			});
			return;
		}

		const overall = container.createDiv({ cls: "wsg-overall-score" });
		overall.createEl("span", {
			text: `${result.overallScore}% overall consistency`,
			cls: "wsg-overall-score-text",
		});
		overall.createEl("div", {
			text: `${result.filesScanned} notes scanned · last run ${new Date(result.scannedAt).toLocaleString()}`,
			cls: "wsg-muted",
		});

		if (result.compliance.length > 0) {
			const scoresEl = container.createDiv({ cls: "wsg-score-list" });
			scoresEl.createEl("h4", { text: "Compliance by rule" });
			for (const c of result.compliance) {
				const row = scoresEl.createDiv({ cls: "wsg-score-row" });
				const label = row.createDiv({ cls: "wsg-score-label" });
				label.createEl("span", { text: c.label });
				label.createEl("span", { text: `${c.percent}% (${c.compliant}/${c.total})`, cls: "wsg-muted" });
				const barOuter = row.createDiv({ cls: "wsg-bar-outer" });
				const barInner = barOuter.createDiv({ cls: "wsg-bar-inner" });
				barInner.style.width = `${c.percent}%`;
				if (c.percent < 60) barInner.addClass("wsg-bar-low");
				else if (c.percent < 90) barInner.addClass("wsg-bar-mid");
				else barInner.addClass("wsg-bar-high");
			}
		} else {
			container.createEl("p", {
				text: "No rules are currently generating measurable checks. Enable some in Settings.",
				cls: "wsg-empty",
			});
		}

		if (result.fileViolationCounts.length > 0) {
			const filesEl = container.createDiv({ cls: "wsg-files-list" });
			filesEl.createEl("h4", { text: "Files with most violations" });
			const table = filesEl.createEl("table", { cls: "wsg-table" });
			const tbody = table.createEl("tbody");
			for (const f of result.fileViolationCounts.slice(0, 15)) {
				const tr = tbody.createEl("tr");
				const tdPath = tr.createEl("td");
				const link = tdPath.createEl("a", { text: f.path });
				link.onclick = (e) => {
					e.preventDefault();
					this.plugin.openFileAtLine(f.path, 1);
				};
				tr.createEl("td", { text: String(f.count) });
			}
		}

		if (this.plugin.pluginData.history.length > 1) {
			const trendEl = container.createDiv({ cls: "wsg-trend" });
			trendEl.createEl("h4", { text: "Trend over time" });
			this.renderTrendChart(trendEl);
		} else if (!this.plugin.rules.trackHistory) {
			container.createDiv({
				text: "Trend tracking is off. Enable it in Settings to see history here.",
				cls: "wsg-muted",
			});
		}
	}

	private renderTrendChart(container: HTMLElement) {
		const history = this.plugin.pluginData.history.slice(-30);
		const width = 320;
		const height = 100;
		const padding = 8;
		const svgNs = "http://www.w3.org/2000/svg";

		const svg = document.createElementNS(svgNs, "svg");
		svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
		svg.setAttribute("width", "100%");
		svg.setAttribute("height", String(height));
		svg.setAttribute("class", "wsg-trend-svg");

		const points = history.map((h, i) => {
			const x = padding + (i / Math.max(1, history.length - 1)) * (width - padding * 2);
			const y = height - padding - (h.overallScore / 100) * (height - padding * 2);
			return `${x},${y}`;
		});

		const polyline = document.createElementNS(svgNs, "polyline");
		polyline.setAttribute("points", points.join(" "));
		polyline.setAttribute("fill", "none");
		polyline.setAttribute("stroke", "var(--interactive-accent)");
		polyline.setAttribute("stroke-width", "2");
		svg.appendChild(polyline);

		container.appendChild(svg);
		const latest = history[history.length - 1];
		container.createDiv({
			text: `Last ${history.length} scan${history.length === 1 ? "" : "s"} · latest ${latest.overallScore}%`,
			cls: "wsg-muted",
		});
	}
}
