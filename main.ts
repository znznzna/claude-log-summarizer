import { App, Modal, Notice, Plugin, TFile, Setting, moment, requestUrl } from 'obsidian';
import { ClaudeLogSummarizerSettingTab } from './settings';
import {
	ClaudeLogSummarizerSettings,
	DEFAULT_SETTINGS,
	GLMApiRequest,
	GLMApiResponse,
	SummaryResult
} from './types';

/**
 * 日付入力モーダル
 */
class DateInputModal extends Modal {
	result: string;
	onSubmit: (result: string) => void;

	constructor(app: App, onSubmit: (result: string) => void) {
		super(app);
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;

		contentEl.createEl('h2', { text: '日付を指定してください' });

		// デフォルト値として昨日の日付
		const yesterday = moment().subtract(1, 'days').format('YYYY-MM-DD');

		new Setting(contentEl)
			.setName('対象日付')
			.setDesc('ログを要約する日付（YYYY-MM-DD形式）')
			.addText((text) =>
				text
					.setPlaceholder('YYYY-MM-DD')
					.setValue(yesterday)
					.onChange((value) => {
						this.result = value;
					})
			);
		this.result = yesterday;

		new Setting(contentEl)
			.addButton((btn) =>
				btn
					.setButtonText('実行')
					.setCta()
					.onClick(() => {
						this.close();
						this.onSubmit(this.result);
					})
			)
			.addButton((btn) =>
				btn
					.setButtonText('キャンセル')
					.onClick(() => {
						this.close();
					})
			);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

export default class ClaudeLogSummarizerPlugin extends Plugin {
	settings: ClaudeLogSummarizerSettings;

	async onload() {
		await this.loadSettings();

		// 設定タブの追加
		this.addSettingTab(new ClaudeLogSummarizerSettingTab(this.app, this));

		// コマンドパレットに登録（前日分）
		this.addCommand({
			id: 'generate-work-summary',
			name: '作業日報を生成（前日分）',
			callback: () => {
				const yesterday = moment().subtract(1, 'days');
				this.generateWorkSummary(yesterday, false);
			}
		});

		// コマンドパレットに登録（日付指定）
		this.addCommand({
			id: 'generate-work-summary-with-date',
			name: '作業日報を生成（日付指定）',
			callback: () => {
				new DateInputModal(this.app, (dateStr) => {
					const targetDate = moment(dateStr, 'YYYY-MM-DD');
					if (!targetDate.isValid()) {
						new Notice('無効な日付形式です。YYYY-MM-DD形式で入力してください。');
						return;
					}
					this.generateWorkSummary(targetDate, false);
				}).open();
			}
		});

		// リボンアイコンの追加
		this.addRibbonIcon('file-text', 'Claude Log Summarizer', () => {
			const yesterday = moment().subtract(1, 'days');
			this.generateWorkSummary(yesterday, false);
		});

		// Daily Note作成トリガーの登録
		if (this.settings.autoRunOnDailyNoteCreate) {
			this.registerDailyNoteCreateTrigger();
		}

		// 起動時の自動実行チェック
		if (this.settings.autoRunOnStartup) {
			this.checkAndRunAutoSummary();
		}
	}

	onunload() {
		// クリーンアップ処理（必要に応じて）
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	/**
	 * Daily Note作成トリガーを登録
	 */
	registerDailyNoteCreateTrigger() {
		this.registerEvent(
			this.app.vault.on('create', async (file) => {
				if (!(file instanceof TFile)) return;

				// Daily Noteのパターンにマッチするか確認
				const dailyNotePattern = new RegExp(
					`^${this.settings.dailyNotePath}/\\d{4}-\\d{2}-\\d{2}\\.md$`
				);

				if (!dailyNotePattern.test(file.path)) return;

				// ファイル名から日付を抽出
				const match = file.name.match(/(\d{4}-\d{2}-\d{2})\.md$/);
				if (!match) return;

				const dailyNoteDate = moment(match[1], 'YYYY-MM-DD');
				if (!dailyNoteDate.isValid()) return;

				// 前日のログを要約（例: 1/23のDaily Note作成 → 1/22のログを要約）
				const logDate = dailyNoteDate.clone().subtract(1, 'days');

				// 少し遅延させてファイルが安定するのを待つ
				setTimeout(async () => {
					console.log(`Daily Note作成を検知: ${file.path}, ログ日付: ${logDate.format('YYYY-MM-DD')}`);
					await this.generateWorkSummary(logDate, true);
				}, 1000);
			})
		);
	}

	/**
	 * 自動実行のチェックと実行
	 */
	async checkAndRunAutoSummary() {
		const today = moment().format('YYYY-MM-DD');

		// 今日すでに実行済みの場合はスキップ
		if (this.settings.lastRunDate === today) {
			return;
		}

		// 前日のログがあるか確認して実行
		const yesterday = moment().subtract(1, 'days');
		await this.generateWorkSummary(yesterday, true);
	}

	/**
	 * 指定した日付のサマリーがすでにDaily Noteに存在するかチェック
	 * @param logDate ログの日付
	 * @returns すでに存在する場合はtrue
	 */
	async isSummaryAlreadyExists(logDate: moment.Moment): Promise<boolean> {
		try {
			const dailyNoteDate = logDate.clone().add(1, 'days');
			const dailyNoteFileName = `${dailyNoteDate.format('YYYY-MM-DD')}.md`;
			const dailyNotePath = `${this.settings.dailyNotePath}/${dailyNoteFileName}`;

			const dailyNoteFile = this.app.vault.getAbstractFileByPath(dailyNotePath);
			if (!dailyNoteFile || !(dailyNoteFile instanceof TFile)) {
				return false;
			}

			const content = await this.app.vault.read(dailyNoteFile as TFile);
			// そのログ日付のサマリー見出しがすでに存在するかチェック
			const summaryHeadingPattern = `### ${logDate.format('YYYY-MM-DD')} 作業サマリー`;
			return content.includes(summaryHeadingPattern);
		} catch (error) {
			console.error('サマリー存在チェックエラー:', error);
			return false;
		}
	}

	/**
	 * 作業日報生成のメイン処理
	 * @param logDate ログの対象日付
	 * @param isAuto 自動実行かどうか
	 */
	async generateWorkSummary(logDate: moment.Moment, isAuto: boolean = false) {
		try {
			// すでにサマリーが存在する場合はスキップ（自動実行時のみ）
			if (isAuto) {
				const alreadyExists = await this.isSummaryAlreadyExists(logDate);
				if (alreadyExists) {
					console.log(`${logDate.format('YYYY-MM-DD')}のサマリーはすでに存在します。スキップします。`);
					// スキップした場合も実行日を更新して次回起動時の再実行を防ぐ
					this.settings.lastRunDate = moment().format('YYYY-MM-DD');
					await this.saveSettings();
					return;
				}
			}

			// APIキーの確認
			if (!this.settings.glmApiKey) {
				new Notice('GLM APIキーが設定されていません。設定画面で入力してください。');
				return;
			}

			// ローディング通知
			const loadingNotice = new Notice(`作業日報を生成中...（${logDate.format('YYYY-MM-DD')}）`, 0);

			// 1. ログファイルを読み取る
			const logContent = await this.readLogFile(logDate);
			if (!logContent) {
				loadingNotice.hide();
				if (!isAuto) {
					new Notice(`${logDate.format('YYYY-MM-DD')}のログファイルが見つかりません。`);
				}
				return;
			}

			// ログ内容が実質空の場合はスキップ（見出しのみなど）
			const contentWithoutHeadings = logContent.replace(/^#.*$/gm, '').trim();
			if (contentWithoutHeadings.length < 50) {
				loadingNotice.hide();
				if (!isAuto) {
					new Notice(`${logDate.format('YYYY-MM-DD')}のログに要約する内容がありません（文字数: ${contentWithoutHeadings.length}）`);
				}
				return;
			}

			// 2. GLM APIで要約生成
			const summaryResult = await this.generateSummary(logContent);
			if (!summaryResult.success) {
				loadingNotice.hide();
				new Notice(`要約生成に失敗しました: ${summaryResult.error}`);
				return;
			}

			// 3. 翌日のDaily Noteに書き込む
			const dailyNoteDate = logDate.clone().add(1, 'days');
			await this.writeToDailyNote(logDate, dailyNoteDate, summaryResult.summary!);

			// 4. 最終実行日を更新
			this.settings.lastRunDate = moment().format('YYYY-MM-DD');
			await this.saveSettings();

			loadingNotice.hide();
			new Notice(`✅ ${logDate.format('YYYY-MM-DD')}の作業日報を${dailyNoteDate.format('YYYY-MM-DD')}のDaily Noteに追加しました！`);

		} catch (error) {
			new Notice(`エラーが発生しました: ${error.message}`);
			console.error('Claude Log Summarizer Error:', error);
		}
	}

	/**
	 * ログファイルを読み取る
	 * @param date 対象日付（moment）
	 * @returns ログ内容（見つからない場合はnull）
	 */
	async readLogFile(date: moment.Moment): Promise<string | null> {
		try {
			// ログファイル名を生成（日本語形式）
			const logFileName = `${date.format('YYYY年MM月DD日')}.md`;
			const logFilePath = `${this.settings.logFilePath}/${logFileName}`;

			// ファイルを取得
			const file = this.app.vault.getAbstractFileByPath(logFilePath);

			if (!file || !(file instanceof TFile)) {
				return null;
			}

			// ファイル内容を読み取る
			const content = await this.app.vault.read(file);
			return content;

		} catch (error) {
			console.error('ログファイル読み取りエラー:', error);
			return null;
		}
	}

	/**
	 * GLM APIで要約を生成
	 * @param logContent ログファイルの内容
	 * @returns 要約結果
	 */
	async generateSummary(logContent: string): Promise<SummaryResult> {
		try {
			const apiRequest: GLMApiRequest = {
				model: 'glm-4.5-air',
				messages: [
					{
						role: 'system',
						content: `技術作業の記録を専門とするアシスタントです。
ClaudeCodeとの対話ログから、プロジェクト別・カテゴリ別に作業内容を整理して抽出してください。

ログの見出し「## /dev プロジェクト名」からプロジェクトを識別できます。`
					},
					{
						role: 'user',
						content: `以下のClaudeCodeとの対話ログから、作業内容をプロジェクト別にまとめてください。

## 出力フォーマット（厳守）

\`\`\`
#### プロジェクト名

**🆕 追加した機能**
- 新規に実装した機能や追加したファイル

**🔧 修正・改善**
- バグ修正、リファクタリング、パフォーマンス改善

**📝 その他の作業**
- 調査、設定変更、ドキュメント更新など

**⏳ 残タスク**
- 未完了のタスク、次にやるべきこと
\`\`\`

## ルール
- プロジェクトが複数ある場合は、プロジェクトごとにセクションを分ける
- 各カテゴリに該当する内容がなければそのカテゴリは省略
- 雑談や軽微なやり取りは除外
- 各項目は簡潔に（1行程度）
- 技術的な内容を優先
- 「次やること」「TODO」「残タスク」などの言及があれば「残タスク」に記載

対話ログ:
${logContent}

作業サマリー:`
					}
				],
				temperature: 0.3,
				max_tokens: 2000
			};

			// GLM APIへリクエスト
			const response = await requestUrl({
				url: 'https://api.z.ai/api/paas/v4/chat/completions',
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${this.settings.glmApiKey}`
				},
				body: JSON.stringify(apiRequest)
			});

			// レスポンスのパース
			const apiResponse: GLMApiResponse = response.json;

			if (apiResponse.choices && apiResponse.choices.length > 0) {
				const summary = apiResponse.choices[0].message.content.trim();
				return {
					success: true,
					summary: summary
				};
			} else {
				return {
					success: false,
					error: 'APIからの応答が不正です'
				};
			}

		} catch (error) {
			console.error('GLM API呼び出しエラー:', error);
			// 詳細なエラー情報を取得
			let errorMessage = error.message || 'API呼び出しに失敗しました';
			if (error.response) {
				console.error('レスポンス詳細:', error.response);
				errorMessage += ` (詳細: ${JSON.stringify(error.response)})`;
			}
			return {
				success: false,
				error: errorMessage
			};
		}
	}

	/**
	 * Daily Noteに要約を書き込む
	 * @param logDate ログの日付（サマリーのタイトル用）
	 * @param dailyNoteDate Daily Noteの日付（書き込み先）
	 * @param summary 要約内容
	 */
	async writeToDailyNote(logDate: moment.Moment, dailyNoteDate: moment.Moment, summary: string) {
		try {
			// Daily Noteファイル名（ISO形式）
			const dailyNoteFileName = `${dailyNoteDate.format('YYYY-MM-DD')}.md`;
			const dailyNotePath = `${this.settings.dailyNotePath}/${dailyNoteFileName}`;

			// Daily Noteが存在するか確認
			let dailyNoteFile = this.app.vault.getAbstractFileByPath(dailyNotePath);

			let content = '';

			if (!dailyNoteFile || !(dailyNoteFile instanceof TFile)) {
				// ファイルが存在しない場合は作成
				const folder = this.app.vault.getAbstractFileByPath(this.settings.dailyNotePath);

				// フォルダが存在しない場合は作成
				if (!folder) {
					await this.app.vault.createFolder(this.settings.dailyNotePath);
				}

				// 新規ファイルを作成
				dailyNoteFile = await this.app.vault.create(dailyNotePath, '');
				content = '';
			} else {
				// 既存ファイルの内容を読み取る
				content = await this.app.vault.read(dailyNoteFile as TFile);
			}

			// 挿入する内容を作成（ログの日付をタイトルに使用）
			const summarySection = `\n### ${logDate.format('YYYY-MM-DD')} 作業サマリー\n\n${summary}\n`;

			// 見出しが存在するかチェック
			const headingPattern = new RegExp(`^${this.settings.targetHeading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm');

			let newContent: string;

			if (headingPattern.test(content)) {
				// 見出しが存在する場合：見出しの直後に挿入
				newContent = content.replace(headingPattern, (match) => {
					return `${match}${summarySection}`;
				});
			} else {
				// 見出しが存在しない場合：ファイル末尾に見出しごと追加
				if (content.trim() === '') {
					newContent = `${this.settings.targetHeading}${summarySection}`;
				} else {
					newContent = `${content}\n\n${this.settings.targetHeading}${summarySection}`;
				}
			}

			// ファイルに書き込む
			await this.app.vault.modify(dailyNoteFile as TFile, newContent);

		} catch (error) {
			console.error('Daily Note書き込みエラー:', error);
			throw new Error(`Daily Noteへの書き込みに失敗しました: ${error.message}`);
		}
	}
}
