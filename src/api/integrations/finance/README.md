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

Toda mensagem recebida passa por `supermarketController.emit`. Se o texto
contiver um link/QR de NFC-e, a nota é capturada automaticamente — nenhuma outra
mensagem é afetada.

## Endpoints

Base: `/supermarket` — todos exigem `:instanceName` e a apikey da instância.

| Método | Rota                                        | Descrição                                             |
| ------ | ------------------------------------------- | ----------------------------------------------------- |
| POST   | `/supermarket/receipt/:instanceName`        | Ingerir nota (`url` da NFC-e, `base64`/`imageUrl`)    |
| POST   | `/supermarket/manual/:instanceName`         | Cadastrar nota manualmente (lista de itens)           |
| GET    | `/supermarket/receipts/:instanceName`       | Listar notas (`startDate`, `endDate`, `category`)     |
| GET    | `/supermarket/receipt/:receiptId/:instanceName` | Detalhe de uma nota                               |
| DELETE | `/supermarket/receipt/:receiptId/:instanceName` | Remover uma nota                                  |
| GET    | `/supermarket/analytics/:instanceName`      | Dados agregados para o dashboard                      |

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
- Captura automática de **foto** enviada no WhatsApp (hoje a captura automática
  cobre link/QR; foto já funciona pela API REST).
- Toggle de habilitação do módulo por instância.
