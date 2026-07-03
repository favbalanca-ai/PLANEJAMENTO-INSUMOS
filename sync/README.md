# Sincronização App ↔ Planilha (Google Sheets)

O app é estático (roda no navegador). Para sincronizar com a sua planilha do
Google, publicamos um **Web App do Apps Script** vinculado a ela. A **planilha é
a verdade**: o app puxa dela e grava de volta apenas campos simples.

## O que sincroniza
- **Puxar (planilha → app):** todos os dados (produtos, talhões, planos,
  preços, máquinas). Substitui o que está no app.
- **Enviar (app → planilha):** apenas **dose, estoque, preço, área e
  produtividade** (grava em células de entrada). Inserção/remoção de insumos e
  talhões criados no app **não** são enviados (por segurança, para não mexer na
  estrutura/fórmulas da planilha).

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
- O POST usa `Content-Type: text/plain` para evitar *preflight* de CORS.

## Observações
- A sincronização funciona na **versão publicada (GitHub Pages)**. Na
  pré-visualização hospedada da Claude, o navegador bloqueia chamadas externas.
- Se a planilha tiver a coluna de preço vinda de `IMPORTRANGE`, enviar `preco`
  substitui a fórmula por um valor naquela célula.
- A estrutura das abas deve seguir a planilha padrão (mesmas colunas). Se você
  mudar o layout, ajuste os índices de coluna no `Code.gs`.
