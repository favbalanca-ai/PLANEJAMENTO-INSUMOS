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

Já existe o workflow `.github/workflows/deploy-pages.yml` que publica a pasta
`app/`. Como o token do Actions não tem permissão para **ligar** o Pages
sozinho, é preciso habilitar uma vez (passo único):

1. No GitHub, vá em **Settings → Pages**.
2. Em **Build and deployment → Source**, selecione **GitHub Actions**.
3. Faça o merge desta branch na `main` (ou rode o workflow manualmente em
   **Actions → Deploy app to GitHub Pages → Run workflow**).
4. O app fica em `https://favbalanca-ai.github.io/PLANEJAMENTO-INSUMOS/`.

Enquanto isso, há uma **versão hospedada** pronta (link enviado no chat) e o
arquivo único `planejamento_app.html` para abrir localmente.

## Telas

- **Painel** — indicadores: área total, demanda de compras (R$), custo de
  insumos, itens sem preço; custo por cultura, compras por classe, maiores compras.
- **Talhões** — criar, duplicar (copiando o plano de outro) e excluir talhões;  lista dos 20 talhões; edite **área** e **produtividade** e o
  cálculo (produção, custo/ha, custo total) atualiza sozinho. Clique para abrir.
  Em todo o app o talhão aparece **só pelo nome** (ex.: "ESTEVÃO"): códigos na frente do nome
  ("NV2-", "TL02-") são escondidos (`tNome`). O código continua sendo o nome da **aba** na planilha e
  aparece discreto só na coluna "Aba" da lista de Talhões e no detalhe do talhão.
- **Talhão (detalhe)** — operações da safra principal e safrinha, com produtos,
  **dose/ha editável**, preço, custo/ha. Cada operação tem uma **máquina**
  (conjunto) sugerida automaticamente pela classe dos insumos e trocável no
  seletor; o custo de máquina/ha entra no subtotal da operação.
- **Demanda de Compras** — consolida a demanda de todos os talhões e subtrai o
  **estoque** (editável): `A comprar = máx(0; Demanda − Estoque)`. Itens sem
  preço podem ter o preço preenchido ali.
- **Estoque (também no Administrativo)** — a mesma tela aparece nos módulos Planejamento e
  Administrativo (`VIEW_MOD.estoque='both'`, `TELA_MODS.estoque`); abrir por um módulo não troca de módulo.
  Operador com acesso ao Administrativo vê e edita o estoque inicial e o "em pedido".
- **Cotação** — itens a comprar agrupados por fornecedor, com exportação CSV.
- **Compras (entradas)** — compras registradas à mão, por XML de NF-e ou pelo
  Receber nota. A lista **sincroniza entre aparelhos** pela aba `COMPRAS APP` da
  planilha; excluir uma compra tira as entradas dela do estoque em todos os aparelhos.
- **Sincronizar → Log detalhado** — cada conversa do app com a planilha (compras, baixas, de-para,
  execução, edições, puxar, NF-e…): hora, quanto demorou e o que a planilha respondeu (erros em vermelho,
  lentos > 20 s em amarelo). Filtro "Só problemas" e botão **Copiar** para mandar o log numa mensagem.
  Guarda as últimas 300 no aparelho.
- **Login** — tela **Entrar** (login + PIN), **Minha conta** (trocar PIN, sair) e, para o administrador,
  **👥 Usuários**: criar/editar pessoas, perfil (Administrador/Operador), módulos e telas liberados
  (nenhuma tela marcada = todas do módulo), redefinir PIN, desativar. O menu, o Início e as rotas só
  mostram o que é liberado; quem filtra os dados de verdade é a planilha (ver `sync/README.md`).
- **Modo embutido** (`?embed=receber`) — o app aparece dentro de outro (módulo **📦 Receber insumos** do
  Pesagem v2, mesmo site `favbalanca-ai.github.io` → mesmo login no aparelho): sem menus, só as abas
  **Receber** e **Pendências** (conforme a permissão), além de Entrar / Minha conta / ⚙️ Sincronizar.
  Não troca o módulo salvo do app normal.
- **Mapa → Nova Ação** — tocar no talhão do mapa (ou ➕ *Ação* na lista de limites / ➕ *Nova ação* na tela
  do talhão no Campo) abre a folha **Nova Ação**: Ocorrência e Outras ocorrências → Monitoramento;
  Recomendação; **Aferição**; Aplicação → operações do talhão; Stand; Anotação e Estimativa de
  produtividade aparecem como *em breve*. Embaixo, links para Operações e Timeline.
- **Campo → Aferição** (`#/afericao/<tipo>~<talhão>`, menu *Aferir*) — abas **Dados** e **Histórico**
  (histórico filtrado pela máquina escolhida). O resumo é recalculado enquanto digita:
  - **Aplicação (pulverizador):** comprimento, largura da barra, espaçamento entre bicos, volume (mL) de
    cada bico no tempo do percurso → **L/ha = média × 10 ÷ (comprimento × espaçamento)**, total na barra,
    CV entre bicos, bicos fora de ±10%, diferença da vazão alvo.
  - **Colheita (perda):** comprimento × largura (m²), peso (g) ou nº de grãos × PMS → **kg/ha = g ÷ m² × 10**
    e sc/ha.
  - **Semeadura: adubo:** g por linha → kg/m e **kg/ha = média × 10 ÷ (comprimento × espaçamento)**; alvo
    sugerido pelo adubo da operação de plantio.
  - **Semeadura: sementes:** contagem (ou peso + PMS) por linha → sementes/m e **sementes/ha**; alvo
    sugerido pela população do plantio.
  - Velocidade: digitada ou calculada pelo **tempo do percurso** (comprimento ÷ tempo × 3,6).
  - Salva na planilha (aba **AFERICOES APP**, ver `sync/README.md`); depois de salvar, a próxima aferição
    já vem com a mesma máquina e medidas. Excluir marca como excluída (some em todos os aparelhos).
- **Campo → Contagem de Stand** (modelo novo) — atividade, comprimento, espaçamento e meta (sugerida pela
  população do plantio); uma linha por fileira contada. Quadro **Informações**: linhas, **densidade**
  (média ÷ comprimento ÷ espaçamento × 10.000), **CV entre linhas**, plantas/metro, % da meta.
  - **Informar distâncias** (chave): cada linha ganha dominadas, duplas, ausentes e o botão 📏 — a tela
    **Posição das Plantas (cm)** recebe a medida na trena de cada planta (a 1ª no 0). Com a trena o app
    conta sozinho plantas, duplas (< 0,5× o espaçamento ideal) e ausentes (> 1,5×; conta as que faltaram no
    vão). Espaçamento ideal = 100 ÷ plantas/m da meta (sem meta: a média medida). Mostra **CV de
    distribuição**, **% inconformes**, % dominadas/duplas/ausentes.
  - Sincroniza com a planilha (aba **STAND APP**); excluir marca como excluída. Contagens antigas continuam
    aparecendo (e sobem para a planilha).
- **Campo → Quadro de operações** — ao abrir *Operação de Campo* sem escolher talhão aparece o quadro:
  uma **linha por talhão** (nome, cultura · cultivar, área, *Detalhes ›*) e um **cartão por operação**
  (nome, atividade, data, **DAA** = dias desde a aplicação, **Pos. Ciclo** = dias depois do plantio).
  Cores: verde = aplicado · listrado = em andamento · amarelo = faltam até 3 dias · vermelho = atrasado ·
  cinza = dentro do prazo · riscado = *não será realizada*. Filtros de safra (1ª, 2ª, ambas), atividade
  (pela classe dos produtos: Herbicida, Fungicida, Plantio…) e talhão; botão 🖨 Imprimir. O **+** do cartão
  abre o talhão já com a operação aberta. No celular a coluna do talhão fica fixa e os cartões rolam de lado.
  - **Tocar no cartão** abre uma janelinha: data estimada, data efetiva (em vermelho com ⚠ e quantos dias
    antes/depois, se diferente da estimada), dias após aplicado, situação e a tabela **Produto · Dose/ha ·
    Total** no talhão (dose realizada quando informada, senão a do plano; extras incluídos) + *Ver aplicação ›*.
    No celular ela aparece presa embaixo; fecha no ✕, tocando fora ou com Esc.
  - **‹ Recuar / Avançar ›** (na janelinha): troca a operação de lugar com a anterior/próxima da mesma safra
    do talhão. É só a **ordem de exibição** (quadro e tela do talhão) — vale mesmo com operações concluídas,
    não reescreve a aba do talhão nem mexe em baixas. Fica no registro da operação (`ord`) e sobe para a
    planilha junto com a execução do Campo (aba REALIZADO APP), então aparece igual nos outros aparelhos.
    Sem `ord`, vale a ordem do planejamento.
  - **⚠** no cartão = aplicada em data diferente da estimada · **🔔** = retorno do operador esperando aprovação.
  - **Mais detalhes** (acima de cada coluna): a mesma operação em todos os talhões do quadro — situação,
    estimada, efetiva, DAA e produtos (dose/ha · total), com **+** para abrir cada uma.
- **Status "Não será realizada"** — 4º botão no registro da operação (além de Pendente / Em andamento /
  Concluída). Não conta como atrasada nem como próxima, sai da % de conclusão e tem o chip *Não realizadas*;
  "↩ Voltar a pendente" desfaz.
- **Campo → Recomendação de TS** — toda operação com **semente + produtos de TS** ganha a seção
  🧪 *Recomendação de TS* e o botão **Enviar TS**. A batelada é medida em **bag** (a unidade da semente
  no planejamento, ex.: 5MM); as doses vêm do **planejamento** (por ha) e viram "por batelada"
  (`dose/ha ÷ bags/ha × bags por batelada`). Mostra nº de bateladas, a última (parcial), sementes/ha e,
  com o PMS (opcional), kg/ha. O operador abre o link (`retorno.html` em modo TS), vê a dose por batelada
  e dá baixa: a **semente e os produtos de TS saem do estoque** nessa hora e a operação de plantio
  continua aberta — ao concluir o plantio eles **não saem de novo** (`opBaixaEff`). Se o TS voltar
  **depois** do plantio concluído, a baixa do plantio é reenviada sem a semente; reabrir/reprovar/excluir o
  TS faz o contrário (`tsMarca`). O custo realizado do talhão soma a baixa do TS. Unidades em branco no
  PORTIFÓLIO aparecem como aviso (preencher na planilha).
- **Campo → Recomendação de plantio** — na operação com semente, a seção 🚿 de aplicação vira
  🌱 *Recomendação de plantio*: **população (sementes/ha)** — já vem a do planejamento (bags/ha × sementes
  por bag) e pode ser informada —, plantadeira, início e fim. **Linhas sempre a 50 cm** (fixo):
  `sementes por metro = população × 0,5 ÷ 10.000` (200.000/ha → 10 por metro). Fertilizantes e líquidos
  só **por ha** (kg/ha ou L/ha; tonelada aparece em kg), sem conta de tanque. O WhatsApp e o
  `retorno.html` (modo plantio) mostram "200.000 sementes por ha · 10 por metro" e as doses por ha; na
  baixa, o adubo é digitado em kg e volta para a planilha na unidade do estoque (t). Ao concluir, o
  plantio vira realizado (dia 0 do DAE). Mostra se o TS já foi feito; depois de enviar o TS, os
  produtos de TS saem da recomendação de plantio.
- **Campo → PDF da recomendação** — ao lado de cada "Enviar por WhatsApp" (TS, plantio e aplicação) há
  **🖨 PDF (com link de baixa)**: gera a recomendação pronta para imprimir/salvar ("Salvar como PDF") com o
  botão **👉 ABRIR PARA DAR BAIXA** clicável no PDF (o mesmo link do WhatsApp para o `retorno.html`).
  Gerar o PDF conta como enviado (TS "enviado"; operação "em andamento"). O PDF de plantio mostra em
  destaque sementes por ha, sementes por metro (linhas a 50 cm) e as doses por ha; o de TS, a dose por
  batelada. A tela Recomendação (🖨) usa o mesmo PDF. O link do PDF é **curto** (`retorno.html?s=…&r=<id>`)
  e vem com **QR Code**: ao gerar, o app grava a recomendação na aba `RECOM LINKS` (`__recomLink`) e a
  página do operador busca o resto em `?acao=recom&id=`. Sem o Code.gs novo (ou sem conexão), o PDF sai
  com o link longo, sem QR. QR via `qrcode-generator@1.4.4` (jsDelivr, carregado só ao gerar o PDF).
  O **arquivo PDF é montado no próprio app** (`pdfArquivo`: `html2canvas@1.4.1` + `jspdf@2.5.1`, jsDelivr):
  "Imprimir → Salvar como PDF" do celular perdia os links. A página vira imagem (mesmo visual da
  impressão, ~200–300 KB) e o link entra como link de verdade sobre o botão e o QR Code. Abre a janela
  **PDF pronto**: 📲 Enviar o PDF (WhatsApp… — compartilhar do celular), ⬇️ Baixar, 👁 Abrir e 🖨 Imprimir.
  Sem internet para o gerador, cai na impressão como antes.
- **Máquinas** — catálogo de conjuntos (custo de operação) com **R$/HM** e
  **preço do diesel** editáveis; calcula custo de máquina/ha, diesel/ha e custo
  total/ha, além do custo médio por passada.
- **DRE Orçada** — resultado por cultura: Receita = Produção × Preço; Custo =
  insumos + **máquinas** (somadas por operação) + **arrendamento/outros**
  (R$/ha editável). Preço de venda, custo de máquinas e arrendamento editáveis.

## Baixa do operador e aprovação (v180)

- A baixa que o operador envia pelo link (aplicação, plantio e TS) chega como **Retorno recebido** e só sai
  do estoque quando o administrador **aprova** — no cartão da operação no **Campo** (✅ Aprovar baixa /
  ✖ Reprovar) ou na tela Recomendação. Vale só o **último envio** do operador e só uma vez
  (`retornoTs`): reprovar/reabrir não "volta sozinho" no próximo puxar.
- Uma baixa só é marcada como enviada se a planilha **aceitou** (`postOk`); planilha ocupada = tenta de novo.
  A página do operador só mostra "Baixa enviada!" com o OK da planilha.
- Números digitados: `numBR` — "2,5" e "2.5" = 2,5; "1.500" = 1500.
- Operação concluída / TS feito: PDF e WhatsApp não criam outro link de baixa (o PDF diz "Baixa já registrada").

## Desempenho (v181)

- **Redesenho parcial** (`morphInto`): na MESMA tela (edição, sincronização) o app compara a tela nova
  com a atual e troca só o que mudou — o campo em que a pessoa está não é tocado (não perde o foco).
  Vale para Estoque, Talhão, Talhões, Campo, Demanda, Cotação, Painel, DRE, Resultados, Máquinas,
  Empreendimentos, Recomendação, Preços, Sincronizar e Compras. Mapa e câmera: redesenho completo.
  Celular médio (CPU 4×): editar 1 número no Estoque 2,0 s → 0,6 s; Talhão 0,42 s → 0,15 s.
- Compras: digitar quantidade/preço atualiza só a linha e o total (antes perdia o foco a cada letra).
- Puxar sem mudança na planilha não redesenha (o `_srv` — tempo de leitura — ficava fora da comparação).
- Envio automático de edições simples: confere com a planilha **uma vez**, 8 s depois da última edição
  (antes baixava a planilha inteira a cada número). Voltar ao app usa a checagem leve (hash), pedido
  antes dos dados. O puxar automático não fica parado por uma edição sem eco (puxa a cada ~1,5 min).
- Faixa/selo de sincronização calculados 1x por quadro; baixas pendentes enviadas uma de cada vez;
  formatadores de número criados uma vez; Painel e Demanda sem contas repetidas;
  `content-visibility` nos cartões do Campo/Talhão no celular.

## iPhone: zoom e girar a tela

- No celular, todo campo (input/select/textarea) tem letra de **16px**: com menos, o Safari do iPhone dá
  **zoom sozinho** ao tocar e a página fica ampliada (a barra de baixo ia parar no meio da tela).
- `text-size-adjust:100%`: o iPhone não aumenta a letra ao girar a tela.
- Ao girar a tela, o app trava a escala em 1 por um instante e solta (desfaz zoom que tenha ficado;
  o zoom com os dedos continua funcionando).

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
