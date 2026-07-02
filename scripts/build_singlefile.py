#!/usr/bin/env python3
"""Gera app/planejamento_app.html: versão autocontida (HTML+CSS+JS+dados em 1 arquivo),
que abre direto no navegador sem servidor. Uso: python3 scripts/build_singlefile.py
"""
import os
A = "app"
html = open(os.path.join(A, "index.html"), encoding="utf-8").read()
css  = open(os.path.join(A, "styles.css"), encoding="utf-8").read()
js   = open(os.path.join(A, "app.js"), encoding="utf-8").read()
data = open(os.path.join(A, "data.json"), encoding="utf-8").read()

# embute os dados e dispensa o fetch
js = js.replace("fetch('data.json').then(r=>r.json())", "Promise.resolve(window.__DATA__)")
js = "window.__DATA__=" + data + ";\n" + js

html = html.replace('<link rel="stylesheet" href="styles.css">', f"<style>\n{css}\n</style>")
html = html.replace('<script src="app.js"></script>', f"<script>\n{js}\n</script>")

out = os.path.join(A, "planejamento_app.html")
open(out, "w", encoding="utf-8").write(html)
print(f"OK -> {out} ({os.path.getsize(out)} bytes)")
