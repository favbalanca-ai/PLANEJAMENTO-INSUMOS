# PLANEJAMENTO-INSUMOS

Planejamento de safra e **demanda de compras de insumos** (Safra 2026/2027).

- `PLANEJAMENTO_SAFRA_2627.xlsx` — planilha melhorada (ver `MELHORIAS.md`).
- `PLANEJAMENTO_SAFRA_2627_ORIGINAL.xlsx` — versão original (backup).
- `MELHORIAS.md` — o que foi melhorado e por quê.
- `scripts/build_melhorias.py` — script que gera a versão melhorada a partir do original.

A demanda de compra é calculada por: **A COMPRAR = MÁX(0; Demanda − Estoque)**,
consolidada na aba `DEMANDA DE COMPRAS`.

## Web app

Em `app/` há um **aplicativo web** (estático, sem backend) para planejamento
completo por talhão — painel de indicadores, talhões editáveis, demanda de
compras, cotação por fornecedor e DRE orçada. Os dados saem da planilha e as
edições ficam salvas no navegador.

```bash
cd app && python3 -m http.server 8091   # abra http://localhost:8091
```

Detalhes e publicação no GitHub Pages: `app/README.md`.
Para regerar os dados: `python3 scripts/extract_data.py PLANEJAMENTO_SAFRA_2627_ORIGINAL.xlsx`.
