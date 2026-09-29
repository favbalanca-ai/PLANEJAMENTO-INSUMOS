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

**Velocidade (cache em duas partes).** O `doGet` guarda os dados no cache do Apps Script
(`CacheService`) por até 5 min, em duas partes: **BASE** (portfólio, talhões/planos — lê as
abas de talhão —, DRE, máquinas, preços, equipe) e **APP** (compras, saídas, tarefas,
execução, resultados, limites, NF-e). Gravação do app que só mexe na parte APP limpa só
ela, então o próximo puxar não relê as abas de talhão. Edições de campo (dose, estoque,
área…) e preços limpam as duas. **Editar a planilha à mão** também limpa as duas (gatilho
simples `onEdit`, não precisa instalar). Todo `doPost` usa uma **trava** (`LockService`):
duas gravações ao mesmo tempo esperam a vez em vez de se atropelar (se passar de 45 s,
responde "planilha ocupada" e o app tenta de novo depois).

Um indicador no topo mostra o estado: 🟢 *Sincronizado*, 🟡 *Sincronizando…*,
🔴 *Erro* ou ⚪ *Auto desligado*. Os botões **Puxar agora / Enviar agora**
forçam a sincronização quando você quiser. Em conflito, a **planilha vence**
(o app puxa por cima das edições de campo locais).

## O que sincroniza
- **Puxar (planilha → app):** todos os dados (produtos, talhões, planos,
  preços, máquinas). Substitui o que está no app.
- **Preço de referência:** é um **ajuste local do app** (não vai para a
  planilha e não é apagado ao puxar), porque na planilha o preço vem de
  fórmula/importação. Editar o preço no app afeta os cálculos de valor/compra;
  para voltar ao preço da planilha, apague o campo.
- **Em pedido:** sincroniza com a coluna **EM PEDIDO** da `PORTIFÓLIO` (criada
  automaticamente e localizada pelo cabeçalho — você pode mover a coluna).
- **Enviar (app → planilha):** **dose, estoque, em pedido, área, produtividade**,
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
  - `pedido` → `PORTIFÓLIO` coluna **EM PEDIDO** (achada pelo cabeçalho; criada em W se faltar)
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
- **Compras registradas (entre aparelhos)** — `{__entrada:{id, fornecedor, data, nf, obs, itens, nfe, ts, _u}}`
  grava a ENTRADA na `MOVIMENTAÇÃO ESTOQUE` (etiqueta `[#id]`, reenviar não duplica) **e** o registro
  inteiro na aba **`COMPRAS APP`** (KEY|JSON|ATUALIZADO, criada se faltar; mais novo `_u` vence).
  `{__entradas:[…]}` = várias compras/exclusões numa requisição só (o app usa este; responde
  `ids` confirmados). `{__entrada:{id, del:true, itens:[], _u}}` = compra excluída: apaga as linhas `[#id]` do razão e
  deixa uma "lápide" `{id, del:true}` para os outros aparelhos apagarem também. O `doGet` devolve
  a aba em `compras_app`; o app junta com a lista local ao puxar.
- **NF-e (fase 1)** — ver `docs/NFE_RECEBIMENTO.md`:
  - `{__entrada:{id:<chave de 44 dígitos>, …}}` → a nota importada do XML vira uma
    ENTRADA comum na `MOVIMENTAÇÃO ESTOQUE`, com ORIGEM `NF-e 1234/1 · Fornecedor [#chave]`
    (reenviar não duplica; o `doGet` devolve em `movimentacao.nfe` as chaves que já
    deram entrada, e o app bloqueia importar a mesma nota de novo).
  - `{__nfeDepara:{itens:[{cnpj, cprod, xprod, produto, fator, ignorar, custo, por}]}}`
    → aba **`DE-PARA NFE`** (criada se faltar; colunas achadas pelo cabeçalho),
    uma linha por CNPJ do emitente + código do produto na nota. O `doGet` devolve
    em `depara_nfe`. Assim a 2ª nota do mesmo fornecedor já vem "automática".
- **NF-e (fase 2)** — captura automática. Rode **`setupNfe()` uma vez** pelo editor
  (autoriza Gmail e Drive; cria pastas `NFe/…`, abas `CONFIG NFE`, `NFE RECEBIDAS`,
  `NFE ITENS`, o token e o gatilho de 15 min `capturarNfe`). Depois preencha os
  CPF/CNPJ dos produtores na `CONFIG NFE` e cole o TOKEN no app (Sincronizar).
  - `capturarNfe()` lê o Gmail (`has:attachment (filename:xml OR filename:zip) newer_than:7d -label:NFE-OK`)
    e a pasta `NFe/Entrada`; `processarXmlNfe()` valida, evita duplicar pela chave,
    salva em `NFe/XML/AAAA-MM/` e grava a `NFE RECEBIDAS` (status A CLASSIFICAR).
  - `doGet ?acao=nfe_lista&status=…&token=…` e `?acao=nfe&chave=…&token=…`;
  - `doGet ?acao=capturar&token=…` → roda `capturarNfe` na hora (botão **Atualizar** do app).
    Cada e-mail/arquivo é tratado à parte: um com erro não trava os outros (fica na Entrada e é
    tentado de novo). O resumo da última busca (hora, lidas, novas, repetidas, rejeitadas com o
    motivo, erros) fica na propriedade do script `NFE_CAPTURA` e vai em `nfe_lista.captura`;
    os últimos 30 arquivos lidos (nova/repetida/ignorada/rejeitada + motivo) ficam em
    `NFE_CAPTURA_HIST` → `nfe_lista.historico` (e `nfe_lista.ignoradas` = chaves IGNORADA);
  - `{__nfeReabrir:{chave}, token}` → nota IGNORADA volta para A CLASSIFICAR ("Classificar mesmo assim");
  - `{__nfeProdutor:{doc}, token}` → nova linha PRODUTOR na CONFIG NFE ("Cadastrar como produtor") e as
    notas IGNORADAS desse destinatário voltam para A CLASSIFICAR (a captura também faz isso a cada busca);
  - CONFIG NFE: CPF/CNPJ na linha logo abaixo de um PRODUTOR, com a coluna A vazia, também conta como produtor;
  - chave, CPF/CNPJ e códigos são gravados sempre como **texto** (`_setCells_`); linhas antigas em que a
    chave virou número são consertadas pelo XML guardado (`nfeRepararChaves_`, roda em toda busca);
    `doPost {token, __nfeClassifica:{chave, status, itens[], obs}}` e `{token, __nfeUpload:{xml}}`.
- **NF-e (fase 3)** — entrega futura: `__nfeClassifica` aceita `status` EM TRÂNSITO / A ENTREGAR /
  RECEBIDA / IGNORADA e `ref` (contrato da remessa). `nfeContratos_()` calcula faturado × entregue ×
  saldo; `?acao=contratos&token=…`; `readData` leva `nfe_estados` (a entregar, em trânsito,
  pendências e avariado por produto) para a conta do "a comprar".
- **NF-e (fase 4)** — recebimento: `?acao=nfe_chave&chave=…&token=…` (status + itens da nota);
  `{token, __recebimento:{chave, data, por, itens:[{n, qtdRecebida}], semXml?}}` → RECEBIDA /
  RECEBIDA SEM XML (o XML casa sozinho quando chegar). Coluna nova `FOTO CANHOTO` na `NFE RECEBIDAS`.
- **NF-e (fase 5)** — divergências: `__recebimento.pendencias[]` → aba `PENDÊNCIAS RECEBIMENTO`;
  `?acao=pendencias&status=…`; `{token, __pendencia:{id, status, solucao, obs}}`;
  `{token, __nfeFoto:{nome, mime, b64}}` → pasta `NFe/Fotos` (devolve o link).
  `nfe_estados` passa a levar `pendencias` (abatem o "a comprar") e `avariado`.
- O POST usa `Content-Type: text/plain` para evitar *preflight* de CORS.

## Observações
- A sincronização funciona na **versão publicada (GitHub Pages)**. Na
  pré-visualização hospedada da Claude, o navegador bloqueia chamadas externas.
- Se a planilha tiver a coluna de preço vinda de `IMPORTRANGE`, enviar `preco`
  substitui a fórmula por um valor naquela célula.
- A estrutura das abas deve seguir a planilha padrão (mesmas colunas). Se você
  mudar o layout, ajuste os índices de coluna no `Code.gs`.
