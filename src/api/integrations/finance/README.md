# Módulo Finanças — Supermercado

Módulo para coletar notas fiscais de supermercado (via WhatsApp ou API), extrair
os itens, classificá-los em categorias e gerar análises de gastos para um
dashboard.

## Como funciona

1. **Entrada** — a nota chega de duas formas:
   - **Link / QR Code da NFC-e**: a `NfceService` acessa a página oficial da
     SEFAZ e extrai item a item (descrição, quantidade, unidade, valores) com
     precisão.
   - **Foto / PDF da nota**: a `ReceiptOcrService` usa um modelo de visão da
     OpenAI para ler a imagem e devolver os itens em JSON estruturado.
2. **Categorização** — a `SupermarketCategoryService` classifica cada item por
   palavras-chave (PT-BR) em categorias como *Hortifruti*, *Carnes e Aves*,
   *Laticínios e Frios*, *Bebidas*, *Limpeza*, etc. Não depende de IA.
3. **Persistência** — cada nota vira um `SupermarketReceipt` com seus
   `SupermarketReceiptItem`. Notas fiscais (com chave de acesso) são
   deduplicadas.
4. **Resumo no WhatsApp** — quando a nota chega pelo WhatsApp, o app responde
   com um resumo (total, nº de itens e onde mais se gastou).
5. **Análise / Dashboard** — o endpoint `analytics` entrega os dados agregados
   (por categoria, por mês, top lojas, top itens) prontos para os gráficos.

### Captura automática pelo WhatsApp

Toda mensagem recebida passa por `supermarketController.emit`, que delega ao
serviço. A captura é **opt-in por instância** (`SupermarketSetting.enabled`):
enquanto o módulo estiver desativado, nenhuma mensagem é tocada. Com o módulo
ativo:

- **Link/QR da NFC-e** no texto → nota capturada da SEFAZ.
- **Foto ou PDF** enviados no chat → baixados e lidos (quando `captureMedia`
  está ligado; usa a IA). Documentos que não são imagem/PDF são ignorados.
- Se `replyOnCapture` estiver ligado, o app responde com o resumo.

Ative pelo endpoint `POST /supermarket/settings/:instanceName` ou pelo painel
"Captura automática" no dashboard.

## Endpoints

Base: `/supermarket` — todos exigem `:instanceName` e a apikey da instância.

| Método | Rota                                        | Descrição                                             |
| ------ | ------------------------------------------- | ----------------------------------------------------- |
| POST   | `/supermarket/receipt/:instanceName`        | Ingerir nota (`url` da NFC-e, `base64`/`imageUrl`)    |
| POST   | `/supermarket/upload/:instanceName`         | **Upload de arquivo** (imagem, PDF ou texto) — `multipart/form-data`, campo `file` |
| POST   | `/supermarket/manual/:instanceName`         | Cadastrar nota manualmente (lista de itens)           |
| GET    | `/supermarket/receipts/:instanceName`       | Listar notas (`startDate`, `endDate`, `category`)     |
| GET    | `/supermarket/receipt/:receiptId/:instanceName` | Detalhe de uma nota                               |
| DELETE | `/supermarket/receipt/:receiptId/:instanceName` | Remover uma nota                                  |
| GET    | `/supermarket/analytics/:instanceName`      | Dados agregados para o dashboard                      |
| POST   | `/supermarket/settings/:instanceName`       | Ativar/desativar o módulo e a captura (`enabled`, `captureMedia`, `replyOnCapture`) |
| GET    | `/supermarket/settings/:instanceName`       | Ler as configurações da instância                     |

### Exemplos

Ingerir por link da NFC-e:

```http
POST /supermarket/receipt/minha-instancia
{ "url": "https://www.fazenda.xx.gov.br/nfce/qrcode?p=352507...44digitos..." }
```

Ingerir por foto (base64):

```http
POST /supermarket/receipt/minha-instancia
{ "base64": "<conteudo-base64>", "mimeType": "image/jpeg" }
```

Upload de arquivo (imagem, PDF ou texto) via `multipart/form-data`:

```bash
curl -X POST https://sua-evolution-api/supermarket/upload/minha-instancia \
  -H "apikey: SUA_APIKEY" \
  -F "file=@/caminho/da/nota.pdf"
```

Estratégia por tipo de arquivo: **imagem** → leitura por visão da IA; **PDF** →
extrai o texto (e segue o link da NFC-e se houver, senão interpreta com IA);
**texto/CSV** → detecta link/QR da NFC-e ou interpreta com IA. O mesmo upload
está disponível no dashboard (arrastar-e-soltar). Limite de 20 MB por arquivo.

Análise de gastos:

```http
GET /supermarket/analytics/minha-instancia?startDate=2025-07-01&endDate=2025-07-31
```

Resposta (resumo):

```jsonc
{
  "summary": { "totalSpent": 842.17, "receiptCount": 6, "topCategory": "Carnes e Aves", ... },
  "byCategory": [ { "category": "Carnes e Aves", "total": 210.4, "percentage": 24.98 }, ... ],
  "byMonth":    [ { "month": "2025-07", "total": 842.17 } ],
  "topStores":  [ { "store": "Supermercado X", "total": 500.0, "visits": 3 } ],
  "topItems":   [ { "description": "picanha", "category": "Carnes e Aves", "total": 89.9 } ]
}
```

## Configuração da OpenAI (para leitura de foto/PDF)

A chave é resolvida nesta ordem: `openaiApiKey` do payload → credencial
(`OpenaiCreds`) da instância → variável global `OPENAI_API_KEY_GLOBAL`. Para
notas via link/QR da NFC-e a IA não é necessária.

## Banco de dados

Models: `SupermarketReceipt` e `SupermarketReceiptItem` (migrations em
`prisma/postgresql-migrations` e `prisma/mysql-migrations`). Rode
`npm run db:deploy` após atualizar.

## Próximos passos

- Dashboard web consumindo o endpoint `analytics` (gráficos por categoria, mês,
  ranking de lojas/itens).
- Filtro por palavra-chave/legenda antes de processar fotos (para reduzir
  chamadas à IA em imagens que não são notas).
- Orçamento/limites por categoria e alertas de estouro.

## Dependências adicionais

`pdf-parse` (extração de texto de PDF) — carregada sob demanda; se ausente, o
upload de PDF retorna uma mensagem orientando a enviar como imagem/link.
