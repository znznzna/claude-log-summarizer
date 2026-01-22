#!/usr/bin/env python3
"""
Claude会話ログの最終リファクタリング
- コードブロックを大幅省略（ファイル名と最初の数行のみ）
- 長いセクションを要約
"""

import re
import sys
from pathlib import Path

def aggressive_code_truncation(content: str) -> str:
    """コードブロックを大幅に省略"""
    def replace_code_block(match):
        lang = match.group(1) or ''
        code = match.group(2).strip()
        lines = code.split('\n')

        if len(lines) <= 5:
            return match.group(0)

        # 最初の3行だけ残す
        head = '\n'.join(lines[:3])
        total_lines = len(lines)

        return f"```{lang}\n{head}\n... ({total_lines} lines total)\n```"

    pattern = r'```(\w*)\n(.*?)```'
    return re.sub(pattern, replace_code_block, content, flags=re.DOTALL)

def truncate_long_sections(content: str, max_section_chars: int = 3000) -> str:
    """長いセクションを省略"""
    sections = re.split(r'(^## .+$)', content, flags=re.MULTILINE)

    result = []
    i = 0
    while i < len(sections):
        part = sections[i]

        if part.startswith('## '):
            result.append(part)
            i += 1
            # 次のパート（本文）があれば処理
            if i < len(sections):
                body = sections[i]
                if len(body) > max_section_chars:
                    # 長い本文は省略
                    truncated = body[:max_section_chars]
                    # 最後の完全な段落で切る
                    last_para = truncated.rfind('\n\n')
                    if last_para > max_section_chars // 2:
                        truncated = truncated[:last_para]
                    omitted_chars = len(body) - len(truncated)
                    result.append(truncated + f'\n\n... ({omitted_chars:,} chars omitted) ...\n')
                else:
                    result.append(body)
                i += 1
        else:
            result.append(part)
            i += 1

    return ''.join(result)

def merge_consecutive_same_project(content: str) -> str:
    """連続する同じプロジェクトのセクションをマージ"""
    lines = content.split('\n')
    result = []
    current_project = None
    skip_until_next_section = False

    for line in lines:
        if line.startswith('## /dev '):
            project = line[8:].strip()
            if project == current_project:
                # 同じプロジェクトの連続 → 見出しをスキップして---で区切る
                result.append('\n---\n')
                skip_until_next_section = False
            else:
                current_project = project
                result.append(line)
        elif line.startswith('## '):
            # 別の見出し（計画など）
            current_project = None
            result.append(line)
        else:
            result.append(line)

    return '\n'.join(result)

def remove_empty_sections(content: str) -> str:
    """空のセクションを削除"""
    # 見出しの直後に別の見出しが来る場合を削除
    content = re.sub(r'(^## .+$)\n+(?=^## )', '', content, flags=re.MULTILINE)
    # 連続する---を1つに
    content = re.sub(r'(\n---\n)+', '\n---\n', content)
    return content

def main():
    backup_path = Path("/Users/motokiendo/Documents/Obsidian Vault/My vault/AI-Output/_CLAUDE/Talklog/2026年01月18日.md.backup")
    output_path = Path("/Users/motokiendo/Documents/Obsidian Vault/My vault/AI-Output/_CLAUDE/Talklog/2026年01月18日.md")

    print(f"Reading: {backup_path}")
    content = backup_path.read_text(encoding='utf-8')

    original_size = len(content)
    print(f"Original size: {original_size:,} bytes ({original_size/1024/1024:.2f} MB)")

    print("Step 1: Aggressive code truncation...")
    content = aggressive_code_truncation(content)
    print(f"  After: {len(content):,} bytes")

    print("Step 2: Merging consecutive same-project sections...")
    content = merge_consecutive_same_project(content)
    print(f"  After: {len(content):,} bytes")

    print("Step 3: Truncating long sections...")
    content = truncate_long_sections(content)
    print(f"  After: {len(content):,} bytes")

    print("Step 4: Removing empty sections...")
    content = remove_empty_sections(content)
    print(f"  After: {len(content):,} bytes")

    new_size = len(content)
    reduction = (1 - new_size / original_size) * 100
    print(f"\nFinal size: {new_size:,} bytes ({new_size/1024/1024:.2f} MB)")
    print(f"Total reduction: {reduction:.1f}%")

    output_path.write_text(content, encoding='utf-8')
    print(f"Saved: {output_path}")

if __name__ == '__main__':
    main()
