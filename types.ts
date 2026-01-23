/**
 * プラグイン設定のインターフェース
 */
export interface ClaudeLogSummarizerSettings {
	/** GLM API キー */
	glmApiKey: string;
	/** ログファイルが格納されているパス (Vault相対パス) */
	logFilePath: string;
	/** Daily Noteが格納されているパス (Vault相対パス) */
	dailyNotePath: string;
	/** Daily Note内の挿入先見出し */
	targetHeading: string;
	/** Obsidian起動時に自動実行するかどうか */
	autoRunOnStartup: boolean;
	/** Daily Note作成時に自動実行するかどうか */
	autoRunOnDailyNoteCreate: boolean;
	/** 最終実行日 (YYYY-MM-DD形式) */
	lastRunDate: string;
}

/**
 * デフォルト設定
 */
export const DEFAULT_SETTINGS: ClaudeLogSummarizerSettings = {
	glmApiKey: '',
	logFilePath: 'AI-Output/_CLAUDE/Talklog',
	dailyNotePath: 'Daily',
	targetHeading: '## 作業日報',
	autoRunOnStartup: false,
	autoRunOnDailyNoteCreate: true,
	lastRunDate: ''
};

/**
 * GLM API リクエストの型
 */
export interface GLMApiRequest {
	model: string;
	messages: Array<{
		role: 'system' | 'user' | 'assistant';
		content: string;
	}>;
	temperature?: number;
	max_tokens?: number;
}

/**
 * GLM API レスポンスの型
 */
export interface GLMApiResponse {
	id: string;
	object: string;
	created: number;
	model: string;
	choices: Array<{
		index: number;
		message: {
			role: string;
			content: string;
			reasoning_content?: string;
		};
		finish_reason: string;
	}>;
	usage: {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
	};
}

/**
 * 作業日報生成の結果
 */
export interface SummaryResult {
	success: boolean;
	summary?: string;
	error?: string;
}
