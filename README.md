# PLANEJAMENTO-INSUMOS

Planejamento de safra e **demanda de compras de insumos** (Safra 2026/2027).

- `PLANEJAMENTO_SAFRA_2627.xlsx` — planilha melhorada (ver `MELHORIAS.md`).
- `PLANEJAMENTO_SAFRA_2627_ORIGINAL.xlsx` — versão original (backup).
- `MELHORIAS.md` — o que foi melhorado e por quê.
- `scripts/build_melhorias.py` — script que gera a versão melhorada a partir do original.

A demanda de compra é calculada por: **A COMPRAR = MÁX(0; Demanda − Estoque)**,
consolidada na aba `DEMANDA DE COMPRAS`.
