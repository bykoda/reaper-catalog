"use strict";
const $ = (id) => document.getElementById(id);
function startCatalog(D) {
  const state = {
      view: "items",
      category: "all",
      query: "",
      sort: "name",
      limit: 24,
      status: "all",
      media: "all",
    },
    positions = Object.create(null);
  const KEY = "reaper-library-reviewed-v1";
  let reviewed = Object.create(null);
  function readReview(json) {
    const saved = JSON.parse(json || "{}");
    if (saved && typeof saved === "object" && !Array.isArray(saved)) {
      return Object.assign(Object.create(null), saved);
    }
    return Object.create(null);
  }
  try {
    reviewed = readReview(localStorage.getItem(KEY));
  } catch {
    // The catalog also works without local storage.
  }

  const esc = (s) =>
    String(s || "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const cmp = (a, b) =>
    a
      .replace(/^[^\p{L}\p{N}]+/u, "")
      .localeCompare(b.replace(/^[^\p{L}\p{N}]+/u, ""), "ru", {
        sensitivity: "base",
        numeric: true,
      });
  const allEntries = [...D.items, ...D.resources],
    byKey = new Map(allEntries.map((x) => [x.key, x]));
  let toastTimer;
  function toast(s) {
    (document.querySelector("dialog[open]") || document.body).append(
      $("toast"),
    );
    $("toast").textContent = s;
    $("toast").classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $("toast").classList.add("hidden"), 3200);
  }
  function saveReview() {
    try {
      localStorage.setItem(KEY, JSON.stringify(reviewed));
    } catch (e) {
      toast("Браузер не сохранил отметки. Скачайте резервную копию прогресса.");
    }
  }
  $("snapshotDate").textContent = `Снимок каталога от ${D.meta.date}`;
  const hrefFor = (value) => (/^https?:\/\//i.test(value) ? esc(value) : "#");
  $("stats").innerHTML = [
    [D.items.length, "тем форума"],
    [D.authors.length, "авторов тем"],
    [D.meta.imageEntryCount, "карточек с фото"],
  ]
    .map(
      ([n, t]) => `<div class="stat"><b>${esc(n)}</b><span>${t}</span></div>`,
    )
    .join("");
  $("countItems").textContent = D.items.length;
  $("countAuthors").textContent = D.authors.length;
  $("countResources").textContent = D.resources.length;
  function drawFilters() {
    let list = D[state.view];
    const counts = Object.create(null);
    if (state.view === "authors") {
      $("filters").innerHTML =
        '<div class="filter active">Все авторы <small>' +
        list.length +
        "</small></div>";
      return;
    }
    list.forEach((x) => (counts[x.category] = (counts[x.category] || 0) + 1));
    const cats =
      state.view === "items" ? D.categories : Object.keys(counts).sort(cmp);
    $("filters").innerHTML = [
      ["all", "Все категории", list.length],
      ...cats.filter((c) => counts[c]).map((c) => [c, c, counts[c]]),
    ]
      .map(
        ([id, label, n]) =>
          `<button class="filter ${state.category === id ? "active" : ""}" data-category="${esc(id)}" aria-pressed="${state.category === id}">${esc(label)}<small>${n}</small></button>`,
      )
      .join("");
  }
  function progress() {
    const n = D.items.filter((x) => reviewed[x.url]).length;
    $("progress").textContent = `Просмотрено тем: ${n} из ${D.items.length}`;
    $("sideProgress").textContent = `${n} / ${D.items.length} тем просмотрено`;
    $("progressFill").style.width = (100 * n) / D.items.length + "%";
    $("reviewControls").classList.toggle("hidden", state.view === "authors");
  }
  function currentImage(x) {
    const ids = x.images || [];
    return D.media[ids[(positions[x.key] || 0) % ids.length]];
  }
  function mediaHTML(x) {
    const ids = x.images || [];
    if (!ids.length)
      return '<div class="no-media">Нет доступного изображения в проверенных источниках</div>';
    const p = (positions[x.key] || 0) % ids.length,
      m = D.media[ids[p]];
    return `<div class="card-media"><button class="preview" data-action="image" data-key="${esc(x.key)}" aria-label="Увеличить изображение: ${esc(x.name)}"><img src="${esc(m.path)}" alt="${esc(x.name)} — изображение из ${m.origin === "GitHub" ? "GitHub" : "темы форума"}" loading="lazy" decoding="async" width="${esc(m.width)}" height="${esc(m.height)}"></button><div class="media-controls"><span>${esc(m.origin)}${m.animated ? " · кадр GIF" : ""}</span><span class="gallery-switch">${ids.length > 1 ? `<button data-action="prev" data-key="${esc(x.key)}" aria-label="Предыдущее изображение">‹</button><span>${p + 1} / ${ids.length}</span><button data-action="next" data-key="${esc(x.key)}" aria-label="Следующее изображение">›</button>` : ""}</span><button data-action="download-image" data-key="${esc(x.key)}">↓ Скачать PNG</button></div></div>`;
  }
  function cardHTML(x) {
    const seen = !!reviewed[x.url];
    return `<article class="card ${seen ? "viewed" : ""}" data-entry="${esc(x.key)}">${mediaHTML(x)}<span class="tag">${esc(x.category)}</span><h2><a class="main-link" href="${hrefFor(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.name)} <span class="arrow" aria-hidden="true">↗</span></a></h2><p>${esc(x.description)}</p><div class="card-bottom"><span>${x.author ? `${state.view === "items" ? "Автор темы" : "Источник"}: <span class="author-name">${esc(x.author)}</span>` : "Автор не указан в источнике"}</span><span>${esc(x.kind)}</span></div><div class="card-actions"><button class="action mark" data-action="mark" data-key="${esc(x.key)}" aria-pressed="${seen}">${seen ? "✓ Просмотрено" : "○ Отметить просмотренным"}</button><button class="action post-button" data-action="post" data-key="${esc(x.key)}">Текст для поста</button></div></article>`;
  }
  function render() {
    const isAuthor = state.view === "authors";
    let list = D[state.view].filter(
      (x) =>
        (isAuthor ||
          state.category === "all" ||
          x.category === state.category) &&
        (!state.query ||
          [x.name, x.author, x.description, x.category, x.url]
            .filter(Boolean)
            .join(" ")
            .toLocaleLowerCase("ru")
            .includes(state.query)) &&
        (isAuthor ||
          state.status === "all" ||
          (state.status === "seen" ? !!reviewed[x.url] : !reviewed[x.url])) &&
        (isAuthor ||
          state.media === "all" ||
          (state.media === "yes" ? !!x.images?.length : !x.images?.length)),
    );
    list.sort((a, b) =>
      state.sort === "author" && !isAuthor
        ? cmp(a.author || "Я", b.author || "Я") || cmp(a.name, b.name)
        : cmp(a.name, b.name),
    );
    $("resultCount").textContent =
      `Найдено: ${list.length} · показано: ${Math.min(state.limit, list.length)}`;
    $("results").className = isAuthor ? "authors" : "grid";
    $("notice").textContent = isAuthor
      ? "Профили авторов первых сообщений тем. В коллективных проектах состав разработчиков уточняйте на странице проекта."
      : state.view === "resources"
        ? "Дополнительные источники: репозитории, ReaPack и сайты проектов. Изображения загружаются по мере просмотра."
        : "Описания подготовлены заново в едином редакционном стиле. Изображения взяты из тем форума и GitHub; GIF представлены статичными кадрами. Отметки «Просмотрено» сохраняются на этом устройстве.";
    $("results").innerHTML = list.length
      ? list
          .slice(0, state.limit)
          .map((x) =>
            isAuthor
              ? `<a class="author-card" href="${hrefFor(x.url)}" target="_blank" rel="noopener noreferrer"><span class="avatar" aria-hidden="true">${esc(x.name.slice(0, 2).toUpperCase())}</span><span><strong>${esc(x.name)} ↗</strong><small>Тем в каталоге: ${esc(x.count)} · профиль форума</small></span></a>`
              : cardHTML(x),
          )
          .join("")
      : '<div class="empty">Ничего не найдено. Измените запрос или сбросьте фильтры.</div>';
    $("more").classList.toggle("hidden", state.limit >= list.length);
    $("more").textContent =
      `Показать ещё · осталось ${Math.max(0, list.length - state.limit)}`;
    $("clear").classList.toggle("hidden", !$("search").value);
    progress();
  }
  function filename(x) {
    return (
      x.name
        .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 100) || "reaper-script"
    );
  }
  function downloadUrl(url, name) {
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    // A link outside an open modal is inert in some webviews.
    (document.querySelector("dialog[open]") || document.body).append(link);
    link.click();
    link.remove();
  }

  async function downloadBlob(blob, name) {
    if (miniApp.active && navigator.canShare && navigator.share) {
      const files = [new File([blob], name, { type: blob.type })];
      try {
        if (navigator.canShare({ files })) {
          await navigator.share({ files });
          return;
        }
      } catch (error) {
        if (error.name === "AbortError") return;
      }
    }
    const url = URL.createObjectURL(blob);
    downloadUrl(url, name);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  function downloadImage(x) {
    const image = currentImage(x);
    if (!image) return;
    downloadUrl(
      image.path,
      filename(x) + "-" + ((positions[x.key] || 0) + 1) + ".png",
    );
  }
  function postText(x) {
    const author = x.author
      ? `\n${x.key.startsWith("i:") ? "Автор темы на форуме" : "Источник"}: ${x.author}`
      : "";
    return `${x.name}\n\n${x.description}${author}\n${x.authorUrl ? "Профиль: " + x.authorUrl + "\n" : ""}\nПодробнее: ${x.url}`;
  }
  let activePost = null,
    activeImage = null;
  function showPost(x) {
    activePost = x;
    $("postTitle").textContent = x.name;
    $("postText").value = postText(x);
    miniApp.openDialog($("postDialog"));
  }
  function fillImage() {
    const x = activeImage,
      m = currentImage(x);
    if (!m) return;
    $("imageTitle").textContent = x.name;
    $("fullImage").src = m.path;
    $("openFullImage").href = m.path;
    $("openFullImage").classList.toggle("hidden", !miniApp.active);
    $("fullImage").alt = x.name;
    $("imageMeta").innerHTML =
      `${esc(m.width)} × ${esc(m.height)} px · PNG${m.animated ? " · статичный кадр GIF" : ""} · ${esc(m.origin)}<br><a href="${hrefFor(m.source)}" target="_blank" rel="noopener noreferrer">Страница источника ↗</a> · <a href="${hrefFor(m.url)}" target="_blank" rel="noopener noreferrer">Исходное вложение ↗</a>`;
    $("imagePosition").textContent =
      `${(positions[x.key] || 0) + 1} / ${x.images.length}`;
    ["imagePrev", "imageNext"].forEach((id) =>
      $(id).classList.toggle("hidden", x.images.length < 2),
    );
  }
  function showImage(x) {
    activeImage = x;
    fillImage();
    miniApp.openDialog($("imageDialog"));
  }
  $("results").addEventListener("click", (e) => {
    const b = e.target.closest("[data-action]");
    if (!b) return;
    const x = byKey.get(b.dataset.key);
    if (!x) return;
    const action = b.dataset.action;
    if (action === "mark") {
      if (reviewed[x.url]) delete reviewed[x.url];
      else reviewed[x.url] = true;
      saveReview();
      render();
    } else if (action === "post") showPost(x);
    else if (action === "image") showImage(x);
    else if (action === "download-image") downloadImage(x);
    else if (action === "prev" || action === "next") {
      positions[x.key] =
        ((positions[x.key] || 0) +
          (action === "next" ? 1 : -1) +
          x.images.length) %
        x.images.length;
      const card = b.closest("article");
      card.querySelector(".card-media").outerHTML = mediaHTML(x);
    }
  });
  async function copyField(field, message) {
    try {
      await navigator.clipboard.writeText(field.value);
      toast(message);
      return;
    } catch {
      field.focus();
      field.select();
    }
    try {
      if (document.execCommand("copy")) {
        toast(message);
        return;
      }
    } catch {
      // Leave the text selected for manual copying.
    }
    toast("Скопируйте выделенный текст");
  }

  $("copyText").addEventListener("click", () =>
    copyField($("postText"), "Текст скопирован"),
  );
  $("downloadText").addEventListener("click", () => {
    if (activePost)
      downloadBlob(
        new Blob(["\ufeff" + $("postText").value], {
          type: "text/plain;charset=utf-8",
        }),
        filename(activePost) + ".txt",
      );
  });
  $("downloadFullImage").addEventListener("click", () => {
    if (activeImage) downloadImage(activeImage);
  });
  function changeFullImage(delta) {
    if (!activeImage) return;
    positions[activeImage.key] =
      ((positions[activeImage.key] || 0) + delta + activeImage.images.length) %
      activeImage.images.length;
    fillImage();
    const visibleCard = [...$("results").querySelectorAll("[data-entry]")].find(
      (card) => card.dataset.entry === activeImage.key,
    );
    const media = visibleCard?.querySelector(".card-media");
    if (media) media.outerHTML = mediaHTML(activeImage);
  }
  $("imagePrev").addEventListener("click", () => changeFullImage(-1));
  $("imageNext").addEventListener("click", () => changeFullImage(1));
  document
    .querySelectorAll("[data-close]")
    .forEach((b) =>
      b.addEventListener("click", () => $(b.dataset.close).close()),
    );
  document.querySelectorAll("dialog").forEach((d) =>
    d.addEventListener("click", (e) => {
      if (e.target === d) {
        const r = d.getBoundingClientRect();
        if (
          e.clientX < r.left ||
          e.clientX > r.right ||
          e.clientY < r.top ||
          e.clientY > r.bottom
        )
          d.close();
      }
    }),
  );
  $("imageDialog").addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") changeFullImage(1);
    if (e.key === "ArrowLeft") changeFullImage(-1);
  });
  document.querySelectorAll(".tab").forEach((b) =>
    b.addEventListener("click", () => {
      state.view = b.dataset.view;
      state.category = "all";
      state.limit = 24;
      document.querySelectorAll(".tab").forEach((t) => {
        t.classList.toggle("active", t === b);
        t.setAttribute("aria-current", t === b ? "page" : "false");
      });
      drawFilters();
      render();
    }),
  );
  $("filters").addEventListener("click", (e) => {
    const b = e.target.closest("[data-category]");
    if (!b) return;
    state.category = b.dataset.category;
    state.limit = 24;
    drawFilters();
    render();
  });
  $("search").addEventListener("input", () => {
    state.query = $("search").value.trim().toLocaleLowerCase("ru");
    state.limit = 24;
    render();
  });
  $("clear").addEventListener("click", () => {
    $("search").value = "";
    state.query = "";
    state.limit = 24;
    render();
    $("search").focus();
  });
  $("sort").addEventListener("change", () => {
    state.sort = $("sort").value;
    state.limit = 24;
    render();
  });
  $("reviewFilter").addEventListener("change", () => {
    state.status = $("reviewFilter").value;
    state.limit = 24;
    render();
  });
  $("mediaFilter").addEventListener("change", () => {
    state.media = $("mediaFilter").value;
    state.limit = 24;
    render();
  });
  $("more").addEventListener("click", () => {
    state.limit += 48;
    render();
  });
  const progressJson = () =>
    JSON.stringify(
      { format: "reaper-library-progress", version: 1, reviewed },
      null,
      2,
    );
  const saveProgressFile = () =>
    downloadBlob(
      new Blob([progressJson()], { type: "application/json" }),
      "reaper-progress.json",
    );
  function pickProgressFile() {
    const input = $("progressFile");
    (document.querySelector("dialog[open]") || document.body).append(input);
    input.click();
  }
  const allowedReviewUrls = new Set(allEntries.map((entry) => entry.url));

  function importProgress(text) {
    try {
      const backup = JSON.parse(text.replace(/^\uFEFF/, ""));
      if (
        backup?.format !== "reaper-library-progress" ||
        backup.version !== 1 ||
        !backup.reviewed ||
        typeof backup.reviewed !== "object" ||
        Array.isArray(backup.reviewed)
      ) {
        throw new Error("Invalid progress backup");
      }
      for (const [url, seen] of Object.entries(backup.reviewed)) {
        if (seen && allowedReviewUrls.has(url)) reviewed[url] = true;
      }
      saveReview();
      render();
      if ($("progressDialog").open) $("progressDialog").close();
      toast("Отметки из резервной копии добавлены");
    } catch {
      toast("Этот файл не является резервной копией прогресса");
    }
  }

  function openProgressDialog(exporting) {
    $("progressTitle").textContent = exporting
      ? "Сохранить отметки"
      : "Загрузить отметки";
    $("progressText").readOnly = exporting;
    $("progressText").value = exporting ? progressJson() : "";
    $("progressText").placeholder = exporting
      ? ""
      : "Вставьте резервную копию JSON";
    for (const id of ["saveProgressFile", "copyProgress"])
      $(id).classList.toggle("hidden", !exporting);
    for (const id of ["pasteProgress", "pickProgressFile"])
      $(id).classList.toggle("hidden", exporting);
    miniApp.openDialog($("progressDialog"));
  }

  $("exportProgress").addEventListener("click", () =>
    miniApp.active ? openProgressDialog(true) : saveProgressFile(),
  );
  $("importProgress").addEventListener("click", () =>
    miniApp.active ? openProgressDialog(false) : pickProgressFile(),
  );
  $("saveProgressFile").addEventListener("click", saveProgressFile);
  $("copyProgress").addEventListener("click", () =>
    copyField($("progressText"), "JSON скопирован"),
  );
  $("pickProgressFile").addEventListener("click", pickProgressFile);
  $("pasteProgress").addEventListener("click", () =>
    importProgress($("progressText").value),
  );
  $("progressFile").addEventListener("change", async () => {
    const file = $("progressFile").files[0];
    if (!file) return;
    try {
      importProgress(await file.text());
    } catch {
      toast("Не удалось прочитать резервную копию");
    } finally {
      $("progressFile").value = "";
    }
  });
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) {
      try {
        reviewed = readReview(e.newValue);
        render();
      } catch (e) {}
    }
  });
  let beforePrintLimit;
  window.addEventListener("beforeprint", () => {
    beforePrintLimit = state.limit;
    state.limit = Infinity;
    render();
  });
  window.addEventListener("afterprint", () => {
    if (beforePrintLimit === undefined) return;
    state.limit = beforePrintLimit;
    beforePrintLimit = undefined;
    render();
  });
  drawFilters();
  render();
}

async function loadCatalog() {
  $("catalogStatusText").textContent = "Загружаем каталог…";
  $("retryCatalog").classList.add("hidden");
  try {
    const response = await fetch("./catalog.json", { cache: "no-cache" });
    if (!response.ok) throw new Error("HTTP " + response.status);
    const catalog = await response.json();
    startCatalog(catalog);
    $("catalogContent").classList.remove("hidden");
    $("catalogStatus").classList.add("hidden");
  } catch (error) {
    console.error("Catalog load failed", error);
    $("catalogStatusText").textContent =
      location.protocol === "file:"
        ? "Откройте каталог через хостинг или локальный сервер по инструкции."
        : "Каталог не загрузился. Проверьте подключение и повторите.";
    $("retryCatalog").classList.remove("hidden");
  }
}

miniApp.init();
$("retryCatalog").addEventListener("click", loadCatalog);
loadCatalog();
