(function () {
  const pages = {
    "/": { key: "home", title: "NEOVER - Solutions energetiques" },
    "/index.html": { key: "home", title: "NEOVER - Solutions energetiques" },
    "/qui-sommes-nous.html": { key: "about", title: "Qui sommes-nous - NEOVER" },
    "/services.html": { key: "services", title: "Services - NEOVER" },
    "/contact.html": { key: "contact", title: "Contact - NEOVER" },
    "/mentions-legales.html": { key: "legal", title: "Mentions legales - NEOVER" }
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
    { label: "Mentions légales", path: "/mentions-legales.html", key: "legal" }
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

  improveNavigation();
  new MutationObserver(improveNavigation).observe(document.getElementById("root"), {
    childList: true,
    subtree: true
  });
})();
