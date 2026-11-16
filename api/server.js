import "dotenv/config";
import express from "express";
import cors from "cors";

const app = express();
const port = process.env.PORT || 3000;
const allowedOrigins = (process.env.FRONTEND_URL || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    // Permite chamadas sem Origin (health checks e ferramentas de servidor).
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Origem não autorizada pelo CORS."));
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(express.json({ limit: "100kb" }));

app.get("/", (_req, res) => {
  res.json({ service: "IMP COMPANY Payments API", status: "online" });
});

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true, service: "imp-company-payments" });
});

// O endpoint de checkout será implementado após validar o catálogo,
// preços, variações e quais produtos estão efetivamente disponíveis.
app.post("/api/checkout", (_req, res) => {
  res.status(503).json({
    error: "CHECKOUT_NOT_CONFIGURED",
    message: "O checkout ainda está em configuração. Nenhum pagamento foi iniciado.",
  });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`IMP COMPANY Payments API listening on port ${port}`);
});
