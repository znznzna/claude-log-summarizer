#!/usr/bin/env python3
"""
Claude会話ログの積極的リファクタリング
- コードブロックを省略
- 長いClaudeの応答を要約
- freetalkを大幅削減
"""

import re
import sys
from pathlib import Path

def truncate_code_blocks(content: str, max_lines: int = 20) -> str:
    """長いコードブロックを省略"""
    def replace_code_block(match):
        lang = match.group(1) or ''
        code = match.group(2)
        lines = code.split('\n')

        if len(lines) <= max_lines:
            return match.group(0)

        # 最初と最後の数行だけ残す
        head = '\n'.join(lines[:10])
        tail = '\n'.join(lines[-5:])
        omitted = len(lines) - 15

        return f"```{lang}\n{head}\n\n... ({omitted} lines omitted) ...\n\n{tail}\n```"

    pattern = r'```(\w*)\n(.*?)```'
    return re.sub(pattern, replace_code_block, content, flags=re.DOTALL)

def truncate_long_outputs(content: str, max_chars: int = 2000) -> str:
    """長い出力（テーブル、ログなど）を省略"""
    lines = content.split('\n')
    result = []
    consecutive_table_rows = 0

    for line in lines:
        # テーブル行のカウント
        if line.startswith('|') and '|' in line[1:]:
            consecutive_table_rows += 1
            if consecutive_table_rows <= 10:
                result.append(line)
            elif consecutive_table_rows == 11:
                result.append('| ... (rows omitted) ... |')
        else:
            consecutive_table_rows = 0
            result.append(line)

    return '\n'.join(result)

def remove_freetalk_fluff(content: str) -> str:
    """freetalkの雑談部分を削除"""
    # 典型的な雑談パターンを削除
    fluff_patterns = [
        r'べ、別に.*?んだからね[！!]*',
        r'はわわ[・\.]+',
        r'お兄ちゃん[、,].*?[。！!]',
        r'私.*?わけじゃない.*?[。！!]',
    ]

    result = content
    for pattern in fluff_patterns:
        result = re.sub(pattern, '', result)

    return result

def compress_claude_responses(content: str) -> str:
    """Claudeの応答を圧縮"""
    # **Claude**: の後の長い応答を短くする
    lines = content.split('\n')
    result = []
    in_claude_response = False
    claude_lines = []

    for line in lines:
        if line.startswith('**Claude**:'):
            # 前のClaudeの応答を処理
            if claude_lines:
                compressed = compress_response_block(claude_lines)
                result.extend(compressed)
                claude_lines = []

            in_claude_response = True
            claude_lines = [line]
        elif in_claude_response:
            if line.startswith('**ユーザー**:') or line.startswith('## '):
                # Claudeの応答終了
                compressed = compress_response_block(claude_lines)
                result.extend(compressed)
                claude_lines = []
                in_claude_response = False
                result.append(line)
            else:
                claude_lines.append(line)
        else:
            result.append(line)

    # 残りのClaudeの応答
    if claude_lines:
        compressed = compress_response_block(claude_lines)
        result.extend(compressed)

    return '\n'.join(result)

def compress_response_block(lines: list[str], max_lines: int = 50) -> list[str]:
    """Claudeの応答ブロックを圧縮"""
    if len(lines) <= max_lines:
        return lines

    # 最初の部分と最後の部分を残す
    head = lines[:30]
    tail = lines[-10:]
    omitted = len(lines) - 40

    return head + [f'\n... ({omitted} lines omitted) ...\n'] + tail

def deduplicate_similar_sections(content: str) -> str:
    """類似したセクションを統合"""
    sections = re.split(r'(^## .+$)', content, flags=re.MULTILINE)

    result = []
    seen_content_hashes = {}

    i = 0
    while i < len(sections):
        section = sections[i]

        if section.startswith('## '):
            header = section
            body = sections[i + 1] if i + 1 < len(sections) else ''

            # コンテンツのハッシュを計算（正規化後）
            normalized = re.sub(r'\s+', ' ', body.strip())[:500]
            content_hash = hash(normalized)

            if content_hash in seen_content_hashes and len(normalized) > 200:
                # 類似コンテンツは省略
                result.append(header)
                result.append(f'\n(Similar to section at line {seen_content_hashes[content_hash]})\n')
            else:
                seen_content_hashes[content_hash] = len(result)
                result.append(header)
                result.append(body)

            i += 2
        else:
            result.append(section)
            i += 1

    return ''.join(result)

def main():
    # バックアップから読み込む（元のファイル）
    backup_path = Path("/Users/motokiendo/Documents/Obsidian Vault/My vault/AI-Output/_CLAUDE/Talklog/2026年01月18日.md.backup")
    output_path = Path("/Users/motokiendo/Documents/Obsidian Vault/My vault/AI-Output/_CLAUDE/Talklog/2026年01月18日.md")

    if not backup_path.exists():
        print(f"Backup not found: {backup_path}")
        sys.exit(1)

    print(f"Reading: {backup_path}")
    content = backup_path.read_text(encoding='utf-8')

    original_size = len(content)
    print(f"Original size: {original_size:,} bytes ({original_size/1024/1024:.2f} MB)")

    # 各種圧縮を適用
    print("Truncating code blocks...")
    content = truncate_code_blocks(content)

    print("Truncating long outputs...")
    content = truncate_long_outputs(content)

    print("Compressing Claude responses...")
    content = compress_claude_responses(content)

    print("Deduplicating similar sections...")
    content = deduplicate_similar_sections(content)

    new_size = len(content)
    reduction = (1 - new_size / original_size) * 100
    print(f"New size: {new_size:,} bytes ({new_size/1024/1024:.2f} MB)")
    print(f"Reduction: {reduction:.1f}%")

    # 保存
    output_path.write_text(content, encoding='utf-8')
    print(f"Saved: {output_path}")

if __name__ == '__main__':
    main()
