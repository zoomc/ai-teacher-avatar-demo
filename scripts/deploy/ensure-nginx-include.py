#!/usr/bin/env python3
"""把一行 include 幂等地注入/移出 zoomlab 的 nginx server block。

用法:
  ensure-nginx-include.py <server_config_path> <include_line>          # 注入
  ensure-nginx-include.py --remove <server_config_path> <include_line> # 移除

注入行为:
- 若 include_line 已存在于文件中 → 直接退出（幂等，重复部署安全）。
- 否则定位包含 "server_name zoomlab.top" 的最后一个 server block
  （且含 "listen 443"），在其闭合大括号前插入 include_line。

移除行为:
- 若 include_line 不存在 → 直接退出。
- 否则删除该行及紧邻的多余空行。

只读/只改目标 server 配置文件，不动其他 nginx 配置。
"""

import sys


def find_server_block_end(text: str, marker: str, ssl_marker: str) -> int:
    # 选最后一个出现（nginx 配置通常 http 跳转 server 在前，https server 在后）
    pos = text.rfind(marker)
    if pos == -1:
        raise ValueError("marker not found")
    brace = text.rfind("{", 0, pos)
    if brace == -1:
        raise ValueError("no opening brace before marker")
    depth = 0
    i = brace
    while i < len(text):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                block = text[brace : i + 1]
                if ssl_marker not in block:
                    raise ValueError(f"server block does not contain '{ssl_marker}'")
                return i
        i += 1
    raise ValueError("unbalanced braces: server block never closes")


def main() -> int:
    remove_mode = len(sys.argv) == 4 and sys.argv[1] == "--remove"
    if remove_mode:
        path, include_line = sys.argv[2], sys.argv[3]
    elif len(sys.argv) == 3:
        path, include_line = sys.argv[1], sys.argv[2]
    else:
        print(
            "usage: ensure-nginx-include.py [--remove] <server_config_path> <include_line>",
            file=sys.stderr,
        )
        return 2

    with open(path, "r", encoding="utf-8") as f:
        text = f.read()

    line = include_line.strip()

    if remove_mode:
        if line not in text:
            print("not present, nothing to remove")
            return 0
        lines = text.split("\n")
        out = []
        for idx, ln in enumerate(lines):
            if ln.strip() == line:
                # 跳过该行；并去掉它前面紧邻的空行
                if out and out[-1].strip() == "":
                    out.pop()
                continue
            out.append(ln)
        with open(path, "w", encoding="utf-8") as f:
            f.write("\n".join(out))
        print(f"removed from {path}: {line}")
        return 0

    if line in text:
        print(f"already present: {line}")
        return 0

    try:
        end = find_server_block_end(text, "server_name zoomlab.top", "listen 443")
    except ValueError as e:
        print(f"error: {e}", file=sys.stderr)
        return 1

    # 保持缩进与结尾换行风格：在闭合大括号前插入
    indent = "    "
    insert = "\n\n" + indent + line + "\n"
    text = text[:end] + insert + text[end:]

    with open(path, "w", encoding="utf-8") as f:
        f.write(text)
    print(f"injected into {path}: {line}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
