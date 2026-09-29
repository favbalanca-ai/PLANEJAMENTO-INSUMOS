# Recebimento de NF-e por XML → Estoque

Especificação do projeto de entrada de notas fiscais no estoque do app
PLANEJAMENTO-INSUMOS. Documento vivo: atualizar a cada decisão tomada.

## 1. Objetivo

Os XMLs das NF-e de compra ficam numa pasta no Google Drive. O app mostra os
produtos **em trânsito**. Quando a mercadoria chega na fazenda, o operador lê a
**chave de acesso** pela câmera do celular, confere e confirma, e o app dá a
**entrada no estoque**. Nada de digitar nota à mão.

## 2. Fluxo geral

```
E-mail (Gmail)  ─┐
                 ├─► Pasta no Drive ─► Escritório classifica ─► Em trânsito ─► Operador bipa ─► Confere ─► Estoque
SEFAZ (manual)  ─┘   (XML pela chave)  (CFOP + de-para)         (no app)       (câmera)        (falta/avaria)
```

Quem faz o quê:
- **Automático:** captura dos XMLs, validação, índice das notas, status.
- **Escritório:** confirmar o de-para de produtos (só na 1ª vez de cada item).
- **Operador na fazenda:** bipar a chave e conferir a quantidade.

## 3. Estados de um produto e a conta de compras

| Estado | O que é | Origem |
|---|---|---|
| **A entregar** | Comprado e faturado, mas a mercadoria ainda não saiu | Nota de simples faturamento (entrega futura) |
| **Em pedido** | Pedido informado à mão (já existe no app) | Coluna EM PEDIDO do `PORTIFÓLIO` |
| **Em trânsito** | Nota de mercadoria emitida, ainda não recebida | Nota de venda ou remessa classificada |
| **Estoque (saldo)** | Recebido e conferido | Entrada no razão `MOVIMENTAÇÃO ESTOQUE` |
| **Avariado / a resolver** | Recebido com avaria, fora do disponível | Divergência na conferência |

Nova fórmula da Demanda de Compras:

```
A comprar = máx(0; Demanda restante − Saldo − Em pedido − A entregar − Em trânsito − Pendências abertas de falta/avaria)
```

## 4. Captura dos XMLs

### 4.1 E-mail (Apps Script, automático) — fase 2
Função `capturarNfeGmail()` no `Code.gs`, gatilho de tempo a cada 15 min:
1. Busca: `has:attachment (filename:xml OR filename:zip) newer_than:7d -label:NFE-OK`.
2. Abre `.zip` com `Utilities.unzip`. Lê cada `.xml` com `XmlService`.
3. Valida (ver 4.4). Salva no Drive (ver 5.1). Pula se a chave já existe.
4. Registra na aba `NFE RECEBIDAS`.
5. Aplica a etiqueta `NFE-OK` no e-mail.

### 4.2 SEFAZ manual — fase 2
Quem baixar XML da SEFAZ salva na pasta `NFe/Entrada` do Drive (pelo Google
Drive para desktop). O mesmo gatilho varre essa pasta, valida, renomeia pela
chave e move para `NFe/XML/AAAA-MM/`.

### 4.3 Distribuição DF-e da SEFAZ — depois (fora deste repositório)
Script Python agendado num PC do escritório, com certificado **A1** do produtor.
Consulta o web service NFeDistribuicaoDFe, envia o evento "Ciência da Operação"
para liberar o XML completo, respeita o controle de NSU (espera 1 h quando não há
documento novo) e grava os XMLs em `NFe/Entrada`. O Apps Script não serve para
isso porque não usa certificado na conexão. **Certificado nunca vai para o git.**

### 4.4 Validação de cada XML
- Tem que ser `nfeProc` com `protNFe/infProt/cStat = 100` (autorizada). XML sem
  protocolo é ignorado.
- O destinatário (`dest/CPF` ou `dest/CNPJ`) tem que estar na lista de
  produtores (configurada numa aba `CONFIG NFE`, **não no código**). Gravar o
  produtor na `NFE RECEBIDAS`.
- Evento de cancelamento (`procEventoNFe`, `tpEvento = 110111`): marcar a nota
  como `CANCELADA`. Se já tiver sido recebida no estoque, gerar alerta.

## 5. Estrutura no Drive e na planilha

### 5.1 Pastas no Drive
```
NFe/
├── Entrada/          ← jogar XML manual aqui (SEFAZ, WhatsApp etc.)
└── XML/
    └── AAAA-MM/      ← {chave}-nfe.xml (nome padronizado)
```

### 5.2 Abas novas (criadas pelo `Code.gs` se faltarem)

**`NFE RECEBIDAS`** — índice, uma linha por nota:
CHAVE · PRODUTOR · CNPJ EMITENTE · FORNECEDOR · Nº · SÉRIE · EMISSÃO · VALOR ·
TIPO (VENDA / FATURAMENTO / REMESSA / OUTRA) · CHAVE REFERENCIADA ·
STATUS (A CLASSIFICAR / A ENTREGAR / EM TRÂNSITO / RECEBIDA / CANCELADA / IGNORADA) ·
FILE ID · CLASSIFICADA EM · RECEBIDA EM · RECEBIDA POR

**`NFE ITENS`** — uma linha por item de cada nota, depois do de-para:
CHAVE · Nº ITEM · CPROD · XPROD · CFOP · UCOM · QCOM · PRODUTO APP · FATOR ·
QTD APP · UN APP · CUSTO UNIT. REAL · QTD RECEBIDA · IGNORAR

**`DE-PARA NFE`** — memória de produtos:
CNPJ EMITENTE · CPROD · XPROD (último visto) · PRODUTO APP · FATOR · IGNORAR ·
CONFIRMADO POR · DATA

**`PENDÊNCIAS RECEBIMENTO`** — ver seção 10.

**`CONFIG NFE`** — CPF/CNPJ dos produtores, ID da pasta do Drive, token do endpoint.

Entradas no estoque continuam na aba existente **`MOVIMENTAÇÃO ESTOQUE`**, via
`writeEntrada`, usando a **chave** como id (etiqueta `[#chave]`), o que garante
que a mesma nota nunca entre duas vezes.

## 6. Classificação por CFOP

O CFOP fica **em cada item** (`det/prod/CFOP`). O tipo da nota é o dos itens de insumo.

| CFOP | Tipo | Efeito no app |
|---|---|---|
| 5101, 5102, 6101, 6102 (e demais vendas) | VENDA | Vai para **em trânsito** |
| 5922, 6922 | FATURAMENTO (entrega futura) | Vira contrato **a entregar**. Não entra em trânsito nem em estoque |
| 5116, 5117, 6116, 6117 | REMESSA (entrega futura) | Vai para **em trânsito** e abate o saldo a entregar do contrato |
| Outros (devolução, bonificação, remessa p/ conserto…) | OUTRA | Fica "a classificar" para o escritório decidir |

Lista final de CFOPs a confirmar com a contabilidade.

## 7. Tela de de-para (escritório) — fase 1

Lista **Notas a classificar**. Ao abrir uma nota:
- **Cabeçalho:** fornecedor, nº, emissão, chave, valor, tipo pelo CFOP.
- **Cada item** mostra: nome e código na nota, quantidade e unidade → produto do
  app, fator, quantidade convertida. Status do item:
  - **Automático:** `CNPJ + cProd` já está no `DE-PARA NFE`.
  - **Sugerido:** 1ª vez; o app sugere o produto do portfólio de nome mais parecido.
  - **Novo:** nada parecido; escolher na lista ou cadastrar no portfólio.
  - **Ignorar:** não é insumo (palete, frete, peça). Também fica memorizado.
- **Fator automático:** tentar extrair do `xProd` padrões como `CX 10X1KG` → 10,
  `GL 5L` → 5, `BB 20L` → 20. Sempre editável.
- **Custo unitário real** = (vProd − vDesc + vFrete + vOutro + vIPI + vICMSST) ÷
  quantidade convertida. Oferecer atualizar o preço de referência do produto.
- Checkbox **"Lembrar de-para para este fornecedor"** (marcado por padrão).
- Botão **"Confirmar e pôr em trânsito"** (ou **"Registrar contrato"** se for
  faturamento) só libera com todos os itens resolvidos.

**Fase 1 funciona sem Drive:** botão "Importar XML" na tela `#/entradas`
(`<input type="file">` + `DOMParser` no navegador), preenchendo o `compraDraft`.

## 8. Entrega futura — fase 3

- **Faturamento** passa pelo de-para e cria um contrato com saldo a entregar por produto.
- **Remessa** é vinculada ao contrato:
  1. Pela nota referenciada no XML (`ide/NFref/refNFe`).
  2. Sem referência: contrato aberto do mesmo fornecedor com o mesmo produto,
     com confirmação do escritório.
- Remessa classificada: a quantidade **sai de "a entregar" e vai para "em trânsito"**.
- Alertas:
  - Remessa maior que o saldo do contrato.
  - Produto com "em pedido" manual quando chega o faturamento → perguntar se substitui.
  - Contrato com saldo parado há mais de N dias (configurável, padrão 30).
  - Faturamento cancelado → saldo a entregar zerado.
- Tela **Contratos a entregar** por fornecedor: faturado, entregue, saldo, valor do saldo.

## 9. Recebimento na fazenda — fase 4

Tela nova `#/receber` ("Receber nota").

### 9.1 Leitura da chave
- Código de barras CODE-128 do DANFE, 44 dígitos.
- Câmera: `getUserMedia({video:{facingMode:'environment'}})`. Exige HTTPS (Pages ok).
- Leitor: `BarcodeDetector` nativo (Chrome/Android, formato `code_128`). Onde não
  existir (Safari/iPhone), carregar ZXing via jsdelivr, com versão fixa.
- Aceitar só depois de **duas leituras iguais seguidas**.
- Botão de lanterna quando o aparelho suportar.

### 9.2 Validação da chave
Estrutura: cUF(2) · AAMM(4) · CNPJ/CPF(14) · modelo(2) · série(3) · nNF(9) ·
tpEmis(1) · cNF(8) · DV(1).
- 44 dígitos numéricos, modelo = 55.
- DV por módulo 11: pesos 2 a 9 da direita para a esquerda sobre os 43 primeiros
  dígitos; resto 0 ou 1 → DV 0; senão DV = 11 − resto.

### 9.3 Resultado da leitura
- Nota **em trânsito** → abre a conferência.
- Nota de **faturamento** → aviso "essa nota não é de mercadoria, leia a de remessa".
- Nota **já recebida** → aviso com data e quem recebeu.
- Nota **cancelada** → aviso, não deixa receber.
- Chave **não encontrada** (caminhão chegou antes do XML) → registrar chave +
  quantidades como "recebimento sem XML". Os dados da própria chave (CNPJ,
  série, nº) aparecem na tela. Quando o XML chegar, o sistema casa sozinho.

### 9.4 Alternativas à câmera
1. Digitar só o **nº da nota** → busca nas notas em trânsito.
2. Digitar os **44 dígitos** (teclado numérico, grupos de 4, validação ao vivo).
3. Leitor USB/Bluetooth (funciona como teclado no mesmo campo).

## 10. Conferência e divergências — fase 5

- Cada item vem com a quantidade da nota já preenchida como recebida.
- Botão **"Conferido, tudo ok"** para o caso normal (um toque).
- Divergência por item: **Falta**, **Avaria**, **Produto trocado** ou **Sobra**,
  com quantidade afetada, **foto** e observação.
- Efeito no estoque:
  - Entra no saldo só a quantidade em condição de uso.
  - Avaria que ficou na fazenda vai para o saldo **avariado / a resolver**.
  - Pendência aberta continua abatendo o "a comprar" (seção 3).
  - Na entrega futura, a falta **não** volta para "a entregar"; vira pendência da remessa.
- Antes de confirmar com divergência, mostrar o aviso: **"Anote a falta/avaria no
  canhoto do DANFE ou no conhecimento do transportador antes de assinar."**
  Permitir foto do canhoto.
- Aba **`PENDÊNCIAS RECEBIMENTO`**: CHAVE · Nº · FORNECEDOR · PRODUTO · TIPO · QTD ·
  FOTO (link do Drive) · CONFERIDO POR · DATA · STATUS (ABERTA / COBRADA /
  RESOLVIDA) · SOLUÇÃO (REPOSIÇÃO / DESCONTO / DEVOLUÇÃO) · OBS.
- Botão para abrir o WhatsApp com mensagem pronta (mesmo padrão do módulo Campo).
- Opcional (desligado por padrão): lote e validade por item. O XML pode trazer
  isso em `det/prod/rastro` (`nLote`, `qLote`, `dFab`, `dVal`).

## 11. Endpoints e payloads no `Code.gs`

Seguir o padrão existente (`__nome` no `doPost`). Nomes propostos:

| Chamada | O que faz |
|---|---|
| `doGet ?acao=nfe_lista&status=...` | Lista notas da `NFE RECEBIDAS` por status, com itens |
| `doGet ?acao=nfe&chave=...` | Devolve uma nota (cabeçalho + itens do XML + de-para aplicado) |
| `doPost {__nfeClassifica:{chave, itens[]}}` | Grava o de-para, `NFE ITENS` e muda o status |
| `doPost {__recebimento:{chave, itens[], por, data}}` | Entrada no razão (id = chave), status RECEBIDA |
| `doPost {__pendencia:{...}}` | Cria ou atualiza uma pendência |
| `doPost {__recebSemXml:{chave, itens[]}}` | Recebimento antes do XML chegar |

Todos os endpoints de NF-e exigem o **token** da aba `CONFIG NFE`.

## 12. Decisões em aberto

1. **Offline.** Hoje o `sw.js` é **sem cache** de propósito (`nocache-v67`): o
   app não abre sem internet. Se o barracão não tem sinal, decidir entre:
   (a) exigir internet no recebimento; (b) cachear só a tela de recebimento +
   lista em trânsito; (c) voltar a ter cache com controle de versão.
2. **Certificado dos produtores:** A1 (.pfx) ou A3 (token)? Define se o passo
   4.3 é viável.
3. **Lista de CFOPs** a confirmar com a contabilidade.
4. **Repositório público:** manter público (Pages grátis) ou tornar privado?
5. **Token do Web App:** hoje o acesso é "Qualquer pessoa". Adicionar o token
   antes de expor dados de nota.
6. **Lote e validade:** ligar para quais classes?

## 12.1 Decisões da fase 1 (tomadas)

- **Onde:** botão "📄 Importar XML da NF-e" na tela `#/entradas` (Compras → Entradas).
  Tudo roda no navegador (`DOMParser`); não precisa de Drive.
- **Validação:** só aceita `nfeProc` com `cStat = 100` e chave com DV correto;
  recusa nota que já deu entrada (etiqueta `[#chave]` no razão ou compra local).
  Destinatário (`CONFIG NFE`) fica para a fase 2.
- **Faturamento (5922/6922):** avisa e **não** dá entrada (contratos: fase 3).
  **Remessa (5116/5117):** entra no estoque normalmente (vínculo: fase 3).
  **Outra operação:** avisa e só dá entrada se o usuário confirmar.
- **Entrada:** vira uma compra comum (`pushEntrada` → `writeEntrada`) com
  **id = chave**; quantidade = `qCom × fator`; preço = **custo unitário real**.
  Data da entrada = hoje (editável); a data de emissão vai na observação.
- **Preço de referência:** **não é alterado** (vem de fórmula na planilha, regra 7).
  A tela só mostra a diferença do custo real para a referência; o último custo
  fica no `DE-PARA NFE`.
- **Item "Novo":** escolher da lista do portfólio ou marcar "Ignorar".
  Cadastrar produto novo no portfólio fica para depois.
- **"Sugerido"** só conta como resolvido depois de "Aceitar sugestão" (ou de
  escolher o produto). "Automático" já vem resolvido.
- **Token:** não usado na fase 1 (o de-para só tem nomes de produto); entra na fase 2.
- **Payload novo:** `{__nfeDepara:{itens:[…]}}` → aba `DE-PARA NFE`
  (CNPJ EMITENTE · CPROD · XPROD · PRODUTO APP · FATOR · IGNORAR · ÚLTIMO CUSTO ·
  CONFIRMADO POR · DATA). O app só envia depois que o `doGet` passa a devolver
  `depara_nfe` (Code.gs novo implantado); antes disso o de-para fica no aparelho.

## 12.2 Decisões da fase 2 (tomadas)

- **Configuração:** função `setupNfe()` no `Code.gs`, rodada **uma vez** pelo editor
  do Apps Script. Cria as pastas `NFe/Entrada`, `NFe/XML`, `NFe/Rejeitados`, as abas
  `CONFIG NFE`, `NFE RECEBIDAS`, `NFE ITENS`, gera o **token** e liga o gatilho de
  15 min (`capturarNfe`). Pode rodar de novo sem duplicar nada.
- **`CONFIG NFE`** (CHAVE · VALOR · OBS): `TOKEN`, `PASTA NFE` (ID) e uma linha
  `PRODUTOR` por CPF/CNPJ. Lista de produtores vazia = aceita todas, com aviso na OBS.
- **Destinatário fora da lista:** registrada como **IGNORADA** com o motivo na OBS.
- **Arquivo inválido em `NFe/Entrada`** (PDF, XML sem protocolo…): vai para
  `NFe/Rejeitados`. Processado com sucesso: o original vai para a lixeira do Drive
  (a cópia padronizada fica em `NFe/XML/AAAA-MM/{chave}-nfe.xml`).
- **Gmail:** o da conta dona da planilha (a que roda o script). E-mails lidos ganham
  a etiqueta `NFE-OK` (não são lidos de novo).
- **Confirmar no app = entrada direta no estoque** (como na fase 1) e a nota vira
  **RECEBIDA** (+ linhas na `NFE ITENS`). "A entregar/em trânsito" fica para a fase 3.
- **Cancelamento** (evento 110111 homologado): nota vira **CANCELADA**; se já tinha
  dado entrada, a OBS recebe o alerta "⚠ CANCELADA DEPOIS DA ENTRADA NO ESTOQUE"
  (o estoque **não** é ajustado sozinho). Cancelamento que chega antes da nota cria a
  linha CANCELADA; quando a nota chega, completa os dados e continua CANCELADA.
- **Token:** o app guarda no aparelho (Sincronizar → Token da NF-e). Exigido em
  `?acao=nfe_lista`, `?acao=nfe`, `__nfeClassifica` e `__nfeUpload`. O puxar normal
  só leva `nfe_resumo` (contagens, sem dados da nota).
- **XML escolhido no aparelho** também sobe (`__nfeUpload`) para o Drive + índice.
- **Sem internet** ao confirmar: a classificação fica numa fila no aparelho e sobe
  no próximo ENVIAR (aparece em "Falta sincronizar").

## 12.3 Decisões da fase 3 (tomadas)

- **Na conferência (escritório)**, com a NF-e ligada:
  - **Venda / remessa / outra:** "🚚 Confirmar e pôr em trânsito" (status EM TRÂNSITO; entra no
    estoque só quando o operador receber — fases 4/5) ou "📦 Já chegou — dar entrada" (entrada
    direta, status RECEBIDA — para quando a mercadoria chegou antes da classificação).
  - **Faturamento:** "📑 Registrar contrato" (status A ENTREGAR). Se o produto tem EM PEDIDO
    manual, o app pergunta se abate (para não contar em dobro).
- **Contrato** = a própria nota de faturamento (sem aba nova): faturado = `NFE ITENS` dela;
  entregue = soma das remessas vinculadas (`CHAVE REFERENCIADA`) EM TRÂNSITO/RECEBIDA;
  saldo = faturado − entregue. Tudo entregue → status ENTREGUE; remessa cancelada devolve o saldo.
- **Vínculo da remessa:** pelo `refNFe` do XML; sem referência, o app escolhe sozinho quando há
  um único contrato aberto do fornecedor com o produto, senão o escritório escolhe na lista.
  Remessa maior que o saldo → aviso antes de confirmar.
- **Custo da remessa:** remessa costuma ter valor simbólico — vale o custo do contrato.
- **Contrato parado:** `DIAS CONTRATO PARADO` na `CONFIG NFE` (padrão 30) → alerta na tela
  Contratos e no contador do menu.
- **A comprar** = máx(0; demanda restante − saldo − em pedido − **a caminho**), onde a caminho =
  a entregar + em trânsito + pendências abertas (fase 5). Vem da planilha em `nfe_estados`
  (só totais por produto). Estoque ganha as colunas A entregar / Em trânsito / Avariado.
- **Tela** `#/contratos` (Administrativo → Contratos).

## 12.4 Decisões da fase 4 (tomadas)

- **Tela** `#/receber` ("📷 Receber nota") nos módulos Administrativo **e** Campo.
- **Câmera:** `getUserMedia` (câmera traseira) + `BarcodeDetector` (`code_128`) quando existe;
  senão **ZXing** `@zxing/library@0.21.3` (UMD, jsdelivr), carregado só na hora. Aceita a chave
  só com **2 leituras iguais seguidas**; vibra ao aceitar; botão 🔦 lanterna quando o aparelho suporta.
- **Leitor v2** (o 1º não lia no campo): pede 1080p + foco contínuo + zoom (1,8× quando o aparelho
  permite; controle na tela); lê só a **faixa da mira**, recortada e ampliada; alterna leitor nativo e
  ZXing (`Code128Reader` com binarização híbrida e global) e tenta o código na vertical; aceita com
  **2 leituras iguais** (não precisam ser seguidas) e DV conferido.
- **📸 Tirar foto do código:** usa a câmera nativa (foco/resolução melhores) e procura o código em
  vários recortes e na vertical — uma leitura com DV válido basta (foto parada).
- **Validação:** 44 dígitos, modelo 55 e DV (módulo 11). Chave inválida é recusada com o motivo.
- **Alternativas:** nº da nota (procura nas notas EM TRÂNSITO); os 44 dígitos (com validação ao
  vivo; abre sozinho ao completar); leitor USB/Bluetooth no mesmo campo (Enter).
- **Resultado da leitura (9.3):** em trânsito → conferência; faturamento → aviso "leia a remessa";
  já recebida → data e quem recebeu; cancelada → bloqueia; a classificar → pede ao escritório;
  **não encontrada** → "recebimento sem XML" (dados da chave + produtos e quantidades); quando o
  XML chega, `processarXmlNfe` **casa sozinho** (status RECEBIDA, OBS para conferir de-para/custo).
- **Entrada no estoque** do recebimento: compra comum com id = chave (`__entrada`, sem duplicar);
  `__recebimento` grava status, `RECEBIDA EM/POR`, `QTD RECEBIDA` e (fase 5) pendências.
- **Offline (decisão 12.1):** o app exige internet para abrir (sw sem cache, como hoje); se a
  conexão cair no meio, o recebimento fica na fila e sobe no próximo ENVIAR.

## 12.5 Decisões da fase 5 (tomadas)

- **Conferência** (tela Receber nota): cada item já vem com a quantidade da nota; "✅ Conferido,
  tudo ok" num toque. Botão **⚠️ Divergência** por item: tipo (**Falta / Avaria / Produto trocado /
  Sobra**), quantidade **na unidade da nota** (ex.: 2 GL, convertida pelo fator), "a avaria ficou na
  fazenda", **foto** (reduzida no celular: máx. 1280 px, JPEG 70%) e observação.
- **Estoque:** entra só o que está em condição de uso = nota − falta − avaria − troca + sobra.
  Avaria que ficou na fazenda = saldo **Avariado** (coluna no Estoque, fora do disponível).
- **Pendências** (`PENDÊNCIAS RECEBIMENTO`: ID · CHAVE · Nº · FORNECEDOR · PRODUTO · TIPO · QTD · UN ·
  FICOU NA FAZENDA · FOTO · CONFERIDO POR · DATA · STATUS · SOLUÇÃO · OBS). Falta/avaria/troca
  ABERTA ou COBRADA **continuam abatendo o "a comprar"** (como "a caminho"); RESOLVIDA sai da conta.
  Reenviar o mesmo recebimento troca as pendências ABERTAS da nota (não duplica).
- **Canhoto:** com divergência, a tela mostra o aviso "Anote a falta/avaria no canhoto… antes de
  assinar", pede confirmação e permite **foto do canhoto** (coluna `FOTO CANHOTO`).
- **Fotos** vão para `NFe/Fotos` no Drive (`__nfeFoto`); o link fica na pendência. Sem internet, a
  pendência é registrada sem a foto (aviso na tela).
- **WhatsApp:** depois de confirmar, "📲 Avisar pelo WhatsApp" com a mensagem pronta; na tela
  **Pendências** (Administrativo), status ABERTA → COBRADA → RESOLVIDA, solução REPOSIÇÃO /
  DESCONTO / DEVOLUÇÃO, observação e "📲 Cobrar pelo WhatsApp".
- **Lote e validade:** continuam **desligados** (decisão 12.6 em aberto).

## 13. Fases e critérios de aceite

| Fase | Entrega | Pronto quando… |
|---|---|---|
| 0 | `CLAUDE.md`, esta spec, `.gitignore` com `testes/xml/` e `*.pfx`, XMLs de teste locais | Arquivos commitados, nenhum XML real no git |
| 1 | Importar XML no navegador + tela de de-para + aba `DE-PARA NFE` + custo real | Importar os XMLs de teste gera entrada correta; 2ª nota do mesmo fornecedor vem "automático" |
| 2 | Pasta no Drive, `NFE RECEBIDAS`, `NFE ITENS`, captura Gmail + `NFe/Entrada`, endpoints, token, cancelamento | E-mail com XML aparece em "a classificar" em até 15 min; mesma nota 2× não duplica |
| 3 | Estados a entregar / em trânsito, contratos de entrega futura, nova fórmula do "a comprar" | Exemplo de 1.000 L com 2 remessas bate em todas as etapas; nada conta em dobro |
| 4 | Tela `#/receber`: câmera, validação da chave, alternativas, casos da 9.3 | Leitura funciona em Android e iPhone; chave com DV errado é recusada |
| 5 | Conferência com divergências, fotos, `PENDÊNCIAS RECEBIMENTO`, WhatsApp | Falta de 2 GL gera entrada de 22 GL + pendência aberta, e o "a comprar" não aumenta |
