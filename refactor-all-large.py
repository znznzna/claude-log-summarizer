#!/usr/bin/env python3
"""
1MB以上のログファイルを全てリファクタリング
"""

import re
from pathlib import Path

def aggressive_code_truncation(content: str) -> str:
    """コードブロックを大幅に省略"""
    def replace_code_block(match):
        lang = match.group(1) or ''
        code = match.group(2).strip()
        lines = code.split('\n')

        if len(lines) <= 5:
            return match.group(0)

        head = '\n'.join(lines[:3])
        total_lines = len(lines)
        return f"```{lang}\n{head}\n... ({total_lines} lines total)\n```"

    pattern = r'```(\w*)\n(.*?)```'
    return re.sub(pattern, replace_code_block, content, flags=re.DOTALL)

def merge_consecutive_same_project(content: str) -> str:
    """連続する同じプロジェクトのセクションをマージ"""
    lines = content.split('\n')
    result = []
    current_project = None

    for line in lines:
        if line.startswith('## /dev '):
            project = line[8:].strip()
            if project == current_project:
                result.append('\n---\n')
            else:
                current_project = project
                result.append(line)
        elif line.startswith('## '):
            current_project = None
            result.append(line)
        else:
            result.append(line)

    return '\n'.join(result)

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
            if i < len(sections):
                body = sections[i]
                if len(body) > max_section_chars:
                    truncated = body[:max_section_chars]
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

def remove_empty_sections(content: str) -> str:
    """空のセクションを削除"""
    content = re.sub(r'(^## .+$)\n+(?=^## )', '', content, flags=re.MULTILINE)
    content = re.sub(r'(\n---\n)+', '\n---\n', content)
    return content

def process_file(filepath: Path) -> tuple[int, int]:
    """ファイルを処理して元サイズと新サイズを返す"""
    backup_path = filepath.with_suffix('.md.backup')

    # バックアップがあればそこから読む
    if backup_path.exists():
        content = backup_path.read_text(encoding='utf-8')
    else:
        content = filepath.read_text(encoding='utf-8')

    original_size = len(content)

    # 各種処理
    content = aggressive_code_truncation(content)
    content = merge_consecutive_same_project(content)
    content = truncate_long_sections(content)
    content = remove_empty_sections(content)

    new_size = len(content)

    # 保存
    filepath.write_text(content, encoding='utf-8')

    return original_size, new_size

def main():
    talklog_dir = Path("/Users/motokiendo/Documents/Obsidian Vault/My vault/AI-Output/_CLAUDE/Talklog")

    # 1MB以上のファイルを処理
    large_files = [f for f in talklog_dir.glob("*.md") if f.stat().st_size > 1_000_000 and not f.name.endswith('.backup')]

    print(f"Found {len(large_files)} large files to process\n")

    total_original = 0
    total_new = 0

    for filepath in sorted(large_files):
        print(f"Processing: {filepath.name}")
        original, new = process_file(filepath)
        total_original += original
        total_new += new
        reduction = (1 - new / original) * 100
        print(f"  {original:,} -> {new:,} bytes ({reduction:.1f}% reduction)\n")

    print("=" * 50)
    total_reduction = (1 - total_new / total_original) * 100
    print(f"Total: {total_original/1024/1024:.2f}MB -> {total_new/1024/1024:.2f}MB ({total_reduction:.1f}% reduction)")

if __name__ == '__main__':
    main()
