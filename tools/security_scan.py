#!/usr/bin/env python3
"""开源仓库安全扫描：拒绝密钥、设备凭据与内部资料进入版本库。

用法: python tools/security_scan.py <仓库根目录>
命中任一条即退出码 1。模式由片段拼接，避免扫描器命中自身。
"""
from __future__ import annotations

import os
import re
import sys

PATTERNS = {
    "API 密钥明文": "sk-" + "[A-Za-z0-9]{20,}",
    "登录凭据字段": "ltoken" + "_v2|cookie" + "_token_v2|account" + "_id_v2",
    "设备地址": "192\\.168\\.3\\." + "34",
    "设备序列号": "ME825" + "00009004287",
    "设备鉴权口令": "Yd" + "123456",
    "内部调试版标识": "800112" + "3456789012",
    "调试版存储路径": "/userdisk/penai" + "/",
    "内部资料路径": "新闻" + "解决方案|" + "_res" + "earch",
    "云游戏项目标识": "800112" + "3456789130|Cloud" + "StarRail|cloud" + "game|云崩" + "铁|星穹" + "铁道",
    "云游戏模块路径": "/userdisk/c" + "g|userdisk/cloud" + "game|cg" + "media|kms" + "sink|mpp" + "videodec",
    "云游戏侧车文件": "player" + ".py|cg" + "ctl|plane" + "peek|cg." + "vid|cg." + "pcm",
}

SKIP_DIRS = {"node_modules", "__pycache__", ".falcon_", ".falcon_tmp", ".git"}


def main() -> int:
    root = os.path.abspath(sys.argv[1])
    compiled = {k: re.compile(v.encode("utf-8")) for k, v in PATTERNS.items()}
    hits: dict[str, list[str]] = {k: [] for k in PATTERNS}
    scanned = 0
    for dp, dn, fn in os.walk(root, followlinks=False):
        dn[:] = [d for d in dn if d not in SKIP_DIRS]
        for name in fn:
            p = os.path.join(dp, name)
            try:
                with open(p, "rb") as f:
                    data = f.read()
            except OSError:
                continue
            scanned += 1
            for key, rx in compiled.items():
                if rx.search(data):
                    hits[key].append(os.path.relpath(p, root))
    print("扫描文件数: %d" % scanned)
    failed = False
    for key, paths in hits.items():
        if paths:
            failed = True
            print("HIT  %s: %s" % (key, ", ".join(paths)))
        else:
            print("ok    %s" % key)
    print("FAIL 安全扫描未通过" if failed else "OK 安全扫描通过")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
