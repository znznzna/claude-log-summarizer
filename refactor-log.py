#!/usr/bin/env python3
"""
Claude会話ログのリファクタリングスクリプト
- 同じプロジェクトの連続セクションをマージ
- 重複コンテンツを削減
"""

import re
import sys
from pathlib import Path

def parse_sections(content: str) -> list[dict]:
    """ファイルをセクションごとに分割"""
    sections = []
    lines = content.split('\n')

    current_section = None
    current_content = []
    header_line = 0

    for i, line in enumerate(lines):
        # ## で始まる見出しを検出
        if line.startswith('## '):
            # 前のセクションを保存
            if current_section is not None:
                sections.append({
                    'header': current_section,
                    'content': '\n'.join(current_content).strip(),
                    'line': header_line
                })

            current_section = line
            current_content = []
            header_line = i
        elif current_section is not None:
            current_content.append(line)

    # 最後のセクションを保存
    if current_section is not None:
        sections.append({
            'header': current_section,
            'content': '\n'.join(current_content).strip(),
            'line': header_line
        })

    return sections

def get_project_name(header: str) -> str:
    """見出しからプロジェクト名を抽出"""
    # ## /dev project_name の形式
    match = re.match(r'^## /dev\s+(.+)$', header)
    if match:
        return match.group(1).strip()
    # その他の見出し（計画、分析など）
    return header

def merge_sections(sections: list[dict]) -> list[dict]:
    """連続する同じプロジェクトのセクションをマージ"""
    if not sections:
        return []

    merged = []
    current_project = None
    current_contents = []
    current_header = None

    for section in sections:
        project = get_project_name(section['header'])

        # /dev で始まるプロジェクトのみマージ対象
        is_dev_project = section['header'].startswith('## /dev ')

        if is_dev_project and project == current_project:
            # 同じプロジェクトの連続セクション → 内容を追加
            if section['content']:
                current_contents.append(section['content'])
        else:
            # 新しいプロジェクト → 前のをマージして保存
            if current_header is not None and current_contents:
                merged.append({
                    'header': current_header,
                    'content': '\n\n---\n\n'.join(current_contents)
                })

            current_project = project if is_dev_project else None
            current_header = section['header']
            current_contents = [section['content']] if section['content'] else []

            # 非プロジェクトセクションはそのまま追加
            if not is_dev_project:
                if section['content']:
                    merged.append({
                        'header': section['header'],
                        'content': section['content']
                    })
                current_header = None
                current_contents = []

    # 最後のセクション
    if current_header is not None and current_contents:
        merged.append({
            'header': current_header,
            'content': '\n\n---\n\n'.join(current_contents)
        })

    return merged

def deduplicate_content(content: str) -> str:
    """重複したブロックを削除"""
    # 同一の段落が繰り返されている場合を検出
    paragraphs = content.split('\n\n')
    seen = set()
    unique = []

    for para in paragraphs:
        # 短い段落や見出しはそのまま
        if len(para) < 100 or para.startswith('#'):
            unique.append(para)
            continue

        # 長い段落は重複チェック
        para_hash = hash(para.strip())
        if para_hash not in seen:
            seen.add(para_hash)
            unique.append(para)

    return '\n\n'.join(unique)

def format_output(merged: list[dict], date_header: str) -> str:
    """最終出力を整形"""
    output = [date_header, '']

    for section in merged:
        if not section['content']:
            continue

        output.append(section['header'])
        output.append('')

        # 重複削除した内容
        deduped = deduplicate_content(section['content'])
        output.append(deduped)
        output.append('')

    return '\n'.join(output)

def main():
    if len(sys.argv) < 2:
        print("Usage: python refactor-log.py <input_file>")
        sys.exit(1)

    input_path = Path(sys.argv[1])

    if not input_path.exists():
        print(f"File not found: {input_path}")
        sys.exit(1)

    print(f"Reading: {input_path}")
    content = input_path.read_text(encoding='utf-8')

    original_size = len(content)
    print(f"Original size: {original_size:,} bytes ({original_size/1024/1024:.2f} MB)")

    # 最初の見出し（日付）を抽出
    lines = content.split('\n')
    date_header = lines[0] if lines[0].startswith('# ') else '# Log'

    # セクション分割
    sections = parse_sections(content)
    print(f"Found {len(sections)} sections")

    # マージ
    merged = merge_sections(sections)
    print(f"Merged into {len(merged)} sections")

    # 出力整形
    output = format_output(merged, date_header)

    new_size = len(output)
    reduction = (1 - new_size / original_size) * 100
    print(f"New size: {new_size:,} bytes ({new_size/1024/1024:.2f} MB)")
    print(f"Reduction: {reduction:.1f}%")

    # バックアップ作成
    backup_path = input_path.with_suffix('.md.backup')
    input_path.rename(backup_path)
    print(f"Backup saved: {backup_path}")

    # 新しいファイル書き出し
    input_path.write_text(output, encoding='utf-8')
    print(f"Refactored file saved: {input_path}")

if __name__ == '__main__':
    main()
