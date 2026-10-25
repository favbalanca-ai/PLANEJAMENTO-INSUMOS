#!/usr/bin/env python3
"""Catálogo MAPA (AGROFIT) → arquivos JSON do app.

Lê o CSV "Produto Formulado" dos dados abertos do MAPA (uma linha por produto × cultura × praga,
separador ';') e gera:

  app/agrofit/produtos.json        todos os produtos registrados (1 registro por nº de registro MAPA)
  app/agrofit/pragas_<cultura>.json alvos registrados por produto, só para as culturas listadas em
                                     scripts/agrofit_culturas.txt (uma por linha; "Milho*" pega variantes)
  app/agrofit/alvos.json           todos os alvos (praga, doença, planta daninha…) com culturas e nº de produtos

Uso: python3 scripts/agrofit_build.py <csv> <pasta de saída> [culturas.txt]
Sem dependências externas. Roda no GitHub Actions (.github/workflows/agrofit-atualiza.yml).
"""
import csv, json, os, re, sys, unicodedata, collections, datetime

C1 = {'\x96': '–', '\x97': '—', '\x91': "'", '\x92': "'", '\x93': '"', '\x94': '"', '\x85': '…'}

def limpa(s):
    s = (s or '').strip()
    for a, b in C1.items(): s = s.replace(a, b)
    return re.sub(r'\s+', ' ', s)

def norm(s):
    s = unicodedata.normalize('NFD', s or '')
    return ''.join(c for c in s if unicodedata.category(c) != 'Mn').lower().strip()

def slug(s):
    return re.sub(r'[^a-z0-9]+', '_', norm(s)).strip('_')

def modo_norm(s):
    s = limpa(s).rstrip('.').strip()
    if not s: return ''
    s = re.sub(r'\s*[/;,]\s*', '/', s)
    return s[0].upper() + s[1:]

def marcas(s):
    out = []
    for m in limpa(s).split(';'):
        m = m.strip()
        if m and m not in out: out.append(m)
    return out

def tipo_alvo(classe):
    c = norm(classe)
    if 'herbicida' in c: return 'Planta daninha'
    if 'nematicida' in c: return 'Nematoide'
    if any(x in c for x in ('fungicida', 'bactericida')): return 'Doença'
    if any(x in c for x in ('inseticida', 'acaricida', 'formicida', 'cupinicida', 'feromonio', 'moluscicida', 'rodenticida', 'agente biologico')): return 'Praga'
    if 'regulador' in c or 'estimulante' in c or 'protetor' in c: return 'Outro'
    return 'Outro'

def le_culturas(path):
    if not path or not os.path.exists(path): return ['Soja', 'Milho', 'Feijão', 'Sorgo', 'Trigo', 'Algodão', 'Pastagens', 'Café']
    out = []
    for l in open(path, encoding='utf-8'):
        l = l.split('#')[0].strip()
        if l: out.append(l)
    return out

def casa(cultura, alvo):
    c, a = norm(cultura), norm(alvo)
    if c == 'todas as culturas': return True   # biológicos etc. registrados para qualquer cultura
    if a.endswith('*'): return c.startswith(a[:-1].strip())
    return c == a

def main(csv_path, out_dir, cult_path=None):
    raw = open(csv_path, 'rb').read()
    try: txt = raw.decode('utf-8-sig')
    except UnicodeDecodeError: txt = raw.decode('latin-1')
    del raw
    rows = csv.DictReader(txt.splitlines(), delimiter=';')
    prods, culturas = {}, set()
    alvos = le_culturas(cult_path)
    pragas = {a: {'nomes': {}, 'lista': [], 'por': collections.defaultdict(list)} for a in alvos}
    todos = {}   # (nome comum, científico) -> {tipos: Counter, cult: set, prods: set}
    for r in rows:
        reg = limpa(r.get('NR_REGISTRO'))
        if not reg: continue
        p = prods.get(reg)
        if not p:
            p = prods[reg] = {'r': reg, 'm': marcas(r.get('MARCA_COMERCIAL')), 'f': limpa(r.get('FORMULACAO')), 'ia': limpa(r.get('INGREDIENTE_ATIVO')),
                              't': limpa(r.get('TITULAR_DE_REGISTRO')), 'c': limpa(r.get('CLASSE')), 'tox': limpa(r.get('CLASSE_TOXICOLOGICA')),
                              'amb': limpa(r.get('CLASSE_AMBIENTAL')), 'org': limpa(r.get('ORGANICOS')), '_ma': collections.Counter(), '_cu': set()}
        ma = modo_norm(r.get('MODO_DE_ACAO'))
        if ma: p['_ma'][ma] += 1
        cu = limpa(r.get('CULTURA'))
        com0, cie0 = limpa(r.get('PRAGA_NOME_COMUM')), limpa(r.get('PRAGA_NOME_CIENTIFICO'))
        if com0 or cie0:
            T = todos.get((com0, cie0))
            if not T: T = todos[(com0, cie0)] = {'tipos': collections.Counter(), 'cult': set(), 'prods': set()}
            T['tipos'][tipo_alvo(p['c'])] += 1; T['prods'].add(reg)
            if cu: T['cult'].add(cu)
        if cu:
            p['_cu'].add(cu); culturas.add(cu)
            for a in alvos:
                if casa(cu, a):
                    com, cie = limpa(r.get('PRAGA_NOME_COMUM')), limpa(r.get('PRAGA_NOME_CIENTIFICO'))
                    if not (com or cie): continue
                    P = pragas[a]; k = (com, cie)
                    i = P['nomes'].get(k)
                    if i is None: i = P['nomes'][k] = len(P['lista']); P['lista'].append([com, cie])
                    if i not in P['por'][reg]: P['por'][reg].append(i)
    cult_list = sorted(culturas, key=norm)
    cult_idx = {c: i for i, c in enumerate(cult_list)}
    classes = collections.Counter()
    saida = []
    for reg in sorted(prods, key=lambda x: (len(x), x)):
        p = prods[reg]
        p['ma'] = p['_ma'].most_common(1)[0][0] if p['_ma'] else ''
        p['cu'] = sorted(cult_idx[c] for c in p['_cu'])
        del p['_ma'], p['_cu']
        classes[p['c'] or '—'] += 1
        saida.append(p)
    hoje = datetime.date.today().isoformat()
    os.makedirs(out_dir, exist_ok=True)
    arq_pragas = {}
    for a in alvos:
        P = pragas[a]
        if not P['lista']: continue
        nome = 'pragas_' + slug(a) + '.json'
        arq_pragas[a] = nome
        json.dump({'v': 1, 'cultura': a, 'atualizado': hoje, 'pragas': P['lista'], 'por': dict(P['por'])},
                  open(os.path.join(out_dir, nome), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    alv = []
    for (com, cie), T in todos.items():
        alv.append({'n': com, 'c': cie, 't': T['tipos'].most_common(1)[0][0], 'cu': sorted(cult_idx[c] for c in T['cult'] if c in cult_idx), 'np': len(T['prods'])})
    alv.sort(key=lambda a: (norm(a['n'] or a['c']), norm(a['c'])))
    tipos = collections.Counter(a['t'] for a in alv)
    json.dump({'v': 1, 'atualizado': hoje, 'n': len(alv), 'tipos': dict(tipos.most_common()), 'culturas': cult_list, 'alvos': alv},
              open(os.path.join(out_dir, 'alvos.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    json.dump({'v': 1, 'atualizado': hoje, 'fonte': 'MAPA — AGROFIT (dados abertos, dados.agricultura.gov.br)', 'n': len(saida),
               'culturas': cult_list, 'pragasCulturas': arq_pragas, 'classes': dict(classes.most_common()), 'produtos': saida},
              open(os.path.join(out_dir, 'produtos.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print('produtos', len(saida), '| culturas', len(cult_list), '| classes', len(classes), '| alvos', len(alv), dict(tipos), '| pragas:', {a: len(pragas[a]['lista']) for a in arq_pragas})
    for f in sorted(os.listdir(out_dir)):
        print(' ', f, os.path.getsize(os.path.join(out_dir, f)), 'bytes')

if __name__ == '__main__':
    if len(sys.argv) < 3: print(__doc__); sys.exit(1)
    main(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
