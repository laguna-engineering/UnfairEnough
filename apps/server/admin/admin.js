// ── Shared admin dashboard utilities ─────────────────────────

/** Fetch JSON from API, returning parsed data or throwing. */
async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * Render a table into a container element.
 * @param {HTMLElement} container
 * @param {string[]} headers - Column header labels
 * @param {Array<{cells: (string|HTMLElement)[], className?: string, attrs?: Record<string, string>}>} rows
 */
function renderTable(container, headers, rows) {
  if (rows.length === 0) {
    container.innerHTML = '<p class="empty">No data.</p>';
    return;
  }

  const table = document.createElement("table");

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  for (const h of headers) {
    const th = document.createElement("th");
    th.textContent = h;
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const row of rows) {
    const tr = document.createElement("tr");
    if (row.className) tr.className = row.className;
    if (row.attrs) {
      for (const [k, v] of Object.entries(row.attrs)) {
        tr.setAttribute(k, v);
      }
    }
    for (const cell of row.cells) {
      const td = document.createElement("td");
      if (cell instanceof HTMLElement) {
        td.appendChild(cell);
      } else {
        td.textContent = String(cell);
      }
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);

  container.innerHTML = "";
  container.appendChild(table);
}

/** Render the nav bar. Highlights the current page. */
function renderNav() {
  const pages = [
    { href: "/admin/", label: "Players" },
    { href: "/admin/question-sets.html", label: "Question Sets" },
    { href: "/admin/tags.html", label: "Tags" },
    { href: "/admin/export.html", label: "Export" },
  ];

  const nav = document.createElement("nav");
  const brand = document.createElement("a");
  brand.href = "/admin/";
  brand.className = "brand";
  brand.textContent = "Admin";
  nav.appendChild(brand);

  const currentPath = window.location.pathname;
  for (const page of pages) {
    const a = document.createElement("a");
    a.href = page.href;
    a.textContent = page.label;
    if (currentPath === page.href || (page.href === "/admin/" && currentPath === "/admin/index.html")) {
      a.className = "active";
    }
    nav.appendChild(a);
  }

  document.body.prepend(nav);
}

/** Show loading text in container. */
function showLoading(container) {
  container.innerHTML = '<p class="loading">Loading...</p>';
}

/** Show error message in container. */
function showError(container, message) {
  container.innerHTML = `<p class="error">${escapeHtml(message)}</p>`;
}

/** Escape HTML to prevent XSS. */
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/** Format a number with locale formatting. */
function fmtNum(n) {
  return typeof n === "number" ? n.toLocaleString() : "—";
}

/** Format a date string to a short locale string. */
function fmtDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Create an anchor element. */
function link(href, text) {
  const a = document.createElement("a");
  a.href = href;
  a.textContent = text;
  return a;
}

// Initialize nav on DOMContentLoaded
document.addEventListener("DOMContentLoaded", renderNav);
