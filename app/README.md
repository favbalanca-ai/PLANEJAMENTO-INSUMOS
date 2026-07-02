# App — Planejamento de Safra 26/27

Web app **estático** (sem backend) para planejamento completo por talhão, com
demanda de compras, cotação e DRE orçada. Os dados base saem da planilha
`PLANEJAMENTO_SAFRA_2627.xlsx`; suas edições ficam salvas no navegador
(`localStorage`).

## Como rodar

**Opção 1 — arquivo único (mais fácil):** abra **`planejamento_app.html`** direto
no navegador (duplo clique). É uma versão autocontida (HTML+CSS+JS+dados em um só
arquivo), não precisa de servidor. Gere-a com:

```bash
python3 scripts/build_singlefile.py
```

**Opção 2 — servidor local** (usa `index.html` + `data.json` separados):

```bash
cd app
python3 -m http.server 8091
# abra http://localhost:8091
```

## Publicar no GitHub Pages

1. Suba o repositório para o GitHub.
2. Em **Settings → Pages**, selecione a branch e a pasta `/app` (ou mova o
   conteúdo de `app/` para a raiz e use `/`).
3. O app fica disponível em `https://<usuario>.github.io/<repo>/`.

## Telas

- **Painel** — indicadores: área total, demanda de compras (R$), custo de
  insumos, itens sem preço; custo por cultura, compras por classe, maiores compras.
- **Talhões** — lista dos 20 talhões; edite **área** e **produtividade** e o
  cálculo (produção, custo/ha, custo total) atualiza sozinho. Clique para abrir.
- **Talhão (detalhe)** — operações da safra principal e safrinha, com produtos,
  **dose/ha editável**, preço, custo/ha. Cada operação tem uma **máquina**
  (conjunto) sugerida automaticamente pela classe dos insumos e trocável no
  seletor; o custo de máquina/ha entra no subtotal da operação.
- **Demanda de Compras** — consolida a demanda de todos os talhões e subtrai o
  **estoque** (editável): `A comprar = máx(0; Demanda − Estoque)`. Itens sem
  preço podem ter o preço preenchido ali.
- **Cotação** — itens a comprar agrupados por fornecedor, com exportação CSV.
- **Máquinas** — catálogo de conjuntos (custo de operação) com **R$/HM** e
  **preço do diesel** editáveis; calcula custo de máquina/ha, diesel/ha e custo
  total/ha, além do custo médio por passada.
- **DRE Orçada** — resultado por cultura: Receita = Produção × Preço; Custo =
  insumos + **máquinas** (somadas por operação) + **arrendamento/outros**
  (R$/ha editável). Preço de venda, custo de máquinas e arrendamento editáveis.

## Botões

- **Exportar** — baixa suas edições em JSON.
- **Restaurar** — descarta suas edições e volta aos dados originais.

## Estrutura

```
app/
├── index.html    layout + navegação
├── styles.css    design
├── app.js        engine de cálculo, telas e roteamento
├── data.json     dados extraídos da planilha (produtos, talhões, operações, preços)
└── README.md
```

## Atualizar os dados

`data.json` é gerado a partir do workbook. Para regerar após mudar a planilha,
use o extrator (ver `scripts/` na raiz do repositório) apontando para o
`PLANEJAMENTO_SAFRA_2627_ORIGINAL.xlsx`.
