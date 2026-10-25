#!/usr/bin/env python3
"""Cultivares com produção de sementes (SIGEF, dados abertos do MAPA) → app/agrofit/cultivares.json

Lê o CSV "Campos de produção de sementes" (uma linha por campo inscrito: Safra;Especie;Categoria;Cultivar;
Municipio;UF;Status;Data do Plantio;Data de Colheita;Area;Producao bruta;Producao estimada) e agrega por
espécie + cultivar: nº de campos, estados, categorias, primeira/última safra e área inscrita.

Uso: python3 scripts/sigef_build.py <csv> <pasta de saída>
Sem dependências externas. Roda no GitHub Actions junto com o Agrofit.
"""
import csv, json, os, re, sys, unicodedata, collections, datetime

# nome comum das espécies mais usadas (o resto mostra o nome científico; o app busca pelos dois)
NOMES = [
    ('glycine max', 'Soja'), ('zea mays', 'Milho'), ('phaseolus vulgaris', 'Feijão'), ('vigna unguiculata', 'Feijão-caupi'),
    ('sorghum bicolor', 'Sorgo'), ('triticum aestivum', 'Trigo'), ('triticum', 'Trigo'), ('gossypium', 'Algodão'), ('oryza sativa', 'Arroz'),
    ('avena sativa', 'Aveia-branca'), ('avena strigosa', 'Aveia-preta'), ('avena', 'Aveia'), ('hordeum', 'Cevada'), ('secale', 'Centeio'),
    ('helianthus', 'Girassol'), ('saccharum', 'Cana-de-açúcar'), ('coffea', 'Café'), ('arachis hypogaea', 'Amendoim'), ('arachis', 'Amendoim forrageiro'),
    ('pennisetum glaucum', 'Milheto'), ('cenchrus americanus', 'Milheto'), ('pennisetum purpureum', 'Capim-elefante'), ('cenchrus purpureus', 'Capim-elefante'),
    ('crotalaria', 'Crotalária'), ('lolium', 'Azevém'), ('solanum tuberosum', 'Batata'), ('manihot', 'Mandioca'), ('ricinus', 'Mamona'),
    ('brassica napus', 'Canola'), ('raphanus', 'Nabo forrageiro'), ('eucalyptus', 'Eucalipto'), ('stylosanthes', 'Estilosantes'),
    ('cajanus', 'Feijão-guandu'), ('linum', 'Linho'), ('sesamum', 'Gergelim'), ('lupinus', 'Tremoço'), ('pisum', 'Ervilha'), ('vicia', 'Ervilhaca'),
    ('trifolium', 'Trevo'), ('medicago', 'Alfafa'), ('nicotiana', 'Fumo'), ('urochloa brizantha', 'Braquiária (brizantha)'), ('brachiaria brizantha', 'Braquiária (brizantha)'),
    ('urochloa ruziziensis', 'Braquiária (ruziziensis)'), ('brachiaria ruziziensis', 'Braquiária (ruziziensis)'), ('urochloa decumbens', 'Braquiária (decumbens)'),
    ('brachiaria decumbens', 'Braquiária (decumbens)'), ('urochloa humidicola', 'Braquiária (humidicola)'), ('brachiaria humidicola', 'Braquiária (humidicola)'),
    ('urochloa', 'Braquiária'), ('brachiaria', 'Braquiária'), ('megathyrsus', 'Capim-mombaça / Panicum'), ('panicum maximum', 'Panicum'), ('panicum', 'Panicum'),
    ('cynodon', 'Tifton / Cynodon'), ('andropogon', 'Andropógon'), ('paspalum', 'Paspalum'), ('setaria', 'Setária'), ('cucurbita', 'Abóbora'), ('citrullus', 'Melancia'),
    ('cucumis melo', 'Melão'), ('lycopersicon', 'Tomate'), ('solanum lycopersicum', 'Tomate'), ('capsicum', 'Pimentão / pimenta'), ('allium cepa', 'Cebola'),
    ('daucus', 'Cenoura'), ('lactuca', 'Alface'), ('brassica oleracea', 'Couve / brócolis / repolho'), ('fagopyrum', 'Trigo-mourisco'), ('chenopodium quinoa', 'Quinoa'),
    ('mucuna', 'Mucuna'), ('canavalia', 'Feijão-de-porco'), ('dolichos', 'Lab-lab'), ('lablab', 'Lab-lab'), ('triticosecale', 'Triticale'), ('x triticosecale', 'Triticale')]

def norm(s):
    s = unicodedata.normalize('NFD', s or '')
    return ''.join(c for c in s if unicodedata.category(c) != 'Mn').lower().strip()

def nome_comum(esp):
    n = norm(esp)
    for chave, nome in NOMES:
        if n.startswith(chave): return nome
    return ''

def num(v):
    v = str(v or '').strip().replace('.', '').replace(',', '.')
    try: return float(v)
    except ValueError: return 0.0

def main(csv_path, out_dir):
    raw = open(csv_path, 'rb').read()
    try: txt = raw.decode('utf-8-sig')
    except UnicodeDecodeError: txt = raw.decode('latin-1')
    del raw
    rows = csv.DictReader(txt.splitlines(), delimiter=';')
    cult = {}
    for r in rows:
        esp = re.sub(r'\s+', ' ', (r.get('Especie') or '').strip()); cv = re.sub(r'\s+', ' ', (r.get('Cultivar') or '').strip())
        if not esp or not cv: continue
        k = (esp, cv)
        c = cult.get(k)
        if not c: c = cult[k] = {'nc': 0, 'uf': collections.Counter(), 'cat': collections.Counter(), 'sf': set(), 'ha': 0.0}
        c['nc'] += 1
        uf = (r.get('UF') or '').strip().upper()
        if uf: c['uf'][uf] += 1
        cat = (r.get('Categoria') or '').strip()
        if cat: c['cat'][cat] += 1
        sf = (r.get('Safra') or '').strip()
        if sf: c['sf'].add(sf)
        c['ha'] += num(r.get('Area'))
    # espécies
    esp_cnt = collections.Counter(k[0] for k in cult)
    esp_list = sorted(esp_cnt, key=lambda e: (-esp_cnt[e], norm(e)))
    esp_idx = {e: i for i, e in enumerate(esp_list)}
    especies = [{'c': e, 'n': nome_comum(e), 'q': esp_cnt[e]} for e in esp_list]
    saida = []
    for (esp, cv), c in cult.items():
        sfs = sorted(c['sf'])
        saida.append({'c': cv, 'e': esp_idx[esp], 'nc': c['nc'], 'uf': [[u, n] for u, n in c['uf'].most_common()], 'cat': [k for k, _ in c['cat'].most_common()],
                      'sf0': sfs[0] if sfs else '', 'sf1': sfs[-1] if sfs else '', 'ha': round(c['ha'], 1)})
    saida.sort(key=lambda x: (x['e'], norm(x['c'])))
    hoje = datetime.date.today().isoformat()
    safras = sorted({s for c in cult.values() for s in c['sf']})
    os.makedirs(out_dir, exist_ok=True)
    json.dump({'v': 1, 'atualizado': hoje, 'fonte': 'MAPA — SIGEF, campos de produção de sementes (dados abertos, dados.agricultura.gov.br)', 'n': len(saida),
               'safraMax': safras[-1] if safras else '', 'especies': especies, 'cultivares': saida},
              open(os.path.join(out_dir, 'cultivares.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print('cultivares', len(saida), '| espécies', len(especies), '| com nome comum', sum(1 for e in especies if e['n']), '| última safra', safras[-1] if safras else '')
    print('  cultivares.json', os.path.getsize(os.path.join(out_dir, 'cultivares.json')), 'bytes')

if __name__ == '__main__':
    if len(sys.argv) < 3: print(__doc__); sys.exit(1)
    main(sys.argv[1], sys.argv[2])
