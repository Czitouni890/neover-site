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

  function icon(name) {
    const image = document.createElement("img");
    image.src = `/assets/icons/${name}.svg`;
    image.width = 20;
    image.height = 20;
    image.alt = "";
    image.setAttribute("aria-hidden", "true");
    return image;
  }

  function installMobileNavigation() {
    const nav = document.querySelector("nav");
    const bar = nav?.firstElementChild;
    if (!bar || nav.dataset.mobileReady) return;
    nav.dataset.mobileReady = "true";
    nav.setAttribute("aria-label", "Navigation principale");

    const actions = document.createElement("div");
    actions.className = "neover-mobile-actions";
    const call = document.createElement("a");
    call.className = "neover-mobile-call";
    call.href = "tel:+33972730395";
    call.setAttribute("aria-label", "Appeler NEOVER au 09 72 73 03 95");
    call.append(icon("phone"), document.createTextNode("Appeler"));
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "neover-menu-toggle";
    toggle.setAttribute("aria-controls", "neover-mobile-menu");
    toggle.append(icon("menu"));
    const menu = document.createElement("div");
    menu.id = "neover-mobile-menu";
    menu.className = "neover-mobile-menu";
    for (const item of fullNavigation) {
      const link = document.createElement("a");
      link.href = item.path;
      link.textContent = item.label;
      if (item.key === current.key) link.setAttribute("aria-current", "page");
      menu.append(link);
    }
    function setOpen(open) {
      menu.hidden = !open;
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Fermer le menu" : "Ouvrir le menu");
      toggle.title = open ? "Fermer le menu" : "Ouvrir le menu";
      toggle.firstChild.src = `/assets/icons/${open ? "x" : "menu"}.svg`;
    }
    setOpen(false);
    toggle.addEventListener("click", () => setOpen(menu.hidden));
    menu.addEventListener("click", (event) => {
      if (event.target.closest("a")) setOpen(false);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !menu.hidden) {
        setOpen(false);
        toggle.focus();
      }
    });
    document.addEventListener("click", (event) => {
      if (!menu.hidden && !nav.contains(event.target)) setOpen(false);
    });
    window.matchMedia("(min-width: 960px)").addEventListener("change", () => setOpen(false));
    actions.append(call, toggle);
    bar.append(actions);
    nav.append(menu);
  }

  function polishContact(section, form) {
    const container = section.firstElementChild;
    const [intro, details, registration, frame] = container.children;
    container.classList.add("neover-contact-layout");
    intro.classList.add("neover-contact-intro");
    details.classList.add("neover-contact-details");
    registration.classList.add("neover-contact-registration");
    frame.classList.add("neover-contact-frame");
    intro.querySelector("p").textContent = "Un projet d'installation ? \u00c9changeons sur vos besoins, partout en France.";
    const title = document.createElement("h3");
    title.className = "neover-form-title";
    title.textContent = "Parlons de votre projet";
    frame.prepend(title);
    for (const field of form.querySelectorAll("input:not([type='hidden']), textarea, select")) {
      if (field.name === "website") continue;
      field.id = field.id || `neover-${field.name}`;
      const label = field.parentElement.querySelector("label");
      if (label) label.htmlFor = field.id;
      if (["name", "email", "phone"].includes(field.name)) {
        field.autocomplete = { name: "name", email: "email", phone: "tel" }[field.name];
      }
      field.required = true;
      field.maxLength = { name: 80, email: 120, phone: 30, message: 1200 }[field.name] || 80;
    }
    form.querySelector('[name="name"]').minLength = 2;
    form.querySelector('[name="message"]').minLength = 10;
    const phone = form.querySelector('[name="phone"]');
    phone.inputMode = "tel";
    phone.placeholder = "06 12 34 56 78";
    phone.minLength = 8;
    const status = document.createElement("p");
    status.className = "neover-form-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.setAttribute("aria-atomic", "true");
    form.append(status);
  }

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

  function getField(form, aliases) {
    const fields = Array.from(form.querySelectorAll("input, select, textarea"));
    return fields.find((field) => {
      const haystack = [
        field.name,
        field.id,
        field.placeholder,
        field.getAttribute("aria-label"),
        field.closest("label")?.textContent
      ].filter(Boolean).join(" ").toLowerCase();
      return aliases.some((alias) => haystack.includes(alias));
    });
  }

  function ensureFieldName(field, name) {
    if (field && !field.name) field.name = name;
    return field;
  }

  function showFormStatus(form, type, message) {
    let status = form.querySelector(".neover-form-status");
    if (!status) {
      status = document.createElement("p");
      status.className = "neover-form-status";
      status.setAttribute("role", "status");
      status.setAttribute("aria-live", "polite");
      form.append(status);
    }

    status.hidden = false;
    status.className = `neover-form-status neover-form-status-${type}`;
    status.textContent = message;
    if (type !== "pending") status.scrollIntoView({ block: "nearest" });
  }

  function installContactForm() {
    if (current.key !== "contact") return;

    const section = document.querySelector("section#contact");
    if (!section) return;

    const injectedForm = section.querySelector(".neover-contact-form-block");
    injectedForm?.remove();

    const form = section.querySelector("form");
    if (!form || form.dataset.neoverContactReady === "true") return;

    const nameField = ensureFieldName(getField(form, ["nom", "name"]), "name");
    const phoneField = ensureFieldName(getField(form, ["t\u00e9l", "tel", "phone", "portable"]), "phone");
    const emailField = ensureFieldName(getField(form, ["email", "mail", "e-mail"]), "email");
    const projectField = ensureFieldName(form.querySelector('select, input[name="project"]'), "project");
    const messageField = ensureFieldName(getField(form, ["message", "demande", "description"]), "message");

    if (!nameField || !phoneField || !emailField || !messageField) return;

    if (!projectField) {
      const hiddenProject = document.createElement("input");
      hiddenProject.type = "hidden";
      hiddenProject.name = "project";
      hiddenProject.value = "Demande de contact";
      form.append(hiddenProject);
    }

    if (!form.querySelector('[name="page"]')) {
      const pageField = document.createElement("input");
      pageField.type = "hidden";
      pageField.name = "page";
      pageField.value = window.location.pathname;
      form.append(pageField);
    }

    if (!form.querySelector('[name="website"]')) {
      const honeypot = document.createElement("input");
      honeypot.type = "text";
      honeypot.name = "website";
      honeypot.tabIndex = -1;
      honeypot.autocomplete = "off";
      honeypot.className = "neover-honeypot";
      honeypot.setAttribute("aria-hidden", "true");
      form.append(honeypot);
    }

    if (!form.querySelector('[name="consent"]')) {
      const consent = document.createElement("input");
      consent.type = "hidden";
      consent.name = "consent";
      consent.value = "true";
      form.append(consent);
    }

    const submitButton = form.querySelector("button[type='submit'], input[type='submit']");
    const originalButtonText = submitButton?.tagName === "INPUT" ? submitButton.value : submitButton?.textContent;

    polishContact(section, form);
    form.dataset.neoverContactReady = "true";
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      // The compiled page has an obsolete React submit handler with a success alert.
      event.stopPropagation();
      if (form.getAttribute("aria-busy") === "true") return;
      form.setAttribute("aria-busy", "true");
      showFormStatus(form, "pending", "Envoi de votre demande en cours...");

      const formData = new FormData(form);
      const payload = Object.fromEntries(formData.entries());
      payload.consent = formData.get("consent") !== "false";
      payload.project = payload.project || "Demande de contact";

      if (submitButton) {
        submitButton.disabled = true;
        if (submitButton.tagName === "INPUT") submitButton.value = "Envoi en cours...";
        else submitButton.textContent = "Envoi en cours...";
      }

      try {
        const response = await fetch("/api/contact", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload)
        });
        const result = await response.json().catch(() => ({}));

        if (!response.ok || !result.ok) {
          const message = response.status === 429
            ? "Trop de tentatives. Merci de patienter 15 minutes avant de r\u00e9essayer."
            : response.status === 400
              ? "Merci de v\u00e9rifier les informations du formulaire avant l'envoi."
              : "L'envoi n'a pas abouti. Merci de r\u00e9essayer plus tard ou d'appeler NEOVER au 09 72 73 03 95.";
          showFormStatus(form, "error", message);
          return;
        }

        form.reset();
        for (const field of [nameField, emailField, phoneField, messageField]) {
          const prototype = field.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
          Object.getOwnPropertyDescriptor(prototype, "value").set.call(field, "");
          field.dispatchEvent(new Event("input", { bubbles: true }));
        }
        showFormStatus(form, "success", "Votre demande a bien \u00e9t\u00e9 envoy\u00e9e. NEOVER vous recontactera rapidement.");
      } catch (_error) {
        showFormStatus(form, "error", "L'envoi n'a pas abouti. Vous pouvez aussi appeler NEOVER au 09 72 73 03 95.");
      } finally {
        form.setAttribute("aria-busy", "false");
        if (submitButton) {
          submitButton.disabled = false;
          if (submitButton.tagName === "INPUT") submitButton.value = originalButtonText || "Envoyer";
          else submitButton.textContent = originalButtonText || "Envoyer";
        }
      }
    });
  }
  function enhancePage() {
    installContactForm();
    improveNavigation();
    installMobileNavigation();
  }

  enhancePage();
  new MutationObserver(enhancePage).observe(document.getElementById("root"), {
    childList: true,
    subtree: true
  });
})();
