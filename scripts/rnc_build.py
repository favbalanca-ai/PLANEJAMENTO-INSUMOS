#!/usr/bin/env python3
"""Cadastro do RNC (Registro Nacional de Cultivares, consulta pública do CultivarWeb) → app/agrofit/cultivares.json

Lê a lista de cultivares registradas (DENOMINAÇÃO · TIPO DE REGISTRO · MANTENEDOR · Nº REGISTRO) e grava em cada
cultivar do cultivares.json (gerado pelo sigef_build.py) o campo "rnc": {"n": nº de registro, "m": mantenedor,
"t": tipo de registro}. Junção pelo nome da cultivar (normalizado). Cultivares do RNC que não têm campo de produção no
SIGEF entram na lista com nc=0 quando a consulta por espécie funciona.

Uso: python3 scripts/rnc_build.py app/agrofit [--probe | --so-detalhes | --pdf CODSR...]
Detalhes (tecnologia/evento GM, situação, datas, regiões de adaptação, descritores do PDF) vão para app/agrofit/rnc_det.json,
só para soja, milho e sorgo, até RNC_DET_CAP (1500) por rodada (precisa de pdftotext/poppler-utils).
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
    """linhas da tabela de resultados: [denominação, tipo, mantenedor, nº registro, codsr (link DETALHE)]"""
    out = []
    for tr in re.findall(r'<tr[^>]*>(.*?)</tr>', t, re.S | re.I):
        tds = [strip(c) for c in re.findall(r'<td[^>]*>(.*?)</td>', tr, re.S | re.I)]
        if len(tds) >= 4 and re.fullmatch(r'\d{3,6}', tds[3].replace(' ', '')):
            m = re.search(r'codsr=(\d+)', tr); out.append(tds[:4] + [m.group(1) if m else ''])
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

def probe_pdf(codsr):
    import subprocess, tempfile
    h = get('https://sistemas.agricultura.gov.br/snpc/cultivarweb/detalhe_cultivar.php?codsr=' + str(codsr) + '&codverif=0')
    m = re.search(r'pdf\((\d+)\)', h); print('PDF codsr', codsr, 'cod_solic', m and m.group(1))
    if not m: return
    rq = urllib.request.Request('https://sistemas.agricultura.gov.br/snpc/protocolo/relatorios_rnc/pdf_descritores2.php?cod_solicitacao_registro=' + m.group(1) + '&cod_cultivarweb=1', headers={'User-Agent': UA, 'Referer': BASE})
    b = op.open(rq, timeout=300).read()
    with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as f: f.write(b); fn = f.name
    print(subprocess.run(['pdftotext', '-layout', fn, '-'], capture_output=True, text=True, timeout=60).stdout[:12000])

def main(out_dir, probe_only=False):
    if probe_only == 'pdf': return [probe_pdf(c) for c in sys.argv[3:]]
    if probe_only == 'sodet': d = json.load(open(os.path.join(out_dir, 'cultivares.json'), encoding='utf-8')); return detalhes(d, out_dir)
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
    for den, tipo, mant, nreg, codsr in rows:
        k = norm(den); porNome.setdefault(k, []).append({'n': nreg.replace(' ', ''), 'm': mant, 't': tipo, 's': codsr})
    casados = 0
    for c in d.get('cultivares', []):
        r = porNome.get(norm(c.get('c')))
        if r: c['rnc'] = r[0] if len(r) == 1 else dict(r[0], amb=len(r)); casados += 1
        else: c.pop('rnc', None)
    d['rnc_em'] = time.strftime('%Y-%m-%d'); d['rnc_total'] = len(rows)
    json.dump(d, open(path, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print('RNC: cultivares do SIGEF com cadastro:', casados, 'de', len(d.get('cultivares', [])))
    try: detalhes(d, out_dir)
    except SystemExit: raise
    except Exception as e: print('RNC detalhes: falhou —', e)

# ---- detalhes (página da cultivar + PDF de descritores) para as culturas da fazenda ----
ESPECIES_DET = {'Soja', 'Milho', 'Sorgo'}   # culturas da fazenda com detalhe (pedido da dona: só estas)
def _br(d):
    m = re.match(r'(\d{2})/(\d{2})/(\d{4})', d or ''); return f'{m.group(3)}-{m.group(2)}-{m.group(1)}' if m else ''
def detalhe_de(codsr):
    """{gm, sit, dt, val, rec:[...], desc:{...}} de uma cultivar; desc vem do PDF (pdftotext)"""
    import subprocess, tempfile
    h = get('https://sistemas.agricultura.gov.br/snpc/cultivarweb/detalhe_cultivar.php?codsr=' + str(codsr) + '&codverif=0')
    txt = re.sub(r'\s+', ' ', strip(h)); o = {}
    m = re.search(r'TRANSFORMAÇÃO GENÉTICA:\s*(.*?)\s*NOME COMUM', txt);  o['gm'] = m.group(1).strip()[:300] if m else ''
    m = re.search(r'SITUAÇÃO:\s*([A-ZÇÃÕÉÍÓÚÂÊ ]+?)\s+Nº', txt);              o['sit'] = m.group(1).strip() if m else ''
    m = re.search(r'DATA DO REGISTRO:\s*(\d{2}/\d{2}/\d{4})', txt);            o['dt'] = _br(m.group(1)) if m else ''
    m = re.search(r'VALIDADE DO REGISTRO:\s*(\d{2}/\d{2}/\d{4})', txt);        o['val'] = _br(m.group(1)) if m else ''
    m = re.search(r'REGIÃO DE ADAPTAÇÃO.*?\)\s*((?:[A-Z]{2} - \d{3}\s*)+)', txt); o['rec'] = re.findall(r'[A-Z]{2} - \d{3}', m.group(1)) if m else []
    o['rec'] = [x.replace(' - ', '-') for x in o['rec']]
    m = re.search(r'pdf\((\d+)\)', h); o['desc'] = {}
    if m:
        try:
            rq = urllib.request.Request('https://sistemas.agricultura.gov.br/snpc/protocolo/relatorios_rnc/pdf_descritores2.php?cod_solicitacao_registro=' + m.group(1) + '&cod_cultivarweb=1', headers={'User-Agent': UA, 'Referer': BASE})
            b = op.open(rq, timeout=300).read()
            if b[:4] == b'%PDF':
                with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as f: f.write(b); fn = f.name
                out = subprocess.run(['pdftotext', '-layout', fn, '-'], capture_output=True, text=True, timeout=60).stdout; os.unlink(fn)
                o['desc'] = parse_desc(out)
        except Exception as e: o['descErro'] = str(e)[:80]
    return o

def parse_desc(out):
    """Lê a tabela DESCRITOR | DETALHAMENTO do texto do PDF (pdftotext -layout).
    O nome do descritor e o valor podem quebrar em várias linhas, centralizados verticalmente:
    k linhas só de nome, a linha do meio (nome+valor ou só valor) e k linhas só de nome (ou o mesmo com o valor)."""
    desc = {}
    for pag in out.split('\f'):
        ls = pag.splitlines(); hi = next((i for i, l in enumerate(ls) if 'DESCRITOR' in l and 'DETALHAMENTO' in l), None)
        if hi is None: continue
        corpo = []
        for l in ls[hi + 1:]:
            if 'Nº de inscrição' in l or 'Os descritores declarados' in l or 'Mantenedores:' in l: break
            if l.strip(): corpo.append(l.rstrip())
        # coluna do DETALHAMENTO: onde começa o texto depois de um vão de 3+ espaços (ou de uma linha só com valor, recuada)
        cand = []
        for l in corpo:
            m = re.match(r'\s{8,}(\S)', l)
            if m: cand.append(m.start(1)); continue
            m = re.search(r'\S\s{3,}(\S)', l)
            if m: cand.append(m.start(1))
        col = max((min(cand) if cand else ls[hi].index('DETALHAMENTO')) - 1, 1); it = []
        for l in corpo: it.append((l[:col].strip(), l[col:].strip()))
        i = 0
        while i < len(it):
            lado = 0 if it[i][0] and not it[i][1] else (1 if it[i][1] and not it[i][0] else None)
            k = 0
            if lado is not None:
                while i + k < len(it) and bool(it[i + k][0]) != bool(it[i + k][1]) and (bool(it[i + k][1]) == bool(lado)): k += 1
            if i + k >= len(it): fim = len(it)
            else:
                fim = i + k + 1
                j = 0
                while j < k and fim + j < len(it) and bool(it[fim + j][0]) != bool(it[fim + j][1]) and (bool(it[fim + j][1]) == bool(lado)): j += 1
                if j == k: fim += k
            grupo = it[i:fim]; i = fim
            nome = ' '.join(x[0] for x in grupo if x[0]).strip(); val = ' '.join(x[1] for x in grupo if x[1]).strip()
            if nome and val and len(nome) < 160: desc[nome.upper()] = val
    return consolida(desc)

# nomes oficiais dos descritores (soja, milho e sorgo) — servem para juntar pedaços que o PDF separou
DESC_CONHECIDOS = {
    'COR DA FLOR', 'COR DO HILO', 'COR DA VAGEM', 'COR DO TEGUMENTO', 'TIPO DE CRESCIMENTO', 'FORMA DA SEMENTE', 'COR DA PUBESCÊNCIA',
    'BRILHO DA SEMENTE', 'REAÇÃO À PEROXIDASE', 'DENSIDADE DA PUBESCÊNCIA', 'PIGM ANTOCIÂNICA HIPOCÓTILO',
    'FORMA DA PONTA DA PRIMEIRA FOLHA', 'ÂNGULO ENTRE A LÂMINA FOLIAR E O CAULE, MEDIDO LOGO ACIMA DA ESPIGA SUPERIOR',
    'COMPORTAMENTO DA LÂMINA FOLIAR ACIMA DA ESPIGA SUPERIOR', 'COMPRIMENTO DA HASTE PRINCIPAL DO PENDÃO, MEDIDO ENTRE O PONTO DE ORIGEM E O ÁPICE DA HASTE CENTRAL',
    'ÂNGULO ENTRE A HASTE PRINCIPAL DO PENDÃO E A RAMIFICAÇÃO LATERAL, NO TERÇO INFERIOR DO PENDÃO', 'COLORAÇÃO DO ESTIGMA PELA ANTOCIANINA',
    'TIPO DE GRÃO, MEDIDO NO TERÇO MÉDIO DA ESPIGA', 'ALTURA DA PLANTA (CM)',
    'COR DA PLANTA', 'FORMA DA PANÍCULA', 'PIGMENTAÇÃO DO COLEÓPTILO PELA ANTOCIANINA', 'CEROSIDADE DA BAINHA DAS FOLHAS', 'COMPRIMENTO DA FLOR PEDICELADA',
    'DENSIDADE DA PANÍCULA', 'PIGMENTAÇÃO DA NERVURA CENTRAL DAS FOLHAS (NA 3ª FOLHA A PARTIR DA FOLHA BANDEIRA)', 'PRESENÇA E COMPRIMENTO DA ARISTA NA LEMA'}
VALORES_SOLTOS = ('PRESENTE', 'AUSENTE')
def consolida(desc):
    """Junta descritores que vieram partidos em 2–3 chaves seguidas (nome quebrado em linhas iguais ao valor)
    e separa 'NOME PRESENTE' quando o valor caiu na coluna do nome. Mantém a ordem."""
    ks = list(desc.items()); out = {}; i = 0
    while i < len(ks):
        feito = False
        for n in (3, 2):
            if i + n <= len(ks):
                nome = ' '.join(k for k, _ in ks[i:i + n]).replace('  ', ' ')
                if nome in DESC_CONHECIDOS:
                    out[nome] = ' '.join(v for _, v in ks[i:i + n] if v).strip(); i += n; feito = True; break
        if feito: continue
        k, v = ks[i]; i += 1
        for w in VALORES_SOLTOS:
            if k.endswith(' ' + w) and k[:-len(w) - 1] in DESC_CONHECIDOS: k, v = k[:-len(w) - 1], (w + ' ' + v).strip(); break
        out[k] = v
    return out

def detalhes(d, out_dir, cap=None):
    cap = int(cap or os.environ.get('RNC_DET_CAP') or 1500)
    pathD = os.path.join(out_dir, 'rnc_det.json')
    try: det = json.load(open(pathD, encoding='utf-8'))
    except Exception: det = {}
    esp = d.get('especies', []); alvo = {i for i, e in enumerate(esp) if e.get('n') in ESPECIES_DET}
    cands = [c for c in d.get('cultivares', []) if c.get('e') in alvo and c.get('rnc') and c['rnc'].get('s') and (c['rnc']['s'] not in det or det[c['rnc']['s']].get('descErro'))]
    cands.sort(key=lambda c: -int(re.sub(r'\D', '', c['rnc']['n']) or 0))   # nº de registro maior = mais nova primeiro
    print('RNC detalhes: já tem', len(det), '| faltam', len(cands), '| nesta rodada até', cap)
    n = 0; t0 = time.time()
    for c in cands[:cap]:
        try: det[c['rnc']['s']] = detalhe_de(c['rnc']['s']); n += 1
        except Exception as e: print('  erro', c.get('c'), e)
        if n % 50 == 0: print('  ', n, 'detalhes', '%.0fs' % (time.time() - t0), flush=True); json.dump(det, open(pathD, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    json.dump(det, open(pathD, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print('RNC detalhes: gravados', n, 'novos; total', len(det), 'em', pathD)

if __name__ == '__main__':
    main(sys.argv[1], 'pdf' if '--pdf' in sys.argv else 'sodet' if '--so-detalhes' in sys.argv else ('detalhe' if '--detalhe' in sys.argv else ('--probe' in sys.argv)))
