# IMP COMPANY — Payments API

Backend Node.js separado do GitHub Pages para integrar o Mercado Pago Checkout Pro.

## Requisitos
- Node.js 20 ou superior
- Credenciais do Mercado Pago (começar pelo ambiente de teste)

## Desenvolvimento
```bash
cd api
npm install
cp .env.example .env
npm run dev
```

A rota `GET /health` verifica se o serviço está ativo.

## Render
- Root Directory: `api`
- Runtime: Node
- Build Command: `npm install`
- Start Command: `npm start`
- Configure as variáveis no painel Environment do Render:
  - `MERCADO_PAGO_ACCESS_TOKEN`
  - `MERCADO_PAGO_WEBHOOK_SECRET` (quando configurarmos a assinatura do webhook)
  - `FRONTEND_URL` (origem pública exata do site)

Não envie tokens ao GitHub, ao navegador ou ao chat. Não use credenciais de produção antes dos testes.

## Estado
Estrutura inicial criada. O endpoint de checkout permanece desativado até validarmos o catálogo, os preços e os produtos disponíveis para compra. Isso evita criar cobranças com valores incorretos.
