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

CSS_LOADER = """<script>document.write('<link rel="stylesheet" href="styles.css?t=' + Date.now() + '">');</script>"""
JS_LOADER  = """<script>document.write('<script src="app.js?t=' + Date.now() + '"><\\/script>');</script>"""
assert CSS_LOADER in html and JS_LOADER in html, "index.html: carregadores de CSS/JS não encontrados"
html = html.replace(CSS_LOADER, f"<style>\n{css}\n</style>")
html = html.replace(JS_LOADER, f"<script>\n{js}\n</script>")

out = os.path.join(A, "planejamento_app.html")
open(out, "w", encoding="utf-8").write(html)
print(f"OK -> {out} ({os.path.getsize(out)} bytes)")

# version.json: o app compara com a própria APP_VERSION ao abrir e, se a publicada for mais nova,
# se atualiza sozinho (sem depender de nenhum cache do aparelho)
import re, json
m = re.search(r"APP_VERSION\s*=\s*'([^']+)'", open(os.path.join(A, "app.js"), encoding="utf-8").read())
ver = m.group(1) if m else ""
vp = os.path.join(A, "version.json")
open(vp, "w", encoding="utf-8").write(json.dumps({"version": ver}) + "\n")
print(f"OK -> {vp} ({ver})")
