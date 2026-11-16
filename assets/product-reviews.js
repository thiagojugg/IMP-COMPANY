(() => {
  const apiUrl = "https://crctyekoviqcyxzqjrpb.supabase.co/functions/v1/product-reviews";
  const anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNyY3R5ZWtvdmlxY3l4enFqcnBiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ2ODgzNzgsImV4cCI6MjExMDI2NDM3OH0.kC_sb3qqy5AxUrpoIrSuogPCo43lFYRtFxXecbTd4Fo";
  const headers = { "Content-Type": "application/json", "apikey": anonKey, "Authorization": "Bearer " + anonKey };

  function reviewerId() {
    const key = "imp-company-reviewer-v1";
    let value = localStorage.getItem(key);
    if (!value) {
      if (crypto.randomUUID) value = crypto.randomUUID();
      else {
        const bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);
        bytes[6] = (bytes[6] & 15) | 64;
        bytes[8] = (bytes[8] & 63) | 128;
        const hex = [...bytes].map(x => x.toString(16).padStart(2, "0"));
        value = hex.slice(0,4).join("") + "-" + hex.slice(4,6).join("") + "-" + hex.slice(6,8).join("") + "-" + hex.slice(8,10).join("") + "-" + hex.slice(10).join("");
      }
      localStorage.setItem(key, value);
    }
    return value;
  }

  function setup() {
    const details = document.querySelector(".detalhes, .details");
    const heading = details?.querySelector("h1");
    if (!details || !heading) return;

    let widget = details.querySelector(".avaliacao");
    if (!widget) {
      widget = document.createElement("div");
      widget.className = "avaliacao";
      heading.insertAdjacentElement("afterend", widget);
    }

    const metaId = document.querySelector('meta[name="product-id"]')?.content;
    const pathSlug = location.pathname.split("/").filter(Boolean).pop()?.replace(/\.html$/i, "");
    const explicitId = metaId || pathSlug || widget.dataset.productId || details.dataset.productId;
    const productId = explicitId || heading.textContent.trim().toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 120);

    widget.innerHTML = '<div class="estrelas" role="group" aria-label="Avalie este produto">' +
      [1,2,3,4,5].map(n => '<button class="estrela-avaliacao" type="button" data-rating="' + n + '" aria-label="' + n + (n === 1 ? ' estrela' : ' estrelas') + '" aria-pressed="false">★</button>').join("") +
      '</div><small class="texto-avaliacao" aria-live="polite">Carregando avaliações...</small>';

    const style = document.createElement("style");
    style.textContent = ".avaliacao{display:flex;align-items:center;gap:10px;margin:17px 0 34px}.avaliacao .estrelas{display:flex;align-items:center;gap:3px}.estrela-avaliacao{border:0;background:transparent;padding:2px;color:#c9c9c9;font-size:22px;line-height:1;cursor:pointer;transition:color .18s ease,transform .18s ease}.estrela-avaliacao.ativa,.estrela-avaliacao:hover{color:#111}.estrela-avaliacao:hover{transform:scale(1.12)}.estrela-avaliacao:focus-visible{outline:1px solid #111;outline-offset:2px}.avaliacao small{font-size:10px;color:#777;letter-spacing:.08em;white-space:nowrap}@media(max-width:800px){.avaliacao{margin:14px 0 25px}}";
    document.head.appendChild(style);

    const buttons = [...widget.querySelectorAll("[data-rating]")];
    const label = widget.querySelector(".texto-avaliacao");
    const reviewerKey = reviewerId();
    let userRating = 0;
    let average = 0;

    function paint(stars) {
      buttons.forEach(button => {
        const value = Number(button.dataset.rating);
        button.classList.toggle("ativa", value <= stars);
        button.setAttribute("aria-pressed", String(value === userRating));
      });
    }

    function showSummary(count) {
      if (!count) label.textContent = "Seja o primeiro a avaliar";
      else {
        const averageText = average.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
        label.textContent = averageText + "/5 · " + count + (count === 1 ? " avaliação" : " avaliações") +
          (userRating ? " · Sua nota: " + userRating + "/5" : "");
      }
      paint(userRating || Math.round(average));
    }

    async function loadSummary() {
      const query = new URLSearchParams({ product_id: productId, reviewer_key: reviewerKey });
      const response = await fetch(apiUrl + "?" + query.toString(), { headers });
      if (!response.ok) throw new Error("Falha ao carregar avaliações");
      const data = await response.json();
      userRating = data.user_rating || 0;
      average = Number(data.average_rating || 0);
      showSummary(Number(data.rating_count || 0));
    }

    buttons.forEach(button => button.addEventListener("click", async () => {
      const rating = Number(button.dataset.rating);
      buttons.forEach(b => b.disabled = true);
      label.textContent = "Enviando avaliação...";
      try {
        const response = await fetch(apiUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({ product_id: productId, reviewer_key: reviewerKey, rating })
        });
        if (!response.ok) throw new Error("Falha ao salvar avaliação");
        userRating = rating;
        await loadSummary();
        if (!label.textContent.includes("Sua nota")) {
          label.textContent += " · Sua nota: " + rating + "/5";
        }
      } catch (_) {
        label.textContent = "Não foi possível salvar. Tente novamente.";
      } finally {
        buttons.forEach(b => b.disabled = false);
      }
    }));

    loadSummary().catch(() => { label.textContent = "Avaliações indisponíveis no momento"; });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", setup, { once: true });
  else setup();
})();