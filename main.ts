import { Notice, Plugin, TFile, moment } from 'obsidian';
import { ClaudeLogSummarizerSettingTab } from './settings';
import { ClaudeLogSummarizerSettings, DEFAULT_SETTINGS } from './types';
import { DATE_FORMATS } from './constants';
import { LogReaderService } from './services/LogReaderService';
import { GlmApiService } from './services/GlmApiService';
import { DailyNoteService } from './services/DailyNoteService';
import { DateInputModal } from './modals/DateInputModal';

export default class ClaudeLogSummarizerPlugin extends Plugin {
	settings: ClaudeLogSummarizerSettings;

	private logReader: LogReaderService;
	private apiService: GlmApiService;
	private dailyNoteService: DailyNoteService;

	async onload() {
		await this.loadSettings();
		this.initializeServices();

		this.addSettingTab(new ClaudeLogSummarizerSettingTab(this.app, this));
		this.registerCommands();
		this.addRibbonIcon('file-text', 'Claude Log Summarizer', () => {
			this.runSummary(moment().subtract(1, 'days'), false);
		});

		if (this.settings.autoRunOnDailyNoteCreate) {
			this.registerDailyNoteCreateTrigger();
		}

		if (this.settings.autoRunOnStartup) {
			this.checkAndRunAutoSummary();
		}
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.initializeServices();
	}

	/**
	 * サービスを初期化
	 */
	private initializeServices() {
		this.logReader = new LogReaderService(this.app, this.settings.logFilePath);
		this.apiService = new GlmApiService(this.settings.glmApiKey);
		this.dailyNoteService = new DailyNoteService(
			this.app,
			this.settings.dailyNotePath,
			this.settings.targetHeading
		);
	}

	/**
	 * コマンドを登録
	 */
	private registerCommands() {
		this.addCommand({
			id: 'generate-work-summary',
			name: '作業日報を生成（前日分）',
			callback: () => this.runSummary(moment().subtract(1, 'days'), false)
		});

		this.addCommand({
			id: 'generate-work-summary-with-date',
			name: '作業日報を生成（日付指定）',
			callback: () => {
				new DateInputModal(this.app, (dateStr) => {
					const targetDate = moment(dateStr, DATE_FORMATS.DAILY_NOTE);
					if (!targetDate.isValid()) {
						new Notice('無効な日付形式です。YYYY-MM-DD形式で入力してください。');
						return;
					}
					this.runSummary(targetDate, false);
				}).open();
			}
		});
	}

	/**
	 * Daily Note作成トリガーを登録
	 */
	private registerDailyNoteCreateTrigger() {
		const pattern = this.dailyNoteService.getDailyNotePattern();

		this.registerEvent(
			this.app.vault.on('create', async (file) => {
				if (!(file instanceof TFile) || !pattern.test(file.path)) return;

				const match = file.name.match(/(\d{4}-\d{2}-\d{2})\.md$/);
				if (!match) return;

				const dailyNoteDate = moment(match[1], DATE_FORMATS.DAILY_NOTE);
				if (!dailyNoteDate.isValid()) return;

				const logDate = dailyNoteDate.clone().subtract(1, 'days');

				setTimeout(() => {
					console.log(`Daily Note作成を検知: ${file.path}, ログ日付: ${logDate.format(DATE_FORMATS.DAILY_NOTE)}`);
					this.runSummary(logDate, true);
				}, 1000);
			})
		);
	}

	/**
	 * 自動実行のチェックと実行
	 */
	private async checkAndRunAutoSummary() {
		const today = moment().format(DATE_FORMATS.DAILY_NOTE);
		if (this.settings.lastRunDate === today) return;

		await this.runSummary(moment().subtract(1, 'days'), true);
	}

	/**
	 * サマリー生成のメイン処理
	 */
	private async runSummary(logDate: moment.Moment, isAuto: boolean) {
		try {
			if (isAuto) {
				const exists = await this.dailyNoteService.isSummaryExists(logDate);
				if (exists) {
					console.log(`${logDate.format(DATE_FORMATS.DAILY_NOTE)}のサマリーはすでに存在します。スキップします。`);
					await this.updateLastRunDate();
					return;
				}
			}

			if (!this.settings.glmApiKey) {
				new Notice('GLM APIキーが設定されていません。設定画面で入力してください。');
				return;
			}

			const loadingNotice = new Notice(`作業日報を生成中...（${logDate.format(DATE_FORMATS.DAILY_NOTE)}）`, 0);

			const logResult = await this.logReader.readLogFile(logDate);
			if (!logResult.success || !logResult.content) {
				loadingNotice.hide();
				if (!isAuto) {
					new Notice(`${logDate.format(DATE_FORMATS.DAILY_NOTE)}のログファイルが見つかりません。`);
				}
				return;
			}

			if (!this.logReader.isValidContent(logResult.content)) {
				loadingNotice.hide();
				if (!isAuto) {
					new Notice(`${logDate.format(DATE_FORMATS.DAILY_NOTE)}の${this.logReader.getInvalidContentReason(logResult.content)}`);
				}
				return;
			}

			const summaryResult = await this.apiService.generateSummary(logResult.content);
			if (!summaryResult.success || !summaryResult.summary) {
				loadingNotice.hide();
				new Notice(`要約生成に失敗しました: ${summaryResult.error}`);
				return;
			}

			await this.dailyNoteService.writeSummary(logDate, summaryResult.summary);
			await this.updateLastRunDate();

			loadingNotice.hide();
			const dailyNoteDate = logDate.clone().add(1, 'days');
			new Notice(`✅ ${logDate.format(DATE_FORMATS.DAILY_NOTE)}の作業日報を${dailyNoteDate.format(DATE_FORMATS.DAILY_NOTE)}のDaily Noteに追加しました！`);

		} catch (error) {
			new Notice(`エラーが発生しました: ${error.message}`);
			console.error('Claude Log Summarizer Error:', error);
		}
	}

	/**
	 * 最終実行日を更新
	 */
	private async updateLastRunDate() {
		this.settings.lastRunDate = moment().format(DATE_FORMATS.DAILY_NOTE);
		await this.saveSettings();
	}
}
