#!/usr/bin/env python3
"""Gera, no fim de app/styles.css, o bloco "Celular: fonte menor em todos os módulos".

Lê todas as regras com font-size em px (nível de cima e @media max-width:640px), reduz ~10% (arredonda em 0,5 px,
mínimo 9,5 px) e escreve um @media (max-width:640px) no fim do arquivo. Fica de fora: campos de texto (input/select/
textarea/.txt/.cell/.sel — 16 px no iPhone evita o zoom ao tocar), quadro de operações (.oq-*, já reduzido na v220),
PDF/impressão (.rx-*, pdf, print, crono) e os botões flutuantes. Rodar de novo substitui o bloco anterior.
"""
import re, pathlib
P=pathlib.Path(__file__).resolve().parent.parent/'app'/'styles.css'
MARK='/* ===== Celular: fonte ~'   # início do bloco gerado (qualquer fator)
css=P.read_text()
if MARK in css: css=css[:css.index(MARK)].rstrip('\n')+'\n'
FATOR=0.81   # dois cortes de 10% (v236 + v237)
def media_kind(q):
    q=q.lower()
    if 'print' in q: return 'print'
    if 'max-width:640' in q or 'max-width: 640' in q: return 'mobile'
    return 'other'
i=0; n=len(css); stack=[]; rules=[]; buf=''
while i<n:
    c=css[i]
    if css.startswith('/*',i):
        j=css.find('*/',i+2); i=j+2 if j>0 else n; continue
    if c=='{':
        sel=buf.strip(); buf=''
        if sel.startswith('@media'): stack.append(media_kind(sel)); i+=1; continue
        if sel.startswith('@'):
            depth=1; j=i+1
            while j<n and depth:
                if css[j]=='{': depth+=1
                elif css[j]=='}': depth-=1
                j+=1
            i=j; continue
        j=css.find('}',i); rules.append((sel, css[i+1:j], stack[-1] if stack else 'top')); i=j+1; continue
    if c=='}':
        if stack: stack.pop()
        buf=''; i+=1; continue
    buf+=c; i+=1
skip=re.compile(r'input|select|textarea|\.txt|\.cell|\.sel\b|oq-|rx-|pdf|print|crono|#print-area|\.mapa-fab|\.rcv-fab|leaflet')
final={}; order=0
for sel,decl,med in rules:
    if med not in ('top','mobile'): continue
    m=re.findall(r'(?:^|;)\s*font-size\s*:\s*([\d.]+)px\s*(!important)?', decl)
    if not m: continue
    val=float(m[-1][0]); imp=bool(m[-1][1])
    if val<11.5: continue
    novo=max(9.5, round(val*FATOR*2)/2)
    for p in [p.strip() for p in sel.split(',') if p.strip() and not skip.search(p)]:
        order+=1; prev=final.get(p)
        if prev and prev[3]=='mobile' and med=='top': continue   # a regra do bloco do celular vence a do topo
        final[p]=(novo,imp,order,med)
items=sorted(final.items(), key=lambda kv: kv[1][2])
out=['',MARK+'20% menor em todos os módulos (v236+v237), como no quadro de operações. Campos de texto continuam com 16px (iPhone não dá zoom). Gerado por scripts/css_fonte_celular.py — não edite à mão, rode o script ===== */','@media (max-width:640px){']
out+=[f'  {sel}{{font-size:{v:g}px{" !important" if imp else ""}}}' for sel,(v,imp,o,med) in items]
out.append('}')
P.write_text(css+'\n'.join(out)+'\n'); print(len(items),'seletores')
