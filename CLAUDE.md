# CLAUDE.md — PLANEJAMENTO-INSUMOS

Instruções para o Claude Code trabalhar neste repositório. Leia inteiro antes de
qualquer tarefa. Para o projeto de NF-e, leia também `docs/NFE_RECEBIMENTO.md`.

## Sobre o projeto

Planejamento da safra 2026/2027 (insumos, demanda de compras, estoque, campo, DRE)
de uma fazenda de grãos irrigada. Três partes:

- `PLANEJAMENTO_SAFRA_2627*.xlsx` — planilha base (o `_ORIGINAL` é backup; não editar).
- `app/` — web app **estático** (PWA), publicado no GitHub Pages pelo workflow
  `.github/workflows/deploy-pages.yml` a cada push na `main` que mexa em `app/**`.
- `sync/Code.gs` — Apps Script publicado como Web App, vinculado à planilha do
  Google Sheets. É a ponte app ↔ planilha.

A dona do projeto **não é programadora profissional e está aprendendo**. Explique o
que mudou em linguagem simples ao final de cada tarefa.

## Regras de arquitetura (não quebrar)

1. **A planilha é a fonte da verdade.** O app puxa dela (`doGet`) e envia edições
   (`doPost`). Em conflito, a planilha vence.
2. **Sem backend e sem build.** Nada de npm, bundler ou framework. O app é
   `index.html` + `styles.css` + `app.js` (JS puro) + `data.json`.
3. **Bibliotecas externas** só via `<script>` de `cdn.jsdelivr.net` ou
   `cdnjs.cloudflare.com`, com versão fixa. Só adicionar se não houver API nativa.
4. **Padrão do `doPost`:** um payload por tipo, com chave `__nome`
   (ex.: `__entrada`, `__saida`, `__retorno`). Novos tipos seguem o mesmo padrão
   e ganham um `else if` no roteador do `doPost`.
5. **Idempotência no razão de estoque:** as linhas da aba `MOVIMENTAÇÃO ESTOQUE`
   levam a etiqueta `[#id]` na coluna ORIGEM, e `movDeleteBySource(id)` limpa
   antes de regravar. Reenviar nunca pode duplicar. Para NF-e, o id é a chave de
   acesso (44 dígitos).
6. **Abas novas** são criadas pelo `Code.gs` quando faltam (ver `logMovimentacao`).
   Localize colunas **pelo cabeçalho**, não por índice fixo, sempre que possível.
7. **Não gravar valor em célula que tem fórmula** na planilha (dose, preço via
   IMPORTRANGE etc.), a não ser que a spec mande.
8. **Estado local** do app fica no `localStorage` (ver `SYNC_KEY`, `COMPRAS_KEY`).
   Tudo o que precisa ser visto por outros aparelhos tem que subir para a planilha.

## Checklist de entrega (toda mudança)

- [ ] Mudou `app/app.js`? Suba a `APP_VERSION` (linha 5, formato `AAAA.MM.DD-N`).
- [ ] Rode `python3 scripts/build_singlefile.py` (regera `planejamento_app.html`
      e `version.json`). Commite os dois.
- [ ] Mudou `app/sw.js`? Troque o texto de `VERSAO`.
- [ ] Mudou `sync/Code.gs`? Avise no final: **a dona precisa colar o arquivo no
      Apps Script e criar uma Nova versão em Implantar → Gerenciar implantações**.
      Sem isso o app continua falando com o código antigo.
- [ ] Atualize o `README.md` / `app/README.md` / `sync/README.md` se o
      comportamento mudou.

## Como testar

```bash
cd app && python3 -m http.server 8091   # abrir http://localhost:8091
```

- XMLs de teste ficam em `testes/xml/` (pasta **fora do git**, ver Segurança).
- A sincronização com a planilha só funciona na versão publicada ou com a URL
  do Web App configurada na tela Sincronizar.
- Teste em tela de celular (DevTools, modo responsivo): o app é usado no campo.

## Segurança — o repositório é PÚBLICO

- **Nunca** commitar XML real de nota fiscal, CPF/CNPJ de produtor, dados
  bancários, certificados (`.pfx`), senhas ou a URL `/exec` do Web App.
- `testes/xml/`, `*.pfx` e `*.p12` devem estar no `.gitignore`.
- Dados de exemplo em testes: anonimizar CPF/CNPJ e nomes.

## Como trabalhar

- **Planeje antes de codar.** Mostre: arquivos que vai mudar, funções novas,
  payloads novos do `doPost`, abas novas da planilha e como testar. Espere o ok.
- **Uma fase por branch/PR.** Commits pequenos, mensagens em português.
- **Reaproveite o que existe** antes de criar tela ou função nova (ex.: a tela
  `#/entradas`, `pushEntrada`, `writeEntrada`, `syncPost`, `toast`, `route`).
- Siga o estilo do `app.js`: funções de tela em `V.nome = function(){...}`,
  rotas `#/nome`, ações por `data-act`, texto da interface em português.
- Ao terminar, explique as mudanças função por função, de forma didática.
