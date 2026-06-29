(function () {
  const pages = {
    "/": { key: "home", title: "NEOVER - Solutions \u00c9nerg\u00e9tiques" },
    "/index.html": { key: "home", title: "NEOVER - Solutions \u00c9nerg\u00e9tiques" },
    "/qui-sommes-nous.html": { key: "about", title: "Qui sommes-nous - NEOVER" },
    "/services.html": { key: "services", title: "Services - NEOVER" },
    "/contact.html": { key: "contact", title: "Contact - NEOVER" },
    "/mentions-legales.html": { key: "legal", title: "Mentions l\u00e9gales - NEOVER" }
  };

  const links = {
    "#about": "/qui-sommes-nous.html",
    "#services": "/services.html",
    "#contact": "/contact.html"
  };

  const fullNavigation = [
    { label: "Accueil", path: "/", key: "home" },
    { label: "Qui sommes-nous", path: "/qui-sommes-nous.html", key: "about" },
    { label: "Services", path: "/services.html", key: "services" },
    { label: "Contact", path: "/contact.html", key: "contact" },
    { label: "Mentions l\u00e9gales", path: "/mentions-legales.html", key: "legal" }
  ];

  const current = pages[window.location.pathname] || pages["/"];
  document.body.dataset.page = current.key;
  document.title = current.title;

  function improveNavigation() {
    if (current.key === "home") {
      document.getElementById("mentions-legales")?.remove();
    }

    Object.entries(links).forEach(([hash, path]) => {
      document.querySelectorAll(`a[href="${hash}"]`).forEach((link) => {
        link.href = path;
        link.classList.toggle("neover-active-link", window.location.pathname === path);
      });
    });

    document.querySelectorAll('a[href="/mentions-legales"], a[href="#mentions-legales"]').forEach((link) => {
      link.href = "/mentions-legales.html";
      link.classList.toggle("neover-active-link", current.key === "legal");
    });

    document.querySelectorAll("footer h3, footer h4").forEach((heading) => {
      if (heading.textContent.trim() !== "Navigation") return;
      const list = heading.parentElement?.querySelector("ul");
      if (!list || list.dataset.fullNavigation === "true") return;

      list.dataset.fullNavigation = "true";
      list.replaceChildren(...fullNavigation.map((item) => {
        const listItem = document.createElement("li");
        const link = document.createElement("a");
        link.href = item.path;
        link.textContent = item.label;
        link.className = "hover:text-white transition-colors";
        if (current.key === item.key) link.classList.add("neover-active-link");
        listItem.append(link);
        return listItem;
      }));
    });

    const desktopNavigation = document.querySelector("nav .hidden.md\\:flex");
    if (desktopNavigation && !desktopNavigation.querySelector(".neover-home-link")) {
      const homeLink = document.createElement("a");
      homeLink.href = "/";
      homeLink.textContent = "Accueil";
      homeLink.className = "neover-home-link";
      if (current.key === "home") homeLink.classList.add("neover-active-link");
      desktopNavigation.prepend(homeLink);
    }

    const logo = document.querySelector('nav img[alt="NEOVER Logo"]');
    if (logo && !logo.dataset.homeLinkReady) {
      logo.dataset.homeLinkReady = "true";
      logo.setAttribute("role", "link");
      logo.setAttribute("tabindex", "0");
      logo.addEventListener("click", () => { window.location.href = "/"; });
      logo.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") window.location.href = "/";
      });
    }
  }

  function setFieldError(form, fieldName, message) {
    const field = form.querySelector(`[name="${fieldName}"]`);
    const error = form.querySelector(`[data-field-error="${fieldName}"]`);
    if (!field || !error) return;

    field.classList.toggle("neover-field-invalid", Boolean(message));
    field.setAttribute("aria-invalid", message ? "true" : "false");
    error.textContent = message || "";
  }

  function showFormStatus(form, type, message) {
    const status = form.querySelector(".neover-form-status");
    if (!status) return;

    status.hidden = false;
    status.className = `neover-form-status neover-form-status-${type}`;
    status.textContent = message;
  }

  function installContactForm() {
    if (current.key !== "contact") return;

    const section = document.querySelector("section#contact");
    if (!section || section.querySelector(".neover-contact-form")) return;

    const block = document.createElement("div");
    block.className = "neover-contact-form-block";
    block.innerHTML = `
      <div class="neover-contact-form-copy">
        <p class="neover-form-kicker">Demande de devis</p>
        <h2>Parlez-nous de votre projet</h2>
        <p>D&eacute;crivez rapidement votre besoin. L'&eacute;quipe NEOVER vous recontacte pour qualifier votre demande et vous orienter vers la solution adapt&eacute;e.</p>
      </div>
      <form class="neover-contact-form" novalidate>
        <input type="text" name="website" tabindex="-1" autocomplete="off" class="neover-honeypot" aria-hidden="true" />
        <input type="hidden" name="page" value="${window.location.pathname}" />

        <div class="neover-form-grid">
          <label>
            <span>Nom complet</span>
            <input name="name" type="text" autocomplete="name" required minlength="2" placeholder="Votre nom" />
            <small data-field-error="name"></small>
          </label>

          <label>
            <span>T&eacute;l&eacute;phone</span>
            <input name="phone" type="tel" autocomplete="tel" required placeholder="09 72 73 03 95" />
            <small data-field-error="phone"></small>
          </label>
        </div>

        <div class="neover-form-grid">
          <label>
            <span>Email</span>
            <input name="email" type="email" autocomplete="email" required placeholder="vous@email.fr" />
            <small data-field-error="email"></small>
          </label>

          <label>
            <span>Type de projet</span>
            <select name="project" required>
              <option value="">S&eacute;lectionner</option>
              <option>Panneaux solaires</option>
              <option>Pompe &agrave; chaleur</option>
              <option>Isolation thermique</option>
              <option>Borne de recharge</option>
              <option>Ballon thermodynamique</option>
              <option>Autre demande</option>
            </select>
            <small data-field-error="project"></small>
          </label>
        </div>

        <label>
          <span>Message</span>
          <textarea name="message" rows="5" required minlength="10" placeholder="Ville, type de logement, besoin, disponibilit&eacute;..."></textarea>
          <small data-field-error="message"></small>
        </label>

        <label class="neover-consent">
          <input name="consent" type="checkbox" required />
          <span>J'accepte que NEOVER utilise ces informations pour me recontacter au sujet de ma demande.</span>
        </label>
        <small data-field-error="consent" class="neover-consent-error"></small>

        <button type="submit" class="neover-submit-button">Envoyer ma demande</button>
        <p class="neover-form-status" role="status" aria-live="polite" hidden></p>
      </form>
    `;

    section.append(block);

    const form = block.querySelector("form");
    const submitButton = form.querySelector("button[type='submit']");

    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      ["name", "phone", "email", "project", "message", "consent"].forEach((field) => {
        setFieldError(form, field, "");
      });

      const formData = new FormData(form);
      const payload = Object.fromEntries(formData.entries());
      payload.consent = formData.has("consent");

      submitButton.disabled = true;
      submitButton.textContent = "Envoi en cours...";

      try {
        const response = await fetch("/api/contact", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload)
        });
        const result = await response.json().catch(() => ({}));

        if (!response.ok || !result.ok) {
          Object.entries(result.errors || {}).forEach(([field, message]) => {
            setFieldError(form, field, message);
          });
          showFormStatus(form, "error", "Merci de v\u00e9rifier les champs indiqu\u00e9s avant d'envoyer votre demande.");
          return;
        }

        form.reset();
        showFormStatus(form, "success", "Votre demande a bien \u00e9t\u00e9 envoy\u00e9e. NEOVER vous recontactera rapidement.");
      } catch (_error) {
        showFormStatus(form, "error", "L'envoi n'a pas abouti. Vous pouvez aussi appeler NEOVER au 09 72 73 03 95.");
      } finally {
        submitButton.disabled = false;
        submitButton.textContent = "Envoyer ma demande";
      }
    });
  }

  function enhancePage() {
    installContactForm();
    improveNavigation();
  }

  enhancePage();
  new MutationObserver(enhancePage).observe(document.getElementById("root"), {
    childList: true,
    subtree: true
  });
})();