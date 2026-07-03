# Sincronização App ↔ Planilha (Google Sheets)

O app é estático (roda no navegador). Para sincronizar com a sua planilha do
Google, publicamos um **Web App do Apps Script** vinculado a ela. A **planilha é
a verdade**: o app puxa dela e grava de volta apenas campos simples.

## Automática (padrão)
Com a URL salva e a chave **Sincronização automática** ligada (tela
**Sincronizar** do app), a sincronização acontece sozinha nos dois sentidos:

- **App → planilha:** ao editar algo, o app envia a mudança ~1,5 s depois.
- **Planilha → app:** o app puxa a planilha ao abrir e a cada ~45 s enquanto a
  aba está visível. Se nada mudou na planilha, ele **não** re-renderiza (não
  pisca a tela).

Um indicador no topo mostra o estado: 🟢 *Sincronizado*, 🟡 *Sincronizando…*,
🔴 *Erro* ou ⚪ *Auto desligado*. Os botões **Puxar agora / Enviar agora**
forçam a sincronização quando você quiser. Em conflito, a **planilha vence**
(o app puxa por cima das edições de campo locais).

## O que sincroniza
- **Puxar (planilha → app):** todos os dados (produtos, talhões, planos,
  preços, máquinas). Substitui o que está no app.
- **Enviar (app → planilha):** **dose, estoque, preço, área, produtividade**,
  **1ª cultura (empreendimento), 2ª cultura (safrinha) e produtividade da
  safrinha**, **troca de produto** de um insumo base, **insumos adicionados**
  (grava classe/produto/dose na primeira linha vazia do bloco da operação) e
  **insumos removidos** (limpa a linha do insumo). Depois de enviar mudanças de
  insumo, o app puxa a planilha automaticamente para reconciliar (evita duplicar
  ou fazer o item ressurgir).
- **Fica só no app (não é enviado):** operações, talhões e máquinas **criados**
  no app, e os **ajustes de máquina** (largura/velocidade) — na planilha esses
  valores vêm de fórmulas/cadastro, então gravá-los quebraria as fórmulas.
  (No sentido planilha → app, tudo isso é lido normalmente.)

## Configurar (uma vez)
1. Abra a sua planilha (a fonte da verdade) no Google Sheets.
2. **Extensões → Apps Script**.
3. Apague o conteúdo padrão, cole todo o `Code.gs` desta pasta e **Salvar**.
4. **Implantar → Nova implantação** → engrenagem → **App da Web**.
   - *Executar como:* **Eu (você)**
   - *Quem pode acessar:* **Qualquer pessoa**
5. **Implantar**, autorize o acesso, e copie a **URL do app da Web**
   (termina em `/exec`).
6. No app, abra **Sincronizar**, cole a URL, **Salvar URL** e clique em
   **Puxar da planilha**.

> A cada vez que você **alterar o código** do Apps Script, crie uma nova versão
> em **Implantar → Gerenciar implantações → editar → Nova versão**.

## Como funciona (técnico)
- `doGet` lê as abas `PORTIFÓLIO`, `ÁREA PLANTIO`, `TL01…TL19`,
  `CUSTO OPERAÇÃO` e `DRE ORÇADA` e devolve o mesmo JSON que o app usa.
- `doPost` recebe uma lista de edições e grava:
  - `dose` → aba do talhão, coluna **I** (dose/ha) da operação/insumo
  - `estoque` → `PORTIFÓLIO` coluna **T**
  - `preco` → `PORTIFÓLIO` coluna **S**
  - `area` / `produtividade` → `ÁREA PLANTIO` colunas **E** / **D**
  - `empreendimento` / `emp_safrinha` / `prod_safrinha` → `ÁREA PLANTIO`
    colunas **C** / **H** / **I** (a aba do talhão B3 já referencia C por fórmula)
  - `itemprod` (troca de produto) → aba do talhão: acha a linha pelo produto
    antigo (`itemRowByName`) e grava **classe (B)** e **produto novo (C)**
  - `additem` (insumo novo) → aba do talhão: **classe (B)**, **produto (C)** e
    **dose (I)** na primeira linha vazia do bloco da operação (`emptyItemRow`).
  - `delitem` (insumo removido) → limpa **B/C/I** da linha do insumo naquele
    bloco da operação (`itemRowByName`); as demais colunas (fórmulas) se ajustam.
- O POST usa `Content-Type: text/plain` para evitar *preflight* de CORS.

## Observações
- A sincronização funciona na **versão publicada (GitHub Pages)**. Na
  pré-visualização hospedada da Claude, o navegador bloqueia chamadas externas.
- Se a planilha tiver a coluna de preço vinda de `IMPORTRANGE`, enviar `preco`
  substitui a fórmula por um valor naquela célula.
- A estrutura das abas deve seguir a planilha padrão (mesmas colunas). Se você
  mudar o layout, ajuste os índices de coluna no `Code.gs`.
