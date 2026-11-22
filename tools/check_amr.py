#!/usr/bin/env python3
"""校验 PenAI .amr 安装包自包含性。

用法: python tools/check_amr.py <xxx.amr>

检查项：
  1. manifest.json 的 cert 条目与 zip 内文件一一对应（名字/大小/md5）
  2. app.js / index.js / 每个注册页面 / 图标都在包内
  3. 不含任何原生模块
  4. 不含调试页面与危险路径
任何一项失败即退出码 1，用于 build.mjs 构建后硬门禁。
"""
from __future__ import annotations

import hashlib
import json
import pathlib
import sys
import zipfile

fail = 0


def ok(cond: bool, msg: str) -> None:
    global fail
    if cond:
        print("ok    " + msg)
    else:
        fail += 1
        print("FAIL  " + msg)


def main() -> int:
    global fail
    amr = pathlib.Path(sys.argv[1]).resolve()
    out = amr.parent
    with zipfile.ZipFile(amr) as z:
        names = [i.filename for i in z.infolist() if i.filename != "manifest.json"]
        man = json.loads(z.read("manifest.json").decode("utf-8"))
        cert = man.get("cert", {})

        print("== 包内条目 ==")
        for n in sorted(names):
            print("      " + n)

        ok("app.js.bin" in names, "app.js.bin 存在（应用入口）")
        ok("index.js.bin" in names, "index.js.bin 存在（主页入口）")
        ok(man.get("icon", "app_icon.png") in names, "图标存在：" + str(man.get("icon")))

        print("== manifest 一致性 ==")
        # 图标由 manifest.icon 单独声明，构建工具不把它写进 cert
        signed = [n for n in names if n != man.get("icon", "app_icon.png")]
        ok(set(signed) == set(cert.keys()),
           "cert 与包内文件一一对应（多 %d / 少 %d）"
           % (len(set(signed) - set(cert)), len(set(cert) - set(signed))))
        for n in sorted(set(signed) & set(cert)):
            raw = z.read(n)
            want = cert[n]
            ok(len(raw) == want.get("size") and
               hashlib.md5(raw).hexdigest() == want.get("md5"),
               "%s 大小与 md5 一致" % n)

        print("== 依赖完整性 ==")
        appjson = out / "src" / "app.json"
        if appjson.exists():
            pages = json.loads(appjson.read_text(encoding="utf-8")).get("pages", {})
            for key, src in pages.items():
                # 编译产物按 app.json 的页面键命名：index -> index.js.bin
                # （索引页实际指向 pages/chat/chat.vue，不能用目录名推）
                ok(key + ".js.bin" in names, "页面 %s -> %s.js.bin (%s)" % (key, key, src))
        else:
            ok(False, "找不到 src/app.json，无法核对页面清单")

        print("== 依赖洁净度 ==")
        native = [n for n in names if n.lower().endswith(".so") or n.startswith("libs/")]
        ok(not native, "不含任何原生模块（发现：%s）" % ", ".join(native))
        ok(not any(n in ("gstprobe.js.bin", "probe.js.bin", "scanprobe.js.bin") for n in names),
           "不含调试页面")

        print("== 发行版洁净度 ==")
        for bad in ("probe.js.bin", "scanprobe.js.bin", "gstprobe.js.bin"):
            ok(bad not in names, "不含调试页面 " + bad)
        for n in names:
            ok(not n.startswith("/") and ".." not in pathlib.PurePosixPath(n).parts,
               "路径安全：" + n)

    print("OK  安装包自包含校验通过" if fail == 0 else "FAIL %d 项" % fail)
    return 0 if fail == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
