/**
 * API設定
 */
export const API_CONFIG = {
	/** GLM API エンドポイント */
	ENDPOINT: 'https://api.z.ai/api/paas/v4/chat/completions',
	/** 使用するモデル */
	MODEL: 'glm-4.5-air',
	/** 温度パラメータ */
	TEMPERATURE: 0.3,
	/** 最大トークン数 */
	MAX_TOKENS: 2000
} as const;

/**
 * ログコンテンツの検証用閾値
 */
export const CONTENT_THRESHOLDS = {
	/** 要約対象とする最小文字数 */
	MIN_CONTENT_LENGTH: 50
} as const;

/**
 * 日付フォーマット
 */
export const DATE_FORMATS = {
	/** ログファイル名用（日本語形式） */
	LOG_FILE: 'YYYY年MM月DD日',
	/** Daily Note用（ISO形式） */
	DAILY_NOTE: 'YYYY-MM-DD'
} as const;

/**
 * プロンプトテンプレート
 */
export const PROMPTS = {
	/** システムプロンプト */
	SYSTEM: `技術作業の記録を専門とするアシスタントです。
ClaudeCodeとの対話ログから、プロジェクト別・カテゴリ別に作業内容を整理して抽出してください。

ログの見出し「## /dev プロジェクト名」からプロジェクトを識別できます。`,

	/** ユーザープロンプトテンプレート（{logContent}をログ内容で置換） */
	USER_TEMPLATE: `以下のClaudeCodeとの対話ログから、作業内容をプロジェクト別にまとめてください。

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
{logContent}

作業サマリー:`
} as const;

/**
 * プロンプトを生成
 */
export function buildUserPrompt(logContent: string): string {
	return PROMPTS.USER_TEMPLATE.replace('{logContent}', logContent);
}
