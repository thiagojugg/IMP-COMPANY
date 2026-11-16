# IMP COMPANY — Payments API

Backend Node.js separado do GitHub Pages para integrar o Mercado Pago Checkout Pro.

## Requisitos
- Node.js 20 ou superior
- Projeto Supabase com o schema de pedidos da IMP COMPANY
- Credenciais do Mercado Pago (recomendado testar primeiro em sandbox)

## Desenvolvimento
```bash
cd api
npm install
cp .env.example .env
npm run dev
```

A rota `GET /health` informa se o serviço está ativo e quais integrações estão configuradas, sem revelar credenciais.

## Render
- Root Directory: `api`
- Runtime: Node
- Build Command: `npm install`
- Start Command: `npm start`

Configure no painel Environment do Render:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` — segredo privado, nunca expor ao navegador ou GitHub
- `MERCADO_PAGO_ACCESS_TOKEN`
- `MERCADO_PAGO_WEBHOOK_SECRET` — assinatura secreta gerada em Webhooks no painel do Mercado Pago
- `FRONTEND_URL` — URL base do GitHub Pages: `https://thiagojugg.github.io/IMP-COMPANY`

## Checkout e estoque
- O navegador envia apenas a identificação da variação e os dados de entrega.
- O backend consulta preço e estoque no Supabase; o preço enviado pelo navegador não é utilizado.
- A função `reserve_store_order` reserva o estoque de forma atômica e cria o pedido.
- O backend cria a preferência do Checkout Pro e direciona o comprador para o Mercado Pago.
- O webhook valida a assinatura e consulta o pagamento diretamente na API do Mercado Pago antes de atualizar o pedido.
- Reservas sem pagamento são liberadas na próxima tentativa de checkout após o prazo de 30 minutos; pedidos com pagamento em processamento mantêm a reserva até uma atualização de status.

## Endpoint de webhook
`POST /api/webhooks/mercadopago`

A preferência inclui essa URL como `notification_url`. Configure a assinatura secreta da aplicação no Render antes de liberar pagamentos.

## Disponibilidade atual
A única variação liberada é a camiseta Gengar preta, tamanho G, com estoque inicial de 1 unidade. O produto THE WORLD IS OURS permanece indisponível.
