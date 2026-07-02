# Melhorias — PLANEJAMENTO_SAFRA_2627.xlsx

Arquivo entregue: **`PLANEJAMENTO_SAFRA_2627.xlsx`** (versão melhorada).
Backup do original: **`PLANEJAMENTO_SAFRA_2627_ORIGINAL.xlsx`**.

## O que a planilha faz
Consolida a demanda de insumos de todos os talhões (`TL01`–`TL19`) na aba
`PORTIFÓLIO` e calcula a **demanda de compras subtraindo o estoque**:

```
A COMPRAR = DEMANDA (necessidade total) − ESTOQUE (o que já tenho)
```

## Melhorias aplicadas

### 1. Correção de bug financeiro (crítico)
Na aba `PORTIFÓLIO`, a coluna **U (VOLUME INDICADO)** usava `= R − T`
(demanda − estoque). Quando o **estoque era maior que a demanda**, o resultado
ficava **negativo**, e como `VALOR TOTAL = U × preço`, esses valores negativos
**abatiam o total da compra**, subestimando o orçamento.

- Corrigido para **`= MÁX(0; R − T)`** — nunca compra negativa.
- **12 itens** estavam negativos (ex.: POQUER −R$ 24.296, NATIVO −R$ 22.998,
  PROCLAIM 50 −R$ 22.504).
- Impacto: o orçamento de compras estava **subestimado em ≈ R$ 106.543,68**.

### 2. Nova aba `DEMANDA DE COMPRAS` (lista de compras acionável)
Antes a demanda de compra ficava “escondida” em uma matriz de 24 colunas.
A nova aba é uma lista limpa e pronta para uso, com, por item:

| Coluna | Conteúdo |
|--------|----------|
| CLASSE / FORNECEDOR / PRODUTO / UN | dados do insumo |
| DEMANDA | necessidade total (`PORTIFÓLIO!R`) |
| ESTOQUE | estoque atual (`PORTIFÓLIO!T`) |
| A COMPRAR | `MÁX(0; Demanda − Estoque)` |
| PREÇO UNIT. | `PORTIFÓLIO!S` |
| VALOR TOTAL | `A Comprar × Preço` |
| STATUS | `COMPRAR` / `OK - ESTOQUE` / `⚠ SEM PREÇO` |

Recursos:
- **KPIs no topo**: total a comprar (R$), nº de itens a comprar, itens sem preço,
  valor imobilizado em estoque.
- **Resumo por classe** (à direita) com total por categoria.
- **Filtro automático**, **painéis congelados** e **cores por status**
  (verde = comprar, amarelo = falta preço).
- Tudo **vinculado por fórmula** ao `PORTIFÓLIO`: editar o estoque lá
  (coluna T) atualiza a lista automaticamente.
- Mostra apenas insumos com demanda ou estoque (máquinas excluídas); 77 itens.

### 3. Nova aba `COTAÇÃO FORNECEDOR`
Itens **a comprar** (já descontado o estoque) **agrupados por fornecedor**,
prontos para pedir cotação. Para cada fornecedor: bloco com produtos, quantidade,
preço de referência, valor de referência e **duas colunas para o fornecedor
preencher** — `PREÇO COTADO` (destacado em amarelo) e `VALOR COTADO` (calcula
sozinho) — com **subtotal por fornecedor** e total geral. São 65 itens em 13
fornecedores.

### 4. Máquinas incluídas na aba `DEMANDA DE COMPRAS`
A aba de demanda agora **inclui as MÁQUINAS** (a pedido), além dos insumos —
89 linhas no total. A aba de cotação continua só com insumos.

### 5. Diagnóstico: itens sem preço
**20 itens** com demanda estão **sem preço** cadastrado (`PORTIFÓLIO!S` vazio —
principalmente fertilizantes e corretivos), então o valor deles não entra no
total. Ficam marcados como **⚠ SEM PREÇO** para preenchimento.

## Observações técnicas
- Preservados: 43 tabelas, 408 validações de dados (listas suspensas),
  fórmulas matriciais, intervalos nomeados e as 24 abas originais.
- Todas as fórmulas novas usam funções padrão (SUM, MÁX, SE, SOMASE,
  SOMARPRODUTO, CONT.SE) — funcionam no **Excel** e no **Google Sheets**.
- As colunas de preço/dose que vinham de `IMPORTRANGE` (Google Sheets) já
  estavam “congeladas” no valor de fallback no `.xlsx` original; isso não foi
  alterado.
