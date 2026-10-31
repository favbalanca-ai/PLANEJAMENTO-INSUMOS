#!/usr/bin/env python3
"""Cadastro do RNC (Registro Nacional de Cultivares, consulta pública do CultivarWeb) → app/agrofit/cultivares.json

Lê a lista de cultivares registradas (DENOMINAÇÃO · TIPO DE REGISTRO · MANTENEDOR · Nº REGISTRO) e grava em cada
cultivar do cultivares.json (gerado pelo sigef_build.py) o campo "rnc": {"n": nº de registro, "m": mantenedor,
"t": tipo de registro}. Junção pelo nome da cultivar (normalizado). Cultivares do RNC que não têm campo de produção no
SIGEF entram na lista com nc=0 quando a consulta por espécie funciona.

Uso: python3 scripts/rnc_build.py app/agrofit [--probe]
Sem dependências externas. Roda no GitHub Actions junto com o Agrofit/SIGEF (a consulta é lenta: ~385 páginas).
"""
import json, os, re, sys, time, html, unicodedata, urllib.request, urllib.parse, http.cookiejar

BASE = 'https://sistemas.agricultura.gov.br/snpc/cultivarweb/cultivares_registradas.php'
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
cj = http.cookiejar.CookieJar(); op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))

def get(u, data=None, tent=3):
    for i in range(tent):
        try:
            rq = urllib.request.Request(u, data=data, headers={'User-Agent': UA, 'Referer': BASE, **({'Content-Type': 'application/x-www-form-urlencoded'} if data else {})})
            r = op.open(rq, timeout=600); return r.read().decode('utf-8', 'ignore')
        except Exception as e:
            print('  falha', e, '— tentativa', i + 1); time.sleep(20)
    raise SystemExit('CultivarWeb indisponível')

def strip(s): return html.unescape(re.sub(r'<[^>]+>', ' ', s or '')).replace('\xa0', ' ').strip()
def norm(s):
    s = unicodedata.normalize('NFD', str(s or ''))
    return re.sub(r'[^a-z0-9]+', '', ''.join(c for c in s if unicodedata.category(c) != 'Mn').lower())

def csrf():
    h = get(BASE); m = re.search(r'name="csrf_token" value="([0-9a-f]+)"', h)
    return (m.group(1) if m else ''), h

def campos(tok, pagina=1, cod_especie=''):
    return {'csrf_token': tok, 'postado': '1', 'cod_pagina': str(pagina), 'validar': '0', 'cod_especie': cod_especie, 'txt_nome_comum': '',
            'txt_denominacao': '', 'txt_requerente': '', 'txt_num_formulario': '', 'cod_evento_ogm': '', 'ct_captcha': '', 'acao': 'Pesquisar'}

def linhas(t):
    """linhas da tabela de resultados: [denominação, tipo, mantenedor, nº registro]"""
    out = []
    for tr in re.findall(r'<tr[^>]*>(.*?)</tr>', t, re.S | re.I):
        tds = [strip(c) for c in re.findall(r'<td[^>]*>(.*?)</td>', tr, re.S | re.I)]
        if len(tds) >= 4 and re.fullmatch(r'\d{3,6}', tds[3].replace(' ', '')):
            out.append(tds[:4])
    return out

def total(t):
    m = re.search(r'retornou\s+([\d.]+)\s+registros', t); return int(m.group(1).replace('.', '')) if m else 0
def npaginas(t):
    ps = [int(x) for x in re.findall(r'cod_pagina\D{0,40}?(\d+)', t)] or [int(x) for x in re.findall(r'>\s*(\d{1,4})\s*<', t)]
    m = re.search(r'DE\s+(\d+)', t); return int(m.group(1)) if m else (max(ps) if ps else 1)

def probe():
    tok, h = csrf(); print('csrf', tok[:8])
    t = get(BASE, urllib.parse.urlencode(campos(tok, 1)).encode())
    print('total', total(t), 'páginas', npaginas(t)); L = linhas(t); print('linhas pág.1', len(L)); [print('  ', l) for l in L[:5]]
    # como é o paginador?
    for m in re.findall(r'<a[^>]+>[^<]{0,6}</a>', t)[:12]: print('  link', m[:200])
    for m in re.findall(r'(?:onclick|href)="[^"]*(?:pagina|page)[^"]*"', t, re.I)[:6]: print('  pager', m[:200])
    t2 = get(BASE, urllib.parse.urlencode(campos(tok, 2)).encode()); L2 = linhas(t2); print('linhas pág.2', len(L2), 'diferente da 1?', bool(L2) and L2[0] != L[0]); [print('  ', l) for l in L2[:3]]
    # espécies: códigos
    e = get('https://sistemas.agricultura.gov.br/snpc/cultivarweb/lista_especies.php?cod_uso_snpc_rnc=1')
    print('lista_especies bytes', len(e)); opts = re.findall(r'<option[^>]*value="?(\d+)"?[^>]*>(.*?)</option>', e, re.S | re.I)
    print('options', len(opts)); soja = [o for o in opts if 'glycine' in o[1].lower()]; print('soja', soja[:3])
    if not opts:
        for m in re.findall(r'<a[^>]*>.{0,120}?glycine.{0,80}?</a>', e, re.S | re.I)[:3]: print('  esp link', re.sub(r'\s+', ' ', m)[:300])
        for m in re.findall(r'.{0,200}glycine.{0,200}', e, re.S | re.I)[:2]: print('  esp ctx', re.sub(r'\s+', ' ', m)[:400])
    if soja:
        ts = get(BASE, urllib.parse.urlencode(campos(tok, 1, soja[0][0])).encode()); print('SOJA total', total(ts), 'linhas', len(linhas(ts))); [print('  ', l) for l in linhas(ts)[:5]]

def probe_detalhe(nome, p0=280):
    """sonda: varre as páginas (ordem: espécie, depois nome) a partir de p0 até achar a cultivar; abre o DETALHE e baixa o PDF de descritores"""
    import subprocess
    tok, _ = csrf(); achou = None
    for pg in range(p0, 385):
        d = get(BASE, urllib.parse.urlencode(campos(tok, pg)).encode()); L = linhas(d)
        trs = re.findall(r'<tr[^>]*>(.*?)</tr>', d, re.S | re.I)
        print('pág', pg, 'primeira:', L[0][0] if L else '-', '| última:', L[-1][0] if L else '-', flush=True)
        for tr in trs:
            tds = [strip(c) for c in re.findall(r'<td[^>]*>(.*?)</td>', tr, re.S | re.I)]
            if tds and norm(tds[0]) == norm(nome):
                m = re.search(r'codsr=(\d+)', tr); achou = (tds[:4], m.group(1) if m else None, pg); break
        if achou: break
    print('ACHOU', achou)
    if not achou or not achou[1]: return
    d = get('https://sistemas.agricultura.gov.br/snpc/cultivarweb/detalhe_cultivar.php?codsr=' + achou[1] + '&codverif=0')
    txt = re.sub(r'\s+', ' ', strip(d)); print('DETALHE', txt[:1500])
    m = re.search(r"pdf\((\d+)\)", d); print('cod_solic', m.group(1) if m else None)
    if not m: return
    pu = 'https://sistemas.agricultura.gov.br/snpc/protocolo/relatorios_rnc/pdf_descritores2.php?cod_solicitacao_registro=' + m.group(1) + '&cod_cultivarweb=1'
    rq = urllib.request.Request(pu, headers={'User-Agent': UA, 'Referer': BASE}); r = op.open(rq, timeout=600); b = r.read()
    print('PDF bytes', len(b), 'tipo', r.headers.get('Content-Type'), 'inicio', b[:8])
    open('desc.pdf', 'wb').write(b)
    try:
        out = subprocess.run(['pdftotext', '-layout', 'desc.pdf', '-'], capture_output=True, text=True, timeout=120).stdout
        print('PDFTEXT', re.sub(r'[ \t]+', ' ', out)[:7000])
    except Exception as e: print('pdftotext falhou', e, strip(b.decode('latin-1', 'ignore'))[:1500])

def main(out_dir, probe_only=False):
    if probe_only == 'detalhe': return probe_detalhe(sys.argv[3] if len(sys.argv) > 3 else '24428I2X', int(sys.argv[4]) if len(sys.argv) > 4 else 280)
    if probe_only: return probe()
    path = os.path.join(out_dir, 'cultivares.json'); d = json.load(open(path, encoding='utf-8'))
    tok, _ = csrf(); t = get(BASE, urllib.parse.urlencode(campos(tok, 1)).encode())
    n, np_ = total(t), npaginas(t); print('RNC: total', n, 'páginas', np_)
    if n < 1000 or np_ < 2: raise SystemExit('RNC: resposta inesperada (sem lista) — mantém o cultivares.json anterior')
    rows = linhas(t)
    for p in range(2, np_ + 1):
        tp = get(BASE, urllib.parse.urlencode(campos(tok, p)).encode()); lp = linhas(tp)
        if not lp: print('  página', p, 'vazia'); 
        rows += lp
        if p % 25 == 0: print('  página', p, '/', np_, 'linhas', len(rows)); time.sleep(0.5)
    print('RNC: linhas', len(rows))
    porNome = {}
    for den, tipo, mant, nreg in rows:
        k = norm(den); porNome.setdefault(k, []).append({'n': nreg.replace(' ', ''), 'm': mant, 't': tipo})
    casados = 0
    for c in d.get('cultivares', []):
        r = porNome.get(norm(c.get('c')))
        if r: c['rnc'] = r[0] if len(r) == 1 else dict(r[0], amb=len(r)); casados += 1
        else: c.pop('rnc', None)
    d['rnc_em'] = time.strftime('%Y-%m-%d'); d['rnc_total'] = len(rows)
    json.dump(d, open(path, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print('RNC: cultivares do SIGEF com cadastro:', casados, 'de', len(d.get('cultivares', [])))

if __name__ == '__main__':
    main(sys.argv[1], 'detalhe' if '--detalhe' in sys.argv else ('--probe' in sys.argv))
