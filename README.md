# Claude Log Summarizer

Obsidianプラグイン - ClaudeCodeの会話ログを自動的に要約し、Daily Noteに作業日報として挿入します。

## 機能

- ClaudeCodeの前日のログファイルを自動検出
- GLM-4-Flash APIを使用して会話内容を要約
- Daily Noteに作業サマリーとして挿入
- 手動実行とObsidian起動時の自動実行に対応

## 設定

1. プラグイン設定でGLM API キーを入力
2. ログファイルパスをカスタマイズ（デフォルト: `AI-Output/_CLAUDE/Talklog`）
3. Daily Noteパスをカスタマイズ（デフォルト: `Daily`）
4. 挿入先見出しをカスタマイズ（デフォルト: `## 作業日報`）

## 使い方

### 手動実行
- コマンドパレット（Ctrl/Cmd + P）から「作業日報を生成」を実行
- またはリボンアイコンをクリック

### 自動実行
- プラグイン設定で「起動時に自動実行」を有効化
- Obsidian起動時に前日の作業日報を自動生成

## 必要な環境

- Obsidian v1.0.0以上
- GLM-4-Flash APIキー（[Z.ai](https://api.z.ai/)で取得）

## インストール

1. このリポジトリをクローン
2. `npm install` で依存関係をインストール
3. `npm run build` でビルド
4. `main.js`と`manifest.json`をObsidianのプラグインフォルダにコピー

## 開発

```bash
npm install
npm run dev
```

## ライセンス

MIT
