import "dotenv/config";
import express from "express";
import cors from "cors";
import crypto from "node:crypto";

const app = express();
const port = process.env.PORT || 3000;
const allowedOrigins = (process.env.FRONTEND_URL || "")
  .split(",").map((origin) => origin.trim()).filter(Boolean);
const FRONTEND_URL = (process.env.FRONTEND_URL || "https://thiagojugg.github.io/IMP-COMPANY")
  .replace(/\/$/, "");
const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const MP_ENVIRONMENT = (process.env.MP_ENVIRONMENT || "production").toLowerCase();
const MP_ACCESS_TOKEN = MP_ENVIRONMENT === "test"
  ? (process.env.MERCADO_PAGO_TEST_ACCESS_TOKEN || "")
  : (process.env.MERCADO_PAGO_ACCESS_TOKEN || "");
const MP_WEBHOOK_SECRET = process.env.MERCADO_PAGO_WEBHOOK_SECRET || "";
const VARIANT_ID = "713eb4db-9c0c-4101-9968-35f0d40031a1";
const PRODUCT_PRICE_CENTS = 12390;
const COUPON_CODE = "VN10";
const COUPON_PERCENT = 10;

app.use(cors({
  origin(origin, callback) {
    const originAllowed = allowedOrigins.some((allowed) => {
      try { return new URL(allowed).origin === origin; } catch { return false; }
    });
    if (!origin || originAllowed) return callback(null, true);
    return callback(new Error("Origem não autorizada pelo CORS."));
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(express.json({ limit: "50kb" }));

function requireConfig(res) {
  const missing = [];
  if (!SUPABASE_URL) missing.push("SUPABASE_URL");
  if (!SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!MP_ACCESS_TOKEN) missing.push(MP_ENVIRONMENT === "test" ? "MERCADO_PAGO_TEST_ACCESS_TOKEN" : "MERCADO_PAGO_ACCESS_TOKEN");
  if (!MP_WEBHOOK_SECRET) missing.push("MERCADO_PAGO_WEBHOOK_SECRET");
  if (missing.length) {
    res.status(503).json({ error: "SERVER_NOT_CONFIGURED", message: "Integração ainda não configurada no servidor.", missing });
    return false;
  }
  return true;
}

async function supabaseRequest(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  if (!response.ok) {
    const error = new Error(data?.message || data?.hint || "Falha ao acessar o banco.");
    error.status = response.status;
    error.details = data;
    throw error;
  }
  return data;
}

async function rpc(name, body) {
  return supabaseRequest(`rpc/${name}`, { method: "POST", body: JSON.stringify(body) });
}

async function mpRequest(path, body) {
  const response = await fetch(`https://api.mercadopago.com${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || "Mercado Pago recusou a solicitação.");
    error.status = response.status;
    error.details = data;
    throw error;
  }
  return data;
}

function cleanText(value, max = 160) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function validateCustomer(customer) {
  const name = cleanText(customer?.name);
  const email = cleanText(customer?.email, 180).toLowerCase();
  const phone = cleanText(customer?.phone, 30);
  const a = customer?.address || {};
  const address = {
    recipient: name,
    zip_code: cleanText(a.zipCode, 9).replace(/\D/g, ""),
    street_name: cleanText(a.street, 160),
    street_number: cleanText(a.number, 20),
    complement: cleanText(a.complement, 100),
    neighborhood: cleanText(a.neighborhood, 100),
    city_name: cleanText(a.city, 100),
    state_name: cleanText(a.state, 2).toUpperCase(),
    country_name: "Brasil",
  };
  if (name.length < 3 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      phone.replace(/\D/g, "").length < 10 ||
      address.zip_code.length !== 8 || !address.street_name ||
      !address.street_number || !address.neighborhood ||
      !address.city_name || !/^[A-Z]{2}$/.test(address.state_name)) {
    const error = new Error("Confira nome, e-mail, telefone e todos os campos obrigatórios do endereço.");
    error.status = 400;
    throw error;
  }
  return { name, email, phone, address };
}

async function getShippingCents(state) {
  const result = await rpc("get_store_shipping_rate", { p_state: state });
  const cents = Array.isArray(result) ? result[0] : result;
  if (!Number.isInteger(cents) || cents <= 0) {
    const error = new Error("Ainda não há tarifa de entrega cadastrada para esse estado.");
    error.status = 400;
    throw error;
  }
  return cents;
}

app.get("/", (_req, res) => {
  res.json({ service: "IMP COMPANY Payments API", status: "online" });
});

app.get("/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    service: "imp-company-payments",
    configured: {
      supabase: Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY),
      mercadoPago: Boolean(MP_ACCESS_TOKEN),
      mercadoPagoEnvironment: MP_ENVIRONMENT === "test" ? "test" : "production",
      webhook: Boolean(MP_WEBHOOK_SECRET),
    },
  });
});


app.get("/api/stock", async (req, res) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({ error: "STOCK_NOT_CONFIGURED", message: "Consulta de estoque indisponível." });
  }
  const variantId = cleanText(req.query?.variantId, 64);
  if (variantId !== VARIANT_ID) {
    return res.status(404).json({ error: "VARIANT_NOT_FOUND" });
  }
  try {
    const rows = await supabaseRequest(
      `store_variants?id=eq.${encodeURIComponent(VARIANT_ID)}&select=stock,active`,
      { method: "GET" }
    );
    const variant = rows?.[0];
    if (!variant || !variant.active) {
      return res.status(404).json({ error: "VARIANT_UNAVAILABLE", stock: 0 });
    }
    return res.set("Cache-Control", "no-store").json({ stock: Math.max(0, Number(variant.stock) || 0) });
  } catch (error) {
    console.error("Erro ao consultar estoque:", error.details || error.message);
    return res.status(500).json({ error: "STOCK_LOOKUP_FAILED", message: "Não foi possível consultar o estoque." });
  }
});

app.post("/api/shipping/quote", async (req, res) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({ error: "SHIPPING_NOT_CONFIGURED", message: "Cálculo de frete indisponível no momento." });
  }
  const state = cleanText(req.body?.state, 2).toUpperCase();
  if (!/^[A-Z]{2}$/.test(state)) {
    return res.status(400).json({ error: "INVALID_STATE", message: "Informe uma UF válida para calcular o frete." });
  }
  try {
    const shippingCents = await getShippingCents(state);
    return res.json({ state, shippingCents });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: "SHIPPING_QUOTE_FAILED",
      message: error.status === 400 ? error.message : "Não foi possível calcular o frete agora.",
    });
  }
});

app.post("/api/coupons/validate", async (req, res) => {
  try {
    const code = cleanText(req.body?.code, 32).toUpperCase();
    if (code !== COUPON_CODE) {
      return res.status(400).json({ valid: false, error: "INVALID_COUPON", message: "Cupom inválido ou não disponível." });
    }
    const remaining = Number(await rpc("get_vn10_coupon_remaining", {}));
    if (remaining <= 0) {
      return res.status(409).json({ valid: false, error: "COUPON_LIMIT_REACHED", message: "Este cupom já atingiu o limite de 3 utilizações." });
    }
    const discountCents = Math.round(PRODUCT_PRICE_CENTS * COUPON_PERCENT / 100);
    return res.json({ valid: true, code: COUPON_CODE, percent: COUPON_PERCENT, discountCents, productPriceCents: PRODUCT_PRICE_CENTS, remaining });
  } catch (error) {
    console.error("Erro ao validar cupom:", error.details || error.message);
    return res.status(500).json({ valid: false, message: "Não foi possível verificar a disponibilidade do cupom." });
  }
});

app.post("/api/checkout", async (req, res) => {
  if (!requireConfig(res)) return;
  let orderId = null;
  try {
    const customer = validateCustomer(req.body?.customer);
    const shippingCents = await getShippingCents(customer.address.state_name);
    const couponCode = cleanText(req.body?.couponCode, 32).toUpperCase();
    if (couponCode && couponCode !== COUPON_CODE) {
      const error = new Error("Cupom inválido ou não disponível.");
      error.status = 400;
      throw error;
    }
    const discountCents = couponCode ? Math.round(PRODUCT_PRICE_CENTS * COUPON_PERCENT / 100) : 0;
    const discountedProductCents = PRODUCT_PRICE_CENTS - discountCents;
    const items = req.body?.items;
    if (!Array.isArray(items) || items.length !== 1 ||
        items[0]?.variantId !== VARIANT_ID ||
        !Number.isInteger(items[0]?.quantity) || items[0].quantity !== 1) {
      return res.status(400).json({
        error: "INVALID_CART",
        message: "No momento, apenas 1 camiseta Gengar preta, tamanho G, está disponível.",
      });
    }

    orderId = await rpc("reserve_store_order", {
      p_variant_id: VARIANT_ID,
      p_quantity: 1,
      p_customer_name: customer.name,
      p_customer_email: customer.email,
      p_customer_phone: customer.phone,
      p_shipping_address: customer.address,
      p_shipping_cents: shippingCents,
    });

    if (couponCode) {
      const couponReserved = await rpc("reserve_vn10_coupon", { p_order_id: orderId });
      if (!couponReserved) {
        const error = new Error("Este cupom já atingiu o limite de 3 utilizações.");
        error.status = 409;
        throw error;
      }
    }

    const apiBase = (process.env.RENDER_EXTERNAL_URL || "https://imp-company-payments-uwq7.onrender.com").replace(/\/$/, "");
    const preference = await mpRequest("/checkout/preferences", {
      items: [
        {
          id: "IMP-GENGAR-PRETA-G",
          title: "CAMISETA IMP GENGAR DROP #1 — PRETA / G",
          quantity: 1,
          currency_id: "BRL",
          unit_price: discountedProductCents / 100,
        },
        {
          id: `IMP-FRETE-${customer.address.state_name}`,
          title: `Frete de entrega — ${customer.address.state_name}`,
          quantity: 1,
          currency_id: "BRL",
          unit_price: shippingCents / 100,
        },
      ],
      payer: {
        name: customer.name,
        email: customer.email,
        phone: { number: customer.phone.replace(/\D/g, "") },
      },
      shipments: {
        receiver_address: {
          zip_code: customer.address.zip_code,
          street_name: customer.address.street_name,
          street_number: Number(customer.address.street_number) || 0,
          city_name: customer.address.city_name,
          state_name: customer.address.state_name,
          country_name: "Brasil",
        },
      },
      external_reference: orderId,
      notification_url: `${apiBase}/api/webhooks/mercadopago`,
      back_urls: {
        success: `${FRONTEND_URL}/carrinho.html?pagamento=sucesso&pedido=${orderId}`,
        pending: `${FRONTEND_URL}/carrinho.html?pagamento=pendente&pedido=${orderId}`,
        failure: `${FRONTEND_URL}/carrinho.html?pagamento=falhou&pedido=${orderId}`,
      },
      auto_return: "approved",
      expires: true,
      expiration_date_from: new Date().toISOString(),
      expiration_date_to: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      statement_descriptor: "IMP COMPANY",
      metadata: { order_id: orderId },
    });

    const checkoutUrl = MP_ENVIRONMENT === "test"
      ? preference.sandbox_init_point
      : preference.init_point;
    if (!checkoutUrl) {
      throw new Error(MP_ENVIRONMENT === "test"
        ? "Mercado Pago não retornou sandbox_init_point para a preferência de teste."
        : "Mercado Pago não retornou init_point para a preferência.");
    }

    await supabaseRequest(`store_orders?id=eq.${encodeURIComponent(orderId)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        mp_preference_id: preference.id,
        checkout_url: checkoutUrl,
        total_cents: discountedProductCents + shippingCents,
        coupon_code: couponCode || null,
        discount_cents: discountCents,
        updated_at: new Date().toISOString(),
      }),
    });
    return res.status(201).json({ orderId, checkoutUrl });
  } catch (error) {
    if (orderId) {
      try { await rpc("release_store_order_stock", { p_order_id: orderId }); } catch (releaseError) {
        console.error("Falha ao liberar reserva após erro no checkout:", releaseError.message);
      }
    }
    console.error("Erro ao criar checkout:", error.details || error.message);
    return res.status(error.status || 500).json({
      error: error.message === "OUT_OF_STOCK" ? "OUT_OF_STOCK" : "CHECKOUT_FAILED",
      message: error.message === "OUT_OF_STOCK"
        ? "Essa variação acabou de esgotar."
        : ([400, 409].includes(error.status) ? error.message : "Não foi possível iniciar o pagamento. Tente novamente."),
    });
  }
});

function validWebhookSignature(req, dataId) {
  if (!MP_WEBHOOK_SECRET) return false;
  const signature = req.get("x-signature") || "";
  const requestId = req.get("x-request-id") || "";
  const parts = Object.fromEntries(signature.split(",").map((part) => {
    const [key, ...value] = part.trim().split("=");
    return [key, value.join("=")];
  }));
  if (!parts.ts || !parts.v1 || !requestId || !dataId) return false;
  const manifest = `id:${String(dataId).toLowerCase()};request-id:${requestId};ts:${parts.ts};`;
  const expected = crypto.createHmac("sha256", MP_WEBHOOK_SECRET).update(manifest).digest("hex");
  const received = parts.v1;
  return received.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

app.post("/api/webhooks/mercadopago", async (req, res) => {
  if (!requireConfig(res)) return;
  const paymentId = req.query["data.id"] || req.body?.data?.id;
  if (!validWebhookSignature(req, paymentId)) {
    return res.status(401).json({ error: "INVALID_WEBHOOK_SIGNATURE" });
  }
  try {
    const payment = await mpRequest(`/v1/payments/${encodeURIComponent(paymentId)}`);
    const orderId = payment.external_reference || payment.metadata?.order_id;
    if (!orderId) return res.status(200).json({ received: true, ignored: true });

    const orders = await supabaseRequest(
      `store_orders?id=eq.${encodeURIComponent(orderId)}&select=id,total_cents,status,stock_released`,
      { method: "GET" }
    );
    const order = orders?.[0];
    if (!order) return res.status(200).json({ received: true, ignored: true });

    const paidCents = Math.round(Number(payment.transaction_amount) * 100);
    if (payment.status === "approved") {
      if (paidCents !== order.total_cents) {
        console.error("Valor do pagamento diverge do pedido:", orderId);
        return res.status(409).json({ error: "PAYMENT_AMOUNT_MISMATCH" });
      }
      await supabaseRequest(`store_orders?id=eq.${encodeURIComponent(orderId)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          status: "paid",
          mp_payment_id: String(payment.id),
          updated_at: new Date().toISOString(),
        }),
      });
    } else if (["rejected", "cancelled", "refunded", "charged_back"].includes(payment.status)) {
      await supabaseRequest(`store_orders?id=eq.${encodeURIComponent(orderId)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          mp_payment_id: String(payment.id),
          updated_at: new Date().toISOString(),
        }),
      });
      await rpc("release_store_order_stock", { p_order_id: orderId });
    } else {
      await supabaseRequest(`store_orders?id=eq.${encodeURIComponent(orderId)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          mp_payment_id: String(payment.id),
          updated_at: new Date().toISOString(),
        }),
      });
    }
    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("Erro ao processar webhook:", error.details || error.message);
    return res.status(500).json({ error: "WEBHOOK_PROCESSING_FAILED" });
  }
});

app.listen(port, "0.0.0.0", () => {
  console.log(`IMP COMPANY Payments API listening on port ${port}`);
});
