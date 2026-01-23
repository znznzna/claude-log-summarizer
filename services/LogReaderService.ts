import { App, TFile, moment } from 'obsidian';
import { DATE_FORMATS, CONTENT_THRESHOLDS } from '../constants';

export interface LogReadResult {
	success: boolean;
	content?: string;
	originalSize?: number;
	compressedSize?: number;
	error?: string;
}

/**
 * ログファイル読み取りサービス
 */
export class LogReaderService {
	constructor(private app: App, private logFilePath: string) {}

	/**
	 * 指定した日付のログファイルを読み取る（圧縮済み）
	 */
	async readLogFile(date: moment.Moment): Promise<LogReadResult> {
		try {
			const logFileName = `${date.format(DATE_FORMATS.LOG_FILE)}.md`;
			const logFilePath = `${this.logFilePath}/${logFileName}`;

			const file = this.app.vault.getAbstractFileByPath(logFilePath);

			if (!file || !(file instanceof TFile)) {
				return {
					success: false,
					error: `ログファイルが見つかりません: ${logFilePath}`
				};
			}

			const rawContent = await this.app.vault.read(file);
			const compressedContent = this.compressLog(rawContent);

			console.log(`ログ圧縮: ${rawContent.length}文字 → ${compressedContent.length}文字 (${Math.round(compressedContent.length / rawContent.length * 100)}%)`);

			return {
				success: true,
				content: compressedContent,
				originalSize: rawContent.length,
				compressedSize: compressedContent.length
			};

		} catch (error) {
			console.error('ログファイル読み取りエラー:', error);
			return {
				success: false,
				error: `ログファイル読み取りに失敗: ${error.message}`
			};
		}
	}

	/**
	 * ログを圧縮（API送信前の前処理）
	 */
	private compressLog(content: string): string {
		let compressed = content;

		// 1. コードブロックを省略（言語タグも含む）
		compressed = compressed.replace(/```[\s\S]*?```/g, '[コード省略]');

		// 2. XMLタグブロックを省略
		compressed = compressed.replace(/<observed_from_primary_session>[\s\S]*?<\/observed_from_primary_session>/g, '[ツール実行]');
		compressed = compressed.replace(/<observation>[\s\S]*?<\/observation>/g, '[観察記録]');
		compressed = compressed.replace(/<[a-z_]+>[\s\S]*?<\/[a-z_]+>/g, '[XMLブロック省略]');

		// 3. 長いClaudeの返答を制限（3行まで）
		compressed = compressed.replace(/(\*\*Claude\*\*:)([\s\S]*?)(?=\n---|\n\*\*ユーザー\*\*:|\n## |$)/g, (match, prefix, response) => {
			const lines = response.trim().split('\n');
			if (lines.length > 5) {
				return `${prefix} ${lines.slice(0, 3).join('\n')}\n[...${lines.length - 3}行省略...]`;
			}
			return match;
		});

		// 4. 連続した空行を1つにまとめる
		compressed = compressed.replace(/\n{3,}/g, '\n\n');

		// 5. 連続した区切り線を1つにまとめる
		compressed = compressed.replace(/(---\n){2,}/g, '---\n');

		// 6. 重複した短いエラーメッセージを削除（同じ行が3回以上続く場合）
		const lines = compressed.split('\n');
		const deduped: string[] = [];
		let lastLine = '';
		let repeatCount = 0;

		for (const line of lines) {
			if (line === lastLine && line.length < 100) {
				repeatCount++;
				if (repeatCount === 3) {
					deduped.push(`[...同じ内容が繰り返し...]`);
				}
			} else {
				lastLine = line;
				repeatCount = 1;
				deduped.push(line);
			}
		}
		compressed = deduped.join('\n');

		// 7. インデントされた長い出力を省略
		compressed = compressed.replace(/^( {4,}|\t+).{200,}$/gm, '$1[長い出力省略]');

		return compressed.trim();
	}

	/**
	 * ログ内容が要約対象として有効かチェック
	 */
	isValidContent(content: string): boolean {
		const contentWithoutHeadings = content.replace(/^#.*$/gm, '').trim();
		return contentWithoutHeadings.length >= CONTENT_THRESHOLDS.MIN_CONTENT_LENGTH;
	}

	/**
	 * 要約不可の理由を取得
	 */
	getInvalidContentReason(content: string): string {
		const contentWithoutHeadings = content.replace(/^#.*$/gm, '').trim();
		return `要約する内容がありません（文字数: ${contentWithoutHeadings.length}）`;
	}
}
