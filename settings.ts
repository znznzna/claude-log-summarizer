import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import ClaudeLogSummarizerPlugin from './main';

export class ClaudeLogSummarizerSettingTab extends PluginSettingTab {
	plugin: ClaudeLogSummarizerPlugin;

	constructor(app: App, plugin: ClaudeLogSummarizerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'Claude Log Summarizer 設定' });

		// GLM API キー設定
		new Setting(containerEl)
			.setName('GLM API キー')
			.setDesc('GLM-4-Flash APIのキーを入力してください（Z.aiまたはWaveSpeedから取得）')
			.addText(text => text
				.setPlaceholder('API キーを入力')
				.setValue(this.plugin.settings.glmApiKey)
				.onChange(async (value) => {
					this.plugin.settings.glmApiKey = value;
					await this.plugin.saveSettings();
				}));

		// ログファイルパス設定
		new Setting(containerEl)
			.setName('ログファイルパス')
			.setDesc('ClaudeCodeのログファイルが格納されているフォルダ（Vault相対パス）')
			.addText(text => text
				.setPlaceholder('AI-Output/_CLAUDE/Talklog')
				.setValue(this.plugin.settings.logFilePath)
				.onChange(async (value) => {
					this.plugin.settings.logFilePath = value;
					await this.plugin.saveSettings();
				}));

		// Daily Noteパス設定
		new Setting(containerEl)
			.setName('Daily Noteパス')
			.setDesc('Daily Noteが格納されているフォルダ（Vault相対パス）')
			.addText(text => text
				.setPlaceholder('Daily')
				.setValue(this.plugin.settings.dailyNotePath)
				.onChange(async (value) => {
					this.plugin.settings.dailyNotePath = value;
					await this.plugin.saveSettings();
				}));

		// 挿入先見出し設定
		new Setting(containerEl)
			.setName('挿入先見出し')
			.setDesc('Daily Note内で作業日報を挿入する見出し（Markdown形式）')
			.addText(text => text
				.setPlaceholder('## 作業日報')
				.setValue(this.plugin.settings.targetHeading)
				.onChange(async (value) => {
					this.plugin.settings.targetHeading = value;
					await this.plugin.saveSettings();
				}));

		// 起動時自動実行設定
		new Setting(containerEl)
			.setName('起動時に自動実行')
			.setDesc('Obsidian起動時に前日の作業日報を自動生成する')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoRunOnStartup)
				.onChange(async (value) => {
					this.plugin.settings.autoRunOnStartup = value;
					await this.plugin.saveSettings();
				}));

		// Daily Note作成時自動実行設定
		new Setting(containerEl)
			.setName('Daily Note作成時に自動実行')
			.setDesc('Daily Noteが新規作成されたときに前日の作業日報を自動生成する（推奨）')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoRunOnDailyNoteCreate)
				.onChange(async (value) => {
					this.plugin.settings.autoRunOnDailyNoteCreate = value;
					await this.plugin.saveSettings();
					// 設定変更時はリロードを促す
					if (value) {
						new Notice('設定を反映するにはObsidianを再起動してください。');
					}
				}));

		// 最終実行日の表示（読み取り専用）
		if (this.plugin.settings.lastRunDate) {
			new Setting(containerEl)
				.setName('最終実行日')
				.setDesc(`最後に作業日報を生成した日: ${this.plugin.settings.lastRunDate}`)
				.setDisabled(true);
		}

		// APIドキュメントへのリンク
		containerEl.createEl('div', { cls: 'setting-item-description' }, (el) => {
			el.innerHTML = `
				<h3>APIキーの取得方法</h3>
				<ul>
					<li><a href="https://api.z.ai/">Z.ai</a> - GLM-4-Flash APIを提供</li>
					<li><a href="https://wavespeed.ai/">WaveSpeedAI</a> - GLM-4-Flash APIを提供</li>
				</ul>
			`;
		});
	}
}
