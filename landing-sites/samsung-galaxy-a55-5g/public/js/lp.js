/**
 * Interações da landing page.
 *
 * Substitui o runtime da aplicação de origem, que só funcionava contra o
 * backend dela. Aqui não há framework, nem pedido de rede, nem dependência
 * externa: o script apenas liga os elementos que já vêm no HTML.
 *
 * Tudo é progressivo — com o script bloqueado, a página continua legível, a
 * galeria continua a deslizar por toque e o botão de compra continua a ser
 * uma ligação válida para o checkout.
 */

(function () {
  "use strict";

  var config = readConfig();

  function readConfig() {
    var node = document.getElementById("lp-config");
    if (!node) return { checkout: { enabled: false }, variants: [] };
    try {
      return JSON.parse(node.textContent);
    } catch (error) {
      return { checkout: { enabled: false }, variants: [] };
    }
  }

  function $(selector, scope) {
    return (scope || document).querySelector(selector);
  }

  function $$(selector, scope) {
    return Array.prototype.slice.call((scope || document).querySelectorAll(selector));
  }

  function euros(cents) {
    return (cents / 100).toFixed(2).replace(".", ",") + " €";
  }

  // -------------------------------------------------------------------------
  // Galeria: setas e miniaturas operam o mesmo contentor com deslize nativo,
  // então o gesto de toque no telemóvel continua a ser o do navegador.
  // -------------------------------------------------------------------------

  function setupGallery() {
    var track = $('[data-lp="gallery"]');
    if (!track) return;

    var slides = $$(":scope > div", track);
    var thumbs = $$("button", $('[data-lp="thumbs"]') || document.createElement("div"));

    function current() {
      var width = track.clientWidth || 1;
      return Math.round(track.scrollLeft / width);
    }

    function goTo(index) {
      var clamped = Math.max(0, Math.min(slides.length - 1, index));
      track.scrollTo({ left: clamped * track.clientWidth, behavior: "smooth" });
    }

    var prev = $('[data-lp="prev"]');
    var next = $('[data-lp="next"]');
    if (prev) prev.addEventListener("click", function () { goTo(current() - 1); });
    if (next) next.addEventListener("click", function () { goTo(current() + 1); });

    thumbs.forEach(function (thumb, index) {
      thumb.addEventListener("click", function () { goTo(index); });
    });

    function paintThumbs() {
      var active = current();
      thumbs.forEach(function (thumb, index) {
        thumb.classList.toggle("border-primaria", index === active);
        thumb.classList.toggle("border-gray-200", index !== active);
      });
    }

    var pending;
    track.addEventListener("scroll", function () {
      window.clearTimeout(pending);
      pending = window.setTimeout(paintThumbs, 80);
    }, { passive: true });

    paintThumbs();
  }

  // -------------------------------------------------------------------------
  // Opção de armazenamento, quantidade e destino do checkout
  // -------------------------------------------------------------------------

  function setupPurchase() {
    var buttons = $$("[data-lp-variant]");
    var priceNode = $('[data-lp="price"]');
    var compareNode = $('[data-lp="compare"]');
    var savingsNode = $('[data-lp="savings"]');
    var quantityInput = $('[data-lp="qty"]');
    var buyLink = $('[data-lp="buy"]');

    var variants = config.variants || [];
    var selected = 0;
    var quantity = 1;

    function paintVariants() {
      buttons.forEach(function (button, index) {
        var active = index === selected;
        button.classList.toggle("border-primaria", active);
        button.classList.toggle("bg-primaria-clara", active);
        button.classList.toggle("border-gray-200", !active);
        button.classList.toggle("hover:border-primaria/40", !active);
        button.setAttribute("aria-pressed", active ? "true" : "false");
      });
    }

    function paintPrice() {
      var variant = variants[selected];
      if (!variant) return;
      if (priceNode) priceNode.textContent = euros(variant.price);
      if (compareNode) compareNode.textContent = euros(variant.compareAt);
      if (savingsNode) savingsNode.textContent = euros(variant.compareAt - variant.price);
    }

    function paintBuyLink() {
      if (!buyLink) return;
      if (buyLink.getAttribute("data-lp-checkout") !== "on") return;

      var base = config.checkout.baseUrl + config.checkout.path;
      var params = new URLSearchParams();
      var variant = variants[selected];
      if (variant) params.set("variant", variant.id);
      params.set("qty", String(quantity));

      // As etiquetas da campanha que trouxeram a visita seguem para o
      // checkout — sem elas o anúncio não consegue atribuir a venda.
      var incoming = new URLSearchParams(window.location.search);
      ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid", "ttclid", "gclid"].forEach(
        function (key) {
          var value = incoming.get(key);
          if (value) params.set(key, value);
        },
      );

      buyLink.href = base + "?" + params.toString();
    }

    function refresh() {
      paintVariants();
      paintPrice();
      paintBuyLink();
    }

    buttons.forEach(function (button, index) {
      button.addEventListener("click", function () {
        selected = index;
        refresh();
      });
    });

    function setQuantity(value) {
      quantity = Math.max(1, Math.min(99, value));
      if (quantityInput) quantityInput.value = String(quantity);
      paintBuyLink();
    }

    var minus = $('[data-lp="qty-minus"]');
    var plus = $('[data-lp="qty-plus"]');
    if (minus) minus.addEventListener("click", function () { setQuantity(quantity - 1); });
    if (plus) plus.addEventListener("click", function () { setQuantity(quantity + 1); });
    if (quantityInput) {
      quantityInput.addEventListener("input", function () {
        var parsed = parseInt(quantityInput.value, 10);
        if (!isNaN(parsed)) setQuantity(parsed);
      });
      quantityInput.addEventListener("blur", function () { setQuantity(quantity); });
    }

    // Sem checkout ligado o botão não navega para lado nenhum: avisa e fica
    // à espera da integração, em vez de levar o comprador a um endereço morto.
    if (buyLink && buyLink.getAttribute("data-lp-checkout") !== "on") {
      buyLink.addEventListener("click", function (event) {
        event.preventDefault();
        window.alert("O checkout ainda não está ligado a esta página.");
      });
    }

    refresh();
    setQuantity(1);
  }

  // -------------------------------------------------------------------------
  // Abas de conteúdo
  // -------------------------------------------------------------------------

  function setupTabs() {
    var tabs = $$("[data-lp-tab]");
    if (tabs.length === 0) return;

    function show(name) {
      tabs.forEach(function (tab) {
        var active = tab.getAttribute("data-lp-tab") === name;
        tab.setAttribute("aria-selected", active ? "true" : "false");
        tab.classList.toggle("border-primaria", active);
        tab.classList.toggle("text-primaria", active);
        tab.classList.toggle("border-transparent", !active);
        tab.classList.toggle("text-tinta-suave", !active);
      });
      $$("[data-lp-panel]").forEach(function (panel) {
        panel.hidden = panel.getAttribute("data-lp-panel") !== name;
      });
    }

    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        show(tab.getAttribute("data-lp-tab"));
      });
    });

    show("descricao");
  }

  // -------------------------------------------------------------------------
  // Aviso de cookies — a escolha fica no próprio navegador, nada é enviado.
  // -------------------------------------------------------------------------

  function setupCookies() {
    var banner = $('[data-lp="cookies"]');
    if (!banner) return;

    var KEY = "lp-consentimento";
    var stored = null;
    try {
      stored = window.localStorage.getItem(KEY);
    } catch (error) {
      stored = null;
    }
    if (stored) return;

    banner.hidden = false;
    window.requestAnimationFrame(function () {
      banner.classList.remove("translate-y-full");
    });

    function decide(value) {
      try {
        window.localStorage.setItem(KEY, value);
      } catch (error) {
        /* navegação privada: a escolha vale só para esta visita */
      }
      banner.classList.add("translate-y-full");
      window.setTimeout(function () { banner.hidden = true; }, 300);
    }

    var accept = $('[data-lp="cookies-accept"]');
    var reject = $('[data-lp="cookies-reject"]');
    if (accept) accept.addEventListener("click", function () { decide("aceite"); });
    if (reject) reject.addEventListener("click", function () { decide("recusado"); });
  }

  // -------------------------------------------------------------------------

  function start() {
    setupGallery();
    setupPurchase();
    setupTabs();
    setupCookies();
    document.documentElement.classList.add("lp-pronto");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
